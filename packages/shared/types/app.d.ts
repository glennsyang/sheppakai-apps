// Minimal stand-ins for the types each app gets from its own src/app.d.ts and from
// `svelte-kit sync`, so this package type-checks on its own. Apps never load this file;
// their own declarations apply there.
declare global {
	namespace App {
		interface Locals {
			requestId?: string;
			user?: { id: string; role?: string | null } | null;
			session?: { token: string };
		}

		namespace Superforms {
			type Message = { type: 'error' | 'success'; text: string };
		}
	}
}

declare module '$app/types' {
	interface AppTypes {
		RouteId(): '/';
		RouteParams(): Record<string, never>;
		LayoutParams(): { '/': Partial<Record<string, string>> };
	}
}

export {};
