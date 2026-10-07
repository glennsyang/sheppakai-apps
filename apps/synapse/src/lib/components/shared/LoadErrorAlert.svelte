<script lang="ts">
	import * as Alert from '$lib/components/ui/alert';
	import { CircleAlert } from '@lucide/svelte/icons';

	/** A page load's `loadError` (see docs/ERROR_HANDLING_POLICY.md); renders nothing when unset. */
	let { message, class: className = 'mb-6' }: { message?: string; class?: string } = $props();
</script>

{#if message}
	<Alert.Root variant="destructive" class={className}>
		<CircleAlert class="h-4 w-4" />
		<Alert.Title>Error</Alert.Title>
		<Alert.Description>{message}</Alert.Description>
	</Alert.Root>
{/if}
