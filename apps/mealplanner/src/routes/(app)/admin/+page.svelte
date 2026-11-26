<script lang="ts">
	import AdminUsersTable from '#lib/components/admin/AdminUsersTable.svelte';
	import CreateUserForm from '#lib/components/admin/CreateUserForm.svelte';
	import type { AdminUser } from '#lib/components/admin/types.js';
	import { Alert } from '#lib/components/ui/alert/index.js';

	import type { PageData } from './$types';

	// Row actions (role, ban, remove, welcome email) answer with a toast; the create-user form
	// renders its own message.
	let { data }: { data: PageData } = $props();

	const users = $derived(data.users as AdminUser[]);
</script>

<svelte:head>
	<title>Admin — Meal Planner</title>
</svelte:head>

<div class="space-y-8">
	{#if data.loadError}
		<Alert variant="destructive" role="alert">
			{data.loadError}
		</Alert>
	{/if}

	<div class="space-y-10">
		<CreateUserForm data={data.createForm} />
		<AdminUsersTable {users} currentUserId={data.user.id} allowlistedIds={data.allowlistedIds} />
	</div>
</div>
