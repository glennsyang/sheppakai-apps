# sheppakai-apps

pnpm monorepo for three SvelteKit apps, each deployed to its own Fly.io app.

```
apps/
  synapse/       -> Fly app synapse-dev
  mealplanner/   -> Fly app sheppakai-mealplanner
  budget/        -> Fly app sheppakai-budget
packages/
  logger/        -> @sheppakai/logger, the structured logger every app uses
```

Each app was imported with `git subtree`, so its full history is kept under `apps/<name>`.

## Setup

Node 22.23.3. pnpm comes from corepack, pinned by `packageManager` in the root `package.json`:

```sh
corepack enable
pnpm install
```

## Commands

| Task                    | Command                                   |
| ----------------------- | ----------------------------------------- |
| Run one app             | `pnpm --filter sheppakai-budget dev`      |
| Check / lint / test all | `pnpm check`, `pnpm lint`, `pnpm test`    |
| Only what changed       | `pnpm --filter "...[origin/main]" test`   |
| Build an app image      | `docker build -f apps/budget/Dockerfile .` |

Package names for `--filter`: `synapse`, `sheppakai-mealplanner`, `sheppakai-budget`, `@sheppakai/logger`.

## Shared dependency versions

Dependencies used by two or more apps are pinned once in the `catalog:` section of
`pnpm-workspace.yaml`, and the apps reference them as `"catalog:"`. Bump the version there,
not in an app's `package.json`.

## CI

- `pr-check.yml`: runs format, lint, type check and tests only for the projects a PR changes.
  A change under `packages/`, the lockfile or root config re-checks every app.
- `fly-deploy.yml`: checks then deploys one app with the repo root as the Docker build context.
- `backup-database.yml`: manual SQLite backup of one app's Fly volume.
- `synapse-notifications-cron.yml`, `budget-weekly-cron.yml`, `budget-monthly-cron.yml`: the app crons.

Secrets live in one GitHub **environment per app** (`synapse`, `mealplanner`, `budget`), so a
job only sees its own app's secrets.

## Cutover checklist

Until cutover, the old per-app repos still deploy and run the crons. In this repo, deploys
and crons are manual-only (`workflow_dispatch`) so the two repos never both act on the same Fly app.

1. Create the `synapse`, `mealplanner` and `budget` environments in this repo's settings.
2. Add each app's secrets to its environment: `FLY_API_TOKEN`, `SENTRY_AUTH_TOKEN`,
   `BACKUP_ENCRYPTION_PASSPHRASE`, and for synapse and budget also `APP_URL` and `CRON_SECRET`.
3. Run `Fly Deploy` manually for one app and confirm it is healthy.
4. Uncomment `push` in `fly-deploy.yml` and the `schedule` blocks in the cron workflows.
5. In the old repos, disable the deploy and cron workflows, then archive the repos.
