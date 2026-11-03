<script lang="ts">
	import { enhance } from '$app/forms';
	import { actionMessage } from '@sheppakai/shared/action-message';
	import { toast } from 'svelte-sonner';

	import { Button } from '#lib/components/ui/button/index.js';
	import { Checkbox } from '#lib/components/ui/checkbox/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';

	let {
		open = $bindable(),
		jobId,
		customerEmail,
		invoiceSentAt,
		actionUrl
	}: {
		open: boolean;
		jobId: string;
		customerEmail: string | null;
		invoiceSentAt: Date | null;
		/** e.g. `/window-cleaning?/sendInvoice` */
		actionUrl: string;
	} = $props();

	let paid = $state(false);

	// Untick each time the dialog opens, so one job's choice doesn't carry over to the next
	$effect(() => {
		if (open) paid = false;
	});

	const sentOn = $derived(
		invoiceSentAt
			? new Date(invoiceSentAt).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })
			: null
	);
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-106.25">
		<Dialog.Header>
			<Dialog.Title>{invoiceSentAt ? 'Resend invoice?' : 'Send invoice?'}</Dialog.Title>
			<Dialog.Description>
				This emails the invoice to {customerEmail}.
				{#if sentOn}It was already sent on {sentOn}.{/if}
			</Dialog.Description>
		</Dialog.Header>
		<form
			method="POST"
			action={actionUrl}
			use:enhance={() => {
				open = false;
				const pending = toast.loading('Sending invoice…');
				return async ({ result, update }) => {
					const { type, text } = actionMessage(result, {
						success: 'Invoice sent',
						error: 'Failed to send the invoice'
					});
					toast.dismiss(pending);
					toast[type](text);
					// Stay on this page even when the action lives on another route
					await update({ navigate: false });
				};
			}}
		>
			<input type="hidden" name="id" value={jobId} />
			<label class="flex items-center gap-2 py-2 text-sm">
				<Checkbox name="paid" value="true" bind:checked={paid} />
				Already paid (email shows "Amount paid" instead of "Amount due")
			</label>
			<Dialog.Footer>
				<Dialog.Close><Button type="reset" variant="outline">Cancel</Button></Dialog.Close>
				<Button type="submit">Send</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
