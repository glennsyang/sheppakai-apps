<script lang="ts">
	import { enhance } from '$app/forms';
	import BanIcon from '@lucide/svelte/icons/ban';
	import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
	import MailIcon from '@lucide/svelte/icons/mail';
	import ShieldIcon from '@lucide/svelte/icons/shield';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import UserCheckIcon from '@lucide/svelte/icons/user-check';
	import { actionMessage } from '@sheppakai/shared/action-message';
	import { banUserSchema } from '@sheppakai/shared/admin-user-schemas';
	import { toast } from 'svelte-sonner';
	import { defaults, superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';

	import { Button } from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import * as Tooltip from '#lib/components/ui/tooltip/index.js';

	import type { AdminUser } from './types';

	let { user, currentUserId }: { user: AdminUser; currentUserId: string } = $props();

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
					? `Give ${user.email} admin access? They'll be able to manage users, API keys and archived group members.`
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
			description: `Permanently delete ${user.email} and all of their data (journal, tasks, group members, fitness, everything)? This cannot be undone.`,
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

	// The ban form has a typed field, so it runs through superForm; the rest are button-only forms.
	const banValidators = zod4Client(banUserSchema);
	const banInitialData = () => ({ userId: user.id, banReason: '' });

	// svelte-ignore state_referenced_locally — superForm is intentionally initialized once from props
	const {
		form: banForm,
		errors: banErrors,
		enhance: banEnhance,
		submitting: banSubmitting,
		reset: resetBanForm
	} = superForm(defaults(banInitialData(), banValidators), {
		id: `banUser-${user.id}`,
		validators: banValidators,
		onUpdate: ({ form }) => {
			// Read form.message, not $message: the store is only repopulated after onUpdate.
			if (form.message) toast[form.message.type](form.message.text);
			// Like the other row actions, close once the server has answered a valid form, success
			// or not; stay open only to show field errors (e.g. a reason over 500 characters).
			if (form.valid) openDialog = false;
		},
		onError: ({ result }) => {
			toast.error(`${dialogs.banUser.error}: ${result.error.message}`);
			openDialog = false;
		}
	});

	function open(action: RowAction) {
		// Each opening starts empty, dropping a cancelled reason and its error.
		if (action === 'banUser') resetBanForm({ data: banInitialData(), newState: banInitialData() });
		activeAction = action;
		openDialog = true;
	}
</script>

{#snippet dialogButtons(confirm: string, submitting: boolean)}
	<div class="flex justify-end gap-2 pt-4">
		<Button type="button" variant="outline" onclick={() => (openDialog = false)}>Cancel</Button>
		<Button type="submit" variant={isDestructive ? 'destructive' : 'default'} disabled={submitting}>
			{submitting ? 'Working...' : confirm}
		</Button>
	</div>
{/snippet}

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
				{#if activeAction === 'banUser'}
					<form method="POST" action="?/banUser" use:banEnhance>
						<input type="hidden" name="userId" value={$banForm.userId} />
						<div class="space-y-2">
							<Label for="ban-reason-{user.id}">Reason (optional)</Label>
							<Textarea
								id="ban-reason-{user.id}"
								name="banReason"
								rows={3}
								bind:value={$banForm.banReason}
								aria-invalid={$banErrors.banReason ? 'true' : undefined}
								aria-describedby={$banErrors.banReason ? `ban-reason-error-${user.id}` : undefined}
							/>
							{#if $banErrors.banReason}
								<p id="ban-reason-error-{user.id}" class="text-destructive text-sm">
									{$banErrors.banReason[0]}
								</p>
							{/if}
						</div>
						{@render dialogButtons(dialog.confirm, $banSubmitting)}
					</form>
				{:else}
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
						{@render dialogButtons(dialog.confirm, isSubmitting)}
					</form>
				{/if}
			{/if}
		</Dialog.Content>
	</Dialog.Root>
{/if}
