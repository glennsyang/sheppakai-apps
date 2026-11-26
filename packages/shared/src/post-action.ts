import { deserialize, type ActionResult } from '$app/forms';

/**
 * Post a form action from code and return its ActionResult unchanged.
 *
 * Only for saves that have no form to enhance (drag-and-drop on the Synapse Task board and Topic
 * Queue). Everything else submits through `use:enhance` / superForm.
 *
 * With the `x-sveltekit-action` header SvelteKit answers with a serialized ActionResult instead of
 * re-rendering the page, so a `redirect` (e.g. the auth wall after a session expires) comes back
 * as a redirect rather than looking like a successful save. Callers decide what each result means.
 */
export async function postAction(action: string, formData: FormData): Promise<ActionResult> {
	const response = await fetch(`?/${action}`, {
		method: 'POST',
		headers: { 'x-sveltekit-action': 'true' },
		body: formData
	});
	return deserialize(await response.text());
}

/** The message drag-and-drop callers show when {@link isSessionExpired} is true. */
export const SESSION_EXPIRED_MESSAGE = 'Your session expired. Sign in again.';

/**
 * Whether an ActionResult is the auth wall rather than an answer to the save: `requireAuth`
 * answers an unauthenticated action with `fail(401)`, and `getUser` with a redirect to sign-in.
 */
export function isSessionExpired(result: ActionResult): boolean {
	return result.type === 'redirect' || (result.type === 'failure' && result.status === 401);
}
