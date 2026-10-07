# Environment Variables (synapse)

Every runtime variable this app reads. Shared conventions, the meaning of the variables all
apps share, the "adding a user" steps, and the GitHub Actions secrets are in
[docs/ENVIRONMENT.md](../../../docs/ENVIRONMENT.md). `.env.example` is the local template.

Fly app: `synapse-dev`. Validated in [`src/env.ts`](../src/env.ts) unless noted.

## App runtime

| Variable               | Required | Set in prod via          | Notes                                                                                                                                |
| ---------------------- | -------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `DATABASE_URL`         | Yes      | Dockerfile `ENV`         | `/data/synapse.db`.                                                                                                                  |
| `BETTER_AUTH_SECRET`   | Yes      | Fly secret               | At least 32 characters.                                                                                                              |
| `BETTER_AUTH_BASE_URL` | Yes      | Fly secret               |                                                                                                                                      |
| `CRON_SECRET`          | Yes      | Fly secret               | At least 16 characters. Bearer token for `/api/cron/*`. **Also a GitHub Actions secret, and the two must match** (see the root doc). |
| `AUTH_ALERTS_URL`      | Yes      | Fly secret               | ntfy.sh topic for auth events.                                                                                                       |
| `REMINDER_ALERTS_URL`  | Yes      | Fly secret               | ntfy.sh topic for reminders.                                                                                                         |
| `BREVO_API_KEY`        | Yes      | Fly secret               |                                                                                                                                      |
| `BREVO_FROM_ADDRESS`   | Yes      | Fly secret               | Must be a confirmed Brevo sender.                                                                                                    |
| `ADMIN_USER_IDS`       | No       | Fly secret               | Defaults to `dummy_admin_id`.                                                                                                        |
| `ALLOWED_EMAILS`       | Yes      | Fly secret               | Enforced by `src/lib/server/auth-allowlist-hook.ts`.                                                                                 |
| `NODE_ENV`             | No       | Dockerfile `ENV`         | `production` in the image.                                                                                                           |
| `ADDRESS_HEADER`       | No       | `fly.toml` `[env]`       | `Fly-Client-IP`. Not in `env.ts`.                                                                                                    |
| `SENTRY_DSN`           | No       | Default in `env.ts`      | Public.                                                                                                                              |
| `LOG_LEVEL`            | No       | Not set                  | Declared in `env.ts`, but `packages/logger` reads it from `process.env`.                                                             |
| `FLY_APP_NAME`         | No       | Set automatically by Fly | Used in the `fly secrets set … -a <app>` hint shown after creating a user.                                                           |

## GitHub Actions secrets

Environment `synapse`: `FLY_API_TOKEN`, `BACKUP_ENCRYPTION_PASSPHRASE`, `SENTRY_AUTH_TOKEN`,
`CRON_SECRET`, `APP_URL`. See the [root doc](../../../docs/ENVIRONMENT.md#github-actions-secrets).

## Verification

```bash
fly secrets list -a synapse-dev   # exactly the "Fly secret" rows above, no more, no less
gh secret list --env synapse      # the five secrets above
```
