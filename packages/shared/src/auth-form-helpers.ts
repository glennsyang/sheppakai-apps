// Auth-page `load` helpers. Each app binds its POST_LOGIN_ROUTE via
// `createRedirectIfAuthenticated` in its own `#lib/server/auth/form-helpers`.

import { redirect } from '@sveltejs/kit';
import { zod4 } from 'sveltekit-superforms/adapters';
import { superValidate } from 'sveltekit-superforms/server';
import type { ZodType } from 'zod';

type AuthSchema = ZodType<Record<string, unknown>>;

/**
 * Returns `redirectIfAuthenticated(user)`, which sends an already-authenticated
 * visitor away from an auth page (sign-in, register, …) to `postLoginRoute`.
 * No-op when signed out.
 */
export function createRedirectIfAuthenticated(postLoginRoute: string) {
	return function redirectIfAuthenticated(user: App.Locals['user']): void {
		if (user) {
			throw redirect(302, postLoginRoute);
		}
	};
}

/**
 * Builds the superforms object for an auth page `load`. Never reflects query-string
 * text into the banner: a `?message=` link would let anyone put their own text on the
 * real domain. Pages that need a redirect banner read a whitelisted flag instead (as
 * sign-in does with `?reset=success`) and render fixed copy.
 */
export async function createAuthLoadForm<TSchema extends AuthSchema>(schema: TSchema) {
	return superValidate(zod4(schema));
}
