<script lang="ts">
	import { enhance } from '$app/forms';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import { actionMessage } from '@sheppakai/shared/action-message';
	import { toast } from 'svelte-sonner';

	import type { Recurring } from '#lib';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';

	// Corrects one past month's amount; every other month keeps its own.
	let {
		recurring,
		monthKey,
		periodLabel
	}: { recurring: Recurring; monthKey: string; periodLabel: string } = $props();

	let open = $state(false);
	let saving = $state(false);
	const inputId = $props.id();
</script>

<Button
	variant="ghost"
	size="icon"
	aria-label="Edit {periodLabel} amount: {recurring.merchant}"
	onclick={() => (open = true)}
>
	<PencilIcon class="size-4" />
</Button>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-106.25">
		<Dialog.Header>
			<Dialog.Title>Edit {periodLabel} amount</Dialog.Title>
			<Dialog.Description>
				Changes what {recurring.merchant} cost in {periodLabel} only. Other months keep their amounts.
			</Dialog.Description>
		</Dialog.Header>
		<form
			method="POST"
			action="?/setPastAmount"
			class="grid gap-4"
			use:enhance={() => {
				saving = true;
				return async ({ result, update }) => {
					const { type, text } = actionMessage(result, {
						success: 'Amount updated for that month',
						error: 'Failed to update the amount'
					});
					toast[type](text);
					if (result.type === 'success') open = false;
					await update({ reset: false });
					saving = false;
				};
			}}
		>
			<input type="hidden" name="id" value={recurring.id} />
			<input type="hidden" name="month" value={monthKey} />
			<div class="grid gap-2">
				<Label for={inputId}>Amount</Label>
				<Input
					id={inputId}
					name="amount"
					type="number"
					inputmode="decimal"
					step="0.01"
					min="0.01"
					required
					value={recurring.amount}
				/>
			</div>
			<Dialog.Footer>
				<Dialog.Close><Button type="reset" variant="outline">Cancel</Button></Dialog.Close>
				<Button type="submit" disabled={saving}>Save</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
