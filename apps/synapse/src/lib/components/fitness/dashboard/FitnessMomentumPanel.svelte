<script lang="ts">
	import { Dumbbell, Scale, UtensilsCrossed } from '@lucide/svelte/icons';

	import * as Card from '#lib/components/ui/card/index.js';
	import * as Tooltip from '#lib/components/ui/tooltip/index.js';
	import type { FitnessInsights } from '#lib/utils/fitness-insights.js';
	import { calorieLegendItems, getCalorieAdherenceClass } from '#lib/utils/weight.js';
	import { getWorkoutChartColor, workoutTypeOptions } from '#lib/utils/workout.js';

	interface Props {
		momentum: FitnessInsights['momentum'];
		calorieTarget: number | null;
	}

	let { momentum, calorieTarget }: Props = $props();

	const workoutColorMap: Record<string, string> = {
		'var(--chart-1)': 'bg-pen-tasks',
		'var(--chart-2)': 'bg-pen-journal',
		'var(--chart-3)': 'bg-pen-mind',
		'var(--chart-4)': 'bg-pen-fitness',
		'var(--chart-5)': 'bg-destructive'
	};

	const workoutLegendItems = workoutTypeOptions
		.filter((option) => option.value !== 'other')
		.map((option) => ({
			label: option.label,
			color: workoutColorMap[option.chartColor] ?? 'bg-muted'
		}));

	const dayData = $derived(
		momentum.days.map((day) => ({
			...day,
			color:
				day.workoutTypes.length > 0
					? (workoutColorMap[getWorkoutChartColor(day.workoutTypes[0])] ?? 'bg-muted')
					: 'bg-muted'
		}))
	);

	// Interpretation sentence
	const interpretation = $derived.by(() => {
		const { workoutDays, weighInDays: weightDays, calorieDays: calDays } = momentum.lastWeek;

		const parts: string[] = [];

		if (workoutDays >= 4) parts.push(`${workoutDays} of 7 days active — solid consistency`);
		else if (workoutDays >= 2) parts.push(`${workoutDays} of 7 days active — building rhythm`);
		else if (workoutDays === 1) parts.push('One session this week — a start to build on');
		else parts.push('No workouts logged yet this week');

		if (weightDays >= 4) parts.push('weight tracked consistently');
		if (calDays >= 5) parts.push('nutrition well logged');

		return parts.join(' · ');
	});
</script>

<Card.Root class="border-rule mb-6 overflow-hidden border p-4 md:p-6">
	<Card.Header class="pb-4">
		<Card.Title class="font-display text-lg font-semibold">14-Day Momentum</Card.Title>
		<Card.Description class="text-muted-foreground">
			Activity, weight check-ins, and calorie adherence across each day
		</Card.Description>
	</Card.Header>

	<Card.Content class="space-y-5">
		<!-- Day labels -->
		<div class="grid grid-cols-14 gap-1" style="grid-template-columns: repeat(14, 1fr);">
			{#each dayData as day (day.date)}
				<div class="text-muted-foreground text-center text-[10px] font-medium">
					{day.initial}
				</div>
			{/each}
		</div>

		<!-- Lane 1: Workout activity -->
		<div>
			<div class="mb-1.5 flex items-center gap-1.5">
				<Dumbbell class="text-muted-foreground h-3 w-3" />
				<span class="text-muted-foreground text-xs font-medium">Activity</span>
			</div>
			<div class="grid gap-1" style="grid-template-columns: repeat(14, 1fr);">
				{#each dayData as day (day.date)}
					<Tooltip.Root>
						<Tooltip.Trigger>
							<div class="h-6 rounded-sm transition-all {day.color}"></div>
						</Tooltip.Trigger>
						<Tooltip.Content>
							{day.workoutTypes.length > 0
								? `${day.label}: ${day.workoutTypes.join(', ')}`
								: day.label}
						</Tooltip.Content>
					</Tooltip.Root>
				{/each}
			</div>
		</div>

		<!-- Lane 2: Weight check-ins -->
		<div>
			<div class="mb-1.5 flex items-center gap-1.5">
				<Scale class="text-muted-foreground h-3 w-3" />
				<span class="text-muted-foreground text-xs font-medium">Weight</span>
			</div>
			<div class="grid gap-1" style="grid-template-columns: repeat(14, 1fr);">
				{#each dayData as day (day.date)}
					<div class="flex items-center justify-center">
						<Tooltip.Root>
							<Tooltip.Trigger>
								<div
									class="h-3 w-3 rounded-full transition-all {day.hasWeighIn
										? 'bg-pen-fitness'
										: 'bg-muted'}"
								></div>
							</Tooltip.Trigger>
							<Tooltip.Content>
								{day.hasWeighIn ? `${day.label}: weighed in` : day.label}
							</Tooltip.Content>
						</Tooltip.Root>
					</div>
				{/each}
			</div>
		</div>

		<!-- Lane 3: Calorie adherence -->
		<div>
			<div class="mb-1.5 flex items-center gap-1.5">
				<UtensilsCrossed class="text-muted-foreground h-3 w-3" />
				<span class="text-muted-foreground text-xs font-medium">Calories</span>
			</div>
			<div class="grid gap-1" style="grid-template-columns: repeat(14, 1fr);">
				{#each dayData as day (day.date)}
					<Tooltip.Root>
						<Tooltip.Trigger>
							<div
								class="h-6 rounded-sm transition-all {getCalorieAdherenceClass(
									day.calories,
									calorieTarget
								)}"
							></div>
						</Tooltip.Trigger>
						<Tooltip.Content>
							{day.calories !== null
								? `${day.label}: ${day.calories} cal`
								: `${day.label}: no data`}
						</Tooltip.Content>
					</Tooltip.Root>
				{/each}
			</div>
		</div>

		<!-- Legend -->
		<div class="border-border flex flex-wrap gap-3 border-t pt-3">
			<!-- Workout type legend items -->
			{#each workoutLegendItems as item (item.label)}
				<div class="flex items-center gap-1.5">
					<div class="h-2.5 w-2.5 rounded-sm {item.color}"></div>
					<span class="text-muted-foreground text-xs">{item.label}</span>
				</div>
			{/each}
			<!-- Calorie legend items -->
			{#each calorieLegendItems as item, index (item.label)}
				<div class="{index === 0 ? 'ml-auto ' : ''}flex items-center gap-1.5">
					<div class="h-2.5 w-2.5 rounded-sm {item.className}"></div>
					<span class="text-muted-foreground text-xs">{item.label}</span>
				</div>
			{/each}
		</div>
	</Card.Content>

	<Card.Footer class="border-rule border-t border-dashed">
		<p class="text-foreground text-xs italic">{interpretation}</p>
	</Card.Footer>
</Card.Root>
