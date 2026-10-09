import { randomBytes } from 'node:crypto';

import { BETTER_AUTH_BASE_URL, FLY_APP_NAME } from '$app/env/private';
import { scopesToPermissions, type ApiScope } from '$lib/api-scopes';
import type { AdminApiLogEntry } from '$lib/components/admin/api-logs-columns';
import {
	banUserSchema,
	createUserSchema,
	removeUserSchema,
	sendWelcomeEmailSchema,
	setRoleSchema,
	unbanUserSchema
} from '$lib/schemas/admin-user';
import { createApiKeySchema, revokeApiKeySchema } from '$lib/schemas/api-key';
import { unarchivePersonSchema } from '$lib/schemas/visits';
import { assertAdmin, requireAdmin } from '$lib/server/actions/auth-guard';
import { invalidForm } from '$lib/server/actions/form-responses';
import { allowedEmails, auth } from '$lib/server/auth';
import { buildAllowlistCommand, formatAlertEmail } from '$lib/server/auth-allowlist-hook';
import { getDb } from '$lib/server/db';
import { apiAuditLog, apiKey, people, user, visits } from '$lib/server/db/schema';
import { withAuditFieldsForUpdate } from '$lib/server/db/utils';
import { sendWelcomeEmail } from '$lib/server/email';
import { logger } from '$lib/server/logger';
import { sendAuthAlerts } from '$lib/server/notifications';
import { isRedirect } from '@sveltejs/kit';
import { APIError } from 'better-auth/api';
import { asc, desc, eq, inArray } from 'drizzle-orm';
import { message, setError, superValidate, type SuperValidated } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';

import type { Actions, PageServerLoad } from './$types';

type MessageStatus = NonNullable<Parameters<typeof message>[2]>['status'];

/**
 * Turns a failed `auth.api.*` admin call into a `message(form, …)` failure. better-auth raises
 * `APIError` for expected rejections (insufficient permission, target not found, "can't ban an
 * admin", …), so surface those with their real status and message and log at `warn`. Anything
 * else is unexpected: log at `error` and return a generic 500. Redirects are re-thrown.
 */
function adminActionError<TForm extends Record<string, unknown>>(
	form: SuperValidated<TForm>,
	context: string,
	err: unknown,
	fallback: string
) {
	if (isRedirect(err)) throw err;
	if (err instanceof APIError) {
		logger.warn(context, { status: err.statusCode, reason: err.message });
		return message(
			form,
			{ type: 'error', text: err.body?.message || fallback },
			{ status: (err.statusCode || 400) as MessageStatus }
		);
	}
	logger.error(context, err);
	return message(form, { type: 'error', text: fallback }, { status: 500 });
}

function isAllowlisted(email: string): boolean {
	return allowedEmails.has(email.trim().toLowerCase());
}

/**
 * Sends the welcome email, reporting failure instead of throwing so a Brevo outage after
 * the account already exists doesn't turn into a 500.
 */
async function trySendWelcomeEmail(to: string, name: string): Promise<boolean> {
	try {
		await sendWelcomeEmail(to, name, BETTER_AUTH_BASE_URL);
		return true;
	} catch {
		// sendWelcomeEmail already logged the failure.
		return false;
	}
}

// The api-key plugin stores permissions as a JSON string; tolerate a malformed value
// rather than failing the whole dashboard load.
function parsePermissions(raw: string | null): Record<string, string[]> | null {
	if (!raw) return null;
	try {
		return JSON.parse(raw) as Record<string, string[]>;
	} catch {
		return null;
	}
}

