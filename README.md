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
- `fly-deploy.yml`: on push to main, checks then deploys each changed app with the repo root as the Docker build context.
- `backup-database.yml`: manual SQLite backup of one app's Fly volume.
- `synapse-notifications-cron.yml`, `budget-weekly-cron.yml`, `budget-monthly-cron.yml`: the app crons.

Secrets live in one GitHub **environment per app** (`synapse`, `mealplanner`, `budget`), so a
job only sees its own app's secrets.

## History

The apps used to live in `glennsyang/synapse`, `glennsyang/sheppakai-mealplanner` and
`glennsyang/sheppakai-budget`. Deploys and crons moved here on 2026-10-06, and their workflows were
disabled in the old repos. Older issues and PRs are still on those repos.
