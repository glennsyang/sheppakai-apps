# Environment Variables (mealplanner)

Every runtime variable this app reads. Shared conventions, the meaning of the variables all
apps share, the "adding a user" steps, and the GitHub Actions secrets are in
[docs/ENVIRONMENT.md](../../../docs/ENVIRONMENT.md). `.env.example` is the local template.
If it and this doc ever disagree, this doc and `src/env.ts` win: update `.env.example`.

Fly app: `sheppakai-mealplanner`. Validated in [`src/env.ts`](../src/env.ts) unless noted.

## App runtime

| Variable               | Required | Set in prod via     | Notes                                                                                                                                                                                                                                    |
| ---------------------- | -------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`         | Yes      | Fly secret          | `file:///tmp/build.db`. Dev default: `./data/db.sqlite`.                                                                                                                                                                                 |
| `BETTER_AUTH_SECRET`   | Yes      | Fly secret          | At least 32 characters.                                                                                                                                                                                                                  |
| `BETTER_AUTH_BASE_URL` | Yes      | Fly secret          | Shared entry (`packages/shared/src/env.ts`).                                                                                                                                                                                             |
| `BREVO_API_KEY`        | Yes      | Fly secret          |                                                                                                                                                                                                                                          |
| `BREVO_FROM_ADDRESS`   | Yes      | Fly secret          | Must be a confirmed Brevo sender.                                                                                                                                                                                                        |
| `ADMIN_USER_IDS`       | Yes      | Fly secret          | The build dummy `dummy_admin_id` is rejected at runtime. Promoting with SQL (`UPDATE user SET role='admin'`) also works.                                                                                                                 |
| `ALLOWED_EMAILS`       | Yes      | Fly secret          | Enforced by `src/lib/server/auth/allowlist-hook.ts` at sign-in, at session creation and on every request. Add users from `/admin` → **Add user**.                                                                                        |
| `ANTHROPIC_API_KEY`    | For AI   | Fly secret          | Claude API key (recipe variations, `src/lib/server/ai/claude.ts`). Has a dummy default, so the app boots without it but the feature fails.                                                                                               |
| `GEMINI_API_KEY`       | For AI   | Fly secret          | Gemini API key (meal suggestions, `src/lib/server/ai/gemini.ts`). Same dummy default.                                                                                                                                                    |
| `AUTH_ALERTS_URL`      | No       | Fly secret          | ntfy.sh topic for auth alerts (completed password resets). When unset, it defaults to `https://auth-alerts.invalid` and alerts are skipped, because alert text includes a user's name and email and must never be sent to a placeholder. |
| `NODE_ENV`             | No       | Dockerfile `ENV`    | `production` in the image.                                                                                                                                                                                                               |
| `ADDRESS_HEADER`       | No       | `fly.toml` `[env]`  | `Fly-Client-IP`. Not in `env.ts`.                                                                                                                                                                                                        |
| `SENTRY_DSN`           | No       | Default in `env.ts` | Public.                                                                                                                                                                                                                                  |
| `LOG_LEVEL`            | No       | Not set             | Declared in the shared env entries; read by `packages/logger` from `process.env`.                                                                                                                                                        |

## GitHub Actions secrets

Environment `mealplanner`: `FLY_API_TOKEN`, `BACKUP_ENCRYPTION_PASSPHRASE`,
`SENTRY_AUTH_TOKEN`. There are no cron jobs, so no `CRON_SECRET` or `APP_URL`. See the
[root doc](../../../docs/ENVIRONMENT.md#github-actions-secrets).

## Verification

- [ ] `fly secrets list -a sheppakai-mealplanner` matches the "Fly secret" rows above.
- [ ] `gh secret list --env mealplanner` lists the three secrets above.
- [ ] A fresh `cp .env.example .env` with real values boots the app locally with no
      missing-variable errors, including the AI (Claude/Gemini) and Brevo email paths.
