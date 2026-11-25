<script lang="ts">
	import { goto } from '$app/navigation';
	import { ArrowLeft, CircleSlash } from '@lucide/svelte/icons';

	import PageShell from '#lib/components/app/PageShell.svelte';
	import SessionDialogs from '#lib/components/family-worship/SessionDialogs.svelte';
	import SessionListItem from '#lib/components/family-worship/SessionListItem.svelte';
	import LoadErrorAlert from '#lib/components/shared/LoadErrorAlert.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import type { SessionEntry } from '#lib/schemas/family-worship.js';
	import { formatDateMedium } from '#lib/utils/date.js';

	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let editing = $state<SessionEntry | null>(null);
	let deleting = $state<SessionEntry | null>(null);

	const ALL = 'all';
	const filterTitle = $derived(
		data.filterTopics.find((topic) => topic.id === data.topicId)?.title ?? 'All topics'
	);

	function formatMonth(month: string) {
		const [year, monthIndex] = month.split('-').map(Number);
		return new Date(year ?? 0, (monthIndex ?? 1) - 1, 1).toLocaleDateString('en-US', {
			month: 'long',
			year: 'numeric'
		});
	}

	function filterBy(topicId: string) {
		goto(
			topicId === ALL
				? '/family-worship/history'
				: `/family-worship/history?topic=${encodeURIComponent(topicId)}`,
			{ replace: true }
		);
	}
</script>

<svelte:head>
	<title>History · Family Worship</title>
</svelte:head>

<PageShell class="max-w-3xl sm:py-6">
	<LoadErrorAlert message={data.loadError} />
	<Button href="/family-worship" variant="ghost" size="sm" class="mb-3 -ml-2">
		<ArrowLeft class="mr-1 size-4" aria-hidden="true" />
		Family Worship
	</Button>

	<div class="ruled mb-5 flex flex-wrap items-end justify-between gap-3 pb-4">
		<h1 class="page-title" style="--pen: oklch(var(--color-brown))">History</h1>
		<Select.Root type="single" value={data.topicId ?? ALL} onValueChange={filterBy}>
			<Select.Trigger class="w-full sm:w-64" aria-label="Filter by topic">
				<span class="truncate">{filterTitle}</span>
			</Select.Trigger>
			<Select.Content>
				<Select.Item value={ALL} label="All topics">All topics</Select.Item>
				{#each data.filterTopics as topic (topic.id)}
					<Select.Item value={topic.id} label={topic.title}>{topic.title}</Select.Item>
				{/each}
			</Select.Content>
		</Select.Root>
	</div>

	{#if data.months.length === 0}
		<p class="text-muted-foreground border-rule border-y border-dashed py-12 text-center">
			{data.topicId ? 'No sessions for this topic yet.' : 'No sessions or Skipped Weeks yet.'}
		</p>
	{:else}
		{#each data.months as month (month.month)}
			<section class="mb-6" aria-labelledby="month-{month.month}">
				<h2 id="month-{month.month}" class="font-display mb-1 text-lg font-semibold">
					{formatMonth(month.month)}
				</h2>
				<ul class="divide-rule divide-y">
					{#each month.entries as entry (entry.kind === 'session' ? entry.id : `skip-${entry.weekStart}`)}
						<li>
							{#if entry.kind === 'session'}
								<SessionListItem
									session={entry}
									onEdit={(s) => (editing = s)}
									onDelete={(s) => (deleting = s)}
								/>
							{:else}
								<div class="text-muted-foreground flex items-start gap-2.5 py-2.5">
									<CircleSlash class="mt-1 size-4 shrink-0" aria-hidden="true" />
									<div>
										<p class="text-sm font-semibold">{formatDateMedium(entry.date)}</p>
										<p>Skipped{entry.reason ? `: ${entry.reason}` : ''}</p>
									</div>
								</div>
							{/if}
						</li>
					{/each}
				</ul>
			</section>
		{/each}
	{/if}
</PageShell>

<SessionDialogs
	formData={data.editSessionForm}
	topics={data.activeTopics}
	today={data.today}
	bind:editing
	bind:deleting
/>
