import { APIError } from 'better-auth/api';

/** The longest display name any app accepts; each app's name schemas use the same cap. */
export const MAX_NAME_LENGTH = 100;

/**
 * `databaseHooks.user.{create,update}.before` guard. The profile form already caps the
 * name, but `/api/auth/update-user` and admin `createUser` write straight through
 * better-auth, so this bounds the display name on every path.
 */
export async function assertNameLength(data: { name?: string | null }): Promise<void> {
	if (typeof data.name === 'string' && data.name.length > MAX_NAME_LENGTH) {
		throw new APIError('BAD_REQUEST', {
			message: `Name must be at most ${MAX_NAME_LENGTH} characters`
		});
	}
}
