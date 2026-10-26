<script lang="ts">
	import Icon from '#lib/components/Icon.svelte';
	import { cn } from '#lib/utils.js';

	// Same API and look as budget/synapse's shadcn Spinner (lucide loader-circle), drawn
	// with the local Icon since this app doesn't depend on lucide. Icon is always aria-hidden.
	interface Props {
		class?: string;
		'aria-hidden'?: boolean | 'true' | 'false';
	}

	let { class: className }: Props = $props();
</script>

<Icon name="loader" size={16} class={cn('size-4 animate-spin', className)} />
