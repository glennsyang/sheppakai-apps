import { createAuthRouteActions } from '@sheppakai/shared/auth-route-actions';

// The shared `(auth)` page loads and actions, bound to this app's Better Auth instance,
// logger and post-login route.
import { POST_LOGIN_ROUTE } from '#lib/auth-routes.js';
import { handleAuthFormAction } from '#lib/server/actions/auth-form-handler.js';
import { auth } from '#lib/server/auth/index.js';
import { logger } from '#lib/server/logger.js';
import { createAuthRateLimiter } from '#lib/server/rate-limiter.js';

export const authRouteActions = createAuthRouteActions({
	auth,
	logger,
	handleAuthFormAction,
	createAuthRateLimiter,
	postLoginRoute: POST_LOGIN_ROUTE
});
