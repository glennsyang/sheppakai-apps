<script lang="ts">
	import ReceiptsPage from '#lib/components/ReceiptsPage.svelte';
	import { formatCurrency } from '#lib/utils.js';

	import type { PageProps } from './$types';
	import { columns } from './columns';

	let { data }: PageProps = $props();

	function averagePerMonth() {
		const average = data.monthlyAverage;
		return [
			{
				label: 'Monthly average',
				value: average === null ? '—' : formatCurrency(average),
				subtext: 'Completed months this year'
			}
		];
	}
</script>

<ReceiptsPage
	title="Fuel receipts"
	subtitle="Gas purchases and the GST on them, for the business books"
	basePath="/receipts/fuel"
	{columns}
	amountLabel="Fuel"
	addLabel="Add fuel receipt"
	monthlyExpenses={data.monthlyExpenses}
	yearlyExpenses={data.yearlyExpenses}
	form={data.form}
	loadError={data.loadError}
	yearlyExtra={averagePerMonth}
/>
