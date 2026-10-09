<script lang="ts">
	import type { User } from '$lib/types';

	import DataTable from './DataTable.svelte';
	import { makeColumns } from './users-columns';

	let { users, currentUserId }: { users: User[]; currentUserId: string } = $props();

	const columns = $derived(makeColumns(currentUserId));
</script>

<DataTable
	{columns}
	data={users}
	searchPlaceholder="Search users..."
	defaultPageSize={10}
	defaultSorting={[{ id: 'name', desc: false }]}
	emptyMessage="No users found."
/>
