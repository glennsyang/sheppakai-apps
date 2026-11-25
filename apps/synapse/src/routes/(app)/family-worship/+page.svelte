<script lang="ts">
	import { BookOpen, History } from '@lucide/svelte/icons';
	import { toast } from 'svelte-sonner';
	import { superForm } from 'sveltekit-superforms';

	import PageShell from '#lib/components/app/PageShell.svelte';
	import LogSessionDialog from '#lib/components/family-worship/LogSessionDialog.svelte';
	import PlannedWeekRow from '#lib/components/family-worship/PlannedWeekRow.svelte';
	import SkipWeekDialog from '#lib/components/family-worship/SkipWeekDialog.svelte';
	import TopicActionButton from '#lib/components/family-worship/TopicActionButton.svelte';
	import TopicCard from '#lib/components/family-worship/TopicCard.svelte';
	import TopicDialog from '#lib/components/family-worship/TopicDialog.svelte';
	import TopicQueue from '#lib/components/family-worship/TopicQueue.svelte';
	import ConfirmDialog from '#lib/components/shared/ConfirmDialog.svelte';
	import LoadErrorAlert from '#lib/components/shared/LoadErrorAlert.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import * as Tabs from '#lib/components/ui/tabs/index.js';
	import {
		type PlannedWeekView,
		type SessionEntry,
		type TopicEntry,
		WEEKDAY_NAMES
	} from '#lib/schemas/family-worship.js';
	import { formatDateMedium } from '#lib/utils/date.js';

	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let activeTab = $state<'plan' | 'queue' | 'archived'>('plan');

	const upcomingWeeks = $derived(data.plan.filter((week) => !week.isPast));
	// Most recent first: last week is the one most likely to need logging.
	const unloggedWeeks = $derived(data.plan.filter((week) => week.isPast).toReversed());

	const topicOptions = $derived(data.topicQueue.map(({ id, title }) => ({ id, title })));

	let logDefaults = $state<{ date: string; topicId: string | null }>();
	let showLogDialog = $state(false);

	let sessionToEdit = $state<SessionEntry | null>(null);
	let showEditSessionDialog = $state(false);

	let weekToSkip = $state<{ weekStart: string; dateLabel: string } | null>(null);
	let showSkipDialog = $state(false);

	/** A session starts on the week's Usual Weekday, or today if that hasn't come yet. */
	function logWeek(week: PlannedWeekView) {
		logDefaults = {
			date: week.date <= data.today ? week.date : data.today,
			topicId: week.plannedTopic?.id ?? week.suggestion?.id ?? null
		};
		showLogDialog = true;
	}

	function editSession(session: SessionEntry) {
		sessionToEdit = session;
		showEditSessionDialog = true;
	}

	function skipWeek(week: PlannedWeekView) {
		weekToSkip = { weekStart: week.weekStart, dateLabel: formatDateMedium(week.date) };
		showSkipDialog = true;
	}

	let topicToEdit = $state<TopicEntry | null>(null);
	let showEditDialog = $state(false);

	let topicToDelete = $state<TopicEntry | null>(null);
	let showDeleteDialog = $state(false);

	function editTopic(topic: TopicEntry) {
		topicToEdit = topic;
		showEditDialog = true;
	}

	function confirmDelete(topic: TopicEntry) {
		topicToDelete = topic;
		showDeleteDialog = true;
	}

	// svelte-ignore state_referenced_locally
	const {
		form: weekdayForm,
		errors: weekdayErrors,
		enhance: weekdayEnhance,
		submitting: weekdaySubmitting
	} = superForm(data.usualWeekdayForm, {
		id: 'usual-weekday',
		resetForm: false,
		onUpdate: ({ form }) => {
			if (form.message?.type === 'success') toast.success(form.message.text);
			else if (form.message?.type === 'error') toast.error(form.message.text);
		},
		onError: ({ result }) => {
			toast.error(`Failed to save the Usual Weekday: ${result.error.message}`);
		}
	});

	const weekdayValue = $derived(String($weekdayForm.usualWeekday));
