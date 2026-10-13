import { createAuthFormHandler } from '@sheppakai/shared/auth-form-handler';

// The shared auth-action wrapper, bound to this app's logger and Better Auth
// error-message map.
import { logger } from '#lib/server/logger.js';
import { getBetterAuthErrorMessage } from '#lib/utils.js';

export { invalidAuthForm } from '@sheppakai/shared/auth-form-handler';

export const handleAuthFormAction = createAuthFormHandler({
	logger,
	getErrorMessage: getBetterAuthErrorMessage
});
