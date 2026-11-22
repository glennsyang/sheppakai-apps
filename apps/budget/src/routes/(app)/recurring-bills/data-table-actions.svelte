<script lang="ts">
	import { enhance } from '$app/forms';
	import { refreshAll } from '$app/navigation';
	import { actionMessage } from '@sheppakai/shared/action-message';
	import { toast } from 'svelte-sonner';

	import type { RecurringBill } from '#lib';
	import ConfirmModal from '#lib/components/ConfirmModal.svelte';
	import RecurringBillModal from '#lib/components/RecurringBillModal.svelte';
	import RowActionsMenu from '#lib/components/RowActionsMenu.svelte';
	import { Button, buttonVariants } from '#lib/components/ui/button/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import { recurringBillFormContext } from '#lib/contexts/index.js';
	import { toRecurringBillFormData } from '#lib/formSchemas/index.js';

	let { id, recurringBill }: { id: string; recurringBill: RecurringBill } = $props();

	const recurringBillForm = recurringBillFormContext.get();

	let openEditModal = $state<boolean>(false);
	let openDeleteModal = $state<boolean>(false);
	let togglingPaid = $state<boolean>(false);
</script>

<RowActionsMenu onEdit={() => (openEditModal = true)} onDelete={() => (openDeleteModal = true)}>
	<DropdownMenu.Item>
		<form
			class="toggle-paid-form"
			method="POST"
			action="?/togglePaid"
			use:enhance={() => {
				togglingPaid = true;
				return async ({ result, update }) => {
					if (result.type === 'success') {
						// Silent on success — a toast on every checkbox tick would be noise.
						await refreshAll();
					} else {
						const { text } = actionMessage(result, {
							success: 'Paid status updated',
							error: 'Failed to toggle paid status'
						});
						toast.error(text);
					}

					await update();
					togglingPaid = false;
				};
			}}
		>
			<input type="hidden" name="id" value={id} />
			<input type="hidden" name="paid" value={recurringBill?.paid ? 'false' : 'true'} />
			<Button type="submit" size="sm" variant="ghost" disabled={togglingPaid}
				>{recurringBill?.paid ? 'Mark Unpaid' : 'Mark Paid'}</Button
			>
		</form>
	</DropdownMenu.Item>
</RowActionsMenu>

<RecurringBillModal
	bind:open={openEditModal}
	initialData={toRecurringBillFormData(recurringBill)}
	{recurringBillForm}
	isEditing
/>

<ConfirmModal
	bind:open={openDeleteModal}
	{id}
	actionUrl="?/delete"
	title="Delete recurring bill"
	message="Are you sure you want to delete this recurring bill?"
	confirmButtonText="Delete"
/>

<style>
	:global(.toggle-paid-form button) {
		padding: 0;
		height: 8px;
	}
</style>
