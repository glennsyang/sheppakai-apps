import type { RequestEvent } from '@sveltejs/kit';
import { error, fail, redirect } from '@sveltejs/kit';

import { SIGN_IN_ROUTE } from './auth-routes';

/**
 * An authenticated user as populated on `event.locals` by `hooks.server.ts`.
 */
type AuthenticatedUser = NonNullable<App.Locals['user']>;

/**
 * Authorization wrapper for SvelteKit actions.
 * Ensures the user is authenticated before executing the action handler.
 *
 * @example
 * export const actions = {
 *   create: requireAuth(async (event, user) => {
 *     // user is guaranteed to be defined here
 *     const userId = user.id;
 *     // ... rest of logic
 *   })
 * };
 */
export function requireAuth<
	T,
	Params extends Partial<Record<string, string>> = Partial<Record<string, string>>
>(
	handler: (event: RequestEvent<Params>, user: AuthenticatedUser) => Promise<T>
): (event: RequestEvent<Params>) => Promise<T | ReturnType<typeof fail>> {
	return async (event: RequestEvent<Params>) => {
		if (!event.locals.user) {
			return fail(401, { error: 'Unauthorized' });
		}
		return handler(event, event.locals.user);
	};
}

/**
 * Returns the authenticated user from locals, or throws a redirect to SIGN_IN_ROUTE.
 * Use in load functions inside the (app) route group where the layout already
 * guarantees authentication — this gives a type-narrowed user without non-null
 * assertions.
 *
 * @example
 * export const load: PageServerLoad = async ({ locals }) => {
 *   const user = getUser(locals);
 *   // user.id is typed as string, no ! required
 * };
 */
export function getUser(locals: App.Locals): AuthenticatedUser {
	if (!locals.user) {
		throw redirect(302, SIGN_IN_ROUTE);
	}
	return locals.user;
}

type RoleFields = { id: string; role?: string | null };

/**
 * Admin checks bound to an app's `ADMIN_USER_IDS`. An admin is anyone listed there or
 * carrying `role === 'admin'` — the same rule the better-auth `admin` plugin applies
 * (`adminUserIds` + `adminRoles`), so an admin bootstrapped by id is never 403'd by the
 * app's own guards. Each app builds these once in `$lib/server/actions/auth-guard`.
 *
 * @param getAdminUserIds - returns the comma-separated `ADMIN_USER_IDS` env value. Read
 *   lazily, so importing the guards never touches the env (route tests that mock
 *   `$app/env/private` without it keep working).
 */
export function createAdminGuards(getAdminUserIds: () => string) {
	function isAdminUser(user: RoleFields): boolean {
		if (user.role === 'admin') {
			return true;
		}
		return getAdminUserIds()
			.split(',')
			.some((id) => id.trim() !== '' && id.trim() === user.id);
	}

	/**
	 * Authorization wrapper for SvelteKit actions. Returns `fail(401)` when
	 * unauthenticated, `fail(403)` when authenticated but not an admin.
	 *
	 * @example
	 * export const actions = {
	 *   restore: requireAdmin(async (event, user) => {
	 *     // user is guaranteed to be an authenticated admin here
	 *   })
	 * };
	 */
	function requireAdmin<
		T,
		Params extends Partial<Record<string, string>> = Partial<Record<string, string>>
	>(
		handler: (event: RequestEvent<Params>, user: AuthenticatedUser) => Promise<T>
	): (event: RequestEvent<Params>) => Promise<T | ReturnType<typeof fail>> {
		return async (event: RequestEvent<Params>) => {
			if (!event.locals.user) {
				return fail(401, { error: 'Unauthorized' });
			}
			if (!isAdminUser(event.locals.user)) {
				return fail(403, { error: 'Forbidden' });
			}
			return handler(event, event.locals.user);
		};
	}

	/**
	 * Load-function guard: redirects to SIGN_IN_ROUTE when unauthenticated (as `getUser`
	 * does), throws `error(403)` when authenticated but not an admin, and returns the
	 * narrowed user otherwise.
	 */
	function assertAdmin(locals: App.Locals): AuthenticatedUser {
		const user = getUser(locals);
		if (!isAdminUser(user)) {
			throw error(403, 'Forbidden');
		}
		return user;
	}

	return { isAdminUser, requireAdmin, assertAdmin };
}
