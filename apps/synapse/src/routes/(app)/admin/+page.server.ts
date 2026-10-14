import { BETTER_AUTH_BASE_URL, FLY_APP_NAME } from '$app/env/private';
import { createAdminUserActions } from '@sheppakai/shared/admin-user-actions';
import { parsePermissions } from '@sheppakai/shared/api-scopes';
import { asc, desc, eq, inArray } from 'drizzle-orm';
import { message, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';

import { scopesToPermissions, type ApiScope } from '#lib/api-scopes.js';
import type { AdminApiLogEntry } from '#lib/components/admin/api-logs-columns.js';
import { createUserSchema } from '#lib/schemas/admin-user.js';
import { createApiKeySchema, revokeApiKeySchema } from '#lib/schemas/api-key.js';
import { unarchivePersonSchema } from '#lib/schemas/visits.js';
import { assertAdmin, isAdminUser, requireAdmin } from '#lib/server/actions/auth-guard.js';
import { invalidForm } from '#lib/server/actions/form-responses.js';
import { allowedEmails, auth } from '#lib/server/auth.js';
import { getDb } from '#lib/server/db/index.js';
import { apiAuditLog, apiKey, people, user, visits } from '#lib/server/db/schema/index.js';
import { withTimestampsForUpdate } from '#lib/server/db/utils.js';
import { disableApiKeysForUser } from '#lib/server/db/writes/api-keys.js';
import { sendWelcomeEmail } from '#lib/server/email/index.js';
import { logger } from '#lib/server/logger.js';
import { sendAuthAlerts } from '#lib/server/notifications/index.js';

import type { Actions, PageServerLoad } from './$types';

// Role, ban, unban, remove, create and welcome-email actions, shared by every app.
const adminUserActions = createAdminUserActions({
	appName: 'Synapse',
	auth,
	isAdminUser,
	allowedEmails,
	flyAppName: FLY_APP_NAME,
	sendWelcome: (target) => sendWelcomeEmail(target.email, target.name, BETTER_AUTH_BASE_URL),
	sendAuthAlerts,
	logger,
	disableApiKeysForUser
});

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
	...adminUserActions,

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
				.set({ isArchived: false, archivedAt: null, ...withTimestampsForUpdate() })
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
