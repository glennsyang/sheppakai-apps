import { createApiKeyAdminActions } from '@sheppakai/shared/api-key-admin';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';

import { scopesToPermissions } from '#lib/api-scopes.js';
import { createApiKeySchema } from '#lib/schemas/apiKeys.js';
import { assertAdmin, isAdminUser } from '#lib/server/actions/auth-guard.js';
import { apiKeyStore } from '#lib/server/api/api-key-store.js';
import { auth } from '#lib/server/auth/index.js';
import { logger } from '#lib/server/logger.js';

import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	// The admin layout guards this too, but layout and page loads run in parallel and this
	// load returns every user's keys, so it checks for itself rather than relying on that.
	assertAdmin(locals);

	const createForm = await superValidate(zod4(createApiKeySchema), { id: 'createApiKey' });

	try {
		const apiKeys = await apiKeyStore.listAllWithOwner();
		return { apiKeys, createForm };
	} catch (error) {
		logger.error('Failed to load API keys', error);
		return {
			apiKeys: [],
			loadError: 'Failed to load API keys. Please try refreshing the page.',
			createForm
		};
	}
};

// createApiKey / revokeApiKey, shared with budget and synapse.
export const actions: Actions = createApiKeyAdminActions({
	auth,
	store: apiKeyStore,
	isAdminUser,
	logger,
	createSchema: createApiKeySchema,
	toPermissions: scopesToPermissions
});
