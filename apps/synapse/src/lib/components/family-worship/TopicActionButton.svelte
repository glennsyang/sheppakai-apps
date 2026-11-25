<script lang="ts">
	import { enhance } from '$app/forms';
	import { actionMessage } from '@sheppakai/shared/action-message';
	import { toast } from 'svelte-sonner';

	import { Button } from '#lib/components/ui/button/index.js';

	/** One-click topic action (archive, restore) that posts the topic id and toasts the result. */
	interface Props {
		action: 'archiveTopic' | 'restoreTopic';
		id: string;
		label: string;
	}

	let { action, id, label }: Props = $props();

	let submitting = $state(false);
</script>

<form
	method="POST"
	action="?/{action}"
	use:enhance={() => {
		submitting = true;
		return async ({ result, update }) => {
			const resultMessage = actionMessage(result, {
				success: `${label} successful!`,
				error: `${label} failed!`
			});
			if (resultMessage.type === 'success') {
				toast.success(resultMessage.text);
			} else {
				toast.error(resultMessage.text);
			}
			await update({ navigate: false });
			submitting = false;
		};
	}}
>
	<input type="hidden" name="id" value={id} />
	<Button type="submit" variant="ghost" size="sm" disabled={submitting}>{label}</Button>
</form>
