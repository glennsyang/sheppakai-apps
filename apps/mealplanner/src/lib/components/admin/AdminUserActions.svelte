<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import { actionMessage } from '@sheppakai/shared/action-message';
	import { toast } from 'svelte-sonner';

	import { Button } from '#lib/components/ui/button/index.js';

	import RoleSelectForm from './RoleSelectForm.svelte';
	import type { AdminUser } from './types';

	let {
		user,
		currentUserId,
		allowlisted
	}: { user: AdminUser; currentUserId: string; allowlisted: boolean } = $props();

	const isSelf = $derived(user.id === currentUserId);
	const banned = $derived(Boolean(user.banned));

	let confirmingRemove = $state(false);
	let busy = $state(false);

	type RowAction = 'sendWelcomeEmail' | 'banUser' | 'unbanUser' | 'removeUser';

	// Toast text when an action's answer carries no message of its own.
	const fallbacks = $derived<Record<RowAction, { success: string; error: string }>>({
		sendWelcomeEmail: {
			success: `Welcome email sent to ${user.email}.`,
			error: 'Failed to send welcome email'
		},
		banUser: { success: 'User banned.', error: 'Failed to ban user' },
		unbanUser: { success: 'User unbanned.', error: 'Failed to unban user' },
		removeUser: { success: 'User removed.', error: 'Failed to remove user' }
	});

	/**
	 * Row action submit: toasts the action's message. Takes a getter because `enhance` never
	 * re-reads its argument, and the ban form flips between ban and unban.
	 */
	const submit =
		(action: () => RowAction): SubmitFunction =>
		() => {
			busy = true;
			return async ({ result, update }) => {
				const resultMessage = actionMessage(result, fallbacks[action()]);
				toast[resultMessage.type](resultMessage.text);
				await update();
				busy = false;
				confirmingRemove = false;
			};
		};
</script>

{#if isSelf}
	<span class="ink-faint marker text-sm">you</span>
{:else}
	<div class="flex flex-wrap items-center gap-2">
		{#key user.id}
			<RoleSelectForm {user} disabled={busy} />
		{/key}

		{#if allowlisted && !user.emailVerified}
			<form
				method="POST"
				action="?/sendWelcomeEmail"
				use:enhance={submit(() => 'sendWelcomeEmail')}
			>
				<input type="hidden" name="userId" value={user.id} />
				<Button type="submit" variant="outline" size="sm" disabled={busy}>
					Send welcome email
				</Button>
			</form>
		{/if}

		<form
			method="POST"
			action={banned ? '?/unbanUser' : '?/banUser'}
			use:enhance={submit(() => (banned ? 'unbanUser' : 'banUser'))}
		>
			<input type="hidden" name="userId" value={user.id} />
			<Button type="submit" variant="outline" size="sm" disabled={busy}>
				{banned ? 'Unban' : 'Ban'}
			</Button>
		</form>

		{#if confirmingRemove}
			<form
				method="POST"
				action="?/removeUser"
				use:enhance={submit(() => 'removeUser')}
				class="flex items-center gap-1"
			>
				<input type="hidden" name="userId" value={user.id} />
				<Button type="submit" variant="destructive" size="sm" disabled={busy}>Confirm</Button>
				<Button
					type="button"
					variant="outline"
					size="sm"
					disabled={busy}
					onclick={() => (confirmingRemove = false)}
				>
					Cancel
				</Button>
			</form>
		{:else}
			<Button
				type="button"
				variant="tonal-destructive"
				size="sm"
				disabled={busy}
				onclick={() => (confirmingRemove = true)}
			>
				Remove
			</Button>
		{/if}
	</div>
{/if}
