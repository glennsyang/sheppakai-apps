<script lang="ts">
	import { goto } from '$app/navigation';
	import KeyRoundIcon from '@lucide/svelte/icons/key-round';
	import { isPasskeySupported, passkeyErrorMessage } from '@sheppakai/shared/passkey-client';
	import { superForm } from 'sveltekit-superforms';

	import { FORGOT_PASSWORD_ROUTE, POST_LOGIN_ROUTE } from '#lib/auth-routes.js';
	import AuthFormMessage from '#lib/components/AuthFormMessage.svelte';
	import FormMessage from '#lib/components/FormMessage.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { Field, FieldGroup, FieldLabel } from '#lib/components/ui/field/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import { authClient } from '#lib/passkey-client.js';

	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// svelte-ignore state_referenced_locally
	const { form, errors, message, submitting, enhance } = superForm(data.form);

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
	<title>Sign in · Sheppakai Budget</title>
</svelte:head>

<Card.Root class="w-full">
	<Card.Header>
		<Card.Title class="text-xl tracking-tight">Sign in</Card.Title>
		<Card.Description>Welcome back.</Card.Description>
	</Card.Header>
	<Card.Content>
		<form method="POST" use:enhance>
			<FieldGroup>
				{#if data.resetComplete}
					<FormMessage type="success" text="Password changed. Sign in with your new password." />
				{/if}

				{#if data.invalidVerificationLink}
					<FormMessage
						type="error"
						text="That verification link is invalid or has expired. Sign in to get a new one."
					/>
				{/if}

				<AuthFormMessage message={$message} />

				<Field>
					<FieldLabel for="email">Email</FieldLabel>
					<Input
						id="email"
						name="email"
						type="email"
						placeholder="you@example.com"
						bind:value={$form.email}
						class={$errors.email ? 'border-destructive' : ''}
						autocomplete="username webauthn"
						required
					/>
					{#if $errors.email}
						<p class="text-destructive text-sm">{$errors.email}</p>
					{/if}
				</Field>

				<Field>
					<div class="flex items-center">
						<FieldLabel for="password">Password</FieldLabel>
						<a
							href={FORGOT_PASSWORD_ROUTE}
							class="text-primary ms-auto text-sm font-medium hover:underline"
						>
							Forgot password?
						</a>
					</div>
					<Input
						id="password"
						name="password"
						type="password"
						bind:value={$form.password}
						class={$errors.password ? 'border-destructive' : ''}
						autocomplete="current-password"
						required
					/>
					{#if $errors.password}
						<p class="text-destructive text-sm">{$errors.password}</p>
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
			<div class="mt-6 flex flex-col gap-4">
				<div class="text-muted-foreground flex items-center gap-3 text-xs" aria-hidden="true">
					<span class="bg-border h-px flex-1"></span>
					or
					<span class="bg-border h-px flex-1"></span>
				</div>

				{#if passkeyError}
					<FormMessage type="error" text={passkeyError} />
				{/if}

				<Button
					type="button"
					variant="outline"
					class="w-full"
					disabled={passkeyPending}
					aria-busy={passkeyPending}
					onclick={() => signInWithPasskey(false)}
				>
					{#if passkeyPending}
						<Spinner aria-hidden="true" />
						Waiting for your device…
					{:else}
						<KeyRoundIcon aria-hidden="true" />
						Sign in with a passkey
					{/if}
				</Button>
			</div>
		{/if}
	</Card.Content>
</Card.Root>
