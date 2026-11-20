<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { navigating, page } from '$app/state';
	import Archive from '@lucide/svelte/icons/archive';
	import ArchiveRestore from '@lucide/svelte/icons/archive-restore';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Trash2 from '@lucide/svelte/icons/trash-2';

	import PageShell from '#lib/components/app/PageShell.svelte';
	import LogSessionDialog from '#lib/components/family-worship/LogSessionDialog.svelte';
	import { toastEnhance } from '#lib/components/family-worship/toast-enhance.js';
	import TopicDialog from '#lib/components/family-worship/TopicDialog.svelte';
	import WeekCard from '#lib/components/family-worship/WeekCard.svelte';
	import ConfirmDialog from '#lib/components/shared/ConfirmDialog.svelte';
	import LoadErrorAlert from '#lib/components/shared/LoadErrorAlert.svelte';
	import PageSkeleton from '#lib/components/skeletons/PageSkeleton.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Tabs from '#lib/components/ui/tabs/index.js';
	import { formatDateMedium, formatDateShort } from '#lib/utils/date.js';
	import {
		getWednesdayOf,
		plannedTopicOf,
		type TopicEntry,
		type TopicRef,
		type WeekPlan,
		type WorshipSessionSummary
	} from '#lib/utils/family-worship.js';

	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	type WorshipTab = 'schedule' | 'topics' | 'history';
	const tabs: WorshipTab[] = ['schedule', 'topics', 'history'];
	const isTab = (value: string | null): value is WorshipTab =>
		value !== null && (tabs as string[]).includes(value);

	const initialTab = page.url.searchParams.get('tab');
	let activeTab = $state<WorshipTab>(isTab(initialTab) ? initialTab : 'schedule');

	function handleTabChange(value: string) {
		if (!isTab(value)) return;
		activeTab = value;
		const nextUrl = new URL(page.url.href);
		if (value === 'schedule') nextUrl.searchParams.delete('tab');
		else nextUrl.searchParams.set('tab', value);
		goto(nextUrl, { shallow: true, replace: true, state: page.state });
	}

	const activeTopics = $derived(data.topics.filter((topic) => !topic.isArchived));
	const activeTopicRefs = $derived<TopicRef[]>(
		activeTopics.map((topic) => ({ id: topic.id, title: topic.title }))
	);
	const topicTitles = $derived(new Map(data.topics.map((topic) => [topic.id, topic.title])));

	// ── Logging a week ────────────────────────────────────────────────────────
	let logOpen = $state(false);
	let logDate = $state<string | undefined>(undefined);
	let logTopicId = $state<string | null>(null);

	function openLog(week: WeekPlan) {
		// This week defaults to today; an earlier unlogged week to its Wednesday.
		logDate = getWednesdayOf(data.today) === week.weekOf ? data.today : week.weekOf;
		logTopicId = plannedTopicOf(week)?.id ?? null;
		logOpen = true;
	}

	let editSession = $state<WorshipSessionSummary | null>(null);
	let editSessionOpen = $state(false);

	function openEditSession(session: WorshipSessionSummary) {
		editSession = session;
		editSessionOpen = true;
	}

	// An archived topic still shows in the picker for the session that used it.
	const editSessionTopics = $derived.by(() => {
		const topicId = editSession?.topicId;
		if (!topicId || activeTopicRefs.some((topic) => topic.id === topicId)) return activeTopicRefs;
		return [...activeTopicRefs, { id: topicId, title: topicTitles.get(topicId) ?? 'Topic' }];
	});

	// ── Topics ────────────────────────────────────────────────────────────────
	let showArchived = $state(false);
	const visibleTopics = $derived(showArchived ? data.topics : activeTopics);
	const archivedCount = $derived(data.topics.length - activeTopics.length);

	let editTopic = $state<TopicEntry | null>(null);
	let editTopicOpen = $state(false);

	let deleteTopicTarget = $state<{ id: string; title: string } | null>(null);
	let deleteTopicOpen = $state(false);

	let deleteSessionId = $state<string | null>(null);
	let deleteSessionOpen = $state(false);

	// ── History ───────────────────────────────────────────────────────────────
	let historyTopicId = $state('');
	const monthFormatter = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' });

	const historyGroups = $derived.by(() => {
		const filtered = historyTopicId
			? data.sessions.filter((session) => session.topicId === historyTopicId)
			: data.sessions;
		const groups: { key: string; label: string; sessions: typeof data.sessions }[] = [];
		for (const session of [...filtered].sort((a, b) => b.date.localeCompare(a.date))) {
			const key = session.date.slice(0, 7);
			let group = groups.at(-1);
			if (group?.key !== key) {
				const [year, month] = key.split('-').map(Number);
				group = { key, label: monthFormatter.format(new Date(year, month - 1, 1)), sessions: [] };
				groups.push(group);
			}
			group.sessions.push(session);
		}
		return groups;
	});
