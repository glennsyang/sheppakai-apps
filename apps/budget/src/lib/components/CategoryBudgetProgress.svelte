<script lang="ts">
	import type { CategoryStatus } from '#lib';
	import { formatCurrencyRounded } from '#lib/utils.js';

	interface Props {
		/** From the server's Category Status module; this bar only renders it. */
		status: CategoryStatus;
		color?: string;
	}

	let { status, color }: Props = $props();

	let categoryName = $derived(status.categoryName);
	let spent = $derived(status.spent);
	let budgeted = $derived(status.budgeted);
	let percentage = $derived(Math.round(status.pctUsed));
	let state = $derived(status.state);
</script>

<div class="flex flex-col gap-1.5 px-4 py-2.5 sm:px-5">
	<div class="flex items-center justify-between gap-3 text-sm">
		<span class="flex min-w-0 items-center gap-2">
			<span
				class="size-2 shrink-0 rounded-full"
				style:background={color ?? 'var(--chart-8)'}
				aria-hidden="true"
			></span>
			<span class="truncate font-medium">{categoryName}</span>
		</span>
		<span
			class={[
				'shrink-0 text-xs tabular-nums',
				state === 'over' ? 'text-destructive font-medium' : 'text-muted-foreground'
			]}
		>
			{percentage}% of {formatCurrencyRounded(budgeted)}
		</span>
	</div>
	<div
		class="bg-track h-1.5 overflow-hidden rounded-full"
		role="meter"
		aria-label="{categoryName} spending"
		aria-valuemin={0}
		aria-valuemax={budgeted}
		aria-valuenow={spent}
	>
		<div
			class={[
				'h-full rounded-full transition-[width] duration-500 ease-out',
				state === 'over' && 'bg-destructive',
				state === 'near' && 'bg-warning'
			]}
			style:width="{Math.min(percentage, 100)}%"
			style:background-color={state === 'ok' ? (color ?? 'var(--chart-8)') : undefined}
		></div>
	</div>
</div>
