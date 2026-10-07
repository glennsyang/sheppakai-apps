<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import type { User } from '$lib/types';
	import { actionMessage } from '$lib/utils/actionMessage';
	import MailIcon from '@lucide/svelte/icons/mail';
	import { toast } from 'svelte-sonner';

	let { user }: { user: User } = $props();

	let openWelcomeDialog = $state<boolean>(false);
	let isSubmitting = $state<boolean>(false);
</script>

<Button
	variant="ghost"
	size="sm"
	onclick={() => (openWelcomeDialog = true)}
	class="flex items-center gap-2"
>
	<MailIcon class="size-4" />
	Send welcome email
</Button>

<Dialog.Root bind:open={openWelcomeDialog}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Send Welcome Email</Dialog.Title>
			<Dialog.Description>
				Send {user.email} the welcome email with instructions for setting their password and signing in?
			</Dialog.Description>
		</Dialog.Header>
		<form
			method="POST"
			action="?/sendWelcomeEmail"
			use:enhance={() => {
				isSubmitting = true;

				return async ({ result, update }) => {
					const resultMessage = actionMessage(result, {
						success: `Welcome email sent to ${user.email}.`,
						error: 'Failed to send welcome email'
					});
					if (resultMessage.type === 'success') {
						toast.success(resultMessage.text);
					} else {
						toast.error(resultMessage.text);
					}
					await update();
					isSubmitting = false;
					openWelcomeDialog = false;
				};
			}}
		>
			<input type="hidden" name="userId" value={user.id} />

			<div class="flex justify-end gap-2 pt-4">
				<Button type="button" variant="outline" onclick={() => (openWelcomeDialog = false)}
					>Cancel</Button
				>
				<Button type="submit" disabled={isSubmitting}>
					{isSubmitting ? 'Sending...' : 'Send'}
				</Button>
			</div>
		</form>
	</Dialog.Content>
</Dialog.Root>
