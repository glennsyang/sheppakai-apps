<script lang="ts">
	import { TrendingUpIcon } from '@lucide/svelte/icons';

	import { Badge } from '#lib/components/ui/badge/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import type { SpendingSpike } from '#lib/types.js';

	interface Props {
		spikes: SpendingSpike[];
		onViewCategory: (categoryId: string) => void;
	}

	let { spikes, onViewCategory }: Props = $props();
</script>

{#if spikes.length > 0}
	<Card.Root class="border-amber-500/40 bg-amber-500/5">
		<Card.Content class="px-4 py-3">
			<div class="flex flex-wrap items-center gap-3">
				<div class="flex shrink-0 items-center gap-2">
					<TrendingUpIcon class="size-4 text-amber-600 dark:text-amber-400" />
					<Badge
						variant="outline"
						class="border-amber-500/40 text-xs text-amber-700 dark:text-amber-400"
					>
						{spikes.length}
						{spikes.length === 1 ? 'spending spike' : 'spending spikes'}
					</Badge>
				</div>
				<div class="flex flex-wrap gap-2">
					{#each spikes as spike (spike.categoryId)}
						<button
							onclick={() => onViewCategory(spike.categoryId)}
							class="flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-500/20 dark:text-amber-400"
						>
							{spike.categoryName}
							<span class="font-bold">+{spike.percentOver}% vs avg</span>
						</button>
					{/each}
				</div>
			</div>
		</Card.Content>
	</Card.Root>
{/if}
