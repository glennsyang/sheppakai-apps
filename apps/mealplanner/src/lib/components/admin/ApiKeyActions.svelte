<script lang="ts">
	import { enhance } from '$app/forms';

	import { Button } from '#lib/components/ui/button/index.js';

	let { id, name }: { id: string; name: string } = $props();

	let confirming = $state(false);
	let busy = $state(false);

	const submit = () => {
		busy = true;
		return async ({ update }: { update: () => Promise<void> }) => {
			await update();
			busy = false;
			confirming = false;
		};
	};
</script>

{#if confirming}
	<form method="POST" action="?/revokeApiKey" use:enhance={submit} class="flex items-center gap-1">
		<input type="hidden" name="id" value={id} />
		<Button type="submit" variant="destructive" size="sm" disabled={busy}>Confirm</Button>
		<Button
			type="button"
			variant="outline"
			size="sm"
			disabled={busy}
			onclick={() => (confirming = false)}
		>
			Cancel
		</Button>
	</form>
{:else}
	<Button
		type="button"
		variant="tonal-destructive"
		size="sm"
		onclick={() => (confirming = true)}
		aria-label="Revoke {name}"
	>
		Revoke
	</Button>
{/if}
