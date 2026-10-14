// Admin user-management actions (role, ban, unban, remove, create, welcome email), shared by
// every app. Each app binds its own auth instance, alerts and welcome email once, in its admin
// `+page.server.ts`, and spreads the result into `actions`.

import { randomBytes } from 'node:crypto';

import type { RequestEvent } from '@sveltejs/kit';
import { isRedirect } from '@sveltejs/kit';
import { APIError } from 'better-auth/api';
import type { Infer } from 'sveltekit-superforms';
import { zod4, type ZodValidationSchema } from 'sveltekit-superforms/adapters';
import { message, setError, superValidate, type SuperValidated } from 'sveltekit-superforms/server';

import {
	adminUserIdSchema,
	banUserSchema,
	createUserSchema,
	setRoleSchema,
	type UserRole
} from './admin-user-schemas';
import { buildAllowlistCommand, formatAlertEmail, isEmailAllowed } from './auth-allowlist';
import { invalidAuthForm as invalidForm } from './auth-form-handler';
import { getBetterAuthErrorCode } from './better-auth-errors';

type MessageStatus = NonNullable<Parameters<typeof message>[2]>['status'];
type AdminUser = NonNullable<App.Locals['user']> & { email?: string };
type TargetUser = { id: string; email: string; name: string };

/** The better-auth `admin` plugin endpoints these actions call. */
interface AdminAuthApi {
	setRole(ctx: {
		body: { userId: string; role: UserRole };
		headers: Headers;
	}): Promise<{ user: { email: string } }>;
	banUser(ctx: {
		body: { userId: string; banReason?: string };
		headers: Headers;
	}): Promise<{ user: { email: string } }>;
	unbanUser(ctx: { body: { userId: string }; headers: Headers }): Promise<unknown>;
	removeUser(ctx: { body: { userId: string }; headers: Headers }): Promise<unknown>;
	getUser(ctx: { query: { id: string }; headers: Headers }): Promise<TargetUser>;
	createUser(ctx: {
		body: { name: string; email: string; role: UserRole; password: string };
		headers: Headers;
	}): Promise<{ user: TargetUser }>;
}

export interface AdminUserActionsDeps {
	/** Used in alert titles, e.g. 'Synapse'. */
	appName: string;
	auth: { api: AdminAuthApi };
	/** The app's `isAdminUser` from `createAdminGuards`. */
	isAdminUser: (user: { id: string; role?: string | null }) => boolean;
	allowedEmails: Set<string>;
	/** `FLY_APP_NAME`, for the `fly secrets set` hint when a new user isn't allowlisted. */
	flyAppName?: string;
	/** Sends the welcome email. Throws when the send fails. */
	sendWelcome: (user: TargetUser) => Promise<void>;
	/** Each app's `sendAuthAlerts`. Must not throw. */
	sendAuthAlerts: (message: string, title: string, priority: number) => unknown;
	logger: {
		info(message: string, meta?: Record<string, unknown>): void;
		warn(message: string, meta?: Record<string, unknown>): void;
		error(message: string, error?: unknown): void;
	};
	/**
	 * Apps with API keys: disables every key the user owns after a ban or demotion, so
	 * unbanning or re-promoting them later doesn't quietly bring the old keys back.
	 */
	disableApiKeysForUser?: (userId: string) => Promise<number>;
}

/**
 * Returns the admin user-management actions. Every action validates its form, then rejects
 * non-admins with a `message(form, …)` (401/403) before doing anything, so the page can show
 * the reason. An admin can't change their own role, ban or remove themselves.
 */
