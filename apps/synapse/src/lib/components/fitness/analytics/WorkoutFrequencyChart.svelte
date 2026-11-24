<script lang="ts">
	import { BarChart } from 'layerchart';

	import * as Card from '#lib/components/ui/card/index.js';
	import * as Chart from '#lib/components/ui/chart/index.js';
	import type { WeeklyFrequency } from '#lib/utils/fitness-insights.js';
	import { workoutTypeOptions } from '#lib/utils/workout.js';

	interface Props {
		/** Oldest week first, from Fitness Insights. */
		weeklyFrequency: WeeklyFrequency[];
		weeklyStreak: number;
		hasWorkouts: boolean;
	}

	let { weeklyFrequency, weeklyStreak, hasWorkouts }: Props = $props();

	// Dynamic chart config based on workout type options
	const chartConfig = Object.fromEntries(
		workoutTypeOptions.map((option) => [
			option.value,
			{ label: option.label, color: option.chartColor }
		])
	) satisfies Chart.ChartConfig;

	const chartData = $derived(
		weeklyFrequency.map((week) => ({ week: week.label, ...week.byType, total: week.total }))
	);

	const totalThisWeek = $derived(weeklyFrequency.at(-1)?.total ?? 0);
</script>

<Card.Root>
	<Card.Header>
		<Card.Title class="font-display">Weekly Frequency</Card.Title>
		<Card.Description>Workouts per week over the last 8 weeks</Card.Description>
	</Card.Header>
	<Card.Content>
		{#if !hasWorkouts}
			<div
				class="text-muted-foreground flex h-48 items-center justify-center rounded-lg border border-dashed text-sm"
			>
				Log workouts to see your weekly frequency
			</div>
		{:else}
			<Chart.Container config={chartConfig} class="h-48 w-full">
				<BarChart
					data={chartData}
					x="week"
					series={workoutTypeOptions.map((option) => ({
						key: option.value,
						label: option.label,
						color: chartConfig[option.value].color
					}))}
					seriesLayout="stack"
					props={{
						xAxis: {
							format: (v: string) => v
						}
					}}
				>
					{#snippet tooltip()}
						<Chart.Tooltip indicator="dot" />
					{/snippet}
				</BarChart>
			</Chart.Container>
		{/if}
	</Card.Content>
	<Card.Footer class="text-muted-foreground flex justify-between border-t pt-4 text-sm">
		<span>This week: <span class="text-foreground font-medium">{totalThisWeek}</span></span>
		<span>
			Weekly streak: <span class="text-foreground font-medium">{weeklyStreak}</span>
			{weeklyStreak === 1 ? 'week' : 'weeks'}
		</span>
	</Card.Footer>
</Card.Root>
