import { redirect } from '@sveltejs/kit';

import type { RequestHandler } from './$types';

// `/recurring` moved to `/recurring-bills` (#320). 308 keeps the method, so a form post from a
// page loaded before the move still reaches its action.
const toRecurringBills: RequestHandler = ({ url }) => {
	throw redirect(308, `/recurring-bills${url.search}`);
};

export const GET = toRecurringBills;
export const POST = toRecurringBills;