export function createAdminUserActions(deps: AdminUserActionsDeps) {
	const { appName, auth, isAdminUser, allowedEmails, sendAuthAlerts, logger } = deps;

	function alert(text: string, title: string) {
		return sendAuthAlerts(text, `${appName} - ${title}`, 3);
	}

	/**
	 * Validates against `schema`, rejects non-admins, returns the invalid-form message, and
	 * only then calls `handler`. Actions don't run layout loads, so each needs its own guard.
	 */
	function adminAction<S extends ZodValidationSchema, R>(
		schema: S,
		handler: (
			event: RequestEvent,
			form: SuperValidated<Infer<S, 'zod4'>>,
			admin: AdminUser
		) => Promise<R>,
		invalidMessage?: string
	) {
		return async (event: RequestEvent) => {
			const form = await superValidate(event.request, zod4(schema));
			const user = event.locals.user;
			if (!user) {
				return message(form, { type: 'error', text: 'Unauthorized' }, { status: 401 });
			}
			if (!isAdminUser(user)) {
				return message(form, { type: 'error', text: 'Forbidden' }, { status: 403 });
			}
			if (!form.valid) {
				return invalidForm(form, invalidMessage);
			}
			return handler(event, form, user);
		};
	}

	/**
	 * Turns a failed `auth.api.*` call into a form message. better-auth raises `APIError` for
	 * expected rejections (target not found, "can't ban an admin", …): surface those with their
	 * real status and message and log at `warn`. Anything else is a logged, generic 500.
	 */
	function adminActionError<T extends Record<string, unknown>>(
		form: SuperValidated<T>,
		fallback: string,
		err: unknown
	) {
		if (isRedirect(err)) throw err;
		if (err instanceof APIError) {
			logger.warn(fallback, { status: err.statusCode, reason: err.message });
			return message(
				form,
				{ type: 'error', text: err.body?.message || fallback },
				{ status: (err.statusCode || 400) as MessageStatus }
			);
		}
		logger.error(fallback, err);
		return message(form, { type: 'error', text: fallback }, { status: 500 });
	}

	/** Returns false when disabling failed, so the action reports it instead of full success. */
	async function disableKeysAfter(action: 'ban' | 'demotion', userId: string) {
		if (!deps.disableApiKeysForUser) return true;
		try {
			const count = await deps.disableApiKeysForUser(userId);
			if (count > 0) {
				logger.info(`Disabled API keys after ${action}`, { userId, count });
			}
			return true;
		} catch (error) {
			logger.error(`Failed to disable API keys after ${action}`, { userId, error });
			return false;
		}
	}

	const allowlistCommandFor = (email: string) =>
		buildAllowlistCommand(allowedEmails, email, deps.flyAppName);

	return {
		setRole: adminAction(
			setRoleSchema,
			async ({ request }, form, admin) => {
				const { userId, role } = form.data;
				if (userId === admin.id) {
					return invalidForm(form, 'You cannot change your own role');
				}

				try {
					const { user: target } = await auth.api.setRole({
						body: { userId, role },
						headers: request.headers
					});
					logger.info('User role changed by admin', { adminId: admin.id, userId, role });
					await alert(
						`🔑 Admin ${formatAlertEmail(admin.email ?? '')} set ${formatAlertEmail(target.email)}'s role to ${role}.`,
						'Role Changed Alert'
					);
				} catch (err) {
					return adminActionError(form, 'Failed to change user role', err);
				}

				// A user listed in ADMIN_USER_IDS stays an admin whatever their role, so their keys stay valid.
				const demoted = !isAdminUser({ id: userId, role });
				if (demoted && !(await disableKeysAfter('demotion', userId))) {
					return message(
						form,
						{ type: 'error', text: 'Role changed, but failed to disable their API keys' },
						{ status: 500 }
					);
				}

				return message(form, { type: 'success', text: `Role changed to ${role}.` });
			},
			'Invalid role change request'
		),

		banUser: adminAction(
			banUserSchema,
			async ({ request }, form, admin) => {
				const { userId, banReason } = form.data;
				if (userId === admin.id) {
					return invalidForm(form, 'You cannot ban yourself');
				}

				try {
					// better-auth also revokes the user's sessions, so a ban takes effect immediately.
					const { user: target } = await auth.api.banUser({
						body: { userId, ...(banReason ? { banReason } : {}) },
						headers: request.headers
					});
					logger.info('User banned by admin', { adminId: admin.id, userId });
					await alert(
						`🚫 Admin ${formatAlertEmail(admin.email ?? '')} banned ${formatAlertEmail(target.email)}.`,
						'User Banned Alert'
					);
				} catch (err) {
					return adminActionError(form, 'Failed to ban user', err);
				}

				if (!(await disableKeysAfter('ban', userId))) {
					return message(
						form,
						{ type: 'error', text: 'User banned, but failed to disable their API keys' },
						{ status: 500 }
					);
				}

				return message(form, { type: 'success', text: 'User banned.' });
			},
			'Invalid ban request'
		),

		unbanUser: adminAction(
			adminUserIdSchema,
			async ({ request }, form, admin) => {
				const { userId } = form.data;
				try {
					await auth.api.unbanUser({ body: { userId }, headers: request.headers });
					logger.info('User unbanned by admin', { adminId: admin.id, userId });
				} catch (err) {
					return adminActionError(form, 'Failed to unban user', err);
				}

				return message(form, { type: 'success', text: 'User unbanned.' });
			},
			'User ID is required'
		),

		removeUser: adminAction(
			adminUserIdSchema,
			async ({ request }, form, admin) => {
				const { userId } = form.data;
				if (userId === admin.id) {
					return invalidForm(form, 'You cannot remove your own account');
				}

				try {
					// removeUser returns only { success }, so look the email up first for the alert.
					// A missing user surfaces as better-auth's 404 APIError.
					const target = await auth.api.getUser({
						query: { id: userId },
						headers: request.headers
					});
					await auth.api.removeUser({ body: { userId }, headers: request.headers });
					logger.info('User removed by admin', { adminId: admin.id, userId });
					await alert(
						`🗑️ Admin ${formatAlertEmail(admin.email ?? '')} removed ${formatAlertEmail(target.email)}.`,
						'User Removed Alert'
					);
				} catch (err) {
					return adminActionError(form, 'Failed to remove user', err);
				}

				return message(form, { type: 'success', text: 'User removed.' });
			},
			'User ID is required'
		),

		createUser: adminAction(createUserSchema, async ({ request }, form, admin) => {
			const { name, email, role } = form.data;

			let created: TargetUser;
			try {
				// A throwaway password nobody ever sees; the user sets their own from the welcome email.
				const result = await auth.api.createUser({
					body: { name, email, role, password: randomBytes(32).toString('base64url') },
					headers: request.headers
				});
				created = result.user;
			} catch (err) {
				const code = getBetterAuthErrorCode(err);
				if (code === 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL' || code === 'USER_ALREADY_EXISTS') {
					return setError(form, 'email', 'A user with this email already exists.');
				}
				return adminActionError(form, 'Failed to create user', err);
			}

			logger.info('User created by admin', { adminId: admin.id, userId: created.id, role });
			await alert(
				`👤 Admin ${formatAlertEmail(admin.email ?? '')} created ${role} account for ${formatAlertEmail(email)}.`,
				'User Created Alert'
			);

			// Sign-in is gated by the ALLOWED_EMAILS Fly secret, which the app can't change at
			// runtime. Hold the welcome email until the address is allowlisted, so the user doesn't
			// get instructions that won't work yet.
			if (!isEmailAllowed(allowedEmails, email)) {
				form.message = {
					type: 'success',
					text: `User created. Add ${email} to ALLOWED_EMAILS, then send the welcome email.`
				};
				return { form, allowlistCommand: allowlistCommandFor(email) };
			}

			try {
				await deps.sendWelcome(created);
			} catch (err) {
				logger.error('User created but welcome email failed', { userId: created.id, err });
				// 200, not 5xx: the account exists, so the page should still refresh its user list.
				return message(form, {
					type: 'error',
					text: 'User created, but the welcome email failed to send. Use "Send welcome email" to retry.'
				});
			}

			return message(form, {
				type: 'success',
				text: `User created and welcome email sent to ${email}.`
			});
		}),

		sendWelcomeEmail: adminAction(
			adminUserIdSchema,
			async ({ request }, form, admin) => {
				try {
					const target = await auth.api.getUser({
						query: { id: form.data.userId },
						headers: request.headers
					});

					if (!isEmailAllowed(allowedEmails, target.email)) {
						return invalidForm(
							form,
							`${target.email} isn't in ALLOWED_EMAILS yet. Run: ${allowlistCommandFor(target.email)}`
						);
					}

					await deps.sendWelcome(target);
					logger.info('Welcome email sent by admin', { adminId: admin.id, userId: target.id });
					await alert(
						`✉️ Admin ${formatAlertEmail(admin.email ?? '')} sent a welcome email to ${formatAlertEmail(target.email)}.`,
						'Welcome Email Alert'
					);

					return message(form, { type: 'success', text: `Welcome email sent to ${target.email}.` });
				} catch (err) {
					return adminActionError(form, 'Failed to send welcome email', err);
				}
			},
			'User ID is required'
		)
	};
}
