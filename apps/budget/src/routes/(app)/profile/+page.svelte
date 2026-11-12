<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import { actionMessage } from '@sheppakai/shared/action-message';
	import { isPasskeySupported, passkeyErrorMessage } from '@sheppakai/shared/passkey-client';
	import { superForm } from 'sveltekit-superforms';

	import FormMessage from '#lib/components/FormMessage.svelte';
	import LoadErrorBanner from '#lib/components/LoadErrorBanner.svelte';
	import PageShell from '#lib/components/PageShell.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import { PASSKEY_NAME_MAX } from '#lib/formSchemas/index.js';
	import { authClient } from '#lib/passkey-client.js';

	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// Profile form
	// svelte-ignore state_referenced_locally
	const profileFormStore = superForm(data.profileForm, {
		onUpdate: ({ form }) => {
			if (form.message?.type === 'success') {
				isEditingProfile = false;
			}
		}
	});

	const {
		form: profileForm,
		errors: profileErrors,
		message: profileMessage,
		submitting: profileSubmitting,
		enhance: profileEnhance
	} = profileFormStore;

	// Password form
	// svelte-ignore state_referenced_locally
	const passwordFormStore = superForm(data.passwordForm, {
		resetForm: true,
		onUpdate: ({ form }) => {
			if (form.message?.type === 'success') {
				isEditingPassword = false;
			}
		}
	});

	const {
		form: passwordForm,
		errors: passwordErrors,
		message: passwordMessage,
		submitting: passwordSubmitting,
		enhance: passwordEnhance
	} = passwordFormStore;

	// Profile editing state
	let isEditingProfile = $state(false);
	let isEditingPassword = $state(false);

	// Derived values from data
	const userEmail = $derived(data.user?.email || '');
	const passwordUpdatedAt = $derived(data.passwordUpdatedAt || '');

	// Reset profile form
	function resetProfileForm() {
		$profileForm.name = data.user?.name || '';
		isEditingProfile = false;
	}

	// Reset password form
	function resetPasswordForm() {
		$passwordForm.currentPassword = '';
		$passwordForm.newPassword = '';
		$passwordForm.confirmPassword = '';
		isEditingPassword = false;
	}

	// ── Passkeys ────────────────────────────────────────────────────────────
	type Passkey = PageProps['data']['passkeys'][number];

	const addedFormat = new Intl.DateTimeFormat('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric'
	});

	// `null` until the browser check runs, so SSR doesn't flash the "not supported" note.
	let passkeySupported = $state<boolean | null>(null);
	let addingPasskey = $state(false);
	let passkeyStatus = $state<App.Superforms.Message | null>(null);
	let renamingId = $state<string | null>(null);
	let renameValue = $state('');
	let removeTarget = $state<Passkey | null>(null);
	let removing = $state(false);

	function passkeyLabel(passkey: Passkey) {
		return passkey.name ?? passkey.provider ?? 'Unnamed passkey';
	}

	// Browser-only: WebAuthn isn't available during SSR.
	$effect(() => {
		passkeySupported = isPasskeySupported();
	});

	async function addPasskey() {
		addingPasskey = true;
		passkeyStatus = null;
		try {
			const { error } = await authClient.passkey.addPasskey();
			if (error) {
				// A cancelled device prompt has no message: show nothing.
				const text = passkeyErrorMessage(error);
				if (text) passkeyStatus = { type: 'error', text };
				return;
			}
			passkeyStatus = { type: 'success', text: 'Passkey added.' };
			await invalidateAll();
		} catch (err) {
			const text = passkeyErrorMessage(err);
			if (text) passkeyStatus = { type: 'error', text };
		} finally {
			addingPasskey = false;
		}
	}

	function startRename(passkey: Passkey) {
		renamingId = passkey.id;
		renameValue = passkey.name ?? passkey.provider ?? '';
		passkeyStatus = null;
	}
</script>

<svelte:head>
	<title>Profile</title>
</svelte:head>

