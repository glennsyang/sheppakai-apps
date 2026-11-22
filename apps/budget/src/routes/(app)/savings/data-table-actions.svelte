<script lang="ts">
	import type { SavingsAccount } from '#lib';
	import ConfirmModal from '#lib/components/ConfirmModal.svelte';
	import RowActionsMenu from '#lib/components/RowActionsMenu.svelte';
	import SavingsAccountModal from '#lib/components/SavingsAccountModal.svelte';
	import { savingsAccountFormContext } from '#lib/contexts/index.js';

	let { id, savingsAccount }: { id: string; savingsAccount: SavingsAccount } = $props();

	let openEditModal = $state<boolean>(false);
	let openDeleteModal = $state<boolean>(false);

	const savingsAccountForm = savingsAccountFormContext.get();
</script>

<RowActionsMenu onEdit={() => (openEditModal = true)} onDelete={() => (openDeleteModal = true)} />

<SavingsAccountModal
	bind:open={openEditModal}
	initialData={{
		id,
		title: savingsAccount?.title,
		description: savingsAccount?.description ?? undefined,
		amount: savingsAccount?.amount
	}}
	isEditing
	{savingsAccountForm}
/>

<ConfirmModal
	bind:open={openDeleteModal}
	{id}
	actionUrl="/savings?/delete"
	title="Delete savings account"
	message="Are you sure you want to delete this savings account?"
	confirmButtonText="Delete"
/>
