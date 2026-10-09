// Stand-in for SvelteKit's `$app/server`, which `sveltekit-superforms/server` imports
// only as a server-only guard. Apps resolve the real module; this package's tests can't.
export {};
