import { isRedirect } from '@sveltejs/kit';
import { describe, expect, it, vi } from 'vitest';

const { signInEmail } = vi.hoisted(() => ({
	signInEmail: vi.fn<(options: unknown) => Promise<unknown>>(async () => ({}))
}));

vi.mock('#lib/server/auth/index.js', () => ({ auth: { api: { signInEmail } } }));
vi.mock('#lib/server/logger.js', () => ({ logger: { error: vi.fn<() => void>() } }));
vi.mock('#lib/server/rate-limiter.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('#lib/server/rate-limiter.js')>()),
	createAuthRateLimiter: () => ({ check: async () => ({ limited: false, retryAfter: 0 }) })
}));

import { POST_LOGIN_ROUTE } from '#lib/auth-routes.js';

import { actions } from '../../routes/(auth)/sign-in/+page.server';

// The (auth) page behaviour is tested in @sheppakai/shared/auth-route-actions; this checks the
// app's binding: its Better Auth instance and its post-login route.
describe('auth route actions — wiring', () => {
	it("signs in through this app's Better Auth instance and lands on its post-login route", async () => {
		const request = new Request('https://app.example.com/sign-in', {
			method: 'POST',
			body: new URLSearchParams({ email: 'user@example.com', password: 'correct-horse-battery' })
		});

		const err = await Promise.resolve(actions.default({ request } as never)).catch(
			(error: unknown) => error
		);

		expect(signInEmail).toHaveBeenCalledOnce();
		expect(isRedirect(err) && err.location).toBe(POST_LOGIN_ROUTE);
	});
});
