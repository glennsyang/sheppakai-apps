// Better Auth error code -> message map, shared by every app. Only imported from
// `+page.server.ts` auth actions, hence it lives under `src/lib/server/`.
export { getBetterAuthErrorMessage } from '@sheppakai/shared/better-auth-errors';
