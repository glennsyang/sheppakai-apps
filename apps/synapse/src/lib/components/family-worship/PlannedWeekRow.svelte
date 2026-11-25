<script lang="ts">
	import { Check, CircleSlash, Lightbulb } from '@lucide/svelte/icons';
	import { tick } from 'svelte';

	import { Button } from '#lib/components/ui/button/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import type { PlannedWeekView, SessionEntry } from '#lib/schemas/family-worship.js';
	import { formatDateMedium } from '#lib/utils/date.js';

	import WeekActionForm from './WeekActionForm.svelte';

	/** One week of the plan: its topic (or the suggestion), its session or its skip. */
	interface Props {
		week: PlannedWeekView;
		topics: { id: string; title: string }[];
		onLog: (week: PlannedWeekView) => void;
		onEditSession: (session: SessionEntry) => void;
		onSkip: (week: PlannedWeekView) => void;
	}

	let { week, topics, onLog, onEditSession, onSkip }: Props = $props();

	const dateLabel = $derived(formatDateMedium(week.date));
	const canPlan = $derived(!week.session && !week.skip);
	// Sessions can't be dated in the future, so only this week and past weeks can be logged.
	const canLog = $derived(canPlan && (week.isPast || week.isCurrent));

	let pickerForm = $state<HTMLFormElement>();
	let pickedTopicId = $state('');

	async function pickTopic(topicId: string) {
		pickedTopicId = topicId;
		await tick();
		pickerForm?.requestSubmit();
	}
</script>

<article
	class="bg-card rounded-[3px] border-[1.5px] p-3.5 {week.isCurrent ? 'border-pen-worship' : ''}"
	aria-label="Week of {dateLabel}"
>
	<header class="flex flex-wrap items-center gap-2">
		<h3 class="font-display text-sm font-semibold tracking-wide uppercase">{dateLabel}</h3>
		{#if week.isCurrent}
			<span class="bg-pen-worship rounded-[2px] px-1.5 py-0.5 text-xs font-semibold text-white">
				This week
			</span>
		{:else if week.isPast}
			<span
				class="bg-muted text-muted-foreground rounded-[2px] px-1.5 py-0.5 text-xs font-semibold"
			>
				Not logged
			</span>
		{/if}
	</header>

	<div class="mt-2 min-w-0">
		{#if week.session}
			<p class="flex items-start gap-1.5 font-semibold break-words">
				<Check class="text-pen-worship mt-0.5 size-4 shrink-0" aria-hidden="true" />
				<a href="/family-worship/topics/{week.session.topicId}" class="hover:underline">
					{week.session.topicTitle}
				</a>
			</p>
			<p class="text-muted-foreground text-sm">
				Held {formatDateMedium(week.session.date)}{week.session.note
					? ` · ${week.session.note}`
					: ''}
			</p>
		{:else if week.skip}
			<p class="text-muted-foreground flex items-center gap-1.5">
				<CircleSlash class="size-4 shrink-0" aria-hidden="true" />
				Skipped{week.skip.reason ? `: ${week.skip.reason}` : ''}
			</p>
		{:else if week.plannedTopic}
			<a
				href="/family-worship/topics/{week.plannedTopic.id}"
				class="font-semibold break-words hover:underline"
			>
				{week.plannedTopic.title}
			</a>
		{:else if week.suggestion}
			<p class="text-muted-foreground flex items-start gap-1.5 break-words">
				<Lightbulb class="text-pen-worship mt-0.5 size-4 shrink-0" aria-hidden="true" />
				<span><span class="sr-only">Suggestion: </span>{week.suggestion.title}</span>
			</p>
		{:else}
			<p class="text-muted-foreground text-sm">
				{week.isPast ? 'Nothing was planned.' : 'Nothing planned.'}
			</p>
		{/if}
	</div>

	<div class="mt-3 flex flex-wrap items-center gap-1.5">
		{#if week.suggestion && canPlan}
			<WeekActionForm
				action="planWeek"
				weekStart={week.weekStart}
				fields={{ topicId: week.suggestion.id }}
			>
				{#snippet children({ submitting })}
					<Button
						type="submit"
						size="sm"
						disabled={submitting}
						class="bg-pen-worship hover:bg-pen-worship text-white"
					>
						Accept
					</Button>
				{/snippet}
			</WeekActionForm>
		{/if}

		{#if canLog}
			<Button type="button" size="sm" variant="outline" onclick={() => onLog(week)}>
				Log session
			</Button>
		{/if}

		{#if canPlan && topics.length > 0}
			<WeekActionForm
				action="planWeek"
				weekStart={week.weekStart}
				fields={{ topicId: pickedTopicId }}
				bind:formElement={pickerForm}
			>
				<Select.Root
					type="single"
					value={week.plannedTopic?.id ?? ''}
					onValueChange={(value) => value && pickTopic(value)}
				>
					<Select.Trigger
						size="sm"
						class="h-8"
						aria-label="{week.plannedTopic ? 'Change' : 'Choose'} topic for the week of {dateLabel}"
					>
						{week.plannedTopic ? 'Change' : 'Choose topic'}
					</Select.Trigger>
					<Select.Content>
						{#each topics as topic (topic.id)}
							<Select.Item value={topic.id} label={topic.title}>{topic.title}</Select.Item>
						{/each}
					</Select.Content>
				</Select.Root>
			</WeekActionForm>
		{/if}

		{#if week.plannedTopic && canPlan}
			<WeekActionForm action="clearWeek" weekStart={week.weekStart}>
				{#snippet children({ submitting })}
					<Button type="submit" size="sm" variant="ghost" disabled={submitting}>Clear</Button>
				{/snippet}
			</WeekActionForm>
		{/if}

		{#if canPlan}
			<Button type="button" size="sm" variant="ghost" onclick={() => onSkip(week)}>Skip</Button>
		{/if}

		{#if week.skip}
			<WeekActionForm action="unskipWeek" weekStart={week.weekStart}>
				{#snippet children({ submitting })}
					<Button type="submit" size="sm" variant="ghost" disabled={submitting}>Undo skip</Button>
				{/snippet}
			</WeekActionForm>
			{#if week.isPast || week.isCurrent}
				<Button type="button" size="sm" variant="outline" onclick={() => onLog(week)}>
					Log session
				</Button>
			{/if}
		{/if}

		{#if week.session}
			<Button
				type="button"
				size="sm"
				variant="ghost"
				onclick={() => week.session && onEditSession(week.session)}
			>
				Edit session
			</Button>
		{/if}
	</div>
</article>
