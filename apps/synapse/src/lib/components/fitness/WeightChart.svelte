<script lang="ts">
	import { TrendingDown, TrendingUp } from '@lucide/svelte/icons';
	import { scaleUtc } from 'd3-scale';
	import { curveMonotoneX } from 'd3-shape';
	import { AnnotationLine, LineChart, Points, Spline } from 'layerchart';

	import * as Card from '#lib/components/ui/card/index.js';
	import * as Chart from '#lib/components/ui/chart/index.js';
	import { toWeightTrendSeries, weightYDomain } from '#lib/utils/weight-trend.js';

	interface Props {
		title: string;
		description: string;
		entries: WeightEntry[];
		goalWeight: number | null;
	}

	interface WeightEntry {
		id: string;
		date: string;
		time: string | null;
		weightLbs: number;
		createdAt: Date;
	}

	let { title, description, entries, goalWeight }: Props = $props();

	const chartData = $derived(toWeightTrendSeries(entries));
	const yDomain = $derived(
		weightYDomain(
			chartData.map((d) => d.weight),
			goalWeight
		)
	);
	const showGoalLine = $derived(
		goalWeight != null && goalWeight >= yDomain[0] && goalWeight <= yDomain[1]
	);

	const chartConfig = {
		weight: { label: 'Weight', color: 'var(--chart-2)' },
		trend: { label: '7-entry avg', color: 'var(--chart-1)' }
	} satisfies Chart.ChartConfig;
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{title}</Card.Title>
		<Card.Description>{description}</Card.Description>
	</Card.Header>
	<Card.Content>
		<Chart.Container config={chartConfig}>
			<LineChart
				data={chartData}
				x="date"
				xScale={scaleUtc()}
				{yDomain}
				legend
				tooltipContext={{ mode: 'bisect-x' }}
				series={[
					{ key: 'trend', label: chartConfig.trend.label, color: chartConfig.trend.color },
					{ key: 'weight', label: chartConfig.weight.label, color: chartConfig.weight.color }
				]}
				props={{
					highlight: { points: { r: 6, motion: 'none' } },
					xAxis: {
						format: (v: Date) => v.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
					}
				}}
			>
				{#snippet marks()}
					{#if showGoalLine && goalWeight != null}
						<AnnotationLine
							y={goalWeight}
							label="Goal"
							labelPlacement="top-right"
							props={{
								line: {
									// override the container's `[&_.lc-line]:stroke-border/50` grid styling
									class: 'stroke-muted-foreground! [stroke-dasharray:6_4]',
									strokeWidth: 1.5
								},
								label: { class: 'fill-muted-foreground text-xs' }
							}}
						/>
					{/if}
					<Spline
						seriesKey="weight"
						curve={curveMonotoneX}
						strokeWidth={1.5}
						stroke={chartConfig.weight.color}
						class="opacity-60"
						motion="tween"
					/>
					<Spline
						seriesKey="trend"
						curve={curveMonotoneX}
						strokeWidth={3}
						stroke={chartConfig.trend.color}
						motion="tween"
					/>
					<Points
						seriesKey="weight"
						r={4}
						fill={chartConfig.weight.color}
						class="stroke-card stroke-2"
					/>
				{/snippet}
				{#snippet tooltip()}
					<Chart.Tooltip
						labelFormatter={(v: Date) => {
							return v.toLocaleDateString('en-US', {
								month: 'short',
								day: 'numeric'
							});
						}}
						indicator="dot"
					/>
				{/snippet}
			</LineChart>
		</Chart.Container>
	</Card.Content>
	<Card.Footer>
		<div class="flex w-full items-start gap-2 text-sm">
			<div class="grid gap-2">
				<div class="flex justify-evenly gap-4">
					{#if goalWeight}
						<div class="">
							<p class="text-muted-foreground text-xs">Goal</p>
							<p class="text-sm font-semibold">{goalWeight} lbs</p>
						</div>
					{/if}
					<div class="">
						<p class="text-muted-foreground text-xs">Latest</p>
						<p class="text-sm font-semibold">{entries[0].weightLbs} lbs</p>
					</div>
					{#if entries.length >= 2}
						{@const change = entries[0].weightLbs - entries[entries.length - 1].weightLbs}
						<div class="flex items-center gap-1 text-sm font-semibold">
							{#if change < 0}
								<span class="text-pen-fitness"
									>Trending down by {Math.abs(change).toFixed(1)} lbs</span
								>
								<TrendingDown class="text-pen-fitness size-4" />
							{:else if change > 0}
								<span class="text-destructive">Trending up by {change.toFixed(1)} lbs</span>
								<TrendingUp class="text-destructive size-4" />
							{:else}
								<span>No change</span>
							{/if}
						</div>
					{/if}
				</div>
			</div>
		</div>
	</Card.Footer>
</Card.Root>
