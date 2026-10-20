// Admin management of every user's API keys (list, create, revoke, disable on ban/demotion),
// shared by the apps with an /api/v1 surface. Reads and writes go through Better Auth's own
// adapter, so it works with each app's table and column naming without app-side queries.

import type { ZodValidationSchema } from 'sveltekit-superforms/adapters';
import { message } from 'sveltekit-superforms/server';
import { z } from 'zod';

import { createAdminFormAction } from './admin-form-action';
import { parsePermissions } from './api-scopes';

type WhereClause = {
	field: string;
	value: string | boolean | string[];
	operator?: 'eq' | 'in';
};

/** The Better Auth adapter methods used here (`(await auth.$context).adapter`). */
interface ApiKeyAdapter {
	findMany<T>(data: {
		model: string;
		where?: WhereClause[];
		select?: string[];
		sortBy?: { field: string; direction: 'asc' | 'desc' };
	}): Promise<T[]>;
	updateMany(data: {
		model: string;
		where: WhereClause[];
		update: Record<string, unknown>;
	}): Promise<number>;
	deleteMany(data: { model: string; where: WhereClause[] }): Promise<number>;
}

interface ApiKeyAuth {
	$context: Promise<{ adapter: ApiKeyAdapter }>;
	api: {
		createApiKey(ctx: {
			body: {
				name: string;
				userId: string;
				permissions: Record<string, string[]>;
				expiresIn?: number;
			};
		}): Promise<{ id: string; key: string }>;
	};
}

type ApiKeyRow = {
	id: string;
	name: string | null;
	start: string | null;
	enabled: boolean;
	// Stored by the plugin as a JSON string.
	permissions: string | null;
	expiresAt: Date | null;
	createdAt: Date;
	lastRequest: Date | null;
	referenceId: string;
};

export type ApiKeyWithOwner = Omit<ApiKeyRow, 'permissions' | 'referenceId'> & {
	permissions: Record<string, string[]> | null;
	ownerId: string;
	ownerName: string;
	ownerEmail: string;
};

// The plugin's model; the hashed `key` column is deliberately never selected.
const API_KEY_MODEL = 'apikey';
const LISTED_FIELDS: (keyof ApiKeyRow)[] = [
	'id',
	'name',
	'start',
	'enabled',
	'permissions',
	'expiresAt',
	'createdAt',
	'lastRequest',
	'referenceId'
];

/**
 * Admin-wide key queries. `auth.api.listApiKeys` / `deleteApiKey` only ever touch the calling
 * session's own keys; an admin has to see and revoke keys that belong to other users too (a
 * banned or demoted admin can't be trusted to revoke their own).
 */
export function createApiKeyStore(auth: Pick<ApiKeyAuth, '$context'>) {
	const adapter = async () => (await auth.$context).adapter;

	return {
		/** Every user's keys, newest first, each with its owner. */
		async listAllWithOwner(): Promise<ApiKeyWithOwner[]> {
			const db = await adapter();
			const keys = await db.findMany<ApiKeyRow>({
				model: API_KEY_MODEL,
				select: LISTED_FIELDS,
				sortBy: { field: 'createdAt', direction: 'desc' }
			});
			const ownerIds = [...new Set(keys.map((key) => key.referenceId))];
			const owners =
				ownerIds.length > 0
					? await db.findMany<{ id: string; name: string; email: string }>({
							model: 'user',
							where: [{ field: 'id', operator: 'in', value: ownerIds }],
							select: ['id', 'name', 'email']
						})
					: [];
			const ownersById = new Map(owners.map((owner) => [owner.id, owner]));

			// Keys cascade with their owner, so a key without one is a dangling row: leave it out.
			// Fields are copied one by one, not spread: not every adapter honours `select`, and
			// the row must never carry the hashed `key` to the page.
			return keys.flatMap((key) => {
				const owner = ownersById.get(key.referenceId);
				if (!owner) return [];
				return [
					{
						id: key.id,
						name: key.name,
						start: key.start,
						enabled: key.enabled,
						permissions: parsePermissions(key.permissions),
						expiresAt: key.expiresAt,
						createdAt: key.createdAt,
						lastRequest: key.lastRequest,
						ownerId: owner.id,
						ownerName: owner.name,
						ownerEmail: owner.email
					}
				];
			});
		},

		/** Deletes any user's key by id. Returns whether a key was actually deleted. */
		async deleteById(keyId: string): Promise<boolean> {
			const db = await adapter();
			return (
				(await db.deleteMany({ model: API_KEY_MODEL, where: [{ field: 'id', value: keyId }] })) > 0
			);
		},

		/**
		 * Disables every enabled key a user owns (on ban or demotion). Disabled rather than
		 * deleted so the admin page still shows what the user had; `verifyApiKey` rejects a
		 * disabled key, and unbanning or re-promoting the user does not silently revive it.
		 * Returns how many keys were disabled.
		 */
		async disableForUser(userId: string): Promise<number> {
			const db = await adapter();
			return db.updateMany({
				model: API_KEY_MODEL,
				where: [
					{ field: 'referenceId', value: userId },
					{ field: 'enabled', value: true }
				],
				update: { enabled: false, updatedAt: new Date() }
			});
		}
	};
}

