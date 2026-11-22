import { redirect } from '@sveltejs/kit';

import type { RequestHandler } from './$types';

// `/transactions` moved to `/expenses` (#321). 308 keeps the method, so a form post from a
// page loaded before the move still reaches its action.
const toExpenses: RequestHandler = ({ url }) => {
	throw redirect(308, `/expenses${url.search}`);
};

export const GET = toExpenses;
export const POST = toExpenses;
