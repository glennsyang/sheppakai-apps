# Sentry Wiring Strategy

Single source of truth for how Sentry is wired into `hooks.server.ts` /
`hooks.client.ts` across the three apps (`apps/synapse`, `apps/budget`,
`apps/mealplanner`). Originally tracked by glennsyang/sheppakai-budget#441, before the apps
moved into this monorepo.

## `sentryHandle()` — used in all three

`hooks.server.ts` wires `Sentry.sentryHandle()` first in the `handle` sequence:

```ts
export const handle = sequence(
  Sentry.sentryHandle(),
  createServerHandle({ auth, logger, allowedEmails, dev, building })
);
```

`createServerHandle` and `createHandleError` live in `packages/shared/src/server-handle.ts`;
`Sentry.init` stays in each app's `hooks.server.ts`.

All three apps already set `tracesSampleRate: 1.0` in their server `Sentry.init`, and
`sentryHandle()` is what actually turns that into per-request tracing spans and
distributed-trace header propagation server-side; it also lets Sentry read the same
per-request CSP nonce SvelteKit generates (see [CSP.md](./CSP.md)). Without it, the
`tracesSampleRate` setting is inert.

## `handleError` — never wrapped with `handleErrorWithSentry()` server-side

The shared logger (`packages/logger`, re-exported as each app's `$lib/server/logger`)
already forwards unhandled errors to Sentry:
`logger.error()` calls `Sentry.captureException()` (or `captureMessage()` for non-`Error`
values) internally whenever it's invoked outside dev. `handleError` (`createHandleError`)
calls `logger.error('Unhandled server error', ...)` on every unhandled error, so wrapping
`handleError` itself with `Sentry.handleErrorWithSentry()` would double-report every one
of them. `createHandleError` documents this with a comment directly above it.

**Client-side is different and unaffected**: `hooks.client.ts` in all three apps uses
`export const handleError = handleErrorWithSentry();` — there is no structured logger
running in the browser to cause double-reporting, so this is the correct, unchanged
pattern client-side.

## `Sentry.init` options

All three apps are on SDK v11 (one version, pinned in the `pnpm-workspace.yaml` catalog) and share the same options.

| option             | client                 | server                 | why                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------ | ---------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dsn`              | app's public DSN       | app's public DSN       |                                                                                                                                                                                                                                                                                                                                                                              |
| `tracesSampleRate` | `0.2`                  | `1.0`                  | paired with `sentryHandle()` server-side (see above)                                                                                                                                                                                                                                                                                                                         |
| `dataCollection`   | `sentryDataCollection` | `sentryDataCollection` | v11 replaced `sendDefaultPii` with this, and **leaving it unset collects everything** (cookies, bodies, user info, IPs), including the Better Auth session cookie server-side. `packages/shared/src/sentry-data-collection.ts` (re-exported by each app's `src/lib/sentry-data-collection.ts`) pins the v10-equivalent baseline; requestId is the only prod correlation key. |
| `attachStacktrace` | default                | `false`                | `logger.warn`/`logger.error` report via `captureMessage`; v11 would otherwise attach a synthetic call-site stack trace and regroup existing issues.                                                                                                                                                                                                                          |

`enableLogs` is not set: nothing uses `Sentry.logger`. Each `Sentry.init({...})` call documents the
`dataCollection` choice inline, so nobody drops it when copy-pasting config between hooks.

## Changing this strategy

1. Update `apps/<app>/src/hooks.server.ts` / `hooks.client.ts` for the affected app(s).
2. Update this file so it stays the single source of truth.
3. Verify: `pnpm --filter <app> check:all`, then a manual smoke check (`pnpm --filter <app> dev`, load a page,
   confirm no Sentry init errors in the console and that request logging still works).