export const load: PageServerLoad = async ({ locals }) => {
	// Server loads run in parallel with the layout's guard, so check here too.
	assertAdmin(locals);

	const [createApiKeyForm, createUserForm] = await Promise.all([
		superValidate(zod4(createApiKeySchema), { id: 'createApiKey' }),
		superValidate(zod4(createUserSchema), { id: 'createUser' })
	]);

	try {
		const db = getDb();

		const [users, archivedPeople, apiKeyRecords, auditEntries] = await Promise.all([
			db.query.user.findMany({ orderBy: [desc(user.createdAt)] }),
			db.query.people.findMany({
				where: eq(people.isArchived, true),
				orderBy: [desc(people.updatedAt)]
			}),
			// Every user's keys, not just the signed-in admin's (auth.api.listApiKeys is
			// session-scoped), so an admin can see and revoke keys belonging to anyone.
			// The hashed `key` column is never selected.
			db
				.select({
					id: apiKey.id,
					name: apiKey.name,
					start: apiKey.start,
					enabled: apiKey.enabled,
					permissions: apiKey.permissions,
					expiresAt: apiKey.expiresAt,
					createdAt: apiKey.createdAt,
					lastRequest: apiKey.lastRequest,
					ownerEmail: user.email
				})
				.from(apiKey)
				.leftJoin(user, eq(apiKey.referenceId, user.id))
				.orderBy(desc(apiKey.createdAt)),
			db.query.apiAuditLog.findMany({
				with: { user: true },
				orderBy: [desc(apiAuditLog.createdAt)]
			})
		]);

		// apiKeyId has no FK to apiKey.id (by design, so the trail survives key revocation),
		// so resolve names via a separate lookup rather than a join, tolerating ids with no match.
		const apiKeyIds = [...new Set(auditEntries.map((entry) => entry.apiKeyId))];
		const apiKeyRows =
			apiKeyIds.length > 0
				? await db
						.select({ id: apiKey.id, name: apiKey.name })
						.from(apiKey)
						.where(inArray(apiKey.id, apiKeyIds))
				: [];
		const apiKeyNamesById = new Map(apiKeyRows.map((row) => [row.id, row.name]));

		const apiKeys = apiKeyRecords.map((record) => ({
			...record,
			permissions: parsePermissions(record.permissions)
		}));

		const apiLogs: AdminApiLogEntry[] = auditEntries.map((entry) => ({
			...entry,
			apiKeyName: apiKeyNamesById.get(entry.apiKeyId) ?? null,
			apiKeyExists: apiKeyNamesById.has(entry.apiKeyId)
		}));

		const ownerIds = [...new Set(archivedPeople.map((person) => person.userId))];
		const owners =
			ownerIds.length > 0
				? await db.query.user.findMany({ where: inArray(user.id, ownerIds) })
				: [];
		const ownerEmailById = new Map(owners.map((owner) => [owner.id, owner.email]));

		const latestVisitsByPersonId = new Map<string, typeof visits.$inferSelect>();

		if (archivedPeople.length > 0) {
			const orderedVisits = await db.query.visits.findMany({
				where: inArray(
					visits.personId,
					archivedPeople.map((person) => person.id)
				),
				orderBy: [asc(visits.personId), desc(visits.date), desc(visits.createdAt)]
			});

			for (const visit of orderedVisits) {
				if (!latestVisitsByPersonId.has(visit.personId)) {
					latestVisitsByPersonId.set(visit.personId, visit);
				}
			}
		}

		return {
			users,
			archivedPeople: archivedPeople.map((person) => ({
				...person,
				ownerEmail: ownerEmailById.get(person.userId) ?? 'Unknown',
				lastVisitDate: latestVisitsByPersonId.get(person.id)?.date ?? null
			})),
			apiKeys,
			apiLogs,
			createApiKeyForm,
			createUserForm
		};
	} catch (err) {
		logger.error('Failed to load admin dashboard data', err);
		return {
			users: [],
			archivedPeople: [],
			apiKeys: [],
			apiLogs: [],
			loadError: 'Failed to load admin dashboard data. Please try refreshing the page.',
			createApiKeyForm,
			createUserForm
		};
	}
};

