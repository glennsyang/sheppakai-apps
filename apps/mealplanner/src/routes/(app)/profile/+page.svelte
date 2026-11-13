<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { isPasskeySupported, passkeyErrorMessage } from '@sheppakai/shared/passkey-client';
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';

	import { actionFailureText } from '#lib/action-result.js';
	import Icon from '#lib/components/Icon.svelte';
	import Modal from '#lib/components/Modal.svelte';
	import { Alert } from '#lib/components/ui/alert/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import { authClient } from '#lib/passkey-client.js';
	import { changePasswordSchema, updateNameSchema } from '#lib/schemas/auth.js';
	import { PASSKEY_NAME_MAX } from '#lib/schemas/passkeys.js';

	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// ── Passkeys ────────────────────────────────────────────────────────────
	type Passkey = PageData['passkeys'][number];

	const addedFormat = new Intl.DateTimeFormat(undefined, {
		day: 'numeric',
		month: 'short',
		year: 'numeric'
	});

	// `null` until the browser check runs, so the server render doesn't flash the
	// "doesn't support passkeys" note before hydration.
	let passkeySupported = $state<boolean | null>(null);
	let addingPasskey = $state(false);
	let passkeyStatus = $state<{ type: 'success' | 'error'; text: string } | null>(null);
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

	let isEditingName = $state(false);
	let isEditingPassword = $state(false);

	// svelte-ignore state_referenced_locally — superForm is intentionally initialized once from props
	const nameFormStore = superForm(data.nameForm, {
		validators: zod4Client(updateNameSchema),
		onUpdate: ({ form }) => {
			if (form.message?.type === 'success') isEditingName = false;
		}
	});
	const {
		form: nameForm,
		errors: nameErrors,
		constraints: nameConstraints,
		message: nameMessage,
		submitting: nameSubmitting,
		enhance: nameEnhance
	} = nameFormStore;

	// svelte-ignore state_referenced_locally — superForm is intentionally initialized once from props
	const passwordFormStore = superForm(data.passwordForm, {
		validators: zod4Client(changePasswordSchema),
		resetForm: true,
		onUpdate: ({ form }) => {
			if (form.message?.type === 'success') isEditingPassword = false;
		}
	});
	const {
		form: passwordForm,
		errors: passwordErrors,
		message: passwordMessage,
		submitting: passwordSubmitting,
		enhance: passwordEnhance
	} = passwordFormStore;

	function cancelNameEdit() {
		$nameForm.name = data.user.name;
		isEditingName = false;
	}

	function cancelPasswordEdit() {
		$passwordForm.currentPassword = '';
		$passwordForm.newPassword = '';
		$passwordForm.confirmPassword = '';
		isEditingPassword = false;
	}
</script>

<svelte:head>
	<title>Profile — Meal Planner</title>
</svelte:head>

