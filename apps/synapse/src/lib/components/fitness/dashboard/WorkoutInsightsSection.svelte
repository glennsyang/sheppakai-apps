<script lang="ts">
	import type { Infer, SuperValidated } from 'sveltekit-superforms';

	import WorkoutFrequencyChart from '#lib/components/fitness/analytics/WorkoutFrequencyChart.svelte';
	import LogWorkoutDialog from '#lib/components/fitness/dialogs/LogWorkoutDialog.svelte';
	import type { logWorkoutSchema } from '#lib/schemas/fitness.js';
	import type { FitnessInsights } from '#lib/utils/fitness-insights.js';

	import FitnessStatusCard from './FitnessStatusCard.svelte';

	interface Props {
		insights: FitnessInsights['workouts'];
		hasWorkouts: boolean;
		workoutForm: SuperValidated<Infer<typeof logWorkoutSchema>>;
	}

	let { insights, hasWorkouts, workoutForm }: Props = $props();
</script>

<section class="mb-2 space-y-4">
	<div class="flex items-center justify-between">
		<LogWorkoutDialog formData={workoutForm} instanceId="insights" />
	</div>

	<!-- Insight cards -->
	<div
		class="border-foreground divide-rule grid grid-cols-2 gap-x-4 border-y-2 md:grid-cols-4 md:gap-x-0 md:divide-x"
	>
		<FitnessStatusCard
			label="This week"
			value={insights.weeklyCount}
			unit="sessions"
			trend={insights.weeklyCount >= 3
				? 'positive'
				: insights.weeklyCount >= 1
					? 'neutral'
					: 'negative'}
			trendLabel={insights.weeklyCount >= 3
				? 'Strong week'
				: insights.weeklyCount >= 1
					? 'Keep going'
					: 'Start your week'}
		/>
		<FitnessStatusCard
			label="Streak"
			value={insights.dayStreak}
			unit={insights.dayStreak === 1 ? 'day' : 'days'}
			trend={insights.dayStreak >= 3 ? 'positive' : 'neutral'}
			trendLabel={insights.dayStreak >= 3
				? 'On a roll'
				: insights.dayStreak > 0
					? 'Keep it up'
					: 'Start today'}
		/>
		<FitnessStatusCard
			label="Avg session"
			value={insights.avgDurationMinutes || '—'}
			unit={insights.avgDurationMinutes ? 'min' : ''}
		/>
		<FitnessStatusCard
			label="Best day"
			value={insights.mostConsistentDay ?? '—'}
			trendLabel={insights.mostConsistentDay ? 'Most active day' : 'Log workouts to see'}
		/>
	</div>

	<!-- Frequency chart (full width) -->
	<WorkoutFrequencyChart
		weeklyFrequency={insights.weeklyFrequency}
		weeklyStreak={insights.weeklyStreak}
		{hasWorkouts}
	/>
</section>
