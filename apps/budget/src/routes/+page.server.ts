import { createRedirectIfAuthenticated } from '@sheppakai/shared/auth-form-helpers';

import { POST_LOGIN_ROUTE } from '#lib/auth-routes.js';

import type { PageServerLoad } from './$types';

const redirectIfAuthenticated = createRedirectIfAuthenticated(POST_LOGIN_ROUTE);

export const load: PageServerLoad = async ({ locals }) => {
	redirectIfAuthenticated(locals.user);
	return {};
};