<div class="max-w-3xl px-5 pt-8 pb-12 sm:px-10 sm:pt-12">
	<div class="mb-8">
		<h1 class="text-[2rem] leading-tight font-bold tracking-tight sm:text-[2.5rem]">Profile</h1>
		<p class="ink-soft mt-2 text-lg">Your name, email, password and passkeys.</p>
	</div>

	<!-- Profile Information -->
	<section class="profile-section space-y-5 py-8">
		<div class="flex items-center justify-between">
			<h2 class="text-xl font-bold tracking-tight">Profile information</h2>
			{#if !isEditingName}
				<Button type="button" variant="outline" onclick={() => (isEditingName = true)}>Edit</Button>
			{/if}
		</div>

		{#if $nameMessage}
			<Alert
				variant={$nameMessage.type === 'success' ? 'success' : 'destructive'}
				role={$nameMessage.type === 'success' ? 'status' : 'alert'}
			>
				{$nameMessage.text}
			</Alert>
		{/if}

		<form method="POST" action="?/updateName" use:nameEnhance class="space-y-4">
			<Label>
				<span class="font-semibold">Name</span>
				<Input
					type="text"
					name="name"
					bind:value={$nameForm.name}
					class="mt-1"
					aria-invalid={$nameErrors.name ? 'true' : undefined}
					disabled={!isEditingName}
					minlength={$nameConstraints.name?.minlength}
					maxlength={$nameConstraints.name?.maxlength}
					required={$nameConstraints.name?.required}
					autocomplete="name"
				/>
				{#if $nameErrors.name}
					<span class="ink-red mt-1 block text-sm">{$nameErrors.name}</span>
				{/if}
			</Label>

			<Label>
				<span class="font-semibold">Email</span>
				<Input type="email" value={data.user.email} class="mt-1" disabled aria-readonly="true" />
				<span class="ink-soft mt-1 block text-sm">Email address cannot be changed.</span>
			</Label>

			{#if isEditingName}
				<div class="flex gap-2 pt-2">
					<Button type="submit" disabled={$nameSubmitting}>
						{$nameSubmitting ? 'Saving…' : 'Save changes'}
					</Button>
					<Button
						type="button"
						variant="outline"
						disabled={$nameSubmitting}
						onclick={cancelNameEdit}
					>
						Cancel
					</Button>
				</div>
			{/if}
		</form>
	</section>

	<!-- Change Password -->
	<section class="profile-section space-y-5 py-8">
		<div class="flex items-center justify-between">
			<h2 class="text-xl font-bold tracking-tight">Change password</h2>
			{#if !isEditingPassword}
				<Button type="button" variant="outline" onclick={() => (isEditingPassword = true)}>
					Change password
				</Button>
			{/if}
		</div>

		{#if $passwordMessage}
			<Alert
				variant={$passwordMessage.type === 'success' ? 'success' : 'destructive'}
				role={$passwordMessage.type === 'success' ? 'status' : 'alert'}
			>
				{$passwordMessage.text}
			</Alert>
		{/if}

		{#if isEditingPassword}
			<form method="POST" action="?/changePassword" use:passwordEnhance class="space-y-4">
				<Label>
					<span class="font-semibold">Current password</span>
					<Input
						type="password"
						name="currentPassword"
						bind:value={$passwordForm.currentPassword}
						class="mt-1"
						aria-invalid={$passwordErrors.currentPassword ? 'true' : undefined}
						required
						autocomplete="current-password"
					/>
					{#if $passwordErrors.currentPassword}
						<span class="ink-red mt-1 block text-sm">{$passwordErrors.currentPassword}</span>
					{/if}
				</Label>

				<Label>
					<span class="font-semibold">New password</span>
					<Input
						type="password"
						name="newPassword"
						bind:value={$passwordForm.newPassword}
						class="mt-1"
						aria-invalid={$passwordErrors.newPassword ? 'true' : undefined}
						placeholder="12+ characters"
						required
						autocomplete="new-password"
					/>
					{#if $passwordErrors.newPassword}
						<span class="ink-red mt-1 block text-sm">{$passwordErrors.newPassword}</span>
					{/if}
				</Label>

				<Label>
					<span class="font-semibold">Confirm new password</span>
					<Input
						type="password"
						name="confirmPassword"
						bind:value={$passwordForm.confirmPassword}
						class="mt-1"
						aria-invalid={$passwordErrors.confirmPassword ? 'true' : undefined}
						required
						autocomplete="new-password"
					/>
					{#if $passwordErrors.confirmPassword}
						<span class="ink-red mt-1 block text-sm">{$passwordErrors.confirmPassword}</span>
					{/if}
				</Label>

				<div class="flex gap-2 pt-2">
					<Button type="submit" disabled={$passwordSubmitting}>
						{$passwordSubmitting ? 'Changing…' : 'Change password'}
					</Button>
					<Button
						type="button"
						variant="outline"
						disabled={$passwordSubmitting}
						onclick={cancelPasswordEdit}
					>
						Cancel
					</Button>
				</div>
			</form>
		{/if}
	</section>

	<!-- Passkeys -->
	<section class="profile-section space-y-5 py-8" aria-labelledby="passkeys-heading">
		<div>
			<h2 id="passkeys-heading" class="text-xl font-bold tracking-tight">Passkeys</h2>
			<p class="ink-soft mt-1">
				Sign in with Face ID, Touch ID or your device PIN instead of a password.
			</p>
		</div>

		{#if data.passkeysLoadError}
			<Alert variant="destructive" role="alert">{data.passkeysLoadError}</Alert>
		{/if}

		{#if passkeyStatus}
			<Alert
				variant={passkeyStatus.type === 'success' ? 'success' : 'destructive'}
				role={passkeyStatus.type === 'success' ? 'status' : 'alert'}
			>
				{passkeyStatus.text}
			</Alert>
		{/if}

		{#if data.passkeys.length === 0 && !data.passkeysLoadError}
			<p class="ink-soft">No passkeys yet.</p>
		{:else}
			<ul class="passkey-list">
				{#each data.passkeys as passkey (passkey.id)}
					<li class="passkey-row py-4">
						{#if renamingId === passkey.id}
							<form
								method="POST"
								action="?/renamePasskey"
								class="flex flex-wrap items-end gap-2"
								use:enhance={() =>
									async ({ result, update }) => {
										if (result.type === 'success') {
											renamingId = null;
											passkeyStatus = { type: 'success', text: 'Passkey renamed.' };
										} else {
											passkeyStatus = {
												type: 'error',
												text: actionFailureText(
													result,
													'Could not rename that passkey. Please try again.'
												)
											};
										}
										await update({ reset: false });
									}}
							>
								<input type="hidden" name="id" value={passkey.id} />
								<Label class="min-w-48 flex-1">
									<span class="font-semibold">Passkey name</span>
									<Input
										type="text"
										name="name"
										bind:value={renameValue}
										class="mt-1"
										required
										maxlength={PASSKEY_NAME_MAX}
										autocomplete="off"
									/>
								</Label>
								<Button type="submit">Save</Button>
								<Button type="button" variant="outline" onclick={() => (renamingId = null)}>
									Cancel
								</Button>
							</form>
						{:else}
							<div class="flex flex-wrap items-center justify-between gap-3">
								<div>
									<p class="font-semibold">{passkeyLabel(passkey)}</p>
									{#if passkey.createdAt}
										<p class="ink-soft text-sm">added {addedFormat.format(passkey.createdAt)}</p>
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
										variant="tonal-destructive"
										size="sm"
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
			<Button type="button" disabled={addingPasskey} aria-busy={addingPasskey} onclick={addPasskey}>
				{#if addingPasskey}
					<Spinner aria-hidden="true" />
					Waiting for your device…
				{:else}
					<Icon name="plus" />
					Add a passkey
				{/if}
			</Button>
		{:else if passkeySupported === false}
			<p class="ink-soft text-sm">This browser doesn't support passkeys.</p>
		{/if}
	</section>
</div>

<Modal
	open={removeTarget !== null}
	onClose={() => (removeTarget = null)}
	ariaLabel="Remove passkey"
>
	{#if removeTarget}
		<div class="space-y-4">
			<h2 class="text-xl font-bold tracking-tight">Remove {passkeyLabel(removeTarget)}?</h2>
			<p class="ink-soft">
				It will stop signing you in. You can still sign in with your password and add it again
				later.
			</p>
			<form
				method="POST"
				action="?/removePasskey"
				class="flex gap-2"
				use:enhance={() => {
					removing = true;
					return async ({ result, update }) => {
						removing = false;
						passkeyStatus =
							result.type === 'success'
								? { type: 'success', text: 'Passkey removed.' }
								: {
										type: 'error',
										text: actionFailureText(
											result,
											'Could not remove that passkey. Please try again.'
										)
									};
						removeTarget = null;
						await update();
					};
				}}
			>
				<input type="hidden" name="id" value={removeTarget.id} />
				<Button type="submit" variant="destructive" disabled={removing} aria-busy={removing}>
					{removing ? 'Removing…' : 'Remove passkey'}
				</Button>
				<Button type="button" variant="outline" onclick={() => (removeTarget = null)}>
					Cancel
				</Button>
			</form>
		</div>
	{/if}
</Modal>

<style>
	.profile-section {
		border-top: 1px solid var(--rule-strong);
	}
	.passkey-row + .passkey-row {
		border-top: 1px solid var(--rule);
	}
</style>
