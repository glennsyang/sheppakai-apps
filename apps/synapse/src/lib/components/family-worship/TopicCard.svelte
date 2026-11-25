<script lang="ts">
	import { ExternalLink } from '@lucide/svelte/icons';
	import type { Snippet } from 'svelte';

	import type { TopicEntry } from '#lib/schemas/family-worship.js';

	interface Props {
		topic: TopicEntry;
		/** 1-based place in the Topic Queue; omitted for an Archived Topic. */
		position?: number;
		handle?: Snippet;
		actions: Snippet;
	}

	let { topic, position, handle, actions }: Props = $props();
</script>

<article class="bg-card rounded-[3px] border-[1.5px] p-3.5">
	<div class="flex items-start gap-2.5">
		{@render handle?.()}
		{#if position !== undefined}
			<span
				class="bg-pen-worship/12 text-pen-worship mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-[2px] text-xs font-bold"
				aria-label="Position {position}"
			>
				{position}
			</span>
		{/if}
		<div class="min-w-0 flex-1 space-y-1.5">
			<h3 class="text-[1.02rem] leading-snug font-semibold tracking-[-0.01em] break-words">
				{topic.title}
			</h3>
			<p class="text-muted-foreground text-sm break-words whitespace-pre-line">
				{topic.description}
			</p>
			{#if topic.scriptureReferences}
				<p class="text-sm"><span class="font-semibold">Read:</span> {topic.scriptureReferences}</p>
			{/if}
			{#if topic.notes}
				<p class="text-sm break-words whitespace-pre-line">
					<span class="font-semibold">Notes:</span>
					{topic.notes}
				</p>
			{/if}
			{#if topic.publicationLinks.length > 0}
				<ul class="flex flex-wrap gap-x-3 gap-y-1 text-sm">
					{#each topic.publicationLinks as link, index (index)}
						<li>
							<a
								href={link.url}
								target="_blank"
								rel="noopener noreferrer"
								class="text-pen-worship inline-flex items-center gap-1 underline-offset-2 hover:underline"
							>
								{link.label || new URL(link.url).hostname}
								<ExternalLink class="size-3.5" aria-hidden="true" />
							</a>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	</div>
	<div class="mt-2 flex flex-wrap justify-end gap-1">
		{@render actions()}
	</div>
</article>
