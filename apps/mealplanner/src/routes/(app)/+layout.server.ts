import { SIGN_IN_ROUTE } from '$lib/auth-routes';
import { isAdminUser } from '$lib/server/actions/auth-guard';
import { redirect } from '@sveltejs/kit';

import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	if (!locals.user) {
		throw redirect(302, SIGN_IN_ROUTE);
	}

	return {
		user: locals.user,
		isAdmin: isAdminUser(locals.user)
	};
};
