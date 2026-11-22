import { apiSuccess as sharedApiSuccess } from '@sheppakai/shared/api-response';

import { withPublicUsers } from './public-user';

export * from '@sheppakai/shared/api-response';

/** The shared success envelope, with each record's `user` cut down to `id` and `name`. */
export function apiSuccess(data: unknown, status = 200): Response {
	return sharedApiSuccess(withPublicUsers(data), status);
}
