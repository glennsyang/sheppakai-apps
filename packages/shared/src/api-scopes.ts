/**
 * Helpers for API key scopes. Each app defines its own `API_SCOPES` list of flat
 * `resource:action` strings (easy to render as UI checkboxes and store on a superforms
 * schema); these map them onto the `{ resource: string[] }` permissions record the
 * better-auth API key plugin expects.
 */

/** Groups flat scope strings into the `{ resource: [action, ...] }` shape better-auth expects. */
export function scopesToPermissions(scopes: readonly string[]): Record<string, string[]> {
	const permissions: Record<string, string[]> = {};
	for (const scope of scopes) {
		const [resource, action] = scope.split(':');
		(permissions[resource] ??= []).push(action);
	}
	return permissions;
}

/** Builds the single-scope permissions record passed to `auth.api.verifyApiKey`. */
export function permissionsForScope(scope: string): Record<string, string[]> {
	const [resource, action] = scope.split(':');
	return { [resource]: [action] };
}

/** Parses the JSON `permissions` column better-auth stores on an API key; null if absent or malformed. */
export function parsePermissions(raw: string | null): Record<string, string[]> | null {
	if (!raw) return null;
	try {
		const parsed: unknown = JSON.parse(raw);
		return parsed && typeof parsed === 'object' ? (parsed as Record<string, string[]>) : null;
	} catch {
		return null;
	}
}
