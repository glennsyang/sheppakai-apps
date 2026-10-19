import { isRedirect } from '@sveltejs/kit';
import type { Redirect } from '@sveltejs/kit';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { createAuthLoadForm, createRedirectIfAuthenticated } from './auth-form-helpers';

const mockUser = { id: 'user_123' };
const redirectIfAuthenticated = createRedirectIfAuthenticated('/dashboard');
const schema = z.object({ email: z.string() });

describe('redirectIfAuthenticated', () => {
	it('throws a redirect to /dashboard when the user is authenticated', () => {
		expect.assertions(2);
		let caughtError: unknown;

		try {
			redirectIfAuthenticated(mockUser as App.Locals['user']);
		} catch (e) {
			caughtError = e;
		}

		expect(isRedirect(caughtError)).toBe(true);
		expect((caughtError as Redirect).location).toBe('/dashboard');
	});

	it('does not throw when signed out', () => {
		expect(() => redirectIfAuthenticated(null)).not.toThrow();
	});
});

describe('createAuthLoadForm', () => {
	it('returns a superforms object with no banner', async () => {
		const form = await createAuthLoadForm(schema);
		expect(form.message).toBeUndefined();
	});
});
