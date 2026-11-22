<script lang="ts">
	import PlusIcon from '@lucide/svelte/icons/plus';

	import type { RecurringBill } from '#lib';
	import type { Stat } from '#lib/components/DashboardStatStrip.svelte';
	import MonthlyTablePageShell from '#lib/components/MonthlyTablePageShell.svelte';
	import RecurringBillModal from '#lib/components/RecurringBillModal.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { DataTable } from '#lib/components/ui/data-table/index.js';
	import { recurringBillFormContext } from '#lib/contexts/index.js';
	import { formatCurrency, monthNames } from '#lib/utils.js';
	import { useMonthYearParams } from '#lib/utils/monthYearParams.svelte.js';

	import type { PageProps } from './$types';
	import { getColumns } from './columns';

	let { data }: PageProps = $props();

	// svelte-ignore state_referenced_locally
	recurringBillFormContext.set(data.form);

	let openModal = $state<boolean>(false);
	const unpaidAsOf = new Intl.DateTimeFormat('en-US', {
		month: 'short',
		day: 'numeric'
	}).format(new Date());

	const monthYear = useMonthYearParams('/recurring-bills');
	let periodLabel = $derived(`${monthNames[monthYear.month - 1]} ${monthYear.year}`);

	// Only the current month is fully editable; past months allow a one-month amount fix.
	let columns = $derived(
		getColumns(
			data.isCurrentMonth
				? { kind: 'current' }
				: data.isPastMonth
					? { kind: 'past', monthKey: data.monthKey, periodLabel }
					: { kind: 'future' }
		)
	);

	// Paid bills recede so what is still owed stands out.
	const getRecurringBillRowClass = (bill: RecurringBill) =>
		bill.paid ? 'text-muted-foreground' : '';

	let totalRecurringBills = $derived(
		data.recurringBills.reduce((sum, item) => sum + item.amount, 0)
	);
	let totalUnpaidRecurringBills = $derived(
		data.recurringBills.filter((item) => !item.paid).reduce((sum, item) => sum + item.amount, 0)
	);
	let paidCount = $derived(data.recurringBills.filter((item) => item.paid).length);

	let stats = $derived<Stat[]>([
		{ label: 'Recurring bills total', value: formatCurrency(totalRecurringBills) },
		{
			label: 'Left to pay',
			value: formatCurrency(totalUnpaidRecurringBills),
			subtext: data.isCurrentMonth ? `Unpaid as of ${unpaidAsOf}` : `Unpaid in ${periodLabel}`
		},
		{
			label: 'Paid',
			value: `${paidCount} of ${data.recurringBills.length}`,
			meter: data.recurringBills.length > 0 ? (paidCount / data.recurringBills.length) * 100 : 0
		}
	]);
</script>

<svelte:head>
	<title>Recurring bills</title>
</svelte:head>

<MonthlyTablePageShell
	title="Recurring bills"
	subtitle={data.isCurrentMonth
		? 'Bills and subscriptions that come around every month or year'
		: data.isPastMonth
			? `Bills in effect in ${periodLabel}. Amounts can be corrected for this month only.`
			: `Bills expected in ${periodLabel} (read-only)`}
	loadError={data.loadError}
	selectedMonth={monthYear.month}
	selectedYear={monthYear.year}
	onMonthYearChange={monthYear.onMonthYearChange}
	{stats}
	skeletonColumns={columns.length}
>
	{#snippet primaryAction()}
		{#if data.isCurrentMonth}
			<Button onclick={() => (openModal = true)}>
				<PlusIcon />
				Add recurring bill
			</Button>
		{/if}
	{/snippet}

	{#snippet tableContent()}
		<DataTable
			{columns}
			data={data.recurringBills}
			defaultPageSize={20}
			rowClassName={getRecurringBillRowClass}
			searchPlaceholder="Search bills…"
			emptyMessage={data.isCurrentMonth
				? 'No recurring bills yet. Add rent, subscriptions or insurance to see what is still owed each month.'
				: `No recurring bills were in effect in ${periodLabel}.`}
		/>
	{/snippet}
</MonthlyTablePageShell>

<RecurringBillModal bind:open={openModal} recurringBillForm={data.form} />