/** Better Auth key ids are plain strings, not this repo's UUID table ids. */
export const revokeApiKeySchema = z.object({
	id: z.string().min(1, 'API key ID is required')
});

type CreateApiKeyInput = { name: string; scopes: string[]; expiresInDays?: number };

/** Any app's create-key schema: its scopes enum differs, but every one parses to this shape. */
type CreateApiKeySchema = ZodValidationSchema & z.ZodType<CreateApiKeyInput>;

export interface ApiKeyAdminActionsDeps<S extends CreateApiKeySchema> {
	auth: Pick<ApiKeyAuth, 'api'>;
	/** The app's `createApiKeyStore(auth)`. */
	store: Pick<ReturnType<typeof createApiKeyStore>, 'deleteById'>;
	isAdminUser: (user: { id: string; role?: string | null }) => boolean;
	logger: {
		info(message: string, meta?: Record<string, unknown>): void;
		error(message: string, error?: unknown): void;
	};
	/** The app's create-key form schema; its scopes enum is app-specific. */
	createSchema: S;
	/** Maps the selected scopes to the plugin's `permissions` shape. */
	toPermissions: (scopes: string[]) => Record<string, string[]>;
}

/** Returns the `createApiKey` / `revokeApiKey` admin actions. */
export function createApiKeyAdminActions<S extends CreateApiKeySchema>(
	deps: ApiKeyAdminActionsDeps<S>
) {
	const { auth, store, logger } = deps;
	const adminAction = createAdminFormAction(deps.isAdminUser);

	return {
		createApiKey: adminAction(deps.createSchema, async (_event, form, user) => {
			// `S` is constrained to parse to CreateApiKeyInput, but superforms' Infer<S> can't be
			// resolved while S is generic, so TypeScript sees `{}`.
			// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- generic Infer<S>, see above
			const data = form.data as unknown as CreateApiKeyInput;
			try {
				// Deliberately not passing `headers`: the plugin only accepts server-only fields like
				// `permissions` on a "trusted server" call (no headers/request on the context), and
				// rejects them outright on a session-based "client" call. The admin guard above is
				// the authorization.
				const created = await auth.api.createApiKey({
					body: {
						name: data.name,
						userId: user.id,
						permissions: deps.toPermissions(data.scopes),
						expiresIn: data.expiresInDays ? data.expiresInDays * 86400 : undefined
					}
				});
				logger.info('API key created', { keyId: created.id, scopes: data.scopes });

				// The plaintext key is only ever returned here, once. It rides alongside the usual
				// message-bearing form, so `$message` / `form.valid` keep working as on every page.
				form.message = {
					type: 'success',
					text: 'API key created. Copy it now — it will not be shown again.'
				};
				return { form, apiKey: created.key };
			} catch (error) {
				logger.error('Failed to create API key', error);
				return message(
					form,
					{ type: 'error', text: 'Failed to create API key. Please try again.' },
					{ status: 500 }
				);
			}
		}),

		revokeApiKey: adminAction(
			revokeApiKeySchema,
			async (_event, form, user) => {
				try {
					if (!(await store.deleteById(form.data.id))) {
						return message(form, { type: 'error', text: 'API key not found.' }, { status: 404 });
					}
					logger.info('API key revoked', { keyId: form.data.id, revokedBy: user.id });
				} catch (error) {
					logger.error('Failed to revoke API key', error);
					return message(
						form,
						{ type: 'error', text: 'Failed to revoke API key.' },
						{ status: 500 }
					);
				}
				return message(form, { type: 'success', text: 'API key revoked.' });
			},
			{ invalidMessage: 'API key ID is required' }
		)
	};
}
