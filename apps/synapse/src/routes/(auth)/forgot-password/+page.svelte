<script lang="ts">
	import { superForm } from 'sveltekit-superforms';

	import { SIGN_IN_ROUTE } from '#lib/auth-routes.js';
	import AuthFormMessage from '#lib/components/AuthFormMessage.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import {
		Field,
		FieldDescription,
		FieldGroup,
		FieldLabel
	} from '#lib/components/ui/field/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';

	let { data } = $props();

	// The server answers success and failure with the same generic banner (no account probing),
	// rendered by AuthFormMessage, so there is no separate "sent" state to switch to.
	// svelte-ignore state_referenced_locally
	const { form, errors, enhance, message, submitting } = superForm(data.form);
</script>

<svelte:head><title>Forgot Password - Synapse</title></svelte:head>

<Card.Root class="mx-auto w-full max-w-sm">
	<Card.Header class="text-center">
		<Card.Title class="text-2xl">Forgot your password?</Card.Title>
		<Card.Description>Enter your email to receive reset instructions</Card.Description>
	</Card.Header>
	<Card.Content>
		<form method="POST" use:enhance class="space-y-6">
			<AuthFormMessage message={$message} />

			<FieldGroup>
				<Field>
					<FieldLabel for="email">Email</FieldLabel>
					<Input
						id="email"
						name="email"
						type="email"
						autocomplete="email"
						bind:value={$form.email}
						placeholder="you@example.com"
						class={$errors.email ? 'border-destructive' : ''}
						required
					/>
					{#if $errors.email}
						<p class="text-destructive dark:text-destructive mt-1 text-sm">{$errors.email}</p>
					{/if}
				</Field>

				<Button type="submit" class="w-full" disabled={$submitting}>
					{#if $submitting}
						<Spinner class="mr-2 size-4" aria-label="Sending reset link" />
					{/if}
					{$submitting ? 'Sending...' : 'Send reset link'}
				</Button>

				<FieldDescription class="text-center">
					<a href={SIGN_IN_ROUTE}> Back to Sign in </a>
				</FieldDescription>
			</FieldGroup>
		</form>
	</Card.Content>
</Card.Root>
