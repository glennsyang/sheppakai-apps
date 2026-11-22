<script lang="ts">
	import type { Expense } from '#lib';
	import ConfirmModal from '#lib/components/ConfirmModal.svelte';
	import ExpenseModal from '#lib/components/ExpenseModal.svelte';
	import RowActionsMenu from '#lib/components/RowActionsMenu.svelte';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import { getCategoriesContext, expenseFormContext } from '#lib/contexts/index.js';
	import { toDuplicateExpenseFormData, toExpenseFormData } from '#lib/formSchemas/index.js';

	let {
		id,
		expenseData,
		actionUrl,
		deleteMessage
	}: {
		id: string;
		expenseData: Expense;
		actionUrl: string;
		deleteMessage: string;
	} = $props();

	let openEditModal = $state<boolean>(false);
	let openDuplicateModal = $state<boolean>(false);
	let openDeleteModal = $state<boolean>(false);

	const categories = getCategoriesContext();
	const expenseForm = expenseFormContext.get();
</script>

<RowActionsMenu onEdit={() => (openEditModal = true)} onDelete={() => (openDeleteModal = true)}>
	<DropdownMenu.Item onclick={() => (openDuplicateModal = true)}>Duplicate</DropdownMenu.Item>
</RowActionsMenu>

<ExpenseModal
	bind:open={openEditModal}
	initialData={toExpenseFormData(expenseData)}
	isEditing
	categories={categories()}
	{expenseForm}
/>

<ExpenseModal
	bind:open={openDuplicateModal}
	initialData={toDuplicateExpenseFormData(expenseData)}
	isDuplicating
	categories={categories()}
	{expenseForm}
/>

<ConfirmModal
	bind:open={openDeleteModal}
	{id}
	{actionUrl}
	title="Delete expense"
	message={deleteMessage}
	confirmButtonText="Delete"
/>
