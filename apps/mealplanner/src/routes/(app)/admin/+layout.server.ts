import { assertAdmin } from '$lib/server/actions/auth-guard';

import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	return { user: assertAdmin(locals) };
};