export const actions = {
	createUser: requireAdmin(async ({ request }, admin) => {
		const form = await superValidate(request, zod4(createUserSchema));

		if (!form.valid) {
			return invalidForm(form);
		}

		const { name, email, role } = form.data;

		let newUserId: string;
		try {
			// A throwaway password the admin never sees; the user sets their own through the
			// forgot-password flow. No headers → a trusted server call; requireAdmin above is
			// the authorization, as with createApiKey.
			const created = await auth.api.createUser({
				body: { name, email, role, password: randomBytes(32).toString('base64url') }
			});
			newUserId = created.user.id;
		} catch (err) {
			if (isRedirect(err)) throw err;
			const code = (err as { body?: { code?: string } })?.body?.code;
			if (code === 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL' || code === 'USER_ALREADY_EXISTS') {
				return setError(form, 'email', 'A user with this email already exists.');
			}
			logger.error('Failed to create user', err);
			return message(
				form,
				{ type: 'error', text: 'Failed to create user. Please try again.' },
				{ status: 500 }
			);
		}

		const allowlisted = isAllowlisted(email);
		const welcomeSent = allowlisted && (await trySendWelcomeEmail(email, name));

		logger.info('User created by admin', {
			adminId: admin.id,
			newUserId,
			role,
			allowlisted,
			welcomeSent
		});
		await sendAuthAlerts(
			`👤 Admin ${formatAlertEmail(admin.email)} created ${role} account for ${formatAlertEmail(email)}.`,
			'Synapse - User Created Alert',
			3
		);

		if (!allowlisted) {
			form.message = {
				type: 'success',
				text: `User created. Add ${email} to ALLOWED_EMAILS, then send the welcome email.`
			};
			return { form, allowlistCommand: buildAllowlistCommand(allowedEmails, email, FLY_APP_NAME) };
		}

		if (!welcomeSent) {
			return message(form, {
				type: 'error',
				text: 'User created, but the welcome email failed to send. Use "Send welcome email" to retry.'
			});
		}

		return message(form, {
			type: 'success',
			text: `User created and welcome email sent to ${email}.`
		});
	}),

	sendWelcomeEmail: requireAdmin(async ({ request }, admin) => {
		const form = await superValidate(request, zod4(sendWelcomeEmailSchema));

		if (!form.valid) {
			return invalidForm(form, 'User ID is required');
		}

		try {
			const target = await getDb().query.user.findFirst({ where: eq(user.id, form.data.userId) });

			if (!target) {
				return message(form, { type: 'error', text: 'User not found' }, { status: 404 });
			}

			if (!isAllowlisted(target.email)) {
				return invalidForm(
					form,
					`${target.email} isn't in ALLOWED_EMAILS yet, so they couldn't sign in. Allowlist them first.`
				);
			}

			if (!(await trySendWelcomeEmail(target.email, target.name))) {
				return message(
					form,
					{ type: 'error', text: 'Failed to send welcome email' },
					{ status: 500 }
				);
			}

			logger.info('Welcome email sent by admin', { adminId: admin.id, userId: target.id });
			await sendAuthAlerts(
				`✉️ Admin ${formatAlertEmail(admin.email)} sent a welcome email to ${formatAlertEmail(target.email)}.`,
				'Synapse - Welcome Email Alert',
				3
			);

			return message(form, { type: 'success', text: `Welcome email sent to ${target.email}.` });
		} catch (err) {
			logger.error('Failed to send welcome email', err);
			return message(
				form,
				{ type: 'error', text: 'Failed to send welcome email' },
				{ status: 500 }
			);
		}
	}),

	setRole: requireAdmin(async ({ request }, admin) => {
		const form = await superValidate(request, zod4(setRoleSchema));

		if (!form.valid) {
			return invalidForm(form, 'Invalid role change request');
		}

		const { userId, role } = form.data;

		if (userId === admin.id) {
			return invalidForm(form, 'You cannot change your own role');
		}

		try {
			const { user: target } = await auth.api.setRole({
				body: { userId, role },
				headers: request.headers
			});
			logger.info('User role changed by admin', { adminId: admin.id, userId, role });
			await sendAuthAlerts(
				`🔑 Admin ${formatAlertEmail(admin.email)} set ${formatAlertEmail(target.email)}'s role to ${role}.`,
				'Synapse - Role Changed Alert',
				3
			);
		} catch (err) {
			return adminActionError(form, 'Failed to change user role', err, 'Failed to change role');
		}

		return message(form, { type: 'success', text: `Role changed to ${role}.` });
	}),

	banUser: requireAdmin(async ({ request }, admin) => {
		const form = await superValidate(request, zod4(banUserSchema));

		if (!form.valid) {
			return invalidForm(form, 'Invalid ban request');
		}

		const { userId, banReason } = form.data;

		if (userId === admin.id) {
			return invalidForm(form, 'You cannot ban yourself');
		}

		try {
			// better-auth also revokes the user's sessions, so a ban takes effect immediately.
			const { user: target } = await auth.api.banUser({
				body: { userId, ...(banReason ? { banReason } : {}) },
				headers: request.headers
			});
			logger.info('User banned by admin', { adminId: admin.id, userId });
			await sendAuthAlerts(
				`🚫 Admin ${formatAlertEmail(admin.email)} banned ${formatAlertEmail(target.email)}.`,
				'Synapse - User Banned Alert',
				3
			);
		} catch (err) {
			return adminActionError(form, 'Failed to ban user', err, 'Failed to ban user');
		}

		return message(form, { type: 'success', text: 'User banned.' });
	}),

	unbanUser: requireAdmin(async ({ request }, admin) => {
		const form = await superValidate(request, zod4(unbanUserSchema));

		if (!form.valid) {
			return invalidForm(form, 'Invalid unban request');
		}

		try {
			await auth.api.unbanUser({ body: { userId: form.data.userId }, headers: request.headers });
			logger.info('User unbanned by admin', { adminId: admin.id, userId: form.data.userId });
		} catch (err) {
			return adminActionError(form, 'Failed to unban user', err, 'Failed to unban user');
		}

		return message(form, { type: 'success', text: 'User unbanned.' });
	}),

	removeUser: requireAdmin(async ({ request }, admin) => {
		const form = await superValidate(request, zod4(removeUserSchema));

		if (!form.valid) {
			return invalidForm(form, 'Invalid remove request');
		}

		const { userId } = form.data;

		if (userId === admin.id) {
			return invalidForm(form, 'You cannot remove your own account');
		}

		try {
			// removeUser returns only { success }, so look the email up first for the alert.
			const target = await getDb().query.user.findFirst({ where: eq(user.id, userId) });

			if (!target) {
				return message(form, { type: 'error', text: 'User not found' }, { status: 404 });
			}

			// Every user-scoped table cascades on user.id, so this deletes all their data too.
			await auth.api.removeUser({ body: { userId }, headers: request.headers });
			logger.info('User removed by admin', { adminId: admin.id, userId });
			await sendAuthAlerts(
				`🗑️ Admin ${formatAlertEmail(admin.email)} removed ${formatAlertEmail(target.email)} and all their data.`,
				'Synapse - User Removed Alert',
				3
			);
		} catch (err) {
			return adminActionError(form, 'Failed to remove user', err, 'Failed to remove user');
		}

		return message(form, { type: 'success', text: 'User removed.' });
	}),

	unarchivePerson: requireAdmin(async ({ request }) => {
		const form = await superValidate(request, zod4(unarchivePersonSchema));

		if (!form.valid) {
			return invalidForm(form, 'Person ID is required');
		}

		const { personId } = form.data;

		try {
			const db = getDb();

			await db
				.update(people)
				.set({ isArchived: false, archivedAt: null, ...withAuditFieldsForUpdate() })
				.where(eq(people.id, personId));

			logger.info('Person unarchived', { personId });
		} catch (err) {
			logger.error('Failed to unarchive person', err);
			return message(form, { type: 'error', text: 'Failed to unarchive person' }, { status: 500 });
		}

		return message(form, { type: 'success', text: 'Person unarchived.' });
	}),

	createApiKey: requireAdmin(async ({ request }, user) => {
		const form = await superValidate(request, zod4(createApiKeySchema));

		if (!form.valid) {
			return invalidForm(form);
		}

		try {
			// Deliberately not passing `headers` here: the plugin only accepts server-only
			// fields like `permissions` and rate-limit overrides on a "trusted server" call
			// (no headers/request on the context), and rejects them outright on a
			// session-based "client" call.
			const created = await auth.api.createApiKey({
				body: {
					name: form.data.name,
					userId: user.id,
					permissions: scopesToPermissions(form.data.scopes as ApiScope[]),
					expiresIn: form.data.expiresInDays * 86400
				}
			});

			logger.info('API key created', { keyId: created.id, scopes: form.data.scopes });

			// The plaintext key is only ever returned here, once. Ride it alongside the
			// usual message-bearing form rather than inventing a new response shape.
			form.message = {
				type: 'success',
				text: 'API key created. Copy it now — it will not be shown again.'
			};
			return { form, apiKey: created.key };
		} catch (err) {
			logger.error('Failed to create API key', err);
			return message(
				form,
				{ type: 'error', text: 'Failed to create API key. Please try again.' },
				{ status: 500 }
			);
		}
	}),

	revokeApiKey: requireAdmin(async ({ request }) => {
		const form = await superValidate(request, zod4(revokeApiKeySchema));

		if (!form.valid) {
			return invalidForm(form, 'API key ID is required');
		}

		try {
			// Direct delete rather than auth.api.deleteApiKey, which only lets a user delete
			// their own keys; requireAdmin above is the authorization for revoking anyone's.
			const deleted = await getDb()
				.delete(apiKey)
				.where(eq(apiKey.id, form.data.id))
				.returning({ id: apiKey.id });

			if (deleted.length === 0) {
				return message(form, { type: 'error', text: 'API key not found' }, { status: 404 });
			}

			logger.info('API key revoked', { keyId: form.data.id });
		} catch (err) {
			logger.error('Failed to revoke API key', err);
			return message(form, { type: 'error', text: 'Failed to revoke API key' }, { status: 500 });
		}

		return message(form, { type: 'success', text: 'API key revoked.' });
	})
} satisfies Actions;