</script>

{#if navigating.to?.url.pathname === '/family-worship'}
	<PageSkeleton color="brown" />
{:else}
	<PageShell class="sm:py-6">
		<LoadErrorAlert message={data.loadError} />
		<div class="ruled mb-6 flex flex-wrap items-center justify-between gap-3 pb-4">
			<div>
				<h1 class="page-title" style="--pen: oklch(var(--color-brown))">Family Worship</h1>
				<p class="text-muted-foreground mt-1">Wednesday evening study: plan, rotate and log</p>
			</div>
			<TopicDialog formData={data.topicForm} />
		</div>

		<Tabs.Root value={activeTab} onValueChange={handleTabChange} class="w-full">
			<Tabs.List
				class="font-display bg-muted text-muted-foreground mb-4 inline-flex h-10 items-center rounded-md p-1"
			>
				<Tabs.Trigger
					value="schedule"
					class="data-[state=active]:border-pen-worship border-b-2 border-transparent"
					>Schedule</Tabs.Trigger
				>
				<Tabs.Trigger
					value="topics"
					class="data-[state=active]:border-pen-worship border-b-2 border-transparent"
					>Topics ({activeTopics.length})</Tabs.Trigger
				>
				<Tabs.Trigger
					value="history"
					class="data-[state=active]:border-pen-worship border-b-2 border-transparent"
					>History</Tabs.Trigger
				>
			</Tabs.List>

			<!-- ── Schedule ─────────────────────────────────────────────────── -->
			<Tabs.Content value="schedule">
				{#if data.topics.length === 0}
					<div class="border-rule border-y border-dashed py-12 text-center">
						<p class="text-muted-foreground mb-4">
							Add a few topics and each Wednesday will get one in rotation.
						</p>
					</div>
				{/if}
				<ul>
					{#each data.upcoming as week (week.weekOf)}
						<WeekCard
							{week}
							today={data.today}
							activeTopics={activeTopicRefs}
							{topicTitles}
							onLog={openLog}
							onEditSession={openEditSession}
						/>
					{/each}
				</ul>
				<p class="text-muted-foreground mt-3 text-xs">
					Suggestions rotate through topics not covered for the longest. Accept one or pick your
					own.
				</p>
			</Tabs.Content>

			<!-- ── Topics ───────────────────────────────────────────────────── -->
			<Tabs.Content value="topics">
				{#if archivedCount > 0}
					<label class="mb-2 flex min-h-11 items-center gap-2 text-sm">
						<input type="checkbox" bind:checked={showArchived} class="accent-pen-worship size-4" />
						Show archived ({archivedCount})
					</label>
				{/if}
				{#if visibleTopics.length === 0}
					<div class="border-rule border-y border-dashed py-12 text-center">
						<p class="text-muted-foreground">
							No topics yet. Use “Add Topic” to start the catalog.
						</p>
					</div>
				{:else}
					<ul>
						{#each visibleTopics as topic (topic.id)}
							<li
								class={[
									'border-rule flex flex-wrap items-center gap-x-3 gap-y-1 border-b py-3',
									topic.isArchived && 'opacity-60'
								]}
							>
								<a href="/family-worship/topics/{topic.id}" class="min-w-0 flex-1 hover:underline">
									<span class="block truncate font-black">
										{topic.title}
										{#if topic.isArchived}
											<span class="text-muted-foreground text-xs font-bold">· Archived</span>
										{/if}
									</span>
									<span class="text-muted-foreground block text-xs tabular-nums">
										{topic.stats.count === 0
											? 'Not covered yet'
											: `Covered ${topic.stats.count}× · last ${formatDateShort(topic.stats.lastCovered ?? '')}`}
									</span>
								</a>
								<div class="flex items-center gap-1">
									<Button
										variant="ghost"
										size="sm"
										class="min-h-11"
										aria-label="Edit {topic.title}"
										onclick={() => {
											editTopic = topic;
											editTopicOpen = true;
										}}
									>
										<Pencil class="size-4" />
									</Button>
									<form
										method="POST"
										action={topic.isArchived ? '?/restoreTopic' : '?/archiveTopic'}
										use:enhance={toastEnhance({
											success: topic.isArchived ? 'Topic restored.' : 'Topic archived.',
											error: 'Failed to update topic.'
										})}
									>
										<input type="hidden" name="id" value={topic.id} />
										<Button
											type="submit"
											variant="ghost"
											size="sm"
											class="min-h-11"
											aria-label="{topic.isArchived ? 'Restore' : 'Archive'} {topic.title}"
											title={topic.isArchived ? 'Restore' : 'Archive'}
										>
											{#if topic.isArchived}
												<ArchiveRestore class="size-4" />
											{:else}
												<Archive class="size-4" />
											{/if}
										</Button>
									</form>
									<Button
										variant="ghost"
										size="sm"
										class="text-destructive min-h-11"
										aria-label="Delete {topic.title}"
										onclick={() => {
											deleteTopicTarget = { id: topic.id, title: topic.title };
											deleteTopicOpen = true;
										}}
									>
										<Trash2 class="size-4" />
									</Button>
								</div>
							</li>
						{/each}
					</ul>
				{/if}
			</Tabs.Content>

			<!-- ── History ──────────────────────────────────────────────────── -->
			<Tabs.Content value="history">
				<div class="mb-3 flex items-center gap-2">
					<label for="history-topic" class="text-sm font-medium">Topic</label>
					<select
						id="history-topic"
						bind:value={historyTopicId}
						class="border-input bg-background min-h-11 max-w-60 rounded-md border px-2 text-sm"
					>
						<option value="">All topics</option>
						{#each data.topics as topic (topic.id)}
							<option value={topic.id}>{topic.title}</option>
						{/each}
					</select>
				</div>
				{#if historyGroups.length === 0}
					<div class="border-rule border-y border-dashed py-12 text-center">
						<p class="text-muted-foreground">No sessions logged yet.</p>
					</div>
				{:else}
					{#each historyGroups as group (group.key)}
						<h3
							class="text-muted-foreground mt-6 mb-1 text-xs font-bold tracking-[0.12em] uppercase"
						>
							{group.label}
						</h3>
						<ul>
							{#each group.sessions as session (session.id)}
								<li
									class={[
										'border-rule flex items-center gap-3 border-b py-2',
										session.status === 'skipped' && 'text-muted-foreground'
									]}
								>
									<span class="w-24 shrink-0 text-sm tabular-nums">
										{formatDateMedium(session.date)}
									</span>
									<span class="min-w-0 flex-1">
										<span class="block truncate text-[0.95rem]">
											{#if session.status === 'done' && session.topicId}
												{topicTitles.get(session.topicId) ?? 'Deleted topic'}
											{:else}
												<span class="italic">Skipped</span>
											{/if}
										</span>
										{#if session.notes}
											<span class="text-muted-foreground block truncate text-xs">
												{session.notes}
											</span>
										{/if}
									</span>
									<Button
										variant="ghost"
										size="sm"
										class="min-h-11"
										aria-label="Edit session on {formatDateMedium(session.date)}"
										onclick={() => openEditSession(session)}
									>
										<Pencil class="size-4" />
									</Button>
									<Button
										variant="ghost"
										size="sm"
										class="text-destructive min-h-11"
										aria-label="Delete session on {formatDateMedium(session.date)}"
										onclick={() => {
											deleteSessionId = session.id;
											deleteSessionOpen = true;
										}}
									>
										<Trash2 class="size-4" />
									</Button>
								</li>
							{/each}
						</ul>
					{/each}
				{/if}
			</Tabs.Content>
		</Tabs.Root>
	</PageShell>

	<LogSessionDialog
		formData={data.sessionForm}
		bind:open={logOpen}
		instanceId="schedule"
		topics={activeTopicRefs}
		defaultDate={logDate}
		defaultTopicId={logTopicId}
		onClose={() => (logOpen = false)}
	/>

	{#if editSession}
		<LogSessionDialog
			formData={data.sessionForm}
			editEntry={editSession}
			bind:open={editSessionOpen}
			topics={editSessionTopics}
			onClose={() => {
				editSessionOpen = false;
				editSession = null;
			}}
		/>
	{/if}

	{#if editTopic}
		<TopicDialog
			formData={data.topicForm}
			editEntry={editTopic}
			bind:open={editTopicOpen}
			onClose={() => {
				editTopicOpen = false;
				editTopic = null;
			}}
		/>
	{/if}

	<ConfirmDialog
		bind:open={deleteTopicOpen}
		title="Delete topic"
		message={`Delete “${deleteTopicTarget?.title ?? ''}”? Its schedule and session history are deleted too. Archive it instead to keep the history.`}
		confirmButtonText="Delete"
		id={deleteTopicTarget?.id}
		actionUrl="?/deleteTopic"
	/>

	<ConfirmDialog
		bind:open={deleteSessionOpen}
		title="Delete session"
		message="Delete this session from the log?"
		confirmButtonText="Delete"
		id={deleteSessionId ?? undefined}
		actionUrl="?/deleteSession"
	/>
{/if}
