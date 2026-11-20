<script lang="ts">
	import { enhance } from '$app/forms';
	import { ArrowRight, Check } from '@lucide/svelte/icons';

	import { toastEnhance } from '#lib/components/family-worship/toast-enhance.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { formatDateMedium } from '#lib/utils/date.js';
	import { getWeekStatus, plannedTopicOf, type WeekPlan } from '#lib/utils/family-worship.js';

	interface Props {
		week: WeekPlan | null;
		today: string;
		topicTitles: Record<string, string>;
	}

	let { week, today, topicTitles }: Props = $props();

	const status = $derived(week ? getWeekStatus(week, today) : null);
	const planned = $derived(week ? plannedTopicOf(week) : null);

	const statusText = $derived(
		status === 'tonight'
			? 'Tonight'
			: status === 'missed'
				? 'No entry yet this week'
				: status === 'upcoming' && week
					? formatDateMedium(week.weekOf)
					: ''
	);
</script>

<section aria-labelledby="worship-h" class="min-w-0">
	<div class="ruled mb-1 flex items-baseline gap-3 pb-2">
		<h2 id="worship-h" class="text-2xl font-black tracking-tight">Family worship</h2>
		{#if statusText}
			<span
				class={['text-sm font-bold', status === 'missed' ? 'text-pen-warn' : 'text-pen-worship']}
				>{statusText}</span
			>
		{/if}
		<a
			href="/family-worship"
			class="text-pen-worship ml-auto flex items-center gap-1 text-xs font-bold hover:underline"
			>Schedule<ArrowRight class="size-3" aria-hidden="true" /></a
		>
	</div>

	<div class="border-rule flex min-h-14 items-center gap-3 border-b py-2">
		{#if !week}
			<span class="text-muted-foreground flex-1 text-[0.95rem] italic">
				Couldn't load this week's study.
			</span>
		{:else if week.session}
			<Check class="text-pen-fitness size-4 shrink-0" aria-hidden="true" />
			<span class="min-w-0 flex-1 truncate text-[0.95rem]">
				{#if week.session.status === 'done' && week.session.topicId}
					{topicTitles[week.session.topicId] ?? 'Done'}
				{:else}
					<span class="text-muted-foreground italic">Skipped this week</span>
				{/if}
			</span>
			<span class="text-muted-foreground shrink-0 text-sm">Logged</span>
		{:else if planned}
			<span class="min-w-0 flex-1 text-[0.95rem]">
				<span class="block truncate">{planned.title}</span>
				{#if !week.scheduledTopic}
					<span class="text-muted-foreground block text-xs">Suggested from the rotation</span>
				{/if}
			</span>
			<form
				method="POST"
				action="/family-worship?/logSession"
				use:enhance={toastEnhance({ success: 'Session logged.', error: 'Failed to log session.' })}
			>
				<input type="hidden" name="status" value="done" />
				<input type="hidden" name="date" value={today} />
				<input type="hidden" name="topicId" value={planned.id} />
				<Button type="submit" class="bg-pen-worship hover:bg-pen-worship min-h-11 text-white">
					We did it
				</Button>
			</form>
		{:else}
			<span class="text-muted-foreground flex-1 text-[0.95rem] italic"> No topics yet. </span>
			<Button href="/family-worship?tab=topics" variant="outline" size="sm" class="min-h-11">
				Add topics
			</Button>
		{/if}
	</div>
</section>
