<script lang="ts">
	import PlusIcon from '@lucide/svelte/icons/plus';
	import type { SuperValidated } from 'sveltekit-superforms';
	import type { z } from 'zod';

	import type { Expense } from '#lib';
	import type { Stat } from '#lib/components/DashboardStatStrip.svelte';
	import ExpenseModal from '#lib/components/ExpenseModal.svelte';
	import MonthlyTablePageShell from '#lib/components/MonthlyTablePageShell.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { DataTable } from '#lib/components/ui/data-table/index.js';
	import { getCategoriesContext, expenseFormContext } from '#lib/contexts/index.js';
	import type { expenseSchema } from '#lib/formSchemas/index.js';
	import { formatCurrency, monthNames } from '#lib/utils.js';
	import { formatDayHeading } from '#lib/utils/dates.js';
	import { useMonthYearParams } from '#lib/utils/monthYearParams.svelte.js';
	import type { createReceiptColumns } from '#lib/utils/receipt-columns.js';

	interface Props {
		title: string;
		subtitle: string;
		basePath: string;
		columns: ReturnType<typeof createReceiptColumns>;
		/** What the amount totals are called, e.g. "Fuel" or "Spent". */
		amountLabel: string;
		/** Label for the add button, e.g. "Add fuel receipt". */
		addLabel: string;
		monthlyExpenses: Expense[];
		yearlyExpenses: Expense[];
		form?: SuperValidated<z.infer<typeof expenseSchema>>;
		loadError?: string;
		/** Extra figures for the stat strip, placed after the yearly total. */
		yearlyExtra?: (yearlyTotalAmount: number) => Stat[];
	}

	let {
		title,
		subtitle,
		basePath,
		columns,
		amountLabel,
		addLabel,
		monthlyExpenses,
		yearlyExpenses,
		form,
		loadError,
		yearlyExtra
	}: Props = $props();

	// svelte-ignore state_referenced_locally
	if (form) {
		expenseFormContext.set(form);
	}

	let openModal = $state<boolean>(false);

	const sumAmount = (items: Expense[]) => (items || []).reduce((sum, t) => sum + t.amount, 0);
	const sumGst = (items: Expense[]) =>
		(items || []).reduce((sum, t) => sum + (t.gstAmount ?? 0), 0);

	let monthlyTotalAmount = $derived(sumAmount(monthlyExpenses));
	let monthlyTotalGst = $derived(sumGst(monthlyExpenses));
	let yearlyTotalAmount = $derived(sumAmount(yearlyExpenses));
	let yearlyTotalGst = $derived(sumGst(yearlyExpenses));

	// svelte-ignore state_referenced_locally
	const monthYear = useMonthYearParams(basePath);

	const categories = getCategoriesContext();

	let monthName = $derived(monthNames[monthYear.month - 1]);

	let stats = $derived<Stat[]>([
		{
			label: `${amountLabel} in ${monthName}`,
			value: formatCurrency(monthlyTotalAmount),
			subtext: `GST ${formatCurrency(monthlyTotalGst)}`
		},
		{
			label: `${amountLabel} in ${monthYear.year}`,
			value: formatCurrency(yearlyTotalAmount)
		},
		...(yearlyExtra?.(yearlyTotalAmount) ?? []),
		{
			label: `GST paid in ${monthYear.year}`,
			value: formatCurrency(yearlyTotalGst),
			tooltip: 'Input tax credits you can claim, from the GST on these receipts.'
		}
	]);
</script>

<svelte:head>
	<title>{title}</title>
</svelte:head>

<MonthlyTablePageShell
	{title}
	{subtitle}
	{loadError}
	selectedMonth={monthYear.month}
	selectedYear={monthYear.year}
	onMonthYearChange={monthYear.onMonthYearChange}
	{stats}
	skeletonColumns={columns.length - 1}
>
	{#snippet primaryAction()}
		<Button onclick={() => (openModal = true)}>
			<PlusIcon />
			{addLabel}
		</Button>
	{/snippet}

	{#snippet tableContent()}
		<DataTable
			{columns}
			data={monthlyExpenses}
			mobileGroupBy={(t) => formatDayHeading(t.date)}
			emptyMessage={`No receipts for ${monthName} ${monthYear.year} yet.`}
		/>
	{/snippet}
</MonthlyTablePageShell>

<ExpenseModal bind:open={openModal} categories={categories()} expenseForm={form!} />
