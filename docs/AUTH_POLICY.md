# Auth policy

All three apps apply the same Better Auth policy. Change a row here and in every app together.

| Setting | Policy | Why |
| --- | --- | --- |
| Session cookie cache | Off (`session.cookieCache.enabled: false`) | A ban, removal, role change or password change takes effect on the next request. On local SQLite the extra session read is negligible. |
| Verification and reset emails | Awaited in `sendVerificationEmail` / `sendResetPassword`; the senders throw on failure | Keeps the send inside the request (Fly can suspend the machine once the response returns) and surfaces delivery failures in logs and Sentry. Forgot-password still shows the same banner on failure, so it reveals nothing about the account. |
| "Password changed" email | Sent after a reset (`onPasswordReset`) and after a profile password change, fire-and-forget with `.catch` | The change has already succeeded, so a failed notice must not fail the response. |
| Change-password rate limit | 5 per minute per user (`createUserRateLimiter([5, 'm'])`) | Limits brute-forcing the current password from a hijacked session. |
| Operator alerts (`sendAuthAlerts`) | Blocked sign-in (debounced), password reset requested | Signals of an attack on an account. Verification-sent alerts are not sent: `sendOnSignIn` makes them routine. |
| Display-name length | 100 characters, enforced by `assertNameLength` (`@sheppakai/shared/name-guard`) on user create and update | Covers `/api/auth/update-user` and admin `createUser`, which skip the form schemas. |
| Verification tokens | Stored hashed (`verification.storeIdentifier: 'hashed'`) | A DB dump can't be replayed. |
| Email allowlist and admin guards | `@sheppakai/shared/auth-allowlist`, `@sheppakai/shared/auth-guard` | One implementation for every app. |

Cookie prefixes differ per app (`sheppakai_budget`, `synapse_auth_`, `mealplanner_auth_`) and stay as they are: renaming one signs every user out.
