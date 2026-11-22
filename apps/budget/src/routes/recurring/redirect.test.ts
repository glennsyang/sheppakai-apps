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

describe('/recurring', () => {
	it('redirects permanently to /recurring-bills', () => {
		expect(redirectOf(GET as Handler, '/recurring')).toEqual({
			status: 308,
			location: '/recurring-bills'
		});
	});

	it('keeps the query string, so month links and form actions still land', () => {
		expect(redirectOf(GET as Handler, '/recurring?month=3&year=2026').location).toBe(
			'/recurring-bills?month=3&year=2026'
		);
		expect(redirectOf(POST as Handler, '/recurring?/togglePaid').location).toBe(
			'/recurring-bills?/togglePaid'
		);
	});
});
