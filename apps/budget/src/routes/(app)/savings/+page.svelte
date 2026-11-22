<script lang="ts">
	import PlusIcon from '@lucide/svelte/icons/plus';

	import DashboardStatStrip, { type Stat } from '#lib/components/DashboardStatStrip.svelte';
	import LoadErrorBanner from '#lib/components/LoadErrorBanner.svelte';
	import PageShell from '#lib/components/PageShell.svelte';
	import SavingsAccountModal from '#lib/components/SavingsAccountModal.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { DataTable } from '#lib/components/ui/data-table/index.js';
	import { savingsAccountFormContext } from '#lib/contexts/index.js';
	import { formatCurrency } from '#lib/utils.js';

	import type { PageProps } from './$types';
	import { columns } from './columns';

	let { data }: PageProps = $props();

	// svelte-ignore state_referenced_locally
	if (data.form) {
		savingsAccountFormContext.set(data.form);
	}

	let openModal = $state<boolean>(false);

	let totalInSavingsAccounts = $derived(
		data.savingsAccounts.reduce((sum, account) => sum + account.amount, 0)
	);
	let largest = $derived(
		data.savingsAccounts.reduce<(typeof data.savingsAccounts)[number] | null>(
			(top, s) => (!top || s.amount > top.amount ? s : top),
			null
		)
	);

	let stats = $derived<Stat[]>([
		{
			label: 'Total in savings accounts',
			value: formatCurrency(totalInSavingsAccounts),
			subtext: `${data.savingsAccounts.length} ${data.savingsAccounts.length === 1 ? 'account' : 'accounts'}`
		},
		{
			label: 'Largest account',
			value: largest ? formatCurrency(largest.amount) : '—',
			subtext: largest?.title
		}
	]);
</script>

<svelte:head>
	<title>Savings accounts</title>
</svelte:head>

<PageShell title="Savings accounts" subtitle="What is set aside in each account">
	{#snippet actions()}
		<Button href="/savings/goals" variant="outline">Goals</Button>
		<Button onclick={() => (openModal = true)}>
			<PlusIcon />
			Add account
		</Button>
	{/snippet}

	{#if data.loadError}
		<LoadErrorBanner message={data.loadError} />
	{:else}
		<DashboardStatStrip {stats} />
		<DataTable
			{columns}
			data={data.savingsAccounts}
			searchable={data.savingsAccounts.length > 10}
			defaultSorting={[{ id: 'amount', desc: true }]}
			emptyMessage="No savings accounts yet. Add one to track its balance here."
		/>
	{/if}
</PageShell>

<SavingsAccountModal bind:open={openModal} savingsAccountForm={data.form} />
