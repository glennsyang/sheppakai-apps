import { FLY_APP_NAME } from '$app/env/private';
import {
	ADMIN_USER_LIST_LIMIT,
	createAdminUserActions
} from '@sheppakai/shared/admin-user-actions';
import { createApiKeyAdminActions } from '@sheppakai/shared/api-key-admin';
import { error } from '@sveltejs/kit';
import { APIError } from 'better-auth/api';
import { asc, desc, eq, inArray } from 'drizzle-orm';
import { message, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';

import { scopesToPermissions, type ApiScope } from '#lib/api-scopes.js';
import type { AdminApiLogEntry } from '#lib/components/admin/api-logs-columns.js';
import { createUserSchema } from '#lib/schemas/admin-user.js';
import { createApiKeySchema } from '#lib/schemas/api-key.js';
import { unarchivePersonSchema } from '#lib/schemas/visits.js';
import { assertAdmin, isAdminUser, requireAdmin } from '#lib/server/actions/auth-guard.js';
import { invalidForm } from '#lib/server/actions/form-responses.js';
import { apiKeyStore } from '#lib/server/api/api-key-store.js';
import { allowedEmails, auth } from '#lib/server/auth.js';
import { sendWelcome } from '#lib/server/auth/welcome.js';
import { getDb } from '#lib/server/db/index.js';
import { apiAuditLog, apiKey, people, user, visits } from '#lib/server/db/schema/index.js';
import { withTimestampsForUpdate } from '#lib/server/db/utils.js';
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
	sendWelcome,
	sendAuthAlerts,
	logger,
	disableApiKeysForUser: (userId) => apiKeyStore.disableForUser(userId)
});

// createApiKey / revokeApiKey, shared with budget.
const apiKeyActions = createApiKeyAdminActions({
	auth,
	store: apiKeyStore,
	isAdminUser,
	logger,
	createSchema: createApiKeySchema,
	toPermissions: (scopes) => scopesToPermissions(scopes as ApiScope[])
});

export const load: PageServerLoad = async ({ request, locals }) => {
	// Server loads run in parallel with the layout's guard, so check here too.
	assertAdmin(locals);

	const [createApiKeyForm, createUserForm] = await Promise.all([
		superValidate(zod4(createApiKeySchema), { id: 'createApiKey' }),
		superValidate(zod4(createUserSchema), { id: 'createUser' })
	]);

	try {
		const db = getDb();

		const [{ users }, archivedPeople, apiKeys, auditEntries] = await Promise.all([
			// Through the admin plugin, not the db, so better-auth's own admin check runs.
			auth.api.listUsers({
				query: { limit: ADMIN_USER_LIST_LIMIT, sortBy: 'createdAt', sortDirection: 'desc' },
				headers: request.headers
			}),
			db.query.people.findMany({
				where: eq(people.isArchived, true),
				orderBy: [desc(people.updatedAt)]
			}),
			// Every user's keys, not just the signed-in admin's, so any admin can revoke anyone's.
			apiKeyStore.listAllWithOwner(),
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
		// The plugin's own admin check is authoritative; map its 401/403 to a plain 403 in
		// case the layout guard's view of the role is ever out of date.
		if (err instanceof APIError && (err.statusCode === 401 || err.statusCode === 403)) {
			error(403, 'Forbidden');
		}
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

	...apiKeyActions
} satisfies Actions;
