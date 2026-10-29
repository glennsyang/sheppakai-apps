<script lang="ts">
	import { API_AUDIT_LOG_LIMIT } from '@sheppakai/shared/api-audit-log';

	import { apiLogColumns } from '#lib/components/admin/api-logs-columns.js';
	import { Alert } from '#lib/components/ui/alert/index.js';
	import DataTable from '#lib/components/ui/data-table/DataTable.svelte';

	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>API logs — Meal Planner</title>
</svelte:head>

<section class="space-y-4">
	<div>
		<h2 class="text-xl font-bold tracking-tight">API logs</h2>
		<p class="ink-soft text-sm">
			The latest {API_AUDIT_LOG_LIMIT} writes made through the API, successful or not.
		</p>
	</div>

	{#if data.loadError}
		<Alert variant="destructive" role="alert">{data.loadError}</Alert>
	{:else}
		<DataTable
			columns={apiLogColumns}
			data={data.entries}
			defaultPageSize={20}
			defaultSorting={[{ id: 'createdAt', desc: true }]}
			searchPlaceholder="Search actions, paths or users..."
			emptyMessage="No API activity yet."
		/>
	{/if}
</section>
