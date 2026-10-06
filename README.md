# sheppakai-apps

Three full-stack SvelteKit apps I built and run for my own household, kept in one pnpm monorepo.
They are private, live tools used every day, shared here as a portfolio.

## The apps

### Synapse: personal life management

One place to run a day. Tasks (kanban, with priorities and due dates), a journal, fitness tracking
(workouts, weight, meals), meditation routines and visit tracking for keeping in touch with people.
A daily agenda ties them together, and scheduled email digests bring you back.

### Meal Planner: dinner planning for a two-person household

Enter what's in the pantry and get dinner suggestions with full recipes, streamed in one at a time.
Generate variations of a dish, then slot meals into a shared Monday to Sunday planner. It uses
Google Gemini for suggestions and Anthropic Claude for variations, both with structured output.

### Budget: household finances and side-business bookkeeping

Transactions, monthly category budgets, recurring bills, income and savings goals, plus the records
for a small window-cleaning business: customers, jobs, and fuel and business receipts. It installs
as a PWA for quick logging on a phone, and a weekly summary email supports review.

## Tech stack

| Concern       | Choice                                                    |
| ------------- | --------------------------------------------------------- |
| Framework     | SvelteKit, Svelte 5 (runes), TypeScript (strict)          |
| UI            | Tailwind CSS v4, shadcn-svelte / bits-ui, LayerChart      |
| Forms         | sveltekit-superforms + Zod                                |
| Data          | SQLite with Drizzle ORM (better-sqlite3)                  |
| Auth          | Better Auth (email + password, invite-only)               |
| Email         | Brevo transactional email                                 |
| Observability | Sentry, plus a shared structured JSON logger              |
| Testing       | Vitest; Playwright in Synapse                             |
| Tooling       | pnpm workspaces and catalogs, oxlint, oxfmt, fallow, lefthook |
| Hosting       | Fly.io, one app per project with SQLite on a volume       |

## Repository layout

```
apps/
  synapse/        Synapse
  mealplanner/    Meal Planner
  budget/         Budget
packages/
  logger/         @sheppakai/logger: structured JSON logging with PII redaction and Sentry forwarding
```

Dependencies shared by more than one app are pinned once in the `catalog:` section of
`pnpm-workspace.yaml`, so every app runs on the same SvelteKit, Svelte, Vite and TypeScript versions.

## Engineering highlights

- **Security by default:** invite-only sign-in with an email allowlist, rate-limited auth forms,
  a strict Content Security Policy and security headers, and per-request IDs in every log line.
- **Privacy-aware logging:** the shared logger strips PII fields and redacts emails and tokens in
  production before anything reaches stdout or Sentry.
- **Path-filtered CI:** pull requests run format, lint, type check and tests only for the projects
  they touch. A change to a shared package re-checks every app that depends on it.
- **Independent deploys:** each app builds its own Docker image from the workspace root
  (`pnpm deploy` produces a pruned production install) and ships to its own Fly.io app when its
  code changes on `main`.
- **Operations:** encrypted on-demand SQLite backups, scheduled jobs for digests and recurring
  resets, Semgrep static analysis and Dependabot updates.

## Running locally

Requires Node 22.23.3. pnpm is pinned through corepack.

```sh
corepack enable
pnpm install

cp apps/budget/.env.example apps/budget/.env   # then fill in values
pnpm --filter sheppakai-budget dev             # http://localhost:5173
```

| Task                    | Command                                    |
| ----------------------- | ------------------------------------------ |
| Check, lint, test all   | `pnpm check`, `pnpm lint`, `pnpm test`     |
| Only what changed       | `pnpm --filter "...[origin/main]" test`    |
| Build an app image      | `docker build -f apps/budget/Dockerfile .` |

Workspace package names: `synapse`, `sheppakai-mealplanner`, `sheppakai-budget`, `@sheppakai/logger`.
