<script lang="ts">
	import { enhance } from '$app/forms';
	import { actionMessage } from '@sheppakai/shared/action-message';
	import { toast } from 'svelte-sonner';

	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';

	let {
		jobId,
		customerEmail,
		invoiceSentAt,
		actionUrl
	}: {
		jobId: string;
		customerEmail: string | null;
		invoiceSentAt: Date | null;
		/** e.g. `/window-cleaning?/sendInvoice` */
		actionUrl: string;
	} = $props();

	let form = $state<HTMLFormElement>();
	let sending = $state(false);
</script>

<form
	bind:this={form}
	method="POST"
	action={actionUrl}
	class="hidden"
	use:enhance={() => {
		sending = true;
		const pending = toast.loading('Sending invoice…');
		return async ({ result, update }) => {
			const { type, text } = actionMessage(result, {
				success: 'Invoice sent',
				error: 'Failed to send the invoice'
			});
			toast.dismiss(pending);
			if (type === 'success') toast.success(text);
			else toast.error(text);
			await update();
			sending = false;
		};
	}}
>
	<input type="hidden" name="id" value={jobId} />
</form>

<DropdownMenu.Item disabled={!customerEmail || sending} onclick={() => form?.requestSubmit()}>
	{invoiceSentAt ? 'Resend invoice' : 'Send invoice'}
	{#if !customerEmail}
		<span class="text-muted-foreground ms-auto text-xs">No email</span>
	{/if}
</DropdownMenu.Item>
