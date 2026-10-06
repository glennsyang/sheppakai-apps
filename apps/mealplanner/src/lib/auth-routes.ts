// Shared auth route paths; this app only adds where users land after sign-in.
export * from '@sheppakai/shared/auth-routes';

/**
 * Where authenticated users land after signing in. This app's authenticated home
 * lives at `/` (`(app)/+page.svelte`); budget/synapse use `/dashboard` because
 * they have a dedicated dashboard route.
 */
export const POST_LOGIN_ROUTE = '/';
