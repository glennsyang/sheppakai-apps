// The shared auth-page `load` helpers, redirecting to this app's POST_LOGIN_ROUTE.
import { POST_LOGIN_ROUTE } from '$lib/auth-routes';
import { createRedirectIfAuthenticated } from '@sheppakai/shared/auth-form-helpers';

export { createAuthLoadForm } from '@sheppakai/shared/auth-form-helpers';

export const redirectIfAuthenticated = createRedirectIfAuthenticated(POST_LOGIN_ROUTE);
