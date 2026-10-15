<script lang="ts">
	import { enhance } from '$app/forms';

	import { POST_LOGIN_ROUTE } from '#lib/auth-routes.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';

	let isSubmitting = $state(false);
</script>

<svelte:head>
	<title>Sign Out - Sheppakai Budget</title>
</svelte:head>

<Card.Root class="w-full">
	<Card.Header>
		<Card.Title class="text-xl tracking-tight">Sign out?</Card.Title>
		<Card.Description>You'll need your email and password to get back in.</Card.Description>
	</Card.Header>
	<Card.Content class="flex flex-col gap-2">
		<form
			method="POST"
			use:enhance={() => {
				isSubmitting = true;

				return async ({ update }) => {
					await update();
					isSubmitting = false;
				};
			}}
		>
			<Button type="submit" class="w-full" disabled={isSubmitting} aria-busy={isSubmitting}>
				{#if isSubmitting}
					<Spinner aria-hidden="true" />
					Signing out…
				{:else}
					Sign out
				{/if}
			</Button>
		</form>
		<Button href={POST_LOGIN_ROUTE} variant="ghost" class="w-full">Cancel</Button>
	</Card.Content>
</Card.Root>
