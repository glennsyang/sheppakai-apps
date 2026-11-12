<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { passkeyErrorMessage, isPasskeySupported } from '@sheppakai/shared/passkey-client';
	import { onMount } from 'svelte';
	import { superForm } from 'sveltekit-superforms';

	import { FORGOT_PASSWORD_ROUTE, POST_LOGIN_ROUTE } from '#lib/auth-routes.js';
	import AuthFormMessage from '#lib/components/AuthFormMessage.svelte';
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
	let passkeyError = $state<string | null>(null);
	let passkeySigningIn = $state(false);
	let conditionalAbortController = $state<AbortController | null>(null);

	async function signInWithPasskey(autoFill = false) {
		passkeyError = null;
		if (!autoFill) {
			passkeySigningIn = true;
		}

		const controller = new AbortController();
		if (autoFill) {
			conditionalAbortController?.abort();
			conditionalAbortController = controller;
		}

		const { error } = await authClient.signIn.passkey({
			autoFill,
			fetchOptions: { signal: controller.signal }
		});

		if (autoFill && conditionalAbortController === controller) {
			conditionalAbortController = null;
		}
		if (!autoFill) {
			passkeySigningIn = false;
		}

		if (error) {
			passkeyError = passkeyErrorMessage(error);
			return;
		}

		await goto(POST_LOGIN_ROUTE, { invalidateAll: true });
	}

	function abortConditionalPasskeySignIn() {
		conditionalAbortController?.abort();
		conditionalAbortController = null;
	}

	onMount(() => {
		passkeySupported = isPasskeySupported();
		if (!passkeySupported) return;

		const credentialApi = window.PublicKeyCredential as typeof PublicKeyCredential & {
			isConditionalMediationAvailable?: () => Promise<boolean>;
		};

		if (typeof credentialApi.isConditionalMediationAvailable !== 'function') return;

		void credentialApi
			.isConditionalMediationAvailable()
			.then((ok) => {
				if (ok) {
					void signInWithPasskey(true);
				}
			})
			.catch(() => {
				// Keep password sign-in as-is; unsupported/failed checks stay silent.
			});

		return () => {
			abortConditionalPasskeySignIn();
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
		<form method="POST" use:enhance onsubmit={abortConditionalPasskeySignIn} class="space-y-6">
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
				{#if passkeySupported}
					<div class="text-muted-foreground relative py-1 text-center text-xs">
						<span class="bg-card relative z-10 px-2">or</span>
						<div class="bg-border absolute inset-x-0 top-1/2 h-px -translate-y-1/2"></div>
					</div>
					<Field>
						<Button
							type="button"
							variant="outline"
							class="w-full"
							onclick={() => signInWithPasskey(false)}
							disabled={passkeySigningIn}
							aria-busy={passkeySigningIn}
						>
							{#if passkeySigningIn}
								<Spinner aria-hidden="true" />
								Signing in with passkey…
							{:else}
								Sign in with a passkey
							{/if}
						</Button>
					</Field>
					{#if passkeyError}
						<p class="text-destructive text-sm" role="alert">{passkeyError}</p>
					{/if}
				{/if}
			</FieldGroup>
		</form>
	</Card.Content>
</Card.Root>
