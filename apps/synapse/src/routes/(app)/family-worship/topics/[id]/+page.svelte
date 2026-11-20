<script lang="ts">
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import ExternalLink from '@lucide/svelte/icons/external-link';

	import PageShell from '#lib/components/app/PageShell.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { formatDateLong, formatDateShort } from '#lib/utils/date.js';

	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const topic = $derived(data.topic);
</script>

<PageShell class="sm:py-6">
	<Button variant="ghost" href="/family-worship?tab=topics" class="mb-4 -ml-3 min-h-11">
		<ArrowLeft class="mr-2 size-4" />Topics
	</Button>

	<div class="ruled mb-6 pb-4">
		<h1 class="page-title" style="--pen: oklch(var(--color-brown))">{topic.title}</h1>
		<p class="text-muted-foreground mt-1 text-sm tabular-nums">
			{#if data.stats.count === 0}
				Not covered yet
			{:else}
				Covered {data.stats.count}× · last {formatDateShort(data.stats.lastCovered ?? '')}
			{/if}
			{#if topic.isArchived}· Archived{/if}
		</p>
	</div>

	<div class="grid grid-cols-1 gap-x-10 gap-y-8 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
		<div class="min-w-0 space-y-6">
			{#if topic.description}
				<section>
					<h2 class="text-muted-foreground mb-1 text-xs font-bold tracking-[0.12em] uppercase">
						What it is
					</h2>
					<p class="whitespace-pre-line">{topic.description}</p>
				</section>
			{/if}
			{#if topic.scriptureRefs}
				<section>
					<h2 class="text-muted-foreground mb-1 text-xs font-bold tracking-[0.12em] uppercase">
						Scriptures
					</h2>
					<p>{topic.scriptureRefs}</p>
				</section>
			{/if}
			{#if topic.links.length > 0}
				<section>
					<h2 class="text-muted-foreground mb-1 text-xs font-bold tracking-[0.12em] uppercase">
						Publications
					</h2>
					<ul class="space-y-1">
						{#each topic.links as link (link)}
							<li>
								<a
									href={link}
									target="_blank"
									rel="noopener noreferrer"
									class="text-pen-worship inline-flex max-w-full items-center gap-1 break-all hover:underline"
								>
									{link}<ExternalLink class="size-3 shrink-0" aria-hidden="true" />
								</a>
							</li>
						{/each}
					</ul>
				</section>
			{/if}
			{#if topic.notes}
				<section>
					<h2 class="text-muted-foreground mb-1 text-xs font-bold tracking-[0.12em] uppercase">
						Notes
					</h2>
					<p class="whitespace-pre-line">{topic.notes}</p>
				</section>
			{/if}
		</div>

		<section class="min-w-0">
			<h2 class="ruled mb-1 pb-2 text-2xl font-black tracking-tight">Dates covered</h2>
			{#if data.sessions.length === 0}
				<p class="text-muted-foreground py-4 text-sm">No sessions logged for this topic yet.</p>
			{:else}
				<ul>
					{#each data.sessions as session (session.id)}
						<li class="border-rule border-b py-2">
							<span class="block text-sm font-medium tabular-nums">
								{formatDateLong(session.date)}
							</span>
							{#if session.notes}
								<span class="text-muted-foreground block text-sm whitespace-pre-line">
									{session.notes}
								</span>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	</div>
</PageShell>
