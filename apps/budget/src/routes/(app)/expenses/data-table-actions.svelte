<script lang="ts">
	import type { Expense } from '#lib';
	import ExpenseRowActions from '#lib/components/ExpenseRowActions.svelte';

	let { id, expenseData }: { id: string; expenseData: Expense } = $props();
</script>

<ExpenseRowActions
	{id}
	{expenseData}
	actionUrl="/expenses?/delete"
	deleteMessage="Are you sure you want to delete this expense?"
/>
