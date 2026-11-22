import { isRedirect } from '@sveltejs/kit';
import { describe, expect, it } from 'vitest';

import { GET, POST } from './+server';

type Handler = (event: never) => unknown;

function redirectOf(handler: Handler, path: string) {
	const url = new URL(`https://budget.example.com${path}`);
	try {
		handler({ url } as never);
	} catch (err) {
		if (isRedirect(err)) return { status: err.status, location: err.location };
		throw err;
	}
	throw new Error('expected a redirect');
}

describe('/transactions', () => {
	it('redirects permanently to /expenses', () => {
		expect(redirectOf(GET, '/transactions')).toEqual({ status: 308, location: '/expenses' });
	});

	it('keeps the query string, so month, search links and form actions still land', () => {
		expect(redirectOf(GET, '/transactions?month=3&year=2026').location).toBe(
			'/expenses?month=3&year=2026'
		);
		expect(redirectOf(GET, '/transactions?search=costco').location).toBe('/expenses?search=costco');
		expect(redirectOf(POST, '/transactions?/create').location).toBe('/expenses?/create');
	});
});
