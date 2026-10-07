# Server Error Handling Policy

## Overview

This is the target policy for every app in the monorepo (`apps/budget`, `apps/synapse`,
`apps/mealplanner`). All SvelteKit server load functions and actions must handle errors
consistently, so that:

- **Operational visibility**: errors are logged with enough context to debug them
- **Graceful degradation**: users see a helpful message instead of a generic 500 page
- **Consistent UX**: every route handles failure the same predictable way

Paths in the examples below are relative to the app (`apps/<app>/`); most of them point at
`apps/budget`, the reference implementation.

## Adoption status

| Area                                    | budget | synapse                             | mealplanner  |
| --------------------------------------- | ------ | ----------------------------------- | ------------ |
| Load functions return `loadError`       | ✅     | ✅                                  | ✅           |
| Auth forms via `handleAuthFormAction`   | ✅     | ✅                                  | ✅           |
| Non-auth actions use `message(form, …)` | ✅     | ✅ (except Daily Agenda, see below) | ✅           |
| `/api/v1` JSON envelope                 | ✅     | ✅                                  | n/a (no API) |

All three apps follow this policy (#19). New code in any app does too.

Each app has the same building blocks: `invalidForm` in
`src/lib/server/actions/form-responses.ts` for validation failures, and (budget, synapse)
`actionMessage()` in `src/lib/utils/actionMessage.ts` for components that submit with plain
`use:enhance`. mealplanner's planner/pantry components use `actionFailureText()` in
`src/lib/action-result.ts` for the same job. Actions that post no fields of their own (synapse's
`archivePerson`, `deleteRoutine`, …) validate against `noFieldsSchema` / `idSchema` in
`src/lib/schemas/common.ts`, so they still have a form to carry a message.

## Policy: Load Functions

### Required Pattern

All `load` functions that make database queries or external API calls **must** wrap them in try/catch blocks:

```typescript
export const load: PageServerLoad = async ({ url, locals }) => {
  // Initialize forms first (outside try/catch since they're synchronous)
  const form = await superValidate(zod4(mySchema));

  try {
    // Database queries or external API calls
    const data = await queries.findAll();

    return {
      data,
      form,
    };
  } catch (error) {
    logger.error("Failed to load [entity name]:", error);
    return {
      data: [], // sensible empty default
      loadError: "Failed to load [entity name]. Please try refreshing the page.",
      form,
    };
  }
};
```

### Key Requirements

1. **Log all errors**: Use `logger.error()` with descriptive context
2. **Return typed fallback**: Return all expected properties with safe defaults
3. **Include loadError field**: Add optional `loadError: string` to communicate failure to UI
4. **Safe defaults**: Empty arrays for lists, empty objects for maps, null for optional single values
5. **Preserve forms**: Always return form objects initialized before the try block

### Example: Multiple Queries

```typescript
export const load: PageServerLoad = async ({ url }) => {
  const { startDate, endDate } = getMonthRangeFromUrl(url);
  const form = await superValidate(zod4(transactionSchema));

  try {
    const [transactions, budgets] = await Promise.all([
      transactionQueries.findByDateRange(startDate, endDate),
      budgetQueries.findByMonthYear(month, year),
    ]);

    return {
      transactions,
      budgets,
      form,
    };
  } catch (error) {
    logger.error("Failed to load transactions and budgets:", error);
    return {
      transactions: [],
      budgets: [],
      loadError: "Failed to load transaction data. Please try refreshing the page.",
      form,
    };
  }
};
```

## Policy: Actions

### Response contract

A form action returns exactly one of three things. There is no fourth shape — in particular, never a
bare `fail(...)` and never an ad-hoc `{ success: true }`.

| Outcome                            | Response                                             | HTTP    |
| ---------------------------------- | ---------------------------------------------------- | ------- |
| Success, navigate away             | `throw redirect(302, '/somewhere')`                  | 302     |
| Success, stay on page              | `message(form, { type: 'success', text })`           | 200     |
| Failure (validation **or** server) | `message(form, { type: 'error', text }, { status })` | 4xx/5xx |

Superforms converts a `message(...)` with a 4xx/5xx status into `fail(status, { form })`, so the
failure case still carries field-level errors — it just also carries a banner. Every failure
therefore has a renderable `App.Superforms.Message` (declared in `src/app.d.ts`), and pages only ever
read `$message` and `$errors`. No page has to branch on which shape the server happened to send.

### Implementations

Both halves live in each app's `src/lib/server/actions/auth-form-handler.ts`. The three copies
match apart from where they import `getBetterAuthErrorMessage` from. In budget, non-auth actions (CRUD helpers,
admin guard, app routes) import the same validation helper as `invalidForm` from
`src/lib/server/actions/form-responses.ts`, a re-export that gives it a neutral name without a
second copy:

```typescript
// Validation failure
if (!form.valid) {
	return invalidAuthForm(form);
}

// Server failure: rethrows redirects, logs, maps the Better Auth error to a
// friendly message, and returns the failure banner.
return handleAuthFormAction(
	form,
	async () => {
		await auth.api.signInEmail({ body: { ... }, headers: request.headers });
		throw redirect(302, '/dashboard');
	},
	{
		loggerContext: 'Sign-in failed',
		fallbackMessage: 'An error occurred during sign-in. Please try again.'
	}
);
```

`handleAuthFormAction` defaults to status 400; pass `status` only to override it. Pass
`errorType: 'success'` where a failure must stay indistinguishable from a success (see
`src/routes/(auth)/forgot-password/+page.server.ts`, which hides whether an account exists).

### Reading the response on the client

Pages hold a `superForm` instance and read `$message` / `$errors`. Inside the `onUpdate` callback,
read `form.message` off the callback argument — **not** the `$message` store. `clearOnSubmit` defaults
to `'message'`, so superforms blanks the store at submit time and only repopulates it after `onUpdate`
has run; a `$message` read inside `onUpdate` is always `undefined`. See
`src/routes/(app)/profile/+page.svelte` for the correct pattern.

Note also that `message(form, ..., { status >= 400 })` sets `form.valid = false`, so `form.valid` is a
usable success check — but prefer `form.message?.type === 'success'`, which is explicit.

A few budget components submit with plain `use:enhance` from `$app/forms` rather than a `superForm`
instance, because they render no fields of their own: `ConfirmModal`, `PresetBudgetCard`,
`UpcomingBillsCard`, and the recurring table's `paid-toggle` / `data-table-actions`. They read the
banner out of the raw `ActionResult` via `actionMessage()` in `src/lib/utils/actionMessage.ts`, which
is the only place that unwraps a result by hand.

### Migration status (budget)

Every action in budget follows this contract. The shared `requireAuth` 401 wall is the sole
exception (see below), and `actionMessage()` keeps its `data.error` fallback for that one case alone.

Success messages for CRUD actions come from `getCrudMessage()` in
`src/lib/server/actions/messages.ts`, so the server owns the wording and pages render
`form.message.text` verbatim rather than duplicating it.

`createDeleteAction` in `src/lib/server/actions/crud-helpers.ts` validates against `idSchema`
(`src/lib/formSchemas/common.ts`) rather than taking a per-caller schema. Every delete in the app
takes an id and nothing else, so one code path covers them all — and a validated form is what lets a
delete answer with a renderable message instead of a bare `fail(...)`. `deleteCustomer` in
`src/routes/(app)/window-cleaning/+page.server.ts` follows the same shape by hand, because it
soft-deletes and so cannot use `deleteAction`.

## Exceptions

- **Auth redirects**: `throw redirect(...)` is intentional control flow, not an error case
- **Validation failures**: Already handled by superforms/zod validation
- **Intentional error throws**: When using `error(404, 'Not found')` is appropriate
- **`requireAuth` / `requireAdmin` 401/403**: `packages/shared/src/auth-guard.ts` (re-exported
  by each app's `src/lib/server/actions/auth-guard.ts`) returns `fail(401 | 403, { error })`
  because its wrappers run before any `superValidate` and so have no form to carry a message.
  It is shared by all three apps, so it is not bent to one app's contract. The 401 is defence-in-depth: `src/routes/(app)/+layout.server.ts`
  already redirects unauthenticated users, so the path is reachable only when a session expires
  between page load and submit, and `actionMessage()` keeps its `data.error` fallback for it.
  Contrast `adminAuthFailure` (`src/lib/server/actions/admin-guard.ts`), which always runs after
  validation and answers with `message(form, ...)`.
- **Admin actions in budget use `adminFormAction`, never `requireAdmin`**: the shared `requireAdmin` checks
  the DB `role` only, while budget's admin check (`isAdminUser`, via `assertAdmin` /
  `adminFormAction`) also honours the `ADMIN_USER_IDS` bootstrap. Importing `requireAdmin` outside
  its own test is an oxlint error (`no-restricted-imports` in `oxlint.config.ts`).
- **Detail-page loads throw `error()`**: synapse's `journal/[id]`, `tasks/[id]/edit`, `visits/[id]`
  and `meditation/routines/[id]` loads throw `error(404)` for a missing entity and `error(500)` for
  a failed query, rather than returning a `loadError`. The page cannot render anything useful
  without its entity, so the error page is the honest answer.
- **synapse Daily Agenda actions**: `failAgendaValidation` / `failAgendaMutation` in
  `apps/synapse/src/routes/(app)/tasks/+page.server.ts` answer with a structured `agendaAction`
  payload (scope, entity id, field errors, values) that `DailyAgendaView` reads to drive its inline
  editors, so they still use `fail(...)`. `ConfirmDialog` reads that payload's `text` before falling
  back to `actionMessage()`. Moving them onto superforms means reworking `DailyAgendaView`.
- **Sign-out**: `src/routes/(auth)/sign-out/+page.server.ts` has no form. A Better Auth failure is
  logged and the action still redirects to sign-in, so the user never sees a 500 for it.

## Frontend Integration

Components should check for `loadError` and display it prominently:

```svelte
<script lang="ts">
	let { data } = $props();
</script>

{#if data.loadError}
	<Alert variant="destructive">
		<AlertTitle>Error</AlertTitle>
		<AlertDescription>{data.loadError}</AlertDescription>
	</Alert>
{/if}
```

## JSON API routes

`/api/v1/*` routes (`src/routes/api/v1/` in budget and synapse) have no superform to attach a
`message()` to, so they follow the same policy restated as a plain JSON envelope instead:
`{ data }` on success, `{ error: { code, message } }` on failure, always with an explicit HTTP
status — no third shape. See `packages/shared/src/api-response.ts` (`apiSuccess`/`apiError`)
and [API_CONVENTIONS.md](./API_CONVENTIONS.md) for the full contract.

## References

- Example load implementation: `apps/budget/src/routes/(app)/admin/users/+page.server.ts`
- Every `(app)` page load that queries the database follows this pattern; the fallback shape is asserted by
  `apps/budget/src/routes/(app)/load-error-fallbacks.test.ts`,
  `apps/synapse/src/routes/(app)/load-error-fallbacks.test.ts` and
  `apps/mealplanner/src/tests/routes/loadErrorFallbacks.test.ts`
- Example action implementation: `apps/budget/src/routes/(auth)/sign-in/+page.server.ts`
