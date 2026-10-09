<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import type { User } from '$lib/types';
	import { actionMessage } from '$lib/utils/actionMessage';
	import BanIcon from '@lucide/svelte/icons/ban';
	import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
	import MailIcon from '@lucide/svelte/icons/mail';
	import ShieldIcon from '@lucide/svelte/icons/shield';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import UserCheckIcon from '@lucide/svelte/icons/user-check';
	import { toast } from 'svelte-sonner';

	let { user, currentUserId }: { user: User; currentUserId: string } = $props();

	type RowAction = 'sendWelcomeEmail' | 'setRole' | 'banUser' | 'unbanUser' | 'removeUser';

	const isSelf = $derived(user.id === currentUserId);
	const nextRole = $derived(user.role === 'admin' ? 'user' : 'admin');

	const dialogs = $derived<
		Record<
			RowAction,
			{ title: string; description: string; confirm: string; success: string; error: string }
		>
	>({
		sendWelcomeEmail: {
			title: 'Send Welcome Email',
			description: `Send ${user.email} the welcome email with instructions for setting their password and signing in?`,
			confirm: 'Send',
			success: `Welcome email sent to ${user.email}.`,
			error: 'Failed to send welcome email'
		},
		setRole: {
			title: nextRole === 'admin' ? 'Make Admin' : 'Remove Admin',
			description:
				nextRole === 'admin'
					? `Give ${user.email} admin access? They'll be able to manage users, API keys and archived contacts.`
					: `Remove admin access from ${user.email}? They'll become a regular user.`,
			confirm: nextRole === 'admin' ? 'Make admin' : 'Make user',
			success: `Role changed to ${nextRole}.`,
			error: 'Failed to change role'
		},
		banUser: {
			title: 'Ban User',
			description: `Ban ${user.email}? They'll be signed out everywhere and can't sign in until unbanned.`,
			confirm: 'Ban',
			success: 'User banned.',
			error: 'Failed to ban user'
		},
		unbanUser: {
			title: 'Unban User',
			description: `Unban ${user.email}? They'll be able to sign in again.`,
			confirm: 'Unban',
			success: 'User unbanned.',
			error: 'Failed to unban user'
		},
		removeUser: {
			title: 'Remove User',
			description: `Permanently delete ${user.email} and all of their data (journal, tasks, contacts, fitness, everything)? This cannot be undone.`,
			confirm: 'Remove',
			success: 'User removed.',
			error: 'Failed to remove user'
		}
	});

	let activeAction = $state<RowAction | null>(null);
	let openDialog = $state<boolean>(false);
	let isSubmitting = $state<boolean>(false);

	const dialog = $derived(activeAction ? dialogs[activeAction] : null);
	const isDestructive = $derived(activeAction === 'banUser' || activeAction === 'removeUser');

	function open(action: RowAction) {
		activeAction = action;
		openDialog = true;
	}
</script>

{#if isSelf}
	<span class="text-muted-foreground px-3 text-sm">you</span>
{:else}
	<DropdownMenu.Root>
		<Tooltip.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props: menuProps })}
					<Tooltip.Trigger {...menuProps}>
						{#snippet child({ props })}
							<Button {...props} variant="ghost" size="icon" aria-label="Actions for {user.email}">
								<EllipsisIcon class="size-4" />
							</Button>
						{/snippet}
					</Tooltip.Trigger>
				{/snippet}
			</DropdownMenu.Trigger>
			<Tooltip.Content>User actions</Tooltip.Content>
		</Tooltip.Root>
		<DropdownMenu.Content align="end" class="w-48">
			<DropdownMenu.Item onclick={() => open('sendWelcomeEmail')}>
				<MailIcon class="size-4" />
				Send welcome email
			</DropdownMenu.Item>
			<DropdownMenu.Item onclick={() => open('setRole')}>
				<ShieldIcon class="size-4" />
				{nextRole === 'admin' ? 'Make admin' : 'Make user'}
			</DropdownMenu.Item>
			<DropdownMenu.Separator />
			{#if user.banned}
				<DropdownMenu.Item onclick={() => open('unbanUser')}>
					<UserCheckIcon class="size-4" />
					Unban
				</DropdownMenu.Item>
			{:else}
				<DropdownMenu.Item onclick={() => open('banUser')}>
					<BanIcon class="size-4" />
					Ban
				</DropdownMenu.Item>
			{/if}
			<DropdownMenu.Item variant="destructive" onclick={() => open('removeUser')}>
				<Trash2Icon class="size-4" />
				Remove
			</DropdownMenu.Item>
		</DropdownMenu.Content>
	</DropdownMenu.Root>

	<Dialog.Root bind:open={openDialog}>
		<Dialog.Content>
			{#if activeAction && dialog}
				<Dialog.Header>
					<Dialog.Title>{dialog.title}</Dialog.Title>
					<Dialog.Description>{dialog.description}</Dialog.Description>
				</Dialog.Header>
				<form
					method="POST"
					action="?/{activeAction}"
					use:enhance={() => {
						isSubmitting = true;
						const { success, error } = dialog;

						return async ({ result, update }) => {
							const resultMessage = actionMessage(result, { success, error });
							if (resultMessage.type === 'success') {
								toast.success(resultMessage.text);
							} else {
								toast.error(resultMessage.text);
							}
							await update();
							isSubmitting = false;
							openDialog = false;
						};
					}}
				>
					<input type="hidden" name="userId" value={user.id} />
					{#if activeAction === 'setRole'}
						<input type="hidden" name="role" value={nextRole} />
					{/if}

					{#if activeAction === 'banUser'}
						<div class="space-y-2">
							<Label for="ban-reason-{user.id}">Reason (optional)</Label>
							<Textarea id="ban-reason-{user.id}" name="banReason" maxlength={500} rows={3} />
						</div>
					{/if}

					<div class="flex justify-end gap-2 pt-4">
						<Button type="button" variant="outline" onclick={() => (openDialog = false)}>
							Cancel
						</Button>
						<Button
							type="submit"
							variant={isDestructive ? 'destructive' : 'default'}
							disabled={isSubmitting}
						>
							{isSubmitting ? 'Working...' : dialog.confirm}
						</Button>
					</div>
				</form>
			{/if}
		</Dialog.Content>
	</Dialog.Root>
{/if}
