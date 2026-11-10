<script lang="ts">
	import PlusIcon from '@lucide/svelte/icons/plus';

	import type { Recurring } from '#lib';
	import type { Stat } from '#lib/components/DashboardStatStrip.svelte';
	import MonthlyTablePageShell from '#lib/components/MonthlyTablePageShell.svelte';
	import RecurringModal from '#lib/components/RecurringModal.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { DataTable } from '#lib/components/ui/data-table/index.js';
	import { recurringFormContext } from '#lib/contexts/index.js';
	import { formatCurrency, monthNames } from '#lib/utils.js';
	import { useMonthYearParams } from '#lib/utils/monthYearParams.svelte.js';

	import type { PageProps } from './$types';
	import { getColumns } from './columns';

	let { data }: PageProps = $props();

	// svelte-ignore state_referenced_locally
	recurringFormContext.set(data.form);

	let openModal = $state<boolean>(false);
	const unpaidAsOf = new Intl.DateTimeFormat('en-US', {
		month: 'short',
		day: 'numeric'
	}).format(new Date());

	const monthYear = useMonthYearParams('/recurring');
	let periodLabel = $derived(`${monthNames[monthYear.month - 1]} ${monthYear.year}`);

	// Only the current month is editable; other months are read-only history.
	let columns = $derived(getColumns(data.isCurrentMonth));

	// Paid bills recede so what is still owed stands out.
	const getRecurringRowClass = (recurring: Recurring) =>
		recurring.paid ? 'text-muted-foreground' : '';

	let totalRecurring = $derived(data.recurrings.reduce((sum, item) => sum + item.amount, 0));
	let totalUnpaidRecurring = $derived(
		data.recurrings.filter((item) => !item.paid).reduce((sum, item) => sum + item.amount, 0)
	);
	let paidCount = $derived(data.recurrings.filter((item) => item.paid).length);

	let stats = $derived<Stat[]>([
		{ label: 'Recurring total', value: formatCurrency(totalRecurring) },
		{
			label: 'Left to pay',
			value: formatCurrency(totalUnpaidRecurring),
			subtext: data.isCurrentMonth ? `Unpaid as of ${unpaidAsOf}` : `Unpaid in ${periodLabel}`
		},
		{
			label: 'Paid',
			value: `${paidCount} of ${data.recurrings.length}`,
			meter: data.recurrings.length > 0 ? (paidCount / data.recurrings.length) * 100 : 0
		}
	]);
</script>

<svelte:head>
	<title>Recurring</title>
</svelte:head>

<MonthlyTablePageShell
	title="Recurring"
	subtitle={data.isCurrentMonth
		? 'Bills and subscriptions that come around every month or year'
		: `Bills in effect in ${periodLabel} (read-only)`}
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
				Add recurring
			</Button>
		{/if}
	{/snippet}

	{#snippet tableContent()}
		<DataTable
			{columns}
			data={data.recurrings}
			defaultPageSize={20}
			rowClassName={getRecurringRowClass}
			searchPlaceholder="Search bills…"
			emptyMessage={data.isCurrentMonth
				? 'No recurring bills yet. Add rent, subscriptions or insurance to see what is still owed each month.'
				: `No recurring bills were in effect in ${periodLabel}.`}
		/>
	{/snippet}
</MonthlyTablePageShell>

<RecurringModal bind:open={openModal} recurringForm={data.form} />
