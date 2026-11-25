<script lang="ts">
	import { ArrowLeft } from '@lucide/svelte/icons';

	import PageShell from '#lib/components/app/PageShell.svelte';
	import SessionDialogs from '#lib/components/family-worship/SessionDialogs.svelte';
	import SessionListItem from '#lib/components/family-worship/SessionListItem.svelte';
	import TopicCard from '#lib/components/family-worship/TopicCard.svelte';
	import LoadErrorAlert from '#lib/components/shared/LoadErrorAlert.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import type { SessionEntry } from '#lib/schemas/family-worship.js';
	import { formatDateMedium } from '#lib/utils/date.js';

	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let editing = $state<SessionEntry | null>(null);
	let deleting = $state<SessionEntry | null>(null);
</script>

<svelte:head>
	<title>{data.history?.topic.title ?? 'Topic'} · Family Worship</title>
</svelte:head>

<PageShell class="max-w-3xl sm:py-6">
	<LoadErrorAlert message={data.loadError} />
	<Button href="/family-worship" variant="ghost" size="sm" class="mb-3 -ml-2">
		<ArrowLeft class="mr-1 size-4" aria-hidden="true" />
		Family Worship
	</Button>

	{#if data.history}
		{@const history = data.history}
		<h1 class="page-title mb-4 break-words" style="--pen: oklch(var(--color-brown))">
			{history.topic.title}
		</h1>

		<dl class="mb-5 grid grid-cols-2 gap-3 sm:max-w-sm">
			<div class="bg-card rounded-[3px] border-[1.5px] p-3">
				<dt class="text-muted-foreground text-xs font-semibold uppercase">Sessions</dt>
				<dd class="text-2xl font-semibold">{history.count}</dd>
			</div>
			<div class="bg-card rounded-[3px] border-[1.5px] p-3">
				<dt class="text-muted-foreground text-xs font-semibold uppercase">Last covered</dt>
				<dd class="text-lg font-semibold">
					{history.lastDate ? formatDateMedium(history.lastDate) : 'Not yet'}
				</dd>
			</div>
		</dl>

		<TopicCard topic={history.topic}>
			{#snippet actions()}
				{#if history.topic.isArchived}
					<span class="text-muted-foreground text-sm">Archived</span>
				{/if}
			{/snippet}
		</TopicCard>

		<section class="mt-6" aria-labelledby="topic-sessions">
			<h2 id="topic-sessions" class="mb-2 text-lg font-semibold">Sessions</h2>
			{#if history.sessions.length === 0}
				<p class="text-muted-foreground border-rule border-y border-dashed py-8 text-center">
					No sessions for this topic yet.
				</p>
			{:else}
				<ul class="divide-rule divide-y">
					{#each history.sessions as session (session.id)}
						<li>
							<SessionListItem
								{session}
								showTopic={false}
								onEdit={(s) => (editing = s)}
								onDelete={(s) => (deleting = s)}
							/>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	{/if}
</PageShell>

<SessionDialogs
	formData={data.editSessionForm}
	topics={data.activeTopics}
	today={data.today}
	bind:editing
	bind:deleting
/>
