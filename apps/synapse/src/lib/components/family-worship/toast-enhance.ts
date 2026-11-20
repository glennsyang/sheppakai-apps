import type { SubmitFunction } from '$app/forms';
import { actionMessage } from '@sheppakai/shared/action-message';
import { toast } from 'svelte-sonner';

/**
 * `use:enhance` handler for the small plain forms on the Family Worship screens (schedule a
 * week, archive, "We did it"): toast the action's message, then let SvelteKit revalidate.
 */
export function toastEnhance(fallbacks: { success: string; error: string }): SubmitFunction {
	return () =>
		async ({ result, update }) => {
			const resultMessage = actionMessage(result, fallbacks);
			if (resultMessage.type === 'success') {
				toast.success(resultMessage.text);
			} else {
				toast.error(resultMessage.text);
			}
			// Stay put: by default SvelteKit navigates to the route that owns the action, which
			// would take the dashboard's "We did it" over to /family-worship (and drop ?tab=).
			await update({ navigate: false });
		};
}
