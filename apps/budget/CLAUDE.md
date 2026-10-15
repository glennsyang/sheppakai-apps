# Sheppakai Budget — Claude Code Guide

A personal finance tracker: transactions, category budgets, recurring transactions, savings goals, income, receipts (fuel + business), and a side "window-cleaning" business tracker, all under one auth'd app.

---

## Tech Stack

| Concern    | Choice                                                       |
| ---------- | ------------------------------------------------------------ |
| Framework  | SvelteKit + TypeScript                                       |
| Database   | SQLite via Drizzle ORM (`better-sqlite3`)                    |
| Auth       | better-auth v1 + `@better-auth/api-key` + `admin` plugin     |
| UI         | shadcn-svelte (bits-ui) + Tailwind CSS v4                    |
| Charts     | `layerchart` + `d3-scale`/`d3-shape` (not a table-chart lib) |
| Data table | `@tanstack/svelte-table`                                     |
| Forms      | sveltekit-superforms v3 + Zod v4                             |
| Errors     | Sentry (`@sentry/sveltekit`)                                 |
| Testing    | Vitest v5, colocated `*.test.ts`                             |
| Linting    | oxlint + oxfmt, plus custom static checks (see below)        |
| Deployment | fly.io, region `yyz`, SQLite on a persistent volume          |

---

## Non-Negotiable Conventions

- **Never use `console.log`** — import `logger` from `#lib/server/logger.js`.
- Imports use `#lib/components/ui/...` directly — no custom path alias (`$comp` etc. does not exist in this repo).
- Class merging: prefer Svelte's array `class={[...]}` syntax; `tailwind-merge`/`tailwind-variants` are deps but only for the shadcn component internals, not general app code.
- Re-throw SvelteKit redirects in auth/action catch blocks: `if (isRedirect(err)) throw err`.
- Load and action error handling follows `docs/ERROR_HANDLING_POLICY.md` at the repo root; budget is its reference implementation.

### Env vars — uses SvelteKit's newer `$app/env` module, not `$app/environment`

This repo is on a SvelteKit version where `building`/`dev` come from **`$app/env`** (see `src/hooks.server.ts`), and private runtime env vars come from **`$app/env/private`** (see `src/lib/server/auth.ts` — `BETTER_AUTH_SECRET`, `ADMIN_USER_IDS`, etc.), not the older `$app/environment` / `$env/dynamic/private` pattern most SvelteKit docs/examples still show. Don't "fix" imports to the old modules.

### Static checks beyond oxlint

- `no-explicit-any` is enforced by oxlint itself (`typescript/no-explicit-any` rule), not a custom script.
- `check:redirect-throws` — the repo-root `scripts/check-redirect-throws.mjs`, run full-app via `pnpm check:redirect-throws` and separately at commit time scoped to staged SvelteKit server files via `lint-staged.config.ts`. Not part of `pnpm lint`.
- `check:dead-code` — via `fallow dead-code`, part of `pnpm lint`.
- Run `pnpm check:all` (fmt + lint + test) before considering a change done.

---

## The CRUD Pattern (read before adding a new list/entity feature)

This repo already has a shared helper for the repeated "list page + form + server actions" shape — **don't hand-roll it**:

- **`createCrudActions()`** in `src/lib/server/actions/crud-helpers.ts` — generic create/update/delete actions given a Zod schema, a Drizzle table, an entity name, and optional `transformCreate`/`transformUpdate` hooks. Handles superforms validation, audit fields (`withAuditFieldsForCreate/Update`), and consistent success/error messages (`CrudMessages`).
- **Query objects** per domain in `src/lib/server/db/queries` (e.g. `transactionQueries`, `budgetQueries`) — encapsulate the Drizzle queries for that entity (`findByDateRange`, `search`, etc.) rather than querying inline in `+page.server.ts`.
- **Schemas** live in `src/lib/formSchemas/<domain>.ts`, re-exported via `src/lib/formSchemas/index.ts`.
- Month-scoped pages read `?month=&year=` through `getMonthRangeFromUrl(url)` (`src/lib/utils/dates.ts`). Categories load once in `(app)/+layout.server.ts` and reach every child route.
- This shape repeats across `transactions`, `categories`, `recurring`, `savings`, `income`, `budget`, `receipts/*`, `window-cleaning`, and the `admin` routes. When adding a new one, follow an existing route (e.g. `transactions/+page.server.ts`) rather than inventing a new shape.

---

## Auth

- `src/lib/server/auth.ts` — better-auth with `drizzleAdapter`, `admin` plugin, `apiKey` plugin (`@better-auth/api-key` — there's a real API surface under `src/routes/api/v1`, protected by API keys, separate from session auth).
- Min password length 12, session revoked on password reset, password reset tokens expire in 10 minutes.
- `ADMIN_USER_IDS` env var gates the `admin` plugin's elevated role — check `src/lib/server/auth.ts` before assuming any user can hit `(app)/admin`.
- Auth-adjacent helpers: `src/lib/server/actions/auth-guard.ts` (`requireAuth`, `isAdminUser`, `assertAdmin` — from `@sheppakai/shared/auth-guard`), `src/lib/server/actions/admin-guard.ts` (`adminFormAction`, from `createAdminFormAction` in `@sheppakai/shared/admin-form-action`) for admin form actions. The `(app)` route group is guarded in `src/routes/(app)/+layout.server.ts`. Sign-in is gated to `ALLOWED_EMAILS` by `createAppAuth` in `@sheppakai/shared/auth-config`. The `api/cron` routes use `createCronHandler` from `@sheppakai/shared/cron` (separate auth path, not session-based).

---

## Domain notes

- **`window-cleaning`** and **`receipts` (fuel + business)** are real side-business bookkeeping features, not demo data — treat them as first-class, not throwaway.
- **Sentry** is wired in `hooks.server.ts` via `sentryHandle()` in the `handle` sequence, with `handleError` intentionally left unwrapped (the structured logger already forwards to Sentry) — read `docs/SENTRY.md` at the repo root (the cross-app single source of truth) before changing this.
- CSP is nonce-based (`vite.config.ts`, `csp.mode: 'nonce'`) with specific `unsafe-inline` carve-outs for `layerchart`/bits-ui runtime style injection — read `docs/CSP.md` at the repo root (the cross-app single source of truth) and the comments in `vite.config.ts` before touching CSP, the directives are deliberate, not defaults.

---

## Product Data-Sharing Model (Critical Requirement)

- This app is intentionally a **shared-data** system for exactly **two users**. Both users see and edit the same budget, expense and financial records.
- Do **not** treat cross-user data visibility as a tenant-isolation bug unless this requirement changes. Auth data (sessions, credentials, verification records) stays strictly per-user.
- If this model changes (e.g. private per-user workspaces), reclassify cross-user data exposure as a high-severity security issue and revisit every data-access check. `mealplanner` follows the same model.

---

## Commands

```bash
pnpm dev                 # Dev server
pnpm check:all           # fmt + lint + test — run before calling a change done
pnpm test:unit           # Vitest, watch mode by default (pnpm test for a single run)
pnpm test:coverage
pnpm check:redirect-throws
pnpm db:generate         # drizzle-kit generate (new migration)
pnpm db:migrate
pnpm db:studio
```

---

## Shared toolkit

Repo-wide conventions, the shared `.claude/` skills and agents, and `packages/shared` are described in the repo-root `CLAUDE.md`. This app's `/scaffold-form budget ...` flavor is the CRUD-list pattern above — point it at an existing route like `transactions/+page.server.ts` as the exemplar.
