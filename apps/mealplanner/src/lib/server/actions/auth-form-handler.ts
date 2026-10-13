import { createAuthFormHandler } from '@sheppakai/shared/auth-form-handler';

import { getBetterAuthErrorMessage } from '#lib/server/auth/errors.js';
// The shared auth-action wrapper, bound to this app's logger and Better Auth
// error-message map.
import { logger } from '#lib/server/logger.js';

export { invalidAuthForm } from '@sheppakai/shared/auth-form-handler';

export const handleAuthFormAction = createAuthFormHandler({
	logger,
	getErrorMessage: getBetterAuthErrorMessage
});
