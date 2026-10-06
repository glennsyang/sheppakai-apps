/**
 * Canonical auth route paths.
 *
 * Shared by every app, and imported by both client (`.svelte`) and server code. No inline
 * route literals anywhere else. Convention: a `(auth)` route group with unprefixed URLs and
 * the `sign-in` / `sign-out` verb set. Each app's `$lib/auth-routes` re-exports these and
 * adds its own `POST_LOGIN_ROUTE`.
 */

/** Where unauthenticated visitors are sent. */
export const SIGN_IN_ROUTE = '/sign-in';

/** Sign-out form action target. */
export const SIGN_OUT_ROUTE = '/sign-out';

/** Request a password-reset link. */
export const FORGOT_PASSWORD_ROUTE = '/forgot-password';

/** Complete a password reset (expects a `?token`). */
export const RESET_PASSWORD_ROUTE = '/reset-password';

/** Email-verification landing page (expects an `?email`). */
export const VERIFY_EMAIL_ROUTE = '/verify-email';
