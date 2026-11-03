<script lang="ts">
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';

	let {
		customerEmail,
		invoiceSentAt,
		onSelect
	}: {
		customerEmail: string | null;
		invoiceSentAt: Date | null;
		/** Opens a `SendInvoiceDialog` rendered outside the menu (the menu unmounts on close). */
		onSelect: () => void;
	} = $props();
</script>

<DropdownMenu.Item disabled={!customerEmail} onclick={onSelect}>
	{invoiceSentAt ? 'Resend invoice' : 'Send invoice'}
	{#if !customerEmail}
		<span class="text-muted-foreground ms-auto text-xs">No email</span>
	{/if}
</DropdownMenu.Item>
