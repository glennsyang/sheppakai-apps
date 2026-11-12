<script lang="ts">
	import { goto } from '$app/navigation';
	import { isPasskeySupported, passkeyErrorMessage } from '@sheppakai/shared/passkey-client';
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';

	import { FORGOT_PASSWORD_ROUTE, POST_LOGIN_ROUTE } from '#lib/auth-routes.js';
	import AuthFormMessage from '#lib/components/AuthFormMessage.svelte';
	import AuthShell from '#lib/components/AuthShell.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import { Alert } from '#lib/components/ui/alert/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import { authClient } from '#lib/passkey-client.js';
	import { signInSchema } from '#lib/schemas/auth.js';

	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// svelte-ignore state_referenced_locally — superForm is intentionally initialized once from props
	const { form, errors, constraints, enhance, message, submitting } = superForm(data.form, {
		validators: zod4Client(signInSchema)
	});

	let passkeySupported = $state(false);
	let passkeyPending = $state(false);
	let passkeyError = $state<string | null>(null);

	/**
	 * `autoFill` is the conditional request behind the email field's autofill list. It stays
	 * silent on failure: it is cancelled whenever the button starts a new request or the
	 * page navigates, and the user never asked for it.
	 */
	async function signInWithPasskey(autoFill: boolean) {
		if (!autoFill) {
			passkeyPending = true;
			passkeyError = null;
		}
		try {
			const { error } = await authClient.signIn.passkey({ autoFill });
			if (error) {
				if (!autoFill) passkeyError = passkeyErrorMessage(error);
				return;
			}
			await goto(POST_LOGIN_ROUTE, { invalidateAll: true });
		} catch (err) {
			if (!autoFill) passkeyError = passkeyErrorMessage(err);
		} finally {
			if (!autoFill) passkeyPending = false;
		}
	}

	// Browser-only WebAuthn setup, once: show the button and start autofill sign-in.
	$effect(() => {
		const supported = isPasskeySupported();
		passkeySupported = supported;
		if (!supported) return;
		void PublicKeyCredential.isConditionalMediationAvailable?.().then((available) => {
			if (available) void signInWithPasskey(true);
		});
	});
</script>

<svelte:head>
	<title>Sign In — Meal Planner</title>
</svelte:head>

<AuthShell>
	<div>
		<h1 class="text-[2rem] leading-tight font-bold tracking-tight">Who's cooking?</h1>
		<p class="ink-soft mt-1.5 text-lg">Sign in to see what's on the week.</p>
	</div>

	{#if data.resetComplete}
		<Alert variant="success" role="status">Your password has been reset. Please sign in.</Alert>
	{/if}

	{#if data.invalidVerificationLink}
		<Alert variant="destructive" role="alert">
			That verification link is invalid or has expired. Please sign in or request a new one.
		</Alert>
	{/if}

	<AuthFormMessage message={$message} />

	<form method="POST" use:enhance class="space-y-5">
		<Label>
			<span class="font-semibold">Email</span>
			<Input
				type="email"
				name="email"
				bind:value={$form.email}
				class="mt-1 text-lg"
				aria-invalid={$errors.email ? 'true' : undefined}
				required={$constraints.email?.required}
				placeholder="you@example.com"
				autocomplete="username webauthn"
			/>
			{#if $errors.email}
				<span class="ink-red mt-1 block text-sm">{$errors.email}</span>
			{/if}
		</Label>

		<Label>
			<span class="flex items-baseline justify-between">
				<span class="font-semibold">Password</span>
				<a href={FORGOT_PASSWORD_ROUTE} class="act-text ink-blue text-sm">Forgot it?</a>
			</span>
			<Input
				type="password"
				name="password"
				bind:value={$form.password}
				class="mt-1 text-lg"
				aria-invalid={$errors.password ? 'true' : undefined}
				required={$constraints.password?.required}
				placeholder="••••••••••••"
				autocomplete="current-password"
			/>
			{#if $errors.password}
				<span class="ink-red mt-1 block text-sm">{$errors.password}</span>
			{/if}
		</Label>

		<Button
			type="submit"
			disabled={$submitting}
			aria-busy={$submitting}
			class="mt-2 w-full py-3 text-lg"
		>
			{#if $submitting}
				<Spinner aria-hidden="true" />
				Signing in…
			{:else}
				Sign in
			{/if}
		</Button>
	</form>

	{#if passkeySupported}
		<div class="space-y-4">
			<div class="ink-soft flex items-center gap-3 text-sm" aria-hidden="true">
				<span class="passkey-rule h-px flex-1"></span>
				or
				<span class="passkey-rule h-px flex-1"></span>
			</div>

			{#if passkeyError}
				<Alert variant="destructive" role="alert">{passkeyError}</Alert>
			{/if}

			<Button
				type="button"
				variant="outline"
				disabled={passkeyPending}
				aria-busy={passkeyPending}
				class="w-full py-3 text-lg"
				onclick={() => signInWithPasskey(false)}
			>
				{#if passkeyPending}
					<Spinner aria-hidden="true" />
					Waiting for your device…
				{:else}
					<Icon name="shield" />
					Sign in with a passkey
				{/if}
			</Button>
		</div>
	{/if}
</AuthShell>

<style>
	.passkey-rule {
		background: var(--rule-strong);
	}
</style>
