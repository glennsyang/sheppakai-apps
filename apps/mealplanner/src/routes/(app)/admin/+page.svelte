<script lang="ts">
	import AdminUsersTable from '$lib/components/admin/AdminUsersTable.svelte';
	import CreateUserForm from '$lib/components/admin/CreateUserForm.svelte';
	import type { AdminUser } from '$lib/components/admin/types';
	import { Alert } from '$lib/components/ui/alert';

	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const users = $derived(data.users as AdminUser[]);

	// Row actions (role, ban, remove, welcome email) answer with `message(form, …)` on a form of
	// their own; the create-user form renders its own message, so skip it here.
	const rowMessage = $derived.by(() => {
		const actionForm = (form as { form?: { id: string; message?: App.Superforms.Message } } | null)
			?.form;
		return actionForm && actionForm.id !== data.createForm.id ? actionForm.message : undefined;
	});
</script>

<svelte:head>
	<title>Admin — Meal Planner</title>
</svelte:head>

<div class="space-y-8 px-5 pt-8 pb-12 sm:px-10 sm:pt-12">
	<div>
		<h1 class="text-[2rem] leading-tight font-bold tracking-tight sm:text-[2.5rem]">Admin</h1>
		<p class="ink-soft mt-2 text-lg">Add users and manage their roles and access.</p>
	</div>

	{#if data.loadError}
		<Alert variant="destructive" role="alert">
			{data.loadError}
		</Alert>
	{/if}

	{#if rowMessage?.type === 'error'}
		<Alert variant="destructive" role="alert">
			{rowMessage.text}
		</Alert>
	{:else if rowMessage}
		<Alert variant="success" role="status">
			{rowMessage.text}
		</Alert>
	{/if}

	<div class="space-y-10">
		<CreateUserForm data={data.createForm} allowlist={data.allowlist} />
		<AdminUsersTable {users} currentUserId={data.user.id} allowlistedIds={data.allowlistedIds} />
	</div>
</div>
