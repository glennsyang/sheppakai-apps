<script lang="ts" module>
	export type StatTone = 'positive' | 'warning' | 'negative' | 'neutral';

	export interface Stat {
		label: string;
		value: string;
		subtext?: string;
		tooltip?: string;
		tone?: StatTone;
		/** 0–100+ fill for a thin meter under the value. */
		meter?: number;
		trend?: { direction: 'up' | 'down' | 'flat'; label: string };
		/** Makes the stat a button (e.g. to open a drill-down sheet). */
		onclick?: () => void;
		/** Accessible name for the button when `onclick` is set. */
		actionLabel?: string;
	}
</script>

<script lang="ts">
	import ArrowDownRightIcon from '@lucide/svelte/icons/arrow-down-right';
	import ArrowUpRightIcon from '@lucide/svelte/icons/arrow-up-right';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import MinusIcon from '@lucide/svelte/icons/minus';

	import InfoTooltip from '#lib/components/InfoTooltip.svelte';
	import * as Card from '#lib/components/ui/card/index.js';

	let { stats }: { stats: Stat[] } = $props();

	const toneText: Record<StatTone, string> = {
		positive: 'text-positive',
		warning: 'text-warning',
		negative: 'text-destructive',
		neutral: 'text-foreground'
	};
	const toneFill: Record<StatTone, string> = {
		positive: 'bg-positive',
		warning: 'bg-warning',
		negative: 'bg-destructive',
		neutral: 'bg-foreground/50'
	};
</script>

<Card.Root class="gap-0 overflow-hidden py-0">
	<dl class="bg-border flex flex-wrap gap-px">
		{#each stats as stat (stat.label)}
			{@const tone = stat.tone ?? 'neutral'}
			<div
				class={[
					'bg-card relative flex min-w-0 flex-[1_1_calc(50%-1px)] flex-col gap-1 p-4 sm:flex-[1_1_calc(33.333%-1px)] sm:p-5 lg:flex-[1_1_0]',
					stat.onclick &&
						'hover:bg-muted/50 has-[button:focus-visible]:bg-muted/50 transition-colors'
				]}
			>
				<dt class="text-muted-foreground flex items-center gap-1 text-xs">
					{#if stat.onclick}
						<!-- Stretched button: the whole cell is clickable, tooltip stays reachable above it. -->
						<button
							type="button"
							class="focus-visible:ring-ring flex min-w-0 cursor-pointer items-center gap-1 rounded-sm after:absolute after:inset-0 focus-visible:ring-2 focus-visible:outline-none"
							aria-label={stat.actionLabel ?? stat.label}
							onclick={stat.onclick}
						>
							<span class="truncate">{stat.label}</span>
							<ChevronRightIcon class="size-3.5 shrink-0" aria-hidden="true" />
						</button>
					{:else}
						<span class="truncate">{stat.label}</span>
					{/if}
					{#if stat.tooltip}
						<span class="relative z-10 inline-flex"
							><InfoTooltip text={stat.tooltip} size="sm" /></span
						>
					{/if}
				</dt>
				<dd class={['text-xl font-semibold tracking-tight tabular-nums', toneText[tone]]}>
					{stat.value}
				</dd>
				{#if stat.meter !== undefined}
					<div class="bg-track mt-1 h-1 overflow-hidden rounded-full" aria-hidden="true">
						<div
							class={[
								'h-full rounded-full transition-[width] duration-500 ease-out',
								toneFill[tone]
							]}
							style="width: {Math.min(Math.max(stat.meter, 0), 100)}%"
						></div>
					</div>
				{/if}
				{#if stat.subtext}
					<dd class="text-muted-foreground text-xs">{stat.subtext}</dd>
				{/if}
				{#if stat.trend}
					<dd class="text-muted-foreground mt-auto flex items-center gap-1 pt-1 text-xs">
						{#if stat.trend.direction === 'up'}
							<ArrowUpRightIcon class="size-3.5 shrink-0" />
						{:else if stat.trend.direction === 'down'}
							<ArrowDownRightIcon class="size-3.5 shrink-0" />
						{:else}
							<MinusIcon class="size-3.5 shrink-0" />
						{/if}
						<span class="text-pretty">{stat.trend.label}</span>
					</dd>
				{/if}
			</div>
		{/each}
	</dl>
</Card.Root>
