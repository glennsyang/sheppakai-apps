<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';

	import { FORGOT_PASSWORD_ROUTE } from '#lib/auth-routes.js';
	import AuthFormMessage from '#lib/components/AuthFormMessage.svelte';
	import AuthShell from '#lib/components/AuthShell.svelte';
	import { Alert } from '#lib/components/ui/alert/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import { signInSchema } from '#lib/schemas/auth.js';

	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// svelte-ignore state_referenced_locally — superForm is intentionally initialized once from props
	const { form, errors, constraints, enhance, message, submitting } = superForm(data.form, {
		validators: zod4Client(signInSchema)
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
				autocomplete="email"
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
</AuthShell>
