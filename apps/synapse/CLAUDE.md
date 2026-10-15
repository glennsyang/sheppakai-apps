# Synapse — Claude Code Guide

A personal life-management app: fitness (workouts/weight/meals), journal, meditation, tasks, visits, and an admin dashboard, gated behind auth. Not fitness-only despite the name.

---

## Tech Stack

| Concern     | Choice                                                            |
| ----------- | ----------------------------------------------------------------- |
| Framework   | SvelteKit + TypeScript (strict)                                   |
| Database    | SQLite via Drizzle ORM (better-sqlite3)                           |
| Auth        | better-auth v1 (email + password), Brevo for auth emails          |
| UI          | bits-ui (shadcn-svelte style) + Tailwind CSS v4                   |
| Charts      | layerchart + d3-scale/d3-shape                                    |
| Forms       | sveltekit-superforms v3 + Zod v4                                  |
| Testing     | Vitest v5 (unit, `src/**/*.test.ts` colocated) + Playwright (e2e) |
| Lint/format | oxlint + oxfmt, plus custom static checks (below)                 |
| Deployment  | fly.io, `adapter-node`                                            |

---

## Non-Negotiable Conventions

### TypeScript / Svelte

- Strict TypeScript, no `any` — enforced repo-wide by oxlint's `typescript/no-explicit-any` rule.
- Svelte 5 runes only (`$state`, `$derived`, `$effect`, `$props`, `$bindable`).
- Env vars: import from **`$app/env/private`** (SvelteKit's typed env, declared in `src/env.ts`) — not `$env/static/private`.

### Database — camelCase columns

Unlike some of the other sibling repos, **DB column names here are camelCase**, not snake_case (e.g. `emailVerified`, `userId`, `createdAt` in `src/lib/server/db/schema/`). Don't port snake_case conventions in from another repo.

### Dates — Pacific time

The app's timezone is fixed to `America/Los_Angeles` (`APP_TIME_ZONE` in `src/lib/utils/date.ts`). Day boundaries, "today" helpers, week calculations, reminder cutoffs and editability rules all use Pacific time — never server-local time or UTC.

### SvelteKit redirects

`pnpm check:redirect-throws` (the repo-root `scripts/check-redirect-throws.mjs`) statically enforces that `+page.server.ts` / `+layout.server.ts` / `+server.ts` files always `throw redirect(...)` (not call it bare). Always `if (isRedirect(err)) throw err` when catching around auth calls.

Load and action error handling: follow `docs/ERROR_HANDLING_POLICY.md` at the repo root. Loads that query the DB return a `loadError` (rendered with `LoadErrorAlert`); actions answer with `invalidForm(form)` / `message(form, …, { status })`, never a bare `fail(...)` — the Daily Agenda actions are the one documented exception. Components that submit with plain `use:enhance` read the result through `actionMessage()` (`@sheppakai/shared/action-message`).

### Logging

Never use `console.log`/`console.error`/etc. directly — import `logger` from `#lib/server/logger` (a server-only module; SvelteKit's import guard blocks it from client bundles, so client-side code can't reach it — see `src/lib/utils/journal-context.ts` for the one deliberate exception). In production (`NODE_ENV === 'production'`) it strips `userId`, `id`, `email`, `password`, `token`, `createdBy`, and `updatedBy` from log output and from what's sent to Sentry — `requestId` is the only supported cross-log correlation key in prod. The `LOG_LEVEL` env var sets the minimum level logged (`debug`/`info`/`warn`/`error`); defaults to `debug` in dev, `info` in prod.

### Custom static checks

Beyond oxlint (which also enforces `no-explicit-any`), this app runs `fallow dead-code` and the repo-root `scripts/check-redirect-throws.mjs`. `pnpm lint` runs oxlint + `fallow dead-code` only; the redirect check runs full-app via `pnpm check:redirect-throws`, and separately at commit time scoped to just the staged SvelteKit server files via `lint-staged.config.ts`.

### Git hooks (lefthook)

- **pre-commit**: `lint-staged` runs on staged files.
- **pre-push**: `vitest run` for every app/package changed since `origin/main` — a push is blocked if tests fail.

---

## Project Structure

```
src/
├── hooks.server.ts
├── lib/
│   ├── components/
│   │   ├── ui/              # bits-ui/shadcn-svelte components, $lib/components/ui/*
│   │   └── fitness/dialogs/ # see "Log-entry dialog pattern" below
│   ├── schemas/              # Zod schemas per domain (fitness.ts, etc.)
│   └── server/
│       ├── db/schema/        # Drizzle tables, one file per domain
│       ├── auth.ts           # betterAuth instance (drizzleAdapter, Brevo emails)
│       ├── auth/             # form-helpers, auth-guard
│       ├── email/            # digests: daily-agenda, tasks-due-today, visit-warning
│       └── notifications/    # admin alert pings (new user, verification sent, etc.)
└── routes/
    ├── (auth)/
    ├── (splash)/
    ├── (app)/
    │   ├── fitness/ journal/ meditation/ tasks/ visits/ dashboard/ profile/ admin/
    └── api/
```

---

## Log-entry dialog pattern (`src/lib/components/fitness/dialogs/`)

`LogWorkoutDialog`, `LogMealDialog`, `LogWeightDialog`, `CreateReminderDialog`, `SetCalorieTargetDialog`, `SetGoalWeightDialog` all follow one identical skeleton — **match it exactly** when adding a new one. The shared toolkit's `/scaffold-form` command's "dialog-based entry form" flavor targets this exact shape — point it at one of these dialogs as the exemplar rather than hand-rolling a new one from scratch:

```ts
let {
  formData,             // SuperValidated<Infer<typeof someSchema>>
  editEntry = null,     // non-null → editing an existing row
  onClose,
  open = $bindable(false),
  instanceId = 'default'
}: { ... } = $props();

const isEditing = $derived(editEntry !== null);
let internalOpen = $state(false);
const dialogOpen = $derived(open !== undefined ? open : internalOpen);

// externally-controlled open when editing
$effect(() => { if (editEntry && open === undefined) internalOpen = true; });

const formId = $derived(editEntry ? `edit-<thing>-${editEntry.id}` : `log-<thing>-${instanceId}`);

const { form, errors, enhance, message, submitting } = superForm(formData, {
  id: formId,
  resetForm: !isEditing,
  onUpdate: ({ form }) => { /* toast.success/error, call onClose */ },
  onError: ({ result }) => { /* toast.error */ }
});

// populate fields from editEntry via a second $effect
```

Server actions are named `?/log<Thing>` and `?/update<Thing>` on the same route.

---

## Authentication

- better-auth v1, email+password, `minPasswordLength: 12`, `revokeSessionsOnPasswordReset: true`.
- Invite-only: public sign-up is disabled (`disableSignUp`) and sign-in is gated to the exact `ALLOWED_EMAILS` list (`createAppAuth` in `@sheppakai/shared/auth-config`). New accounts: **Admin → Users → Add user** (creates the user and sends a welcome email), plus adding the email to `ALLOWED_EMAILS` — see `docs/ENVIRONMENT.md`.
- Drizzle adapter (`drizzleAdapter`) reusing the app's own SQLite DB.
- Auth emails (verification, password reset, new-user notice) sent via **Brevo** (`src/lib/server/email/`), not built-in better-auth email.
- Internal ops alerts (`src/lib/server/notifications/`) ping on auth events like verification-sent — separate from the user-facing emails.

### Environment variables

See [`docs/ENVIRONMENT.md`](docs/ENVIRONMENT.md) for the full reference (every variable, which are required, defaults, and where each is consumed). Don't duplicate the list here; update that doc instead.

Sentry (`@sentry/sveltekit`) is now actually wired up — `vite.config.ts` (`sentrySvelteKit({ org: 'sheppakai', project: 'synapse' })`), `src/hooks.client.ts`, and `src/hooks.server.ts` all reference it, and `#lib/server/logger`'s `warn()`/`error()` forward to it in production. The `dsn` in both files points at the real `synapse` project under the `sheppakai` org. `hooks.server.ts` wires `Sentry.sentryHandle()` into the `handle` sequence and intentionally leaves `handleError` unwrapped — see `docs/SENTRY.md` at the repo root for the cross-app strategy.

---

## Common Commands

```bash
pnpm dev
pnpm check                  # svelte-check
pnpm lint                   # oxlint + fallow dead-code
pnpm check:redirect-throws  # redirect-throw static check (not part of lint)
pnpm fmt:check              # oxfmt --check
pnpm check:all              # fmt + lint + test
pnpm test                   # vitest run
pnpm test:e2e               # playwright
pnpm db:generate            # drizzle-kit generate
pnpm db:migrate             # drizzle-kit migrate
```

---

## Shared toolkit

Repo-wide conventions, the shared `.claude/` skills and agents, and `packages/shared` are described in the repo-root `CLAUDE.md`. This app's `/scaffold-form synapse ...` flavor is the "Log-entry dialog pattern" above. The logger comes from the `@sheppakai/logger` workspace package.
