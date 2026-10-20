import type { ActionResult } from '$app/forms';
import { isRecord } from '@sheppakai/shared/guards';

/**
 * The user-facing text from a failed planner/pantry action. Those actions all fail with
 * `{ form }` carrying a superforms `message` (see server/actions/domain-action.ts);
 * anything else — a thrown error, a 401 `{ error }` — falls back to `fallback`.
 */
export function actionFailureText(result: ActionResult, fallback: string): string {
	if (result.type === 'failure') {
		const form: unknown = result.data?.form;
		const message = isRecord(form) ? form.message : undefined;
		if (isRecord(message) && typeof message.text === 'string' && message.text) return message.text;
	}
	return fallback;
}
