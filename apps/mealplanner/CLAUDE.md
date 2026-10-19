# Meal Planner — Claude Code Guide

A dinner-focused meal planner. Users enter pantry ingredients → Gemini suggests dinners with full
recipes → meals slot into a Monday–Sunday weekly planner.

---

## Tech Stack

| Concern    | Choice                                                           |
| ---------- | ---------------------------------------------------------------- |
| Framework  | SvelteKit + TypeScript (strict)                                  |
| Database   | SQLite via Drizzle ORM (better-sqlite3)                          |
| Auth       | better-auth v1 (email + password)                                |
| AI         | `@google/genai` (suggestions) + `@anthropic-ai/sdk` (variations) |
| UI         | shadcn-svelte (bits-ui) + Tailwind CSS v4                        |
| Animations | Svelte 5 transitions + `@formkit/auto-animate`                   |
| Forms      | sveltekit-superforms v3 + Zod v4                                 |
| Testing    | Vitest v5                                                        |
| Deployment | fly.io (Node 22, SQLite on persistent volume)                    |

---

## Product Data-Sharing Model (Critical Requirement)

- This app is intentionally a **shared-data** system for exactly **two users** — the same model used
  by the sibling `budget` app (see `apps/budget/CLAUDE.md`, "Product Data-Sharing Model").
- Both users are expected to see and edit the same household data: `pantry_items`, `recipes`,
  `meal_plans`, and `meal_plan_entries` are shared, not per-user-private. There is one shared pantry
  and one shared weekly planner, not one per user.
- Do **not** treat cross-user visibility or editing of these tables as a tenant-isolation bug (IDOR)
  in this project unless this product requirement changes. A full-codebase security review
  (2026-08-27) initially flagged this as critical in #31 and #32 — both were closed as by-design
  once this was clarified.
