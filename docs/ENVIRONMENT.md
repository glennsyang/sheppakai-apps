# Environment Variables

What every app shares, plus the GitHub Actions secrets used by the root-level workflows. Each
app's own runtime variables are in its `docs/ENVIRONMENT.md`:

- [apps/budget/docs/ENVIRONMENT.md](../apps/budget/docs/ENVIRONMENT.md)
- [apps/synapse/docs/ENVIRONMENT.md](../apps/synapse/docs/ENVIRONMENT.md)
- [apps/mealplanner/docs/ENVIRONMENT.md](../apps/mealplanner/docs/ENVIRONMENT.md)

## Where variables live

| Kind                    | Where it's set                                                              | Read by                                                    |
| ----------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------- |
| App runtime secrets     | Fly secrets (`fly secrets set … -a <fly-app>`)                              | The running app, validated in `apps/<app>/src/env.ts`      |
| App runtime, not secret | `apps/<app>/Dockerfile` `ENV` or `apps/<app>/fly.toml` `[env]`              | The running app                                            |
| Local development       | `apps/<app>/.env` (copy `.env.example`)                                     | `pnpm --filter <app> dev`                                  |
| CI / infra secrets      | GitHub Actions **environment** secrets (`budget`, `synapse`, `mealplanner`) | Root `.github/workflows/*.yml` only. Never the running app |

`src/env.ts` uses SvelteKit's `defineEnvVars`. During `pnpm build`, each variable falls back to
a build-time dummy so the build never needs real secrets. Those dummies are rejected at
runtime.

## Shared runtime variables

These mean the same thing in every app. Each app's doc covers where they're set and any
differences.

| Variable               | Purpose                                                                                                                                                                                |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`         | SQLite file path. Set in each Dockerfile for production.                                                                                                                               |
| `BETTER_AUTH_SECRET`   | Better Auth session signing key, at least 32 characters.                                                                                                                               |
| `BETTER_AUTH_BASE_URL` | App origin Better Auth builds callback and email links against.                                                                                                                        |
| `BREVO_API_KEY`        | Brevo transactional email.                                                                                                                                                             |
| `BREVO_FROM_ADDRESS`   | Sender address. Must be a confirmed Brevo sender.                                                                                                                                      |
| `ADMIN_USER_IDS`       | Comma-separated user ids bootstrapped as admins by the Better Auth `admin` plugin. Defaults to `dummy_admin_id`.                                                                       |
| `ALLOWED_EMAILS`       | Comma-separated; the only emails that can sign in (exact, case-insensitive). Unset or empty means env validation fails and every request returns 500 (fails closed).                   |
| `AUTH_ALERTS_URL`      | ntfy.sh topic for auth push alerts.                                                                                                                                                    |
| `NODE_ENV`             | `development` \| `production` \| `test`. Set to `production` in each Dockerfile.                                                                                                       |
| `ADDRESS_HEADER`       | `Fly-Client-IP`, set in each `fly.toml`. Makes `getClientAddress()` return the real client IP so the auth rate limiters key per client. Not in `env.ts`; read by `adapter-node`.       |
| `SENTRY_DSN`           | Public (sent to the browser). Defaults to the app's Sentry project DSN in `env.ts`, so no config is needed.                                                                            |
| `LOG_LEVEL`            | `debug` \| `info` \| `warn` \| `error`. Defaults to `debug` in dev, `info` in prod. Read straight from `process.env` by `packages/logger`, so tests can override it with `vi.stubEnv`. |

### Adding a user

Public sign-up is disabled in every app. To add an account:

1. As an admin, add the user from the app's admin page.
2. If the email isn't in `ALLOWED_EMAILS`, the page prints the exact
   `fly secrets set ALLOWED_EMAILS="…" -a <fly-app>` command to run. The command includes the
   current list, because `fly secrets set` replaces the whole value.
3. Once the app restarts, send the welcome email from the user's row.

## GitHub Actions secrets

Each app has a GitHub **environment** with the same name. The workflows pick it with
`environment: <app>`, so each app has its own copy of these secrets. Set them with
`gh secret set <NAME> --env <app>`. Don't `fly secrets set` them.

| Secret                         | Apps            | Used by                                                                               | Notes                                                                                                                                                                                                                                   |
| ------------------------------ | --------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FLY_API_TOKEN`                | all             | `fly-deploy.yml`, `backup-database.yml`                                               | Deploys and `flyctl ssh`. Gives SSH access to production, so rotate it if it leaks.                                                                                                                                                     |
| `BACKUP_ENCRYPTION_PASSPHRASE` | all             | `backup-database.yml`                                                                 | GPG-encrypts the dump before upload. The workflow fails closed if it's unset. See [BACKUP_RESTORE.md](./BACKUP_RESTORE.md).                                                                                                             |
| `SENTRY_AUTH_TOKEN`            | all             | `fly-deploy.yml` → `flyctl deploy --build-secret` → Dockerfile → `vite.config.ts`     | Optional. Lets `sentrySvelteKit()` upload source maps during the Docker build. Mounted as a BuildKit secret, so it never reaches an image layer or the running container. Without it, the deploy still works and just skips the upload. |
| `CRON_SECRET`                  | budget, synapse | `budget-monthly-cron.yml`, `budget-weekly-cron.yml`, `synapse-notifications-cron.yml` | **Must match the app's Fly secret of the same name.** Nothing keeps the two in sync, so update both when you rotate it.                                                                                                                 |
| `APP_URL`                      | budget, synapse | the same cron workflows                                                               | The deployed URL the cron job curls. Same host as `BETTER_AUTH_BASE_URL`, but a separate value.                                                                                                                                         |

### Source maps

Each Dockerfile strips `.map` files from the shipped image (`adapter-node` always emits
them), so source maps are never served publicly. With `SENTRY_AUTH_TOKEN` set, they're
uploaded to Sentry before being stripped, which gives readable stack traces in Sentry. To
enable it, create a Sentry **Organization Auth Token** (org `sheppakai`, scope
`project:releases`) and run `gh secret set SENTRY_AUTH_TOKEN --env <app>`.

## Verification

```bash
fly secrets list -a <fly-app>   # should match the "Fly secret" rows in the app's ENVIRONMENT.md
gh secret list --env <app>      # should match the table above for that app
```
