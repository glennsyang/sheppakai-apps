# Passkeys: feasibility and rollout plan

Planning record for #264. No code has changed yet; the work is split into #265 (shared), #266 (budget), #267 (mealplanner) and #268 (synapse).

## Verdict: Go

Passkeys fit the current auth setup with low risk and about 1.5 to 2 days of work:

| Piece                                                                | Estimate        |
| -------------------------------------------------------------------- | --------------- |
| Shared plugin, audit logging, client helper and tests (#265)         | ~0.5 day        |
| Each app: schema, sign-in button, profile section (#266, #267, #268) | ~2–3 hours each |
| Device testing (desktop, iOS PWA, Android)                           | ~0.5 day        |

Why it's low risk:

- All three apps build Better Auth through `createAppAuth` (`packages/shared/src/auth-config.ts`), so the server plugin is added once.
- The plugin (`@better-auth/passkey`) is published at the same version as our `better-auth` (1.7.19).
- Password sign-in stays. Passkeys are an extra, optional way in.
- The existing allowlist and ban checks still apply (see [Security](#security)).

## What the user sees

### Sign-in page

The email and password form stays exactly as it is. Two things are added.

```
┌──────────────────────────────────────┐
│ Sign in                              │
│ Welcome back.                        │
│                                      │
│ Email                                │
│ ┌──────────────────────────────────┐ │
│ │ you@example.com                  │ │  ← tapping here also offers
│ └──────────────────────────────────┘ │    saved passkeys (autofill)
│ Password            Forgot password? │
│ ┌──────────────────────────────────┐ │
│ │ ••••••••••••                     │ │
│ └──────────────────────────────────┘ │
│ ┌──────────────────────────────────┐ │
│ │             Sign in              │ │
│ └──────────────────────────────────┘ │
│ ─────────────── or ───────────────── │
│ ┌──────────────────────────────────┐ │
│ │  🔑  Sign in with a passkey      │ │  ← new
│ └──────────────────────────────────┘ │
└──────────────────────────────────────┘
```

1. **"Sign in with a passkey" button.** Tap it, the device shows its own prompt (Face ID, Touch ID, Windows Hello, or a QR code to use a phone), and the user lands on the app's home page. No email or password is typed.
2. **Autofill.** The email field gets `autocomplete="username webauthn"`. When the user taps it, the saved passkey appears in the keyboard bar (iOS, Android) or the autofill dropdown (Chrome, Safari, Edge). Picking it runs the same Face ID / Touch ID step and signs in.

The button is hidden on browsers with no WebAuthn support. Everything else on the page works as today.

### Profile page

A new **Passkeys** section sits under **Password**:

```
┌──────────────────────────────────────┐
│ Passkeys                             │
│ Sign in with Face ID, Touch ID or    │
│ your device PIN instead of a password│
│                                      │
│ iPhone          added 11 Nov 2026    │
│                     Rename · Remove  │
│ MacBook         added 12 Nov 2026    │
│                     Rename · Remove  │
│ ┌──────────────────────────────────┐ │
│ │         Add a passkey            │ │
│ └──────────────────────────────────┘ │
└──────────────────────────────────────┘
```

- **Add a passkey** opens the device prompt. On success the new passkey shows in the list.
- **Rename** and **Remove** act on one passkey. Removing it stops it from signing in.

### Errors

| Situation                             | What the user sees                                                                         |
| ------------------------------------- | ------------------------------------------------------------------------------------------ |
| User cancels the device prompt        | Nothing. The page stays as it was.                                                         |
| No passkey for this app on the device | "No passkey found for this device. Sign in with your password, then add one from Profile." |
| Browser doesn't support passkeys      | The passkey button is hidden. Password sign-in works.                                      |
| Account removed from the allowlist    | The same generic "Invalid email or password" message password sign-in shows.               |
| Account banned                        | The admin plugin's "You have been banned…" message, the same as password sign-in.          |

### What does not change

- Password sign-in, forgot password, verify email and admin **Add user**.
- New accounts still start with email and password. The user adds a passkey after the first sign-in. Passkey-only sign-up (`registration.requireSession: false`) is deferred.
- The password stays the recovery path: a lost phone means signing in with the password (or resetting it) and adding a new passkey.

### One passkey per app

Each app runs on its own domain, so a passkey belongs to one app. A Budget passkey won't sign in to Synapse. The user adds a passkey in each app they use.

## Does it work in the installed PWA? Yes

| Platform                                      | Installed PWA | Notes                                                              |
| --------------------------------------------- | ------------- | ------------------------------------------------------------------ |
| iPhone / iPad (iOS 16+), home-screen app      | Works         | Passkeys come from iCloud Keychain. Button and autofill both work. |
| Android, Chrome-installed app                 | Works         | Passkeys come from Google Password Manager (or another provider).  |
| macOS / Windows, Chrome or Edge installed app | Works         | Touch ID, Windows Hello, a security key, or a phone via QR.        |
| Firefox (Android)                             | Partial       | Not guaranteed. Password sign-in is the fallback.                  |

Why it works:

- An installed PWA runs on the same origin as the website. WebAuthn checks the origin, not whether the page is in a browser tab or a standalone window. A passkey made in Safari works in the home-screen app, and the other way round.
- The service worker (`apps/*/src/service-worker/index.ts`) ignores non-GET requests and everything under `/api/`. The passkey calls are POSTs to `/api/auth/passkey/*`, so the cache never sees them.
- `Permissions-Policy` (`packages/shared/src/server-handle.ts`) only restricts geolocation, camera and microphone. WebAuthn stays allowed.
- CSP needs no change: the calls are same-origin.

The biggest gain is on iOS. A home-screen app keeps its own cookies, separate from Safari, and iOS clears them more often. Today that means typing a 12+ character password on a phone keyboard. With a passkey it is one Face ID tap.

Sign-in still needs the network, the same as password sign-in today.

## How it fits the code

### Server (#265)

- `createAppAuth` adds `passkey({ rpName: appName })` after `haveIBeenPwned()` and before app plugins and `sveltekitCookies` (which must stay last), **only when the app's `tables` map has a `passkey` key**. Better Auth checks the Drizzle schema against every plugin's tables before each query, so turning the plugin on before an app has the table would break every auth request in that app. Registering the table is the per-app on switch.
- Leave `rpID` and `origin` unset. The plugin derives them from `baseURL` and `trustedOrigins`, which `createAppAuth` already sets (including `http://localhost:5173` in development).
- New endpoints under `/api/auth`: `/passkey/generate-register-options`, `/passkey/verify-registration`, `/passkey/generate-authenticate-options`, `/passkey/verify-authentication`, `/passkey/list-user-passkeys`, `/passkey/update-passkey`, `/passkey/delete-passkey`.
- Registration needs a signed-in session (`requireSession` default). Signed-in users already have a verified email, so passkeys never skip email verification.

- Audit (`createAuthAfterHooks`): `Sign-in successful` with `method: 'passkey'` (password sign-ins log `method: 'password'`), `Passkey added` and `Passkey removed`. A new passkey also sends the "passkey added" email (`sendPasskeyAddedEmail` from `createAuthEmails`) and a `sendAuthAlerts` security alert.

### Browser client (#265, used by each app)

No app has a Better Auth browser client today: sign-in is a SvelteKit form action calling `auth.api.signInEmail` (`packages/shared/src/auth-route-actions.ts`). The WebAuthn prompt can only start in the browser (`navigator.credentials`), so each app uses the shared helper in `@sheppakai/shared/passkey-client`:

- `createPasskeyAuthClient()`: `createAuthClient({ plugins: [passkeyClient()] })` from `better-auth/svelte`.
- `passkeyErrorMessage(error)`: user copy for a failure, or `null` when the user cancelled (stay silent). Takes a thrown error or the `error` of a `{ data, error }` result.
- `isPasskeySupported()`: hide the button when `false`.

Only the passkey button and the profile Passkeys section use it. After a passkey sign-in the page navigates with `goto(postLoginRoute, { invalidateAll: true })`; after add/rename/remove it calls `invalidateAll()`.

### Per-app UI pattern (#266, #267, #268)

The Svelte pieces stay in each app (each app has its own shadcn `Button`/`Card` copies). Create the client once in a module, e.g. `src/lib/passkey-client.ts`:

```ts
import { createPasskeyAuthClient } from "@sheppakai/shared/passkey-client";

export const authClient = createPasskeyAuthClient();
```

**Sign-in page.** Add `autocomplete="username webauthn"` to the email input. Start conditional (autofill) sign-in once on mount (a browser-only API, so `onMount` is fine) and abort it when the password form submits:

```svelte
<script lang="ts">
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";
  import { isPasskeySupported, passkeyErrorMessage } from "@sheppakai/shared/passkey-client";
  import { authClient } from "#lib/passkey-client";

  let supported = $state(false);
  let passkeyError = $state<string | null>(null);

  async function signInWithPasskey(autoFill = false) {
    passkeyError = null;
    const { error } = await authClient.signIn.passkey({ autoFill });
    if (error) {
      passkeyError = passkeyErrorMessage(error);
      return;
    }
    await goto(postLoginRoute, { invalidateAll: true });
  }

  onMount(() => {
    supported = isPasskeySupported();
    if (supported && PublicKeyCredential.isConditionalMediationAvailable) {
      void PublicKeyCredential.isConditionalMediationAvailable().then((ok) => {
        if (ok) void signInWithPasskey(true);
      });
    }
  });
</script>

{#if supported}
  <Button variant="outline" onclick={() => signInWithPasskey()}>Sign in with a passkey</Button>
  {#if passkeyError}<p role="alert">{passkeyError}</p>{/if}
{/if}
```

The password form keeps its own `use:enhance` submit. The browser cancels a pending conditional request when a new WebAuthn call starts or the page navigates, and the cancel maps to `null`, so the password path shows no passkey error.

**Profile page.** A "Passkeys" card under "Password":

- List: `authClient.passkey.listUserPasskeys()` (or `authClient.useListPasskeys()` for a reactive store). Show `name` and `createdAt`.
- Add: `authClient.passkey.addPasskey({ name })`, then `invalidateAll()`. Show `passkeyErrorMessage(error)` when it isn't `null`.
- Rename: `authClient.passkey.updatePasskey({ id, name })`. Remove: `authClient.passkey.deletePasskey({ id })`. Both followed by `invalidateAll()`.
- Registration needs a fresh session (Better Auth's `freshAge`, 1 day by default). An older session gets `SESSION_NOT_FRESH` (403), which `passkeyErrorMessage` turns into "sign out and sign in again".

### Schema (#266, #267, #268)

One new `passkey` table per app, generated with `pnpm --filter <app> db:generate`:

| Field (TypeScript) | Type              | Notes                                       |
| ------------------ | ----------------- | ------------------------------------------- |
| `id`               | text, primary key |                                             |
| `name`             | text, nullable    | Label shown on Profile                      |
| `publicKey`        | text              |                                             |
| `userId`           | text              | FK → `user.id`, cascade delete              |
| `credentialID`     | text, unique      |                                             |
| `counter`          | integer           |                                             |
| `deviceType`       | text              |                                             |
| `backedUp`         | boolean           |                                             |
| `transports`       | text, nullable    |                                             |
| `aaguid`           | text, nullable    | Identifies the provider (iCloud, Google, …) |
| `createdAt`        | timestamp         |                                             |

Column names follow each app's convention: snake_case for budget and mealplanner (`user_id`, `public_key`, …), camelCase for synapse. The table is new, so the migration is a plain `CREATE TABLE`, with no rebuild of existing tables.

Register the table as `passkey` in the `tables` map each app passes to `createAppAuth`. That turns the plugin on for that app (see [Server](#server-265)).

## Security

- **Phishing resistance improves.** A passkey only works on the domain it was made for, so a fake sign-in page can't capture it.
- **Allowlist still enforced.** The `hooks.before` gate in `packages/shared/src/auth-allowlist.ts` only checks `/sign-in/email`, but every passkey sign-in creates a session, and `createAllowlistSessionGuard` (`databaseHooks.session.create.before`) refuses sessions for emails not in `ALLOWED_EMAILS`. #265 adds a test for this.
- **Bans still enforced.** The admin plugin's own `session.create.before` hook throws `BANNED_USER` on every sign-in path. #265 adds a test.
- **Use-time checks unchanged.** `isUserAccessAllowed` (called from `server-handle.ts`) runs on every request regardless of how the session was created.
- **Rate limiting.** Better Auth's limiter (5 per minute per IP per path) covers the new endpoints. One passkey sign-in makes two requests on two paths, so normal use stays well inside it.
- **New edge case: lost device.** Recovery is the password, which stays. If passkey-only accounts are ever added, this needs a new recovery design first.
- **Deleting a user** cascades to their passkeys.

### Password reset must remove passkeys

A password reset is the recovery path for a hacked account: `revokeSessionsOnPasswordReset` signs out every device, so the intruder loses access. Passkeys break that. An intruder with a session can add their own passkey, and a later reset would leave it working. Better Auth doesn't remove passkeys on reset by itself.

#265 closes this with two changes:

1. **Reset deletes every passkey.** `onPasswordReset` in `createAppAuth` deletes all `passkey` rows for the user (through Better Auth's adapter, `deleteMany({ model: 'passkey', where: [{ field: 'userId', value: user.id }] })`) before the "password changed" email goes out. The user re-adds passkeys on their own devices after signing in with the new password. The email copy says passkeys were removed.
2. **Email on every new passkey.** After `/passkey/verify-registration` succeeds, send a "A passkey was added to your account" email (device name, time, link to Profile) and an operator alert via `sendAuthAlerts`. Fire-and-forget with `.catch`, like the "password changed" email. If the user didn't add it, the email tells them to reset their password, which now also removes the passkey.

A profile password change (not a reset) keeps passkeys: the user is signed in and can see and remove them on Profile.

## Risks and mitigations

Owner for all: @glennsyang.

| Risk                                                           | Mitigation                                                                                                                                                              |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wrong `rpID` / origin in production → every passkey call fails | Defaults come from `BETTER_AUTH_BASE_URL`. Test on the deployed Fly URL before announcing. Password sign-in is untouched, so a failure only hides a convenience.        |
| Changing an app's domain later orphans its passkeys            | Passkeys are bound to the domain. Users would re-add them; password still works. Note it in the domain-change checklist.                                                |
| Migration fails on deploy                                      | New table only. Test on a restored backup (`restore-db-backup` skill) before deploy.                                                                                    |
| Autofill call conflicts with the password form                 | Start conditional sign-in once, on mount, and abort it when the form submits. Covered by the per-app acceptance criteria.                                               |
| Plugin ordering                                                | Add before `sveltekitCookies`; existing plugins (admin, HIBP, API key) don't touch passkey paths.                                                                       |
| Intruder adds a passkey that survives a password reset         | Reset deletes all passkeys; every new passkey triggers an email and an operator alert. See [Password reset must remove passkeys](#password-reset-must-remove-passkeys). |

## Test plan

Automated (#265):

- Passkey sign-in for a user not in `ALLOWED_EMAILS` → no session.
- Passkey sign-in for a banned user → no session.
- `/passkey/generate-register-options` with no session → 401.
- Password reset deletes all of the user's passkeys; another user's passkeys are untouched.
- Adding a passkey sends the "passkey added" email and an operator alert; a failing email doesn't fail registration.
- Existing password sign-in and route action tests still pass.

Manual, per app (#266–#268):

1. Sign in with password, add a passkey from Profile, check it's listed.
2. Sign out, sign in with the button. No email typed.
3. Sign out, tap the email field, pick the passkey from autofill.
4. Cancel the device prompt: no error shown, password sign-in still works.
5. Remove the passkey: it no longer signs in.
6. Repeat 2 in the installed PWA (iOS home-screen app, Android if available).

## Rollout

1. Merge #265 (shared). No user-visible change until an app registers the table and adds the UI.
2. Ship budget (#266) first. Run the migration, test on the Fly URL and in the iOS PWA.
3. Ship mealplanner (#267), then synapse (#268).
4. No feature flag: the passkey button is optional and password stays, so a staged rollout per app is enough.

**Rollback:** remove the plugin and the UI and redeploy. The `passkey` table can stay; nothing reads it without the plugin.

**Observability:** #265 extends `createAuthAfterHooks` to log `Sign-in successful` with `method: 'passkey'` and to log passkey add/remove. Failures go to Sentry through the existing error handling. Success check after a week: each regular user has signed in with a passkey at least once and there are no new auth errors in Sentry.
