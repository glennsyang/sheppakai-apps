// API responses carry each record's owner as `user`. The queries load the full user row
// (the admin pages need the email), but an API key holder, such as an external AI
// assistant, only needs to know who the record belongs to. So every `/api/v1` success body
// passes through here, and each `user` object is cut down to `id` and `name`: no email, role
// or ban details leave the app.

/** The user fields an API response may include. */
const PUBLIC_USER_FIELDS = ['id', 'name'] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return (
		typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype
	);
}

function toPublicUser(user: Record<string, unknown>): Record<string, unknown> {
	return Object.fromEntries(
		PUBLIC_USER_FIELDS.filter((field) => field in user).map((field) => [field, user[field]])
	);
}

/** `data` with every nested `user` object reduced to its public fields. */
export function withPublicUsers(data: unknown): unknown {
	if (Array.isArray(data)) return data.map(withPublicUsers);
	if (!isPlainObject(data)) return data;
	return Object.fromEntries(
		Object.entries(data).map(([key, value]) => [
			key,
			key === 'user' && isPlainObject(value) ? toPublicUser(value) : withPublicUsers(value)
		])
	);
}
