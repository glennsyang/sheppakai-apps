<script lang="ts">
	import { untrack } from 'svelte';
	import { defaults, superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';

	import { NativeSelect } from '#lib/components/ui/native-select/index.js';
	import { setRoleSchema, USER_ROLES, type UserRole } from '#lib/schemas/admin.js';

	import type { AdminUser } from './types';

	// One form per user: the parent renders this inside `{#key user.id}`, because the data table
	// keys rows by index and would otherwise hand this instance a different user after a sort.
	let { user, disabled = false }: { user: AdminUser; disabled?: boolean } = $props();

	const savedRole = $derived((user.role ?? 'user') as UserRole);

	// svelte-ignore state_referenced_locally — superForm is intentionally initialized once from props
	const initial = { userId: user.id, role: (user.role ?? 'user') as UserRole };

	const { form, enhance, submitting, submit } = superForm(
		defaults(initial, zod4Client(setRoleSchema)),
		{
			id: `set-role-${initial.userId}`,
			validators: zod4Client(setRoleSchema),
			// Keep the picked role after a save; a reset would flash back to the initial one.
			resetForm: false,
			// The page's banner shows the action's message (`form` is applied to the page).
			onUpdated({ form: result }) {
				if (!result.valid || result.message?.type === 'error') revert();
			},
			onError() {
				revert();
			}
		}
	);

	/** Show the last saved role again after a failed change. */
	function revert() {
		$form.role = savedRole;
	}

	// Follow the saved role when the user list reloads (e.g. after another row action).
	// Tracks only `savedRole`: tracking the store too would undo a pick before it posts.
	$effect(() => {
		const role = savedRole;
		untrack(() => ($form.role = role));
	});
</script>

<form method="POST" action="?/setRole" use:enhance>
	<input type="hidden" name="userId" value={$form.userId} />
	<NativeSelect
		name="role"
		class="w-24"
		size="sm"
		value={$form.role}
		disabled={disabled || $submitting}
		onchange={(e) => {
			$form.role = e.currentTarget.value as UserRole;
			submit();
		}}
		aria-label="Change role for {user.email}"
	>
		{#each USER_ROLES as role (role)}
			<option value={role}>{role}</option>
		{/each}
	</NativeSelect>
</form>
