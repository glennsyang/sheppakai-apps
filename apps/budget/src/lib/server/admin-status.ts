// Admin and ban checks, re-exported from the shared guards so `assertAdmin`, API-key
// verification and the demote-disables-keys path can't drift apart.
export { isAdminUser } from './actions/auth-guard';
export { isBanActive } from '@sheppakai/shared/auth-allowlist';
