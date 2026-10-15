// The guard every admin form action goes through. Each app binds it to its own `isAdminUser`
// once (budget's `adminFormAction`); the shared admin action factories bind it internally.

import type { RequestEvent } from '@sveltejs/kit';
import type { Infer } from 'sveltekit-superforms';
import { zod4, type ZodValidationSchema } from 'sveltekit-superforms/adapters';
import { message, superValidate, type SuperValidated } from 'sveltekit-superforms/server';

import { invalidAuthForm as invalidForm } from './auth-form-handler';

type AdminUser = NonNullable<App.Locals['user']>;

/**
 * Returns `adminFormAction(schema, handler, options)`: validates the request against `schema`,
 * rejects signed-out callers (401) and non-admins (403) with a `message(form, …)` the page can
 * render, returns the invalid-form message, and only then calls `handler` with the parsed form
 * and the admin user. Actions don't run layout loads, so every admin action needs its own guard.
 */
export function createAdminFormAction(isAdminUser: (user: AdminUser) => boolean) {
	return function adminFormAction<
		S extends ZodValidationSchema,
		R,
		Params extends Partial<Record<string, string>> = Partial<Record<string, string>>
	>(
		schema: S,
		handler: (
			event: RequestEvent<Params>,
			form: SuperValidated<Infer<S, 'zod4'>>,
			user: AdminUser
		) => Promise<R>,
		options: { invalidMessage?: string } = {}
	) {
		return async (event: RequestEvent<Params>) => {
			// Validate before the guard so the guard has a form to attach its message to.
			const form = await superValidate(event.request, zod4(schema));
			const user = event.locals.user;
			if (!user) {
				return message(form, { type: 'error', text: 'Unauthorized' }, { status: 401 });
			}
			if (!isAdminUser(user)) {
				return message(form, { type: 'error', text: 'Forbidden' }, { status: 403 });
			}
			if (!form.valid) {
				return invalidForm(form, options.invalidMessage);
			}
			return handler(event, form, user);
		};
	};
}
