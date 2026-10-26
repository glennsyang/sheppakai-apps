# sheppakai-apps — Claude Code Guide

pnpm monorepo with three SvelteKit (Svelte 5 runes) apps and two shared workspace packages. Each app has its own `CLAUDE.md` with app-specific guidance; this file holds what applies to all of them.

| Path               | What it is                                                                 |
| ------------------ | -------------------------------------------------------------------------- |
| `apps/budget`      | Household budget and side-business bookkeeping                             |
| `apps/mealplanner` | Pantry-driven dinner planning (Gemini + Claude suggestions)                |
| `apps/synapse`     | Personal life management (tasks, journal, fitness, meditation, visits)     |
| `packages/logger`  | Structured logger (`@sheppakai/logger`)                                    |
| `packages/shared`  | Server/client modules shared by all three apps (`@sheppakai/shared/<mod>`) |
| `scripts/`         | Repo-level scripts (`check-redirect-throws.mjs`, `migrate.js`, `start.sh`) |
| `docs/`            | Cross-app policies: auth, API, CSP, Sentry, errors, env, backups           |

---

## Repo-wide conventions

- **pnpm, never npm.** Run a script in one app with `pnpm --filter <app> <script>` (or `pnpm <script>` from inside the app). From the root: `pnpm check`, `pnpm lint`, `pnpm fmt:check`, `pnpm test`, `pnpm build`.
- **Node 22.23.4** (pinned in `.node-version`).
- **Dependency versions come from the `catalog:`** in `pnpm-workspace.yaml`. Notable majors: sveltekit-superforms **v3**, Zod **v4**, Vitest **v5**, Tailwind CSS v4, better-auth v1.
- **Lint** (`pnpm lint` in each app) = oxlint + `fallow dead-code`. Format with oxfmt (`pnpm fmt`). `pnpm check:all` = fmt + lint + test.
- **Redirect throws**: `scripts/check-redirect-throws.mjs` (repo root) enforces `throw redirect(...)` in SvelteKit server files. It is **not** part of `lint`: run it with `pnpm check:redirect-throws` in an app; lint-staged also runs it on staged server files at commit time.
- **Git hooks** (lefthook): pre-commit runs lint-staged; pre-push runs Vitest for apps/packages changed since `origin/main`.
- Never use `console.log` — use the app's logger (`#lib/server/logger`, backed by `@sheppakai/logger`).
- Always `if (isRedirect(err)) throw err` when catching around auth calls or anything that may redirect.
- Load and action error handling follows `docs/ERROR_HANDLING_POLICY.md`.
- Don't hand-edit `src/lib/components/ui/` (shadcn-svelte CLI output) or `src/lib/server/db/migrations/` (drizzle-kit output).

### Prefer `packages/shared` over app-local copies

Before writing server code that every app needs, check `packages/shared/src/`. Shared modules include `admin-user-actions`, `profile-actions`, `api-key-admin`, `admin-form-action` (`createAdminFormAction`), `auth-route-actions`, `auth-config` (`createAppAuth`, which also enforces `ALLOWED_EMAILS`), `auth-guard`, `auth-form-handler`, `server-handle` (security headers), `cron`, `healthz`, `rate-limiter`, `timestamps`, `email` and `api-response`. Apps import them as `@sheppakai/shared/<module>`; some apps bind them in a thin local wrapper (e.g. budget's `src/lib/server/actions/admin-guard.ts`). Extend the shared module rather than forking a local copy.

### DB column naming differs per app

| App         | DB columns                                                   |
| ----------- | ------------------------------------------------------------ |
| synapse     | **camelCase** (`emailVerified`, `userId`, `createdAt`)       |
| budget      | **snake_case** (Drizzle fields stay camelCase in TypeScript) |
| mealplanner | **snake_case** (Drizzle fields stay camelCase in TypeScript) |

Don't port one app's convention into another.

---

## Svelte / SvelteKit patterns

- Svelte 5 runes only: `$state`, `$derived`, `$effect`, `$props`, `$bindable`. No `$:` reactive statements.
- Forms submit through SvelteKit form actions with `use:enhance` (which revalidates for you), e.g. `<form method="POST" action="?/updateName" use:enhance>`. Never listen for `submit` on `window` or call `invalidateAll()` from a DOM listener.
- After a manual `fetch` to an API route, call `invalidateAll()` from `$app/navigation`.
- Avoid `onMount` unless you need a browser-only API (canvas, IntersectionObserver, measurements) or a third-party library init. Fetch data in `+page.server.ts` loads; react to changes with `$derived` / `$effect`.
- Use element event attributes (`onclick={...}`), not `addEventListener`.
- Read page info from `page` in `$app/state`, not `$app/stores`.

---

## Reviews

When asked for a review, lead with findings (bugs, regressions, risks, missing tests) ordered by severity, each with a file reference. Keep any summary short and after the findings. If there are no findings, say so and name remaining test gaps.

---

## Shared toolkit

Shared skills, agents and commands for all three apps live in the repo-root `.claude/` folder (no plugin install needed) — it is the single source; there are no copies under `.github/`.

- **Skills:** `svelte-code-writer`, `svelte5-best-practices`, `better-auth-best-practices`, `shadcn-svelte-components`, `tailwind-patterns`, `brevo-email-log` (checks Brevo's transactional email event log to verify whether a specific email actually sent/delivered/bounced — all three apps send through the same Brevo account) and `restore-db-backup`.
- **Command:** `/scaffold-form <app> ...` scaffolds a new form/CRUD feature. Each app's `CLAUDE.md` names its flavor and an exemplar to point it at.
- **Agents:** `code-structure-reviewer` and `security-reviewer` (in `.claude/agents/`) are available on demand — invoke them when you want a structural or security pass on a change, not automatically on every PR. They aren't wired into any automated hook.
