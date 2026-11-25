<script lang="ts">
	import { enhance } from '$app/forms';
	import { refreshAll } from '$app/navigation';
	import { actionMessage } from '@sheppakai/shared/action-message';
	import { toast } from 'svelte-sonner';

	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Separator from '#lib/components/ui/separator/index.js';
	import type { UpcomingBill } from '#lib/types.js';
	import { formatCurrency } from '#lib/utils.js';

	interface Props {
		upcomingBills: UpcomingBill[];
	}

	let { upcomingBills }: Props = $props();

	let togglingId = $state<string | null>(null);

	function dueLabel({ daysUntilDue, overdue }: UpcomingBill): string {
		if (overdue) {
			const overdueDays = Math.abs(daysUntilDue);
			return `Overdue Bill · ${overdueDays} day${overdueDays === 1 ? '' : 's'}`;
		}
		if (daysUntilDue === 0) return 'Due today';
		if (daysUntilDue === 1) return 'Due tomorrow';
		return `Due in ${daysUntilDue} days`;
	}

	function badgeClass({ daysUntilDue, overdue }: UpcomingBill): string {
		if (overdue) return 'bg-destructive hover:bg-destructive text-white';
		if (daysUntilDue <= 1) return 'bg-amber-500 hover:bg-amber-500 text-white';
		return 'bg-muted-foreground/30 hover:bg-muted-foreground/30 text-white';
	}
</script>

<Card.Root>
	<Card.Header class="pb-3">
		<Card.Title class="text-base tracking-tight">Upcoming recurring bills</Card.Title>
	</Card.Header>
	<Card.Content class="pt-0">
		{#if upcomingBills.length === 0}
			<p class="text-muted-foreground py-4 text-center text-sm">No recurring bills due soon</p>
		{:else}
			<div>
				{#each upcomingBills as upcoming, i (upcoming.bill.id)}
					{@const item = upcoming.bill}
					{#if i > 0}
						<Separator.Root class="my-0" />
					{/if}
					<div class="flex flex-wrap items-center justify-between gap-2 py-2.5">
						<p class="text-sm font-medium">{item.merchant}</p>
						<div class="flex items-center gap-2">
							<Badge class="text-xs {badgeClass(upcoming)}">{dueLabel(upcoming)}</Badge>
							<span class="text-sm font-semibold tabular-nums">{formatCurrency(item.amount)}</span>
							<form
								method="POST"
								action="/recurring-bills?/togglePaid"
								use:enhance={() => {
									togglingId = item.id;
									return async ({ result, update }) => {
										if (result.type === 'success') {
											await refreshAll();
										} else {
											const { text } = actionMessage(result, {
												success: 'Marked as paid',
												error: 'Failed to mark as paid'
											});
											toast.error(text);
										}
										// Stay on this page even when the action lives on another route (SvelteKit 3 navigates by default).
										await update({ navigate: false });
										togglingId = null;
									};
								}}
							>
								<input type="hidden" name="id" value={item.id} />
								<input type="hidden" name="paid" value="true" />
								<Button
									type="submit"
									size="sm"
									variant="outline"
									class="h-7 px-2 text-xs"
									disabled={togglingId === item.id}
								>
									{togglingId === item.id ? 'Saving...' : 'Mark Paid'}
								</Button>
							</form>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</Card.Content>
</Card.Root>