- This does **not** extend to auth-only data. Session tokens, account credentials, and verification
  records must stay strictly per-user and never be exposed to another user or leaked to the client
  beyond what better-auth already scopes — that's a real security bug, not a data-sharing question
  (see #33, still open).
- If this model ever changes (e.g. adding private per-user pantries or workspaces), reclassify
  cross-user access to the app tables above as a high-severity security issue and revisit every
  data-access check that currently relies on this decision.

---

## Non-Negotiable Conventions

### TypeScript

- **Strict mode everywhere.** Never use `any` — use proper types, generics, or `unknown`.
- **camelCase** for all TypeScript types, interfaces, and variable names.

### Svelte

- **Svelte 5 runes only**: `$state`, `$derived`, `$effect`, `$props`, `$bindable`.
- Never use `onMount` or manual `addEventListener`. Use `$effect` and Svelte event attributes
  instead.
- Use `page` from `$app/state` (not `$app/stores`) for reactive page info.

### Logging

- **Never use `console.log`** anywhere. Always import and use `#lib/server/logger.js`.
- Logger levels: `debug | info | warn | error`.

### Database

- **snake_case** for all DB column names.
- Every table has `created_at` and `updated_at` audit columns.
- IDs are `crypto.randomUUID()` text strings — use `generateId()` from `#lib/server/db/utils.ts`.
- Set timestamps with `withTimestampsForCreate(now?)` / `withTimestampsForUpdate(now?)` from
  `#lib/server/db/utils.ts` (re-exported from `@sheppakai/shared/timestamps`; they return `Date`s
  for the `integer(..., { mode: 'timestamp' })` columns). When one write touches several rows (e.g.
  a meal plan and its entry), create one `const now = new Date()` and pass it to every call.

### Forms

- All form submissions use **sveltekit-superforms + Zod v4**.
- Import adapters as `zod4` / `zod4Client` from `sveltekit-superforms/adapters`.
- Never spread `{...$constraints}` on email inputs — Zod v4 generates a `pattern` regex the browser
  rejects. Instead apply individual attributes (`required`, `minlength`, etc.).

### Error handling

- Always re-throw SvelteKit redirects: `if (isRedirect(error)) throw error`.
- Follow `docs/ERROR_HANDLING_POLICY.md` at the repo root. Loads that query the DB return a
  `loadError` the page renders; actions answer with `invalidForm(form)`
  (`src/lib/server/actions/form-responses.ts`) or `message(form, …, { status })`, never a bare
  `fail(...)`.

---

## Project Structure

```
src/
├── hooks.server.ts              # Sentry + createServerHandle / createHandleError from @sheppakai/shared
├── app.css                      # Tailwind v4, tw-animate-css, fridge theme, world classes
├── app.html                     # Pre-paint dark-mode script, fonts
├── lib/
│   ├── types.ts                 # Shared TS interfaces (camelCase)
│   ├── auth-client.ts           # Client-side better-auth (better-auth/svelte)
│   ├── schemas/                 # Zod v4 schemas — auth.ts, pantry.ts, mealPlan.ts
│   ├── components/              # Svelte 5 UI components
│   └── server/
│       ├── logger.ts            # App-wide logger — use this, never console.log (server-only, keeps it out of client bundles)
│       ├── db/
│       │   ├── schema/index.ts  # All Drizzle tables (auth + app)
│       │   ├── index.ts         # Drizzle client (WAL mode enabled)
│       │   └── utils.ts         # generateId(), withTimestampsForCreate/Update()
│       ├── auth/
│       │   └── index.ts         # betterAuth instance
│       ├── ai/
│       │   ├── gemini.ts        # suggestMeals() — pantry → dinner suggestions
│       │   ├── claude.ts        # suggestVariations() — variations on a meal
│       │   ├── endpoint.ts      # createAiEndpoint() — auth, rate limit, body parse for both
│       │   └── promptSafety.ts  # sanitizePromptText() for user text sent to either model
│       └── services/
│           ├── pantry.ts
│           ├── mealPlan.ts      # includes getMondayOfCurrentWeek()
│           └── recipes.ts
├── routes/
│   ├── (auth)/                  # Unauthenticated: sign-in, sign-out, password reset, email verification
│   ├── (app)/                   # Protected: auth guard in +layout.server.ts
│   │   ├── pantry/
│   │   ├── suggest/
│   │   ├── planner/
│   │   ├── profile/
│   │   └── admin/
│   ├── api/auth/[...all]/       # better-auth request handler
│   ├── api/healthz/
│   ├── api/suggest/             # Gemini meal suggestions
│   └── api/variations/          # Claude recipe variations
└── tests/                       # Vitest suites
    ├── lib/                     # server helpers, AI endpoint, prompt safety, email, …
    ├── routes/                  # load/action tests per route
    ├── schemas/                 # pantry.test.ts, mealPlan.test.ts
    └── services/                # pantry, mealPlan, mealPlanAtomicity
```

---

## Authentication

- **better-auth v1** with email+password only (no OAuth).
- **Public sign-up is disabled** (`emailAndPassword.disableSignUp: true`, no `/register` route) —
  the shared-data model depends on exactly two users (#124). Sign-in is also gated to the exact
  `ALLOWED_EMAILS` list (`createAppAuth` in `@sheppakai/shared/auth-config`) — same as `budget` and
  `synapse`. New accounts: admin plugin's `createUser`, then add the email to `ALLOWED_EMAILS`.
- Minimum password length: **12 characters**.
- `src/hooks.server.ts` runs `createServerHandle` (`@sheppakai/shared/server-handle`) on every
  request: it populates `event.locals.user` / `event.locals.session` via `svelteKitHandler` and
  re-checks the allowlist.
- `(app)/+layout.server.ts` enforces the auth guard — redirects to `/sign-in` if no session. Auth
  route paths are centralised in `src/lib/auth-routes.ts` (`SIGN_IN_ROUTE`, etc.) — no inline route
  literals.
- **Sign-out** is a form POST to `/sign-out` (handled by `(auth)/sign-out/+page.server.ts`). The
  layout submits a hidden form via `requestSubmit()`.
- `auth.advanced.useSecureCookies` is `true` — cookies require HTTPS. In dev, ensure
  `http://localhost:5173` is in `trustedOrigins`.
- Rate limiting: 5 requests/minute/IP, `database` storage in production, `memory` in dev.
- Cookie prefix: `mealplanner_auth_`.

### Environment variables required

See [`docs/ENVIRONMENT.md`](docs/ENVIRONMENT.md) for the full reference (every variable, which are
required, defaults, and where each is consumed) — it's the canonical source, kept in sync with
`.env.example`. Don't duplicate the list here; update that doc instead.

---

## Database

- Drizzle ORM with `better-sqlite3`, WAL mode enabled.
- Schema file: `src/lib/server/db/schema/index.ts` — defines **both** better-auth tables and app
  tables.
- Better-auth tables: `user`, `session`, `account`, `verification` — defined with camelCase Drizzle
  field names mapping to snake_case DB columns.
- App tables: `pantry_items`, `recipes`, `meal_plans`, `meal_plan_entries`.
- Migrations output: `src/lib/server/db/migrations/`.

### Working with the DB

```bash
pnpm db:generate  # Generate a migration from schema changes
pnpm db:migrate   # Apply committed migrations (dev creates ./data/db.sqlite, prod runs on boot via start.sh)
pnpm db:studio    # Open Drizzle visual browser
```

---

## AI Integration

Two providers, one per feature. Both return typed `MealSuggestion[]` and validate the model output
with `pickValidSuggestions` (`#lib/schemas/mealPlan.js`).

- **Suggestions — Gemini** (`src/lib/server/ai/gemini.ts`, model `gemini-3-flash-preview`,
  `GEMINI_API_KEY`): `suggestMeals(pantryItems)` uses a JSON response schema. Served by
  `POST /api/suggest`.
- **Variations — Claude** (`src/lib/server/ai/claude.ts`, model `claude-sonnet-4-6`,
  `ANTHROPIC_API_KEY`): `suggestVariations(mealName)` uses tool use for typed output. Served by
  `POST /api/variations`.
- Both routes are built with `createAiEndpoint()` (`ai/endpoint.ts`): session check, per-user rate
  limit (10/min), JSON body validated with the route's Zod schema, `apiSuccess` / `apiError`
  responses.
- User text goes through `sanitizePromptText()` (`ai/promptSafety.ts`) and is wrapped in delimiter
  tags the system prompts treat as data only.

---

## shadcn-svelte (bits-ui)

- Components live in `src/lib/components/ui/` (added with
  `pnpm dlx shadcn-svelte@latest add <name>`, config in `components.json`) and are owned code —
  restyle them freely. Currently: `alert`, `button`, `dialog`, `input`, `label`, `native-select`,
  `sheet`, `table`, `textarea`, plus the hand-written `data-table`.
- `cn()` and the prop helper types live in `src/lib/utils.ts`. Icons use the local `Icon.svelte`,
  not lucide.
- Theme: the `fridge` palette and shadcn semantic tokens (`--background`, `--primary`,
  `--destructive`, `--input`, …) are in `src/lib/styles/fridge-theme.css` (imported from `app.css`),
  mapped onto the world tokens (`--board`, `--ink`, `--marker-*`). World classes (`.board`, `.act`,
  `.tile`, `.index-card`, `.magnet`, `.marker`) live in `app.css`; see `DESIGN.md`.
- The type scale runs 6.7% above Tailwind's default (`--text-*` in `fridge-theme.css`), and
  `--default-border-width` is 1.5px.
- `app.css` defines `data-open` / `data-closed` custom variants mapped to bits-ui's `data-state`,
  which the shadcn templates rely on for enter/exit animations.

### Component conventions

- Buttons: `<Button>` — `default` (blue magnet, `.act`), `outline` (`.act-quiet`), `destructive`
  (red magnet), `secondary` (green), `tonal`, `tonal-destructive`, `link` (`.act-text`); sizes
  `default` / `sm` / `icon`. Pass `href` for a link button.
- Fields: `<Label>` wrapping `<Input>` / `<Textarea>` / `<NativeSelect>`; mark invalid fields with
  `aria-invalid`.
- Messages: `<Alert variant="destructive" | "success" | "warning">`; set `role` explicitly where it
  shouldn't be `alert`.
- Dialogs/drawers: use `Modal.svelte` (`variant="dialog" | "drawer"`) — it wraps `Dialog` / `Sheet`
  with the fridge look and focuses the panel on open.

---

## Tailwind CSS v4

- No `tailwind.config.js` — configured entirely in CSS via `@import` and `@theme`.
- Plugin: `@tailwindcss/vite` (add before `sveltekit()` in `vite.config.ts`).
- Custom animations defined in `app.css`: `animate-stick` (placement), `.writing-line` (loading),
  and the `.today-ring` draw.

---

## Forms Pattern

Every form follows this pattern:

**Schema** (`src/lib/schemas/<domain>.ts`):

```ts
import { z } from 'zod';
export const mySchema = z.object({ ... });
export type MySchema = typeof mySchema;
```

**Server** (`+page.server.ts`):

```ts
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { isRedirect, redirect } from '@sveltejs/kit';
import { invalidForm } from '#lib/server/actions/form-responses.js';

// load
const form = await superValidate(zod4(mySchema));
return { form };

// action
const form = await superValidate(request, zod4(mySchema));
if (!form.valid) return invalidForm(form);
try { ... } catch (err) {
  if (isRedirect(err)) throw err;
  return message(form, { type: 'error', text: 'Error message' }, { status: 500 });
}
throw redirect(302, '/destination');
```

**Client** (`+page.svelte`):

```ts
// svelte-ignore state_referenced_locally — superForm is intentionally initialized once from props
const { form, errors, constraints, enhance, message, submitting } = superForm(data.form, {
	validators: zod4Client(mySchema)
});
```

**Email inputs** — do NOT spread `$constraints.email`. Apply individually:

```svelte
<input type="email" required={$constraints.email?.required} ... />
```

---

## Security

- Security headers are set by `createServerHandle` in `packages/shared/src/server-handle.ts` (shared
  by all three apps): `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, and
  `Strict-Transport-Security` in production.
- **CSP is not set in `hooks.server.ts`.** It is nonce-based, configured by the `csp` option of
  `sveltekit()` in `vite.config.ts` — see `docs/CSP.md` at the repo root before changing it.

`hooks.server.ts` wires `Sentry.sentryHandle()` into the `handle` sequence and intentionally leaves
`handleError` unwrapped (the structured logger already forwards to Sentry) — see `docs/SENTRY.md` at
the repo root for the cross-app strategy.

---

## Shared Tooling & Review

Repo-wide conventions, the shared `.claude/` skills and agents, and `packages/shared` are described
in the repo-root `CLAUDE.md`. This app's `/scaffold-form mealplanner ...` flavor is the full-page
form pattern (schema + `+page.server.ts` with superValidate + `+page.svelte` with superForm).

---

## Common Commands

```bash
pnpm dev                    # Dev server — http://localhost:5173
pnpm build                  # Production build
pnpm preview                # Preview production build
pnpm test                   # Vitest, single run
pnpm test:unit              # Vitest, watch mode
pnpm test:coverage          # Vitest with v8 coverage
pnpm check                  # svelte-check (TypeScript + Svelte)
pnpm lint                   # oxlint + fallow dead-code
pnpm lint:fix               # oxlint --fix
pnpm check:redirect-throws  # redirect-throw static check (not part of lint)
pnpm check:all              # fmt + lint + test
pnpm db:generate            # drizzle-kit generate (write a migration from the schema)
pnpm db:migrate             # drizzle-kit migrate (apply committed migrations)
pnpm db:studio              # Drizzle visual browser
```

---

## Deployment (fly.io)

- Region: `yyz` (Toronto)
- SQLite on persistent volume mounted at `/data`, file at `/data/db.sqlite`
- Node 22 slim image
- Set secrets before first deploy:
  ```bash
  fly secrets set BETTER_AUTH_SECRET=... ANTHROPIC_API_KEY=... GEMINI_API_KEY=... BETTER_AUTH_BASE_URL=https://sheppakai-mealplanner.fly.dev
  ```
- The `trustedOrigins` in `auth/index.ts` is derived from `BETTER_AUTH_BASE_URL` — no manual update
  needed when the fly.io app URL changes.

---

## Known Quirks

1. **Superforms + Zod v4 email pattern** — Never spread `{...$constraints}` on `type="email"`
   inputs. Zod v4's email regex uses character classes incompatible with the browser's HTML
   `pattern` attribute `v` flag.

2. **`getMondayOfCurrentWeek()`** — Uses local date components (`.getFullYear()`, `.getMonth()`,
   `.getDate()`) instead of `.toISOString()` to avoid UTC offset shifting the date across midnight.

3. **Auth redirects** — `auth.api.signInEmail` / `signUpEmail` may internally throw SvelteKit
   redirects. Always `if (isRedirect(err)) throw err` inside auth catch blocks.

4. **`useSecureCookies: true`** — Auth cookies require HTTPS. On fly.io this is fine. In local dev,
   better-auth should auto-detect `localhost` and allow non-secure cookies.
