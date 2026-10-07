---
description: Scaffold a new form/CRUD feature/dialog following this repo's existing conventions
argument-hint: <app: budget | synapse | mealplanner> <what it's for and its fields> [flavor: page | crud-list | dialog]
---

## Context

- Apps in this monorepo: !`ls apps`
- Existing full-page form examples (superValidate usage): !`grep -rl "superValidate" apps/*/src --include="*.server.ts" 2>/dev/null | head -9`
- Existing CRUD-list helper usage: !`grep -rln "createCrudActions\|CrudActions" apps/*/src 2>/dev/null | head -6`
- Existing dialog components: !`find apps/*/src -type d -iname "dialogs" 2>/dev/null; find apps/*/src -iname "*Dialog.svelte" 2>/dev/null | head -8`
- Existing schema files: !`find apps/*/src -iname "*schema*" -path "*lib*" 2>/dev/null | head -12`

## Your task

You're scaffolding a new form-backed feature: $ARGUMENTS

This monorepo holds three SvelteKit apps under `apps/` (mealplanner, budget, synapse), and each has settled on its own concrete shape for "a form." Work only inside the target app named in `$ARGUMENTS` (ask if it's missing), read `apps/<app>/CLAUDE.md` first, and ignore the other apps' hits above. Don't assume a universal template — figure out which shape *that* app uses and clone it faithfully.

### 1. Determine the flavor

- **Full page form** — a Zod schema (e.g. `src/lib/schemas/<domain>.ts`), a `+page.server.ts` using `superValidate`/a zod adapter/`fail`/`redirect`, and a `+page.svelte` using `superForm`. (mealplanner's pattern.)
- **CRUD list feature** — a data-table list route backed by a shared server-side CRUD helper (check for something like `createCrudActions()` before hand-rolling actions), plus a Zod schema and query object per domain. (budget's pattern.)
- **Dialog-based entry form** — a modal dialog component with a consistent prop shape (`formData`, `editEntry`, `onClose`, `open = $bindable(false)`, an instance id) and a create/edit toggle state trio (`isEditing`/`internalOpen`/`dialogOpen`-style) wired to `superForm`, plus an `$effect` that opens the dialog externally when `editEntry` is set. (synapse's pattern.)

If `$ARGUMENTS` doesn't say which flavor, use whichever one this repo's own code already uses — read one real, complete example end-to-end (schema + server + client, or the whole dialog component) before writing anything new. If the repo genuinely has none of these yet, default to the full-page form flavor and follow the Non-Negotiable Conventions in its CLAUDE.md.

### 2. Copy the real convention, not a generic one

Once you've picked an exemplar, read it in full and match its actual patterns exactly: import style and aliases (this repo's real ones — never assume `$comp` or another alias without checking), error handling (`isRedirect` rethrow before other catch logic, `fail(400, { form })` shape), the zod adapter names actually imported, naming conventions (e.g. `open[Name]Dialog`), and any shared helpers already in the codebase — don't hand-roll CRUD actions or dialog state plumbing if an equivalent helper/skeleton already exists, extend it instead.

### 3. Generate the pieces

Write the schema, server, and client files (or the dialog component) for the fields/domain described in `$ARGUMENTS`, following the exemplar's structure exactly. Respect this repo's non-negotiable conventions from its CLAUDE.md if one exists (TypeScript strictness, logger usage instead of `console.log`, DB column casing, etc.).

### 4. Keep scope tight

Don't wire up navigation/routing beyond what's needed to reach the new form unless the exemplar you copied from required it (e.g. adding the route folder and its files is in scope; adding a nav link elsewhere in the app is not, unless asked).

### 5. Report back

State which flavor you used and why, which exemplar file(s) you copied conventions from, and the list of files created. Flag anything needing manual follow-up (a DB migration if the schema adds a table/column, a route link to add, an env var).

Ask for clarification only if `$ARGUMENTS` doesn't give you enough to know what fields/domain the form is for — don't guess at business meaning.
