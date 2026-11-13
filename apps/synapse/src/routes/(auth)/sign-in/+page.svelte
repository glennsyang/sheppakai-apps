<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { Shield } from '@lucide/svelte';
	import { isPasskeySupported, passkeyErrorMessage } from '@sheppakai/shared/passkey-client';
	import { superForm } from 'sveltekit-superforms';

	import { FORGOT_PASSWORD_ROUTE, POST_LOGIN_ROUTE } from '#lib/auth-routes.js';
	import AuthFormMessage from '#lib/components/AuthFormMessage.svelte';
	import * as Alert from '#lib/components/ui/alert/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { Field, FieldGroup, FieldLabel } from '#lib/components/ui/field/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import { authClient } from '#lib/passkey-client.js';

	let { data } = $props();

	// svelte-ignore state_referenced_locally
	const { form, errors, enhance, message, submitting } = superForm(data.form);

	const verified = $derived(page.url.searchParams.get('verified') === 'true');

	let passkeySupported = $state(false);
	let passkeyPending = $state(false);
	let passkeyError = $state<string | null>(null);
	// Set when the page unmounts. A client-side navigation doesn't cancel the pending
	// conditional request, so the autofill flow must not start or redirect after this.
	let unmounted = false;

	/**
	 * `autoFill` is the conditional request behind the email field's autofill list. It stays
	 * silent on failure: it is cancelled whenever the button starts a new request, and the
	 * user never asked for it.
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
			if (autoFill && unmounted) return;
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
		PublicKeyCredential.isConditionalMediationAvailable?.()
			.then((available) => {
				if (available && !unmounted) void signInWithPasskey(true);
			})
			// Autofill is best-effort: without it the button still works.
			.catch(() => {});
		return () => {
			unmounted = true;
		};
	});
</script>

<svelte:head><title>Sign In - Synapse</title></svelte:head>

<Card.Root class="mx-auto w-full max-w-sm">
	<Card.Header class="text-center">
		<Card.Title class="text-2xl">Welcome back</Card.Title>
		<Card.Description>Sign in to your account with email</Card.Description>
	</Card.Header>
	<Card.Content>
		<form method="POST" use:enhance class="space-y-6">
			{#if verified}
				<div
					class="bg-pen-fitness/12 text-pen-fitness dark:bg-pen-fitness/20 dark:text-pen-fitness rounded-lg p-4 text-sm"
				>
					Email verified successfully! You can now sign in.
				</div>
			{/if}
			{#if data.resetComplete}
				<div
					class="bg-pen-fitness/12 text-pen-fitness dark:bg-pen-fitness/20 dark:text-pen-fitness rounded-lg p-4 text-sm"
					role="status"
				>
					Password reset successfully! You can now sign in with your new password.
				</div>
			{/if}
			{#if data.invalidVerificationLink}
				<div
					class="bg-destructive/12 text-destructive dark:bg-destructive/20 dark:text-destructive rounded-lg p-4 text-sm"
					role="alert"
				>
					That verification link is invalid or has expired. Please sign in or request a new one.
				</div>
			{/if}
			<AuthFormMessage message={$message} />
			<FieldGroup>
				<Field>
					<FieldLabel for="email">Email</FieldLabel>
					<Input
						id="email"
						name="email"
						type="email"
						autocomplete="username webauthn"
						bind:value={$form.email}
						placeholder="you@example.com"
						class={$errors.email ? 'border-destructive' : ''}
						required
					/>
					{#if $errors.email}
						<p class="text-destructive dark:text-destructive mt-1 text-sm">{$errors.email}</p>
					{/if}
				</Field>
				<Field>
					<div class="flex items-center">
						<FieldLabel for="password">Password</FieldLabel>
						<a href={FORGOT_PASSWORD_ROUTE} class="ms-auto inline-block text-sm underline">
							Forgot your password?
						</a>
					</div>
					<Input
						id="password"
						name="password"
						type="password"
						bind:value={$form.password}
						placeholder="••••••••"
						class={$errors.password ? 'border-destructive' : ''}
						required
					/>
					{#if $errors.password}
						<p class="text-destructive dark:text-destructive mt-1 text-sm">{$errors.password}</p>
					{/if}
				</Field>
				<Field>
					<Button type="submit" class="w-full" disabled={$submitting} aria-busy={$submitting}>
						{#if $submitting}
							<Spinner aria-hidden="true" />
							Signing in…
						{:else}
							Sign in
						{/if}
					</Button>
				</Field>
			</FieldGroup>
		</form>

		{#if passkeySupported}
			<div class="mt-6 space-y-4">
				<div class="text-muted-foreground flex items-center gap-3 text-sm" aria-hidden="true">
					<span class="bg-border h-px flex-1"></span>
					or
					<span class="bg-border h-px flex-1"></span>
				</div>

				{#if passkeyError}
					<Alert.Root variant="destructive">
						<Alert.Description>{passkeyError}</Alert.Description>
					</Alert.Root>
				{/if}

				<Button
					type="button"
					variant="outline"
					disabled={passkeyPending}
					aria-busy={passkeyPending}
					class="w-full"
					onclick={() => signInWithPasskey(false)}
				>
					{#if passkeyPending}
						<Spinner aria-hidden="true" />
						Waiting for your device…
					{:else}
						<Shield />
						Sign in with a passkey
					{/if}
				</Button>
			</div>
		{/if}
	</Card.Content>
</Card.Root>
