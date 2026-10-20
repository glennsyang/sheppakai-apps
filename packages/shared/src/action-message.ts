import type { ActionResult } from '$app/forms';

import { isRecord } from './guards';

function isMessage(value: unknown): value is App.Superforms.Message {
	return (
		isRecord(value) &&
		(value.type === 'error' || value.type === 'success') &&
		typeof value.text === 'string'
	);
}

/**
 * Read the `App.Superforms.Message` out of an ActionResult.
 *
 * Forms with a `superForm` instance read `$message` directly. Components that submit via plain
 * `use:enhance` from `$app/forms` (confirm dialogs, table row actions) see the raw ActionResult
 * instead, so this is the single place that knows how to unwrap one.
 *
 * The response shapes come from `docs/ERROR_HANDLING_POLICY.md`. Every action returns a form, so
 * the `data.error` branch is down to the `requireAuth` / `requireAdmin` 401/403 wall, which runs
 * before `superValidate` and so has no form to carry a message.
 */
export function actionMessage(
	result: ActionResult,
	fallbacks: { success: string; error: string }
): App.Superforms.Message {
	if (result.type === 'redirect') {
		return { type: 'success', text: fallbacks.success };
	}

	if (result.type === 'error') {
		// App.Error from handleError: a sanitized, generic message, so the action-specific
		// fallback reads better.
		return { type: 'error', text: fallbacks.error };
	}

	const data = result.data as { form?: { message?: unknown }; error?: unknown } | undefined;

	if (isMessage(data?.form?.message)) {
		return data.form.message;
	}

	if (result.type === 'failure') {
		return {
			type: 'error',
			text: typeof data?.error === 'string' ? data.error : fallbacks.error
		};
	}

	return { type: 'success', text: fallbacks.success };
}
