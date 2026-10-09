# Environment Variables (budget)

Every runtime variable this app reads. Shared conventions, the meaning of the variables all
apps share, and the GitHub Actions secrets are in
[docs/ENVIRONMENT.md](../../../docs/ENVIRONMENT.md). `.env.example` is the local template.

Fly app: `sheppakai-budget`. Validated in [`src/env.ts`](../src/env.ts) unless noted.

## App runtime

| Variable               | Required | Set in prod via     | Notes                                                                                                        |
| ---------------------- | -------- | ------------------- | ------------------------------------------------------------------------------------------------------------ |
| `DATABASE_URL`         | Yes      | Fly secret          | `file:///tmp/build.db`. Only matters for local dev.                                                          |
| `BETTER_AUTH_SECRET`   | Yes      | Fly secret          | At least 32 characters.                                                                                      |
| `BETTER_AUTH_BASE_URL` | Yes      | Fly secret          | Shared entry (`packages/shared/src/env.ts`). Same host as the `APP_URL` GitHub secret, but a separate value. |
| `CRON_SECRET`          | Yes      | Fly secret          | Bearer token for `/api/cron/*`. **Also a GitHub Actions secret, and the two must match** (see the root doc). |
| `BREVO_API_KEY`        | Yes      | Fly secret          |                                                                                                              |
| `BREVO_FROM_ADDRESS`   | Yes      | Fly secret          | Must be a confirmed Brevo sender.                                                                            |
| `ADMIN_USER_IDS`       | Yes      | Fly secret          | The build dummy `dummy_admin_id` is rejected at runtime.                                                     |
| `ALLOWED_EMAILS`       | Yes      | Fly secret          | Enforced by `src/lib/server/auth-allowlist-hook.ts`. Add users from **Admin → Users → Add User**.            |
| `AUTH_ALERTS_URL`      | No       | Fly secret          | ntfy.sh topic. Has a dummy default.                                                                          |
| `BUDGET_ALERTS_URL`    | No       | Fly secret          | ntfy.sh topic for budget alerts. Has a dummy default.                                                        |
| `NODE_ENV`             | No       | Dockerfile `ENV`    | `production` in the image.                                                                                   |
| `ADDRESS_HEADER`       | No       | `fly.toml` `[env]`  | `Fly-Client-IP`. Not in `env.ts`.                                                                            |
| `SENTRY_DSN`           | No       | Default in `env.ts` | Public.                                                                                                      |
| `LOG_LEVEL`            | No       | Not set             | Declared in the shared env entries; read by `packages/logger` from `process.env`.                            |

## GitHub Actions secrets

Environment `budget`: `FLY_API_TOKEN`, `BACKUP_ENCRYPTION_PASSPHRASE`, `SENTRY_AUTH_TOKEN`,
`CRON_SECRET`, `APP_URL`. See the [root doc](../../../docs/ENVIRONMENT.md#github-actions-secrets).

## Verification

```bash
fly secrets list -a sheppakai-budget   # the "Fly secret" rows above (optional ones may be missing)
gh secret list --env budget            # the five secrets above
```
