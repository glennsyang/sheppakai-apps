<script lang="ts">
	import { ArrowRight, Check, CircleSlash, Lightbulb } from '@lucide/svelte/icons';
	import type { Infer, SuperValidated } from 'sveltekit-superforms';

	import LogSessionDialog from '#lib/components/family-worship/LogSessionDialog.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import type { FamilyWorshipCard, sessionSchema, TopicRef } from '#lib/schemas/family-worship.js';

	interface Props {
		card: FamilyWorshipCard;
		sessionForm: SuperValidated<Infer<typeof sessionSchema>>;
		topics: TopicRef[];
		today: string;
	}

	let { card, sessionForm, topics, today }: Props = $props();

	let dialogOpen = $state(false);
</script>

<section aria-labelledby="family-worship-h" class="min-w-0">
	<div class="ruled mb-1 flex items-baseline gap-3 pb-2">
		<h2 id="family-worship-h" class="text-2xl font-black tracking-tight">Family Worship</h2>
		<span class="text-muted-foreground text-sm">{card.dayLabel}</span>
		<a
			href="/family-worship"
			class="text-pen-worship ml-auto flex items-center gap-1 text-xs font-bold hover:underline"
			>Plan<ArrowRight class="size-3" aria-hidden="true" /></a
		>
	</div>

	<div class="border-rule flex min-h-14 items-center gap-3 border-b py-2">
		{#if card.state === 'done'}
			<Check class="text-pen-worship size-5 shrink-0" aria-hidden="true" />
			<span class="min-w-0 flex-1 truncate font-semibold">{card.topic?.title}</span>
			<span class="text-pen-worship shrink-0 text-sm font-bold">Done</span>
		{:else if card.state === 'skipped'}
			<CircleSlash class="text-muted-foreground size-5 shrink-0" aria-hidden="true" />
			<span class="text-muted-foreground min-w-0 flex-1 truncate">
				Skipped{card.skipReason ? `: ${card.skipReason}` : ''}
			</span>
		{:else}
			{#if card.state === 'suggested'}
				<Lightbulb class="text-pen-worship size-5 shrink-0" aria-hidden="true" />
			{/if}
			<span class="min-w-0 flex-1">
				{#if card.topic}
					<span class="block truncate font-semibold">{card.topic.title}</span>
					{#if card.state === 'suggested'}
						<span class="text-muted-foreground text-xs">Suggested from the Topic Queue</span>
					{/if}
				{:else}
					<span class="text-muted-foreground italic">Nothing planned</span>
				{/if}
			</span>
			<Button
				size="sm"
				class="bg-pen-worship hover:bg-pen-worship shrink-0 text-white"
				disabled={topics.length === 0}
				onclick={() => (dialogOpen = true)}
			>
				We did it
			</Button>
		{/if}
	</div>

	<LogSessionDialog
		formData={sessionForm}
		bind:open={dialogOpen}
		instanceId="dashboard"
		actionPath="/family-worship"
		{topics}
		{today}
		defaults={card.logDefaults}
		onClose={() => (dialogOpen = false)}
	/>
</section>
