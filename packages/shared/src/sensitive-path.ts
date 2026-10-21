// Better Auth's reset-password links (and our welcome links, which reuse them) carry the
// token as a path segment: /api/auth/reset-password/<token>?callbackURL=... Opening the
// link doesn't consume the token, so a logged path is a replayable password-reset link.
// Query-string tokens (verify-email, the /reset-password?token= redirect) never reach the
// request logs, which record only the pathname, and Sentry always filters `token` params.
const RESET_TOKEN_SEGMENT = /(\/api\/auth\/reset-password\/)[^/?#\s]+/g;

/** Masks auth tokens carried in a URL path, so the path is safe to log or send to Sentry. */
export function redactSensitivePath(value: string): string {
	return value.replaceAll(RESET_TOKEN_SEGMENT, '$1[redacted]');
}