</script>

<PageShell class="sm:py-6">
	<LoadErrorAlert message={data.loadError} />
	<div class="ruled mb-6 flex items-center justify-between gap-3 pb-4">
		<div>
			<h1 class="page-title" style="--pen: oklch(var(--color-brown))">Family Worship</h1>
			<p class="text-muted-foreground mt-1">Plan the topics you study together each week</p>
		</div>
		<TopicDialog formData={data.topicForm} instanceId="add" />
	</div>

	<Tabs.Root bind:value={activeTab} class="mb-8 w-full">
		<div class="w-full overflow-x-auto pb-1">
			<Tabs.List
				class="font-display bg-muted text-muted-foreground inline-flex h-10 min-w-max items-center justify-start rounded-md p-1"
			>
				<Tabs.Trigger
					value="plan"
					class="data-[state=active]:border-pen-worship border-b-2 border-transparent"
				>
					Plan
				</Tabs.Trigger>
				<Tabs.Trigger
					value="queue"
					class="data-[state=active]:border-pen-worship border-b-2 border-transparent"
				>
					Topic Queue ({data.topicQueue.length})
				</Tabs.Trigger>
				<Tabs.Trigger
					value="archived"
					class="data-[state=active]:border-border border-b-2 border-transparent"
				>
					Archived Topics ({data.archivedTopics.length})
				</Tabs.Trigger>
			</Tabs.List>
		</div>

		<Tabs.Content value="plan" class="w-full">
			<div class="mb-3 flex flex-wrap items-center justify-between gap-2">
				<p class="text-muted-foreground text-sm">
					Each week shows its {WEEKDAY_NAMES[$weekdayForm.usualWeekday] ?? 'Usual Weekday'}. Accept
					a suggestion or choose any topic.
				</p>
				<Button href="/family-worship/history" variant="outline" size="sm">
					<History class="mr-1 size-4" aria-hidden="true" />
					History
				</Button>
			</div>
			{#if data.topicQueue.length === 0 && data.plan.every((week) => !week.plannedTopic && !week.session)}
				<p class="text-muted-foreground border-rule border-y border-dashed py-8 text-center">
					Add topics to the Topic Queue to start planning.
				</p>
			{/if}

			{@render weekList(upcomingWeeks, 'Planned Weeks')}

			{#if unloggedWeeks.length > 0}
				<section class="mt-8" aria-labelledby="unlogged-weeks">
					<h2 id="unlogged-weeks" class="mb-1 text-lg font-semibold">Not logged yet</h2>
					<p class="text-muted-foreground mb-3 text-sm">
						Recent weeks with no session. Log one late, or mark it as skipped.
					</p>
					{@render weekList(unloggedWeeks, 'Weeks not logged')}
				</section>
			{/if}
		</Tabs.Content>

		<Tabs.Content value="queue" class="w-full">
			{#if data.topicQueue.length === 0}
				<div class="border-rule border-y border-dashed px-4 py-12 text-center">
					<BookOpen class="text-pen-worship mx-auto mb-3 size-8" aria-hidden="true" />
					<p class="font-semibold">No topics yet</p>
					<p class="text-muted-foreground mx-auto mt-1 mb-4 max-w-sm text-sm">
						Add the topics you'd like to study. They line up in the Topic Queue, and you can drag
						them into the order you want.
					</p>
					<TopicDialog formData={data.topicForm} instanceId="empty-state" />
				</div>
			{:else}
				<p class="text-muted-foreground mb-3 text-sm">
					Drag topics to set the study order. The top topic is next.
				</p>
				<TopicQueue topics={data.topicQueue} onEdit={editTopic} onDelete={confirmDelete} />
			{/if}
		</Tabs.Content>

		<Tabs.Content value="archived" class="w-full">
			{#if data.archivedTopics.length === 0}
				<div class="border-rule border-y border-dashed py-12 text-center">
					<p class="text-muted-foreground">
						No Archived Topics. Archive a topic to hide it without losing it.
					</p>
				</div>
			{:else}
				<ul class="flex flex-col gap-2.5" aria-label="Archived Topics">
					{#each data.archivedTopics as topic (topic.id)}
						<li>
							<TopicCard {topic}>
								{#snippet actions()}
									<TopicActionButton action="restoreTopic" id={topic.id} label="Restore" />
									<Button
										type="button"
										variant="ghost"
										size="sm"
										class="text-destructive hover:text-destructive"
										onclick={() => confirmDelete(topic)}
									>
										Delete
									</Button>
								{/snippet}
							</TopicCard>
						</li>
					{/each}
				</ul>
			{/if}
		</Tabs.Content>
	</Tabs.Root>

	<section class="max-w-md" aria-labelledby="family-worship-settings">
		<h2 id="family-worship-settings" class="mb-3 text-lg font-semibold">Settings</h2>
		<form method="POST" action="?/setUsualWeekday" use:weekdayEnhance class="flex items-end gap-2">
			<div class="grid flex-1 gap-2">
				<Label for="usual-weekday">Usual Weekday</Label>
				<Select.Root
					type="single"
					name="usualWeekday"
					value={weekdayValue}
					onValueChange={(value) => ($weekdayForm.usualWeekday = Number(value))}
				>
					<Select.Trigger id="usual-weekday" class="w-full">
						{WEEKDAY_NAMES[$weekdayForm.usualWeekday] ?? 'Choose a day'}
					</Select.Trigger>
					<Select.Content>
						{#each WEEKDAY_NAMES as name, index (name)}
							<Select.Item value={String(index)} label={name}>{name}</Select.Item>
						{/each}
					</Select.Content>
				</Select.Root>
				{#if $weekdayErrors.usualWeekday}
					<p class="text-destructive text-sm">{$weekdayErrors.usualWeekday}</p>
				{/if}
			</div>
			<Button
				type="submit"
				disabled={$weekdaySubmitting}
				class="bg-pen-worship hover:bg-pen-worship text-white"
			>
				{$weekdaySubmitting ? 'Saving...' : 'Save'}
			</Button>
		</form>
		<p class="text-muted-foreground mt-2 text-sm">The day you normally hold Family Worship.</p>
	</section>
</PageShell>

{#snippet weekList(weeks: PlannedWeekView[], label: string)}
	<ul class="grid gap-2.5 sm:grid-cols-2" aria-label={label}>
		{#each weeks as week (week.weekStart)}
			<li>
				<PlannedWeekRow
					{week}
					topics={topicOptions}
					onLog={logWeek}
					onEditSession={editSession}
					onSkip={skipWeek}
				/>
			</li>
		{/each}
	</ul>
{/snippet}

<TopicDialog
	bind:open={showEditDialog}
	formData={data.editTopicForm}
	editEntry={topicToEdit}
	instanceId="edit-main"
	onClose={() => {
		showEditDialog = false;
		topicToEdit = null;
	}}
/>

<LogSessionDialog
	bind:open={showLogDialog}
	formData={data.sessionForm}
	topics={topicOptions}
	defaults={logDefaults}
	today={data.today}
	instanceId="plan"
	onClose={() => {
		showLogDialog = false;
	}}
/>

<LogSessionDialog
	bind:open={showEditSessionDialog}
	formData={data.editSessionForm}
	editEntry={sessionToEdit}
	topics={topicOptions}
	today={data.today}
	instanceId="edit-plan"
	onClose={() => {
		showEditSessionDialog = false;
		sessionToEdit = null;
	}}
/>

<SkipWeekDialog
	bind:open={showSkipDialog}
	week={weekToSkip}
	onClose={() => {
		showSkipDialog = false;
		weekToSkip = null;
	}}
/>

<ConfirmDialog
	bind:open={showDeleteDialog}
	title="Delete Topic"
	message={topicToDelete
		? `Delete “${topicToDelete.title}”? This can't be undone. To keep it, archive it instead.`
		: ''}
	confirmButtonText="Delete"
	id={topicToDelete?.id}
	actionUrl="?/deleteTopic"
/>
