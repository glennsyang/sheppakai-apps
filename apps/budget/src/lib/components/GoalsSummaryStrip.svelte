<script lang="ts">
	import { CheckIcon, ChevronRightIcon, PauseIcon, TargetIcon } from '@lucide/svelte/icons';

	import * as Card from '#lib/components/ui/card/index.js';
	import type { SavingsGoalWithEta } from '#lib/types.js';
	import { formatCurrency, monthNames } from '#lib/utils.js';
	import { formatLocalTimestamp } from '#lib/utils/dates.js';

	interface Props {
		goals: SavingsGoalWithEta[];
	}

	let { goals }: Props = $props();

	const statusOrder: Record<SavingsGoalWithEta['status'], number> = {
		active: 0,
		paused: 1,
		completed: 2,
		archived: 3
	};

	let sortedGoals = $derived(
		[...goals].sort((a, b) => statusOrder[a.status] - statusOrder[b.status])
	);

	/** "2027-03-14" → "Mar 2027" */
	function formatMonthYear(date: string): string {
		const [year, month] = date.split('-').map(Number);
		return `${monthNames[month - 1]?.slice(0, 3) ?? ''} ${year}`;
	}

	function barColor(goal: SavingsGoalWithEta) {
		if (goal.status === 'completed') return 'bg-positive';
		if (goal.status === 'paused') return 'bg-muted-foreground/40';
		return 'bg-positive/80';
	}
</script>

<Card.Root>
	<Card.Header class="pb-3">
		<div class="flex items-center justify-between">
			<Card.Title class="text-base tracking-tight">Savings goals</Card.Title>
			<a
				href="/savings/goals"
				class="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs transition-colors"
			>
				View all <ChevronRightIcon class="size-3.5" />
			</a>
		</div>
	</Card.Header>
	<Card.Content class="pt-0">
		{#if sortedGoals.length === 0}
			<div class="flex flex-col items-center gap-2 py-6 text-center">
				<TargetIcon class="text-muted-foreground/40 size-8" />
				<p class="text-muted-foreground text-sm">No savings goals yet</p>
				<a href="/savings/goals" class="text-primary text-xs hover:underline">Create a goal →</a>
			</div>
		{:else}
			<ul class="grid gap-x-8 gap-y-5 sm:grid-cols-2">
				{#each sortedGoals as goal (goal.id)}
					<li>
						<a
							href="/savings/goals"
							class="group focus-visible:ring-ring/50 block rounded-md outline-none focus-visible:ring-[3px]"
						>
							<span class="flex items-baseline justify-between gap-3 text-sm">
								<span class="flex min-w-0 items-center gap-1.5 font-medium">
									<span
										class="truncate group-hover:underline group-hover:underline-offset-4"
										title={goal.name}>{goal.name}</span
									>
									{#if goal.status === 'completed'}
										<CheckIcon class="text-positive size-3.5 shrink-0" aria-label="Completed" />
									{:else if goal.status === 'paused'}
										<span
											class="text-muted-foreground flex shrink-0 items-center gap-0.5 text-xs font-normal"
										>
											<PauseIcon class="size-3" /> Paused
										</span>
									{/if}
								</span>
								<span class="text-muted-foreground shrink-0 text-xs tabular-nums"
									>{Math.round(goal.percentage)}%</span
								>
							</span>
							<span
								class="bg-track mt-2 block h-1.5 overflow-hidden rounded-full"
								aria-hidden="true"
							>
								<span
									class={['block h-full rounded-full', barColor(goal)]}
									style="width: {Math.min(goal.percentage, 100)}%"
								></span>
							</span>
							<span
								class="text-muted-foreground mt-1.5 flex justify-between gap-3 text-xs tabular-nums"
							>
								<span
									><span class="text-foreground font-medium"
										>{formatCurrency(goal.currentAmount)}</span
									>
									of {formatCurrency(goal.targetAmount)}</span
								>
								{#if goal.targetDate}<span>by {formatLocalTimestamp(goal.targetDate)}</span>{/if}
							</span>
							{#if goal.status === 'active' && goal.percentage < 100}
								<span class="mt-1 flex justify-between gap-3 text-xs tabular-nums">
									{#if goal.etaDate}
										<span class="text-muted-foreground">
											Done ~{formatMonthYear(goal.etaDate)} at {formatCurrency(goal.monthlyRate)}/mo
										</span>
									{:else}
										<span class="text-muted-foreground">No contributions in 6 months</span>
									{/if}
									{#if goal.onTrack === false}
										<span class="text-destructive font-medium">Behind target</span>
									{/if}
								</span>
							{/if}
						</a>
					</li>
				{/each}
			</ul>
		{/if}
	</Card.Content>
</Card.Root>