{#snippet fieldError(message: string[] | undefined)}
	{#if message}
		<p class="text-destructive text-xs">{message}</p>
	{/if}
{/snippet}

<PageShell title="Profile" subtitle="Your account details, password and passkeys">
	{#if data.loadError}
		<LoadErrorBanner message={data.loadError} />
	{/if}

	<section
		class="bg-card grid gap-x-8 gap-y-4 rounded-xl border p-4 shadow-sm sm:p-6 lg:grid-cols-[16rem_minmax(0,1fr)]"
	>
		<div>
			<h2 class="text-base font-semibold tracking-tight">Account</h2>
			<p class="text-muted-foreground mt-1 text-sm">The name shown around the app.</p>
		</div>

		<form
			method="POST"
			action="?/updateName"
			use:profileEnhance
			class="flex max-w-lg flex-col gap-4"
		>
			{#if $profileMessage}
				<FormMessage type={$profileMessage.type} text={$profileMessage.text} />
			{/if}
			<div class="flex flex-col gap-2">
				<label for="name" class="text-sm font-medium">Name</label>
				<Input
					id="name"
					name="name"
					type="text"
					autocomplete="given-name"
					bind:value={$profileForm.name}
					disabled={!isEditingProfile}
					placeholder="Your first name"
					aria-invalid={$profileErrors.name ? 'true' : undefined}
				/>
				{@render fieldError($profileErrors.name)}
			</div>

			<div class="flex flex-col gap-2">
				<label for="email" class="text-sm font-medium">Email</label>
				<Input id="email" type="email" value={userEmail} disabled />
				<p class="text-muted-foreground text-xs">Your sign-in email can't be changed here.</p>
			</div>

			<div class="flex gap-2 pt-1">
				{#if isEditingProfile}
					<Button type="submit" disabled={$profileSubmitting} aria-busy={$profileSubmitting}>
						{#if $profileSubmitting}<Spinner aria-hidden="true" />{/if}
						Save name
					</Button>
					<Button
						type="button"
						variant="ghost"
						onclick={resetProfileForm}
						disabled={$profileSubmitting}
					>
						Cancel
					</Button>
				{:else}
					<Button type="button" variant="outline" onclick={() => (isEditingProfile = true)}>
						Edit name
					</Button>
				{/if}
			</div>
		</form>
	</section>

	<section
		class="bg-card grid gap-x-8 gap-y-4 rounded-xl border p-4 shadow-sm sm:p-6 lg:grid-cols-[16rem_minmax(0,1fr)]"
	>
		<div>
			<h2 class="text-base font-semibold tracking-tight">Password</h2>
			<p class="text-muted-foreground mt-1 text-sm">
				{#if passwordUpdatedAt}
					Last changed {new Date(passwordUpdatedAt).toLocaleDateString('en-US', {
						month: 'short',
						day: 'numeric',
						year: 'numeric'
					})}.
				{:else}
					At least 12 characters.
				{/if}
			</p>
		</div>

		{#if isEditingPassword}
			<form
				method="POST"
				action="?/changePassword"
				use:passwordEnhance
				class="flex max-w-lg flex-col gap-4"
			>
				{#if $passwordMessage}
					<FormMessage type={$passwordMessage.type} text={$passwordMessage.text} />
				{/if}
				<div class="flex flex-col gap-2">
					<label for="currentPassword" class="text-sm font-medium">Current password</label>
					<Input
						id="currentPassword"
						name="currentPassword"
						type="password"
						autocomplete="current-password"
						bind:value={$passwordForm.currentPassword}
						aria-invalid={$passwordErrors.currentPassword ? 'true' : undefined}
						required
					/>
					{@render fieldError($passwordErrors.currentPassword)}
				</div>
				<div class="flex flex-col gap-2">
					<label for="newPassword" class="text-sm font-medium">New password</label>
					<Input
						id="newPassword"
						name="newPassword"
						type="password"
						autocomplete="new-password"
						bind:value={$passwordForm.newPassword}
						aria-invalid={$passwordErrors.newPassword ? 'true' : undefined}
						required
					/>
					{@render fieldError($passwordErrors.newPassword)}
				</div>
				<div class="flex flex-col gap-2">
					<label for="confirmPassword" class="text-sm font-medium">Confirm new password</label>
					<Input
						id="confirmPassword"
						name="confirmPassword"
						type="password"
						autocomplete="new-password"
						bind:value={$passwordForm.confirmPassword}
						aria-invalid={$passwordErrors.confirmPassword ? 'true' : undefined}
						required
					/>
					{@render fieldError($passwordErrors.confirmPassword)}
				</div>
				<div class="flex gap-2 pt-1">
					<Button type="submit" disabled={$passwordSubmitting} aria-busy={$passwordSubmitting}>
						{#if $passwordSubmitting}<Spinner aria-hidden="true" />{/if}
						Change password
					</Button>
					<Button
						type="button"
						variant="ghost"
						onclick={resetPasswordForm}
						disabled={$passwordSubmitting}
					>
						Cancel
					</Button>
				</div>
			</form>
		{:else}
			<div class="flex flex-col items-start gap-3">
				{#if $passwordMessage}
					<FormMessage type={$passwordMessage.type} text={$passwordMessage.text} />
				{/if}
				<Button type="button" variant="outline" onclick={() => (isEditingPassword = true)}>
					Change password
				</Button>
			</div>
		{/if}
	</section>

	<section
		class="bg-card grid gap-x-8 gap-y-4 rounded-xl border p-4 shadow-sm sm:p-6 lg:grid-cols-[16rem_minmax(0,1fr)]"
		aria-labelledby="passkeys-heading"
	>
		<div>
			<h2 id="passkeys-heading" class="text-base font-semibold tracking-tight">Passkeys</h2>
			<p class="text-muted-foreground mt-1 text-sm">
				Sign in with Face ID, Touch ID or your device PIN instead of a password.
			</p>
		</div>

		<div class="flex max-w-lg flex-col items-start gap-3">
			{#if data.passkeysLoadError}
				<FormMessage type="error" text={data.passkeysLoadError} />
			{/if}
			{#if passkeyStatus}
				<FormMessage type={passkeyStatus.type} text={passkeyStatus.text} />
			{/if}

			{#if data.passkeys.length === 0}
				{#if !data.passkeysLoadError}
					<p class="text-muted-foreground text-sm">No passkeys yet.</p>
				{/if}
			{:else}
				<ul class="w-full divide-y rounded-lg border">
					{#each data.passkeys as passkey (passkey.id)}
						<li class="px-3 py-3">
							{#if renamingId === passkey.id}
								<form
									method="POST"
									action="?/renamePasskey"
									class="flex flex-wrap items-end gap-2"
									use:enhance={() =>
										async ({ result, update }) => {
											passkeyStatus = actionMessage(result, {
												success: 'Passkey renamed.',
												error: 'Could not rename that passkey. Please try again.'
											});
											if (passkeyStatus.type === 'success') renamingId = null;
											await update({ reset: false });
										}}
								>
									<input type="hidden" name="id" value={passkey.id} />
									<div class="flex min-w-48 flex-1 flex-col gap-2">
										<label for="passkey-name-{passkey.id}" class="text-sm font-medium">
											Passkey name
										</label>
										<Input
											id="passkey-name-{passkey.id}"
											type="text"
											name="name"
											bind:value={renameValue}
											required
											maxlength={PASSKEY_NAME_MAX}
											autocomplete="off"
										/>
									</div>
									<Button type="submit" size="sm">Save</Button>
									<Button
										type="button"
										variant="ghost"
										size="sm"
										onclick={() => (renamingId = null)}
									>
										Cancel
									</Button>
								</form>
							{:else}
								<div class="flex flex-wrap items-center justify-between gap-3">
									<div>
										<p class="text-sm font-medium">{passkeyLabel(passkey)}</p>
										{#if passkey.createdAt}
											<p class="text-muted-foreground text-xs">
												Added {addedFormat.format(passkey.createdAt)}
											</p>
										{/if}
									</div>
									<div class="flex gap-2">
										<Button
											type="button"
											variant="outline"
											size="sm"
											aria-label="Rename {passkeyLabel(passkey)}"
											onclick={() => startRename(passkey)}
										>
											Rename
										</Button>
										<Button
											type="button"
											variant="outline"
											size="sm"
											class="text-destructive"
											aria-label="Remove {passkeyLabel(passkey)}"
											onclick={() => {
												removeTarget = passkey;
												passkeyStatus = null;
											}}
										>
											Remove
										</Button>
									</div>
								</div>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}

			{#if passkeySupported}
				<Button
					type="button"
					variant="outline"
					disabled={addingPasskey}
					aria-busy={addingPasskey}
					onclick={addPasskey}
				>
					{#if addingPasskey}
						<Spinner aria-hidden="true" />
						Waiting for your device…
					{:else}
						<PlusIcon aria-hidden="true" />
						Add a passkey
					{/if}
				</Button>
			{:else if passkeySupported === false}
				<p class="text-muted-foreground text-xs">This browser doesn't support passkeys.</p>
			{/if}
		</div>
	</section>
</PageShell>

<Dialog.Root
	open={removeTarget !== null}
	onOpenChange={(open) => {
		if (!open) removeTarget = null;
	}}
>
	<Dialog.Content class="sm:max-w-106.25">
		{#if removeTarget}
			<Dialog.Header>
				<Dialog.Title>Remove {passkeyLabel(removeTarget)}?</Dialog.Title>
				<Dialog.Description>
					It will stop signing you in. You can still sign in with your password and add it again
					later.
				</Dialog.Description>
			</Dialog.Header>
			<form
				method="POST"
				action="?/removePasskey"
				use:enhance={() => {
					removing = true;
					return async ({ result, update }) => {
						removing = false;
						passkeyStatus = actionMessage(result, {
							success: 'Passkey removed.',
							error: 'Could not remove that passkey. Please try again.'
						});
						removeTarget = null;
						await update();
					};
				}}
			>
				<input type="hidden" name="id" value={removeTarget.id} />
				<Dialog.Footer>
					<Button type="button" variant="outline" onclick={() => (removeTarget = null)}>
						Cancel
					</Button>
					<Button type="submit" variant="destructive" disabled={removing} aria-busy={removing}>
						{#if removing}<Spinner aria-hidden="true" />{/if}
						{removing ? 'Removing…' : 'Remove passkey'}
					</Button>
				</Dialog.Footer>
			</form>
		{/if}
	</Dialog.Content>
</Dialog.Root>
