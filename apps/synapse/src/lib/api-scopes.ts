/**
 * This app's full set of permissions an external API key can be granted. Kept as a flat
 * `resource:action` string so it's easy to render as UI checkboxes and store on a
 * superforms schema, while still mapping cleanly onto the `{ resource: string[] }`
 * permissions record the better-auth API key plugin expects.
 */
export const API_SCOPES = [
	'tasks:read',
	'tasks:write',
	'mood:read',
	'mood:write',
	'workouts:read',
	'workouts:write',
	'meals:read',
	'meals:write',
	'visits:read',
	'visits:write',
	'people:read',
	'journal:read',
	'journal:write'
] as const;

export type ApiScope = (typeof API_SCOPES)[number];

export { scopesToPermissions } from '@sheppakai/shared/api-scopes';
