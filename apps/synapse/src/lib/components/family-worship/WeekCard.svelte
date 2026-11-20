<script lang="ts">
	import { enhance } from '$app/forms';
	import Check from '@lucide/svelte/icons/check';
	import Pencil from '@lucide/svelte/icons/pencil';
	import X from '@lucide/svelte/icons/x';

	import { Button } from '#lib/components/ui/button/index.js';
	import { formatDateMedium } from '#lib/utils/date.js';
	import {
		getWednesdayOf,
		getWeekStatus,
		type TopicRef,
		type WeekPlan,
		type WorshipSessionSummary
	} from '#lib/utils/family-worship.js';

	import { toastEnhance } from './toast-enhance';

	interface Props {
		week: WeekPlan;
		today: string;
		activeTopics: TopicRef[];
		/** Title lookup for logged sessions (their topic may since be archived). */
		topicTitles: Map<string, string>;
		onLog: (week: WeekPlan) => void;
		onEditSession: (session: WorshipSessionSummary) => void;
	}

	let { week, today, activeTopics, topicTitles, onLog, onEditSession }: Props = $props();

	const status = $derived(getWeekStatus(week, today));
	const isThisWeek = $derived(week.weekOf === getWednesdayOf(today));
	// This week can be logged any day (a study moved to Monday); later weeks cannot yet.
	const canLog = $derived(isThisWeek || status !== 'upcoming');

	const statusLabel = $derived(
		{
			logged: week.session?.status === 'skipped' ? 'Skipped' : 'Done',
			upcoming: 'Upcoming',
			tonight: 'Tonight',
			missed: 'No entry yet'
		}[status]
	);

	const statusClass = $derived(
		{
			logged: week.session?.status === 'skipped' ? 'text-muted-foreground' : 'text-pen-fitness',
			upcoming: 'text-muted-foreground',
			tonight: 'text-pen-worship',
			missed: 'text-pen-warn'
		}[status]
	);

	const sessionTitle = $derived(
		week.session?.topicId ? (topicTitles.get(week.session.topicId) ?? 'Deleted topic') : null
	);

	let changeForm: HTMLFormElement | undefined = $state();
</script>

<li class="border-rule border-b py-3">
	<div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
		<span class="w-28 shrink-0 font-black tabular-nums">{formatDateMedium(week.weekOf)}</span>
		<span class="text-xs font-bold {statusClass}">{statusLabel}</span>
		{#if isThisWeek}
			<span class="text-muted-foreground text-xs">· this week</span>
		{/if}
	</div>

	<div class="mt-1 flex flex-wrap items-center gap-2">
		{#if week.session}
			<span class="min-w-0 flex-1 text-[0.95rem]">
				{#if week.session.status === 'done'}
					{sessionTitle}
				{:else}
					<span class="text-muted-foreground italic">No study this week</span>
				{/if}
				{#if week.session.notes}
					<span class="text-muted-foreground block truncate text-sm">{week.session.notes}</span>
				{/if}
			</span>
			<Button
				variant="ghost"
				size="sm"
				class="min-h-11"
				aria-label="Edit session for {formatDateMedium(week.weekOf)}"
				onclick={() => week.session && onEditSession(week.session)}
			>
				<Pencil class="size-4" />
			</Button>
		{:else}
			<span class="min-w-0 flex-1 text-[0.95rem]">
				{#if week.scheduledTopic}
					{week.scheduledTopic.title}
				{:else if week.suggestedTopic}
					<span class="text-muted-foreground">Suggested:</span>
					<span class="italic">{week.suggestedTopic.title}</span>
				{:else}
					<span class="text-muted-foreground italic">Nothing planned — add topics to rotate</span>
				{/if}
			</span>

			{#if week.suggestedTopic}
				<form
					method="POST"
					action="?/setWeekTopic"
					use:enhance={toastEnhance({
						success: 'Week scheduled.',
						error: 'Failed to schedule week.'
					})}
				>
					<input type="hidden" name="weekOf" value={week.weekOf} />
					<input type="hidden" name="topicId" value={week.suggestedTopic.id} />
					<Button type="submit" variant="outline" size="sm" class="min-h-11">
						<Check class="mr-1 size-4" />Accept
					</Button>
				</form>
			{/if}

			{#if activeTopics.length > 0}
				<form
					bind:this={changeForm}
					method="POST"
					action="?/setWeekTopic"
					use:enhance={toastEnhance({
						success: 'Week scheduled.',
						error: 'Failed to schedule week.'
					})}
				>
					<input type="hidden" name="weekOf" value={week.weekOf} />
					<label class="sr-only" for="week-topic-{week.weekOf}">
						Topic for {formatDateMedium(week.weekOf)}
					</label>
					<select
						id="week-topic-{week.weekOf}"
						name="topicId"
						class="border-input bg-background min-h-11 max-w-44 rounded-md border px-2 text-sm"
						value=""
						onchange={(event) => {
							changeForm?.requestSubmit();
							// The submit has read the choice; show the "Change…" prompt again.
							event.currentTarget.value = '';
						}}
					>
						<option value="" disabled>{week.scheduledTopic ? 'Change…' : 'Pick…'}</option>
						{#each activeTopics as topic (topic.id)}
							<option value={topic.id}>{topic.title}</option>
						{/each}
					</select>
				</form>
			{/if}

			{#if week.scheduledTopic}
				<form
					method="POST"
					action="?/setWeekTopic"
					use:enhance={toastEnhance({ success: 'Week cleared.', error: 'Failed to clear week.' })}
				>
					<input type="hidden" name="weekOf" value={week.weekOf} />
					<Button
						type="submit"
						variant="ghost"
						size="sm"
						class="min-h-11"
						aria-label="Clear {formatDateMedium(week.weekOf)}"
					>
						<X class="size-4" />
					</Button>
				</form>
			{/if}

			{#if canLog}
				<Button
					size="sm"
					class="bg-pen-worship hover:bg-pen-worship min-h-11 text-white"
					onclick={() => onLog(week)}
				>
					Log
				</Button>
			{/if}
		{/if}
	</div>
</li>
