<script lang="ts">
	import { Minus, Target, TrendingDown, TrendingUp } from '@lucide/svelte/icons';
	import type { Infer, SuperValidated } from 'sveltekit-superforms';

	import LogWeightDialog from '#lib/components/fitness/dialogs/LogWeightDialog.svelte';
	import WeightChart from '#lib/components/fitness/WeightChart.svelte';
	import type { logWeightSchema } from '#lib/schemas/fitness.js';
	import type { FitnessInsights } from '#lib/utils/fitness-insights.js';

	import FitnessStatusCard from './FitnessStatusCard.svelte';

	interface WeightEntry {
		id: string;
		date: string;
		time: string | null;
		weightLbs: number;
		createdAt: Date;
	}

	interface GoalWeight {
		targetWeightLbs: number;
	}

	interface Props {
		weightEntries: WeightEntry[];
		insights: FitnessInsights['weight'];
		goalWeight: GoalWeight | null | undefined;
		weightForm: SuperValidated<Infer<typeof logWeightSchema>>;
	}

	let { weightEntries, insights, goalWeight, weightForm }: Props = $props();

	const weeklyRate = $derived(insights.weeklyRate);
	const weeksToGoal = $derived(insights.weeksToGoal);

	const trendIcon = $derived(
		insights.direction === 'down' ? TrendingDown : insights.direction === 'up' ? TrendingUp : Minus
	);

	const remainingTrend = $derived(
		!insights.remainingToGoal
			? 'neutral'
			: insights.remainingToGoal < 0
				? 'positive'
				: insights.direction === 'down'
					? 'positive'
					: 'neutral'
	);
</script>

<section class="mb-2 space-y-4">
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-2">
			<LogWeightDialog formData={weightForm} instanceId="weight" />
		</div>
	</div>

	<!-- Stat rail -->
	<div
		class="border-foreground divide-rule grid grid-cols-2 gap-x-4 border-y-2 md:grid-cols-4 md:gap-x-0 md:divide-x"
	>
		<FitnessStatusCard
			label="Current"
			value={insights.currentWeight ?? '—'}
			unit={insights.currentWeight ? 'lbs' : ''}
		/>
		<FitnessStatusCard
			label="Goal"
			value={goalWeight?.targetWeightLbs ?? '—'}
			unit={goalWeight ? 'lbs' : ''}
			trendLabel={goalWeight ? 'Target set' : 'Set a goal'}
		/>
		<FitnessStatusCard
			label="To go"
			value={insights.remainingToGoal != null ? Math.abs(insights.remainingToGoal).toFixed(1) : '—'}
			unit={insights.remainingToGoal != null ? 'lbs' : ''}
			trend={remainingTrend}
			trendLabel={insights.remainingToGoal && insights.remainingToGoal < 0
				? 'Past goal weight'
				: undefined}
		/>
		<FitnessStatusCard
			label="Pace"
			value={weeklyRate != null ? Math.abs(weeklyRate).toFixed(1) : '—'}
			unit={weeklyRate != null ? 'lbs/wk' : ''}
			trend={weeklyRate != null && weeklyRate < 0
				? 'positive'
				: weeklyRate != null && weeklyRate > 0
					? 'negative'
					: 'neutral'}
			trendLabel={weeksToGoal != null ? `~${weeksToGoal} weeks to goal` : undefined}
		/>
	</div>

	<!-- Weight chart -->
	{#if weightEntries.length === 0}
		<div
			class="border-border dark:border-border flex h-40 items-center justify-center rounded-2xl border border-dashed"
		>
			<p class="text-muted-foreground dark:text-muted-foreground text-sm">
				No weight data yet — start logging to see your trend
			</p>
		</div>
	{:else}
		<WeightChart
			title="Weight Trend"
			description="Your weight over time with goal reference"
			entries={weightEntries}
			goalWeight={goalWeight?.targetWeightLbs ?? null}
		/>
	{/if}
</section>
