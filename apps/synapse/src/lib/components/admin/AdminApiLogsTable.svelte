<script lang="ts">
	import type { AdminApiLogEntry } from '@sheppakai/shared/api-audit-log';

	import { columns } from './api-logs-columns';
	import DataTable from './DataTable.svelte';

	let { entries }: { entries: AdminApiLogEntry[] } = $props();
</script>

<DataTable
	{columns}
	data={entries}
	defaultPageSize={10}
	defaultSorting={[{ id: 'createdAt', desc: true }]}
	emptyMessage="No API activity yet."
/>
