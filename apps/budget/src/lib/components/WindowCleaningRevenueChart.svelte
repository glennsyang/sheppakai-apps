<script lang="ts">
	import { scaleBand } from 'd3-scale';
	import { BarChart, Highlight } from 'layerchart';

	import * as Chart from '#lib/components/ui/chart/index.js';

	interface Props {
		chartData: { month: string; earned: number }[];
	}

	let { chartData }: Props = $props();

	const chartConfig = {
		earned: { label: 'Earned', color: 'var(--positive)' }
	} satisfies Chart.ChartConfig;

	const cad = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' });
</script>

<Chart.Container config={chartConfig} class="aspect-auto h-48 w-full">
	<BarChart
		data={chartData}
		xScale={scaleBand().padding(0.35)}
		x="month"
		y="earned"
		yNice={4}
		yBaseline={0}
		c={() => 'var(--positive)'}
		cRange={['var(--positive)']}
		axis="x"
		rule
		props={{
			bars: { stroke: 'none', radius: 3, fillOpacity: 0.85 },
			highlight: { area: { fill: 'none' } },
			xAxis: {
				format: (d: string) => d.slice(0, 3),
				tickLabelProps: { class: 'fill-muted-foreground text-[0.6875rem]' }
			},
			rule: { class: 'stroke-border' }
		}}
	>
		{#snippet belowMarks()}
			<Highlight area={{ class: 'fill-muted' }} />
		{/snippet}
		{#snippet tooltip()}
			<Chart.Tooltip class="w-44">
				{#snippet formatter({ value })}
					<div class="bg-positive size-2 shrink-0 rounded-full"></div>
					Earned
					<div class="ms-auto font-medium tabular-nums">{cad.format(value as number)}</div>
				{/snippet}
			</Chart.Tooltip>
		{/snippet}
	</BarChart>
</Chart.Container>
