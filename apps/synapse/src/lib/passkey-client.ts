import { createPasskeyAuthClient } from '@sheppakai/shared/passkey-client';

/**
 * Browser-only Better Auth client, used just for the WebAuthn flows (passkey sign-in on
 * /sign-in, Add a passkey on Profile). Everything else goes through form actions.
 */
export const authClient = createPasskeyAuthClient();
