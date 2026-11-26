<script lang="ts">
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import { toast } from 'svelte-sonner';
	import { defaults, superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';

	import type { RecurringBill } from '#lib';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { pastAmountSchema } from '#lib/formSchemas/index.js';

	// Corrects one past month's amount; every other month keeps its own.
	let {
		recurringBill,
		monthKey,
		periodLabel
	}: { recurringBill: RecurringBill; monthKey: string; periodLabel: string } = $props();

	let open = $state(false);
	const inputId = $props.id();

	const validators = zod4Client(pastAmountSchema);
	const initialData = () => ({
		id: recurringBill.id,
		month: monthKey,
		amount: recurringBill.amount
	});

	// svelte-ignore state_referenced_locally — superForm is intentionally initialized once from props
	const { form, errors, enhance, submitting, reset } = superForm(
		defaults(initialData(), validators),
		{
			id: `pastAmount-${recurringBill.id}-${monthKey}`,
			validators,
			resetForm: false,
			onUpdate: ({ form }) => {
				// Read form.message, not $message: the store is only repopulated after onUpdate.
				if (!form.message) return;
				toast[form.message.type](form.message.text);
				if (form.message.type === 'success') open = false;
			},
			onError: ({ result }) => {
				toast.error(`Failed to update the bill price: ${result.error.message}`);
			}
		}
	);

	// Each opening starts from the month's current amount, dropping a cancelled edit and its errors.
	function openDialog() {
		reset({ data: initialData(), newState: initialData() });
		open = true;
	}
</script>

<Button
	variant="ghost"
	size="icon"
	aria-label="Edit {periodLabel} bill price: {recurringBill.merchant}"
	onclick={openDialog}
>
	<PencilIcon class="size-4" />
</Button>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-106.25">
		<Dialog.Header>
			<Dialog.Title>Edit {periodLabel} bill price</Dialog.Title>
			<Dialog.Description>
				Changes what {recurringBill.merchant} cost in {periodLabel} only. Other months keep their amounts.
			</Dialog.Description>
		</Dialog.Header>
		<form method="POST" action="?/setPastAmount" class="grid gap-4" use:enhance>
			<input type="hidden" name="id" value={$form.id} />
			<input type="hidden" name="month" value={$form.month} />
			<div class="grid gap-2">
				<Label for={inputId}>Amount</Label>
				<Input
					id={inputId}
					name="amount"
					type="number"
					inputmode="decimal"
					step="0.01"
					bind:value={$form.amount}
					aria-invalid={$errors.amount ? 'true' : undefined}
					class={[$errors.amount && 'border-destructive']}
				/>
				{#if $errors.amount}
					<p class="text-destructive text-sm">{$errors.amount}</p>
				{/if}
			</div>
			<Dialog.Footer>
				<Dialog.Close><Button type="button" variant="outline">Cancel</Button></Dialog.Close>
				<Button type="submit" disabled={$submitting}>Save</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
