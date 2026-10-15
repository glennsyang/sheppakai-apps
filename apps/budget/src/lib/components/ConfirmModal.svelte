<script lang="ts">
	import { enhance } from '$app/forms';
	import { actionMessage } from '@sheppakai/shared/action-message';
	import { toast } from 'svelte-sonner';

	import { Button } from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';

	interface Props {
		open: boolean;
		title: string;
		message: string;
		confirmButtonText: string;
		id?: string;
		/** Name of the hidden field carrying `id`; the admin user actions post `userId`. */
		idField?: string;
		actionUrl?: string;
	}

	let {
		open = $bindable(),
		title,
		message,
		id,
		idField = 'id',
		confirmButtonText,
		actionUrl
	}: Props = $props();
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-106.25">
		<Dialog.Header>
			<Dialog.Title>{title}</Dialog.Title>
			<Dialog.Description>
				{message}
			</Dialog.Description>
		</Dialog.Header>
		<form
			method="POST"
			action={actionUrl}
			use:enhance={() => {
				open = false;

				return async ({ result, update }) => {
					const { type, text } = actionMessage(result, {
						success: `${title} successful!`,
						error: `${title} failed!`
					});

					toast[type](text);

					// Stay on this page even when the action lives on another route (SvelteKit 3 navigates by default).
					await update({ navigate: false });
				};
			}}
		>
			<input type="hidden" name={idField} value={id} />
			<input type="hidden" name="status" value="archived" />
			<Dialog.Footer>
				<Dialog.Close><Button type="reset" variant="outline">Cancel</Button></Dialog.Close>
				<Button type="submit">{confirmButtonText}</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
