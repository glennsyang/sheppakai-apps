<script lang="ts">
	import { BarChart } from 'layerchart';
	import type { Infer, SuperValidated } from 'sveltekit-superforms';

	import LogMealDialog from '#lib/components/fitness/dialogs/LogMealDialog.svelte';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Chart from '#lib/components/ui/chart/index.js';
	import type { logMealSchema } from '#lib/schemas/fitness.js';
	import type { FitnessInsights } from '#lib/utils/fitness-insights.js';

	import FitnessStatusCard from './FitnessStatusCard.svelte';

	interface Props {
		insights: FitnessInsights['nutrition'];
		hasFoodEntries: boolean;
		mealForm: SuperValidated<Infer<typeof logMealSchema>>;
	}

	let { insights, hasFoodEntries, mealForm }: Props = $props();

	const target = $derived(insights.target);
	const todayCalories = $derived(insights.todayCalories);
	const todayPercentage = $derived(insights.todayAdherence);
	const todayRemaining = $derived(insights.todayRemaining);
	const todayOver = $derived(insights.todayOver);
	const sevenDayAvg = $derived(insights.sevenDayAvg);
	const avgDelta = $derived(insights.avgDeltaVsTarget);
	const topMealPeriod = $derived(insights.topMealPeriod);

	const chartConfig = {
		calories: { label: 'Calories', color: 'var(--chart-2)' }
	} satisfies Chart.ChartConfig;
</script>

<section class="mb-2 space-y-4">
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-2">
			<LogMealDialog formData={mealForm} instanceId="nutrition" />
		</div>
	</div>

	<!-- Insight cards -->
	<div
		class="border-foreground divide-rule grid grid-cols-2 gap-x-4 border-y-2 md:grid-cols-4 md:gap-x-0 md:divide-x"
	>
		<FitnessStatusCard
			label="Today"
			value={todayCalories}
			unit="cal"
			trend={todayPercentage != null
				? todayPercentage >= 85 && todayPercentage <= 110
					? 'positive'
					: todayPercentage > 110
						? 'negative'
						: 'neutral'
				: 'neutral'}
			trendLabel={todayPercentage != null ? `${todayPercentage}% of target` : 'No target set'}
		/>
		<FitnessStatusCard
			label="Remaining"
			value={todayOver != null ? `+${todayOver}` : (todayRemaining ?? '—')}
			unit={target ? 'cal' : ''}
			trend={todayOver != null ? 'negative' : 'positive'}
			trendLabel={todayOver != null
				? 'Over target'
				: todayRemaining != null
					? 'Under target'
					: 'Set a target'}
		/>
		<FitnessStatusCard
			label="7-day avg"
			value={sevenDayAvg ?? '—'}
			unit={sevenDayAvg ? 'cal/day' : ''}
			trendLabel={avgDelta != null
				? avgDelta > 0
					? `${avgDelta} cal over target avg`
					: `${Math.abs(avgDelta)} cal under target avg`
				: undefined}
			trend={avgDelta != null
				? Math.abs(avgDelta) < 100
					? 'positive'
					: avgDelta > 200
						? 'negative'
						: 'neutral'
				: 'neutral'}
		/>
		<FitnessStatusCard
			label="Top food"
			value={topMealPeriod ? topMealPeriod.charAt(0).toUpperCase() + topMealPeriod.slice(1) : '—'}
			trendLabel={topMealPeriod ? 'Most logged food' : 'Log food to see'}
		/>
	</div>

	<!-- 7-day calorie adherence chart -->
	{#if hasFoodEntries}
		<Card.Root class="bg-card dark:bg-muted border-0 dark:shadow-zinc-800/50">
			<Card.Header>
				<Card.Title class="text-foreground dark:text-muted-foreground text-sm font-medium">
					7-Day Calorie Overview
				</Card.Title>
				<Card.Description class="text-muted-foreground dark:text-muted-foreground text-xs">
					Daily intake{target ? ` vs ${target} cal target` : ''}
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<Chart.Container config={chartConfig} class="h-36 w-full">
					<BarChart
						data={insights.lastSevenDays}
						x="day"
						series={[{ key: 'calories', label: 'Calories', color: chartConfig.calories.color }]}
					>
						{#snippet tooltip()}
							<Chart.Tooltip indicator="dot" />
						{/snippet}
					</BarChart>
				</Chart.Container>
			</Card.Content>
		</Card.Root>
	{/if}
</section>
