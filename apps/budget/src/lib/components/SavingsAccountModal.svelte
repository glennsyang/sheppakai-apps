<script lang="ts">
	import { toast } from 'svelte-sonner';
	import type { SuperValidated } from 'sveltekit-superforms';
	import { superForm } from 'sveltekit-superforms';
	import type { z } from 'zod';

	import type { BaseModalProps } from '#lib';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import type { savingsAccountSchema } from '#lib/formSchemas/index.js';

	interface Props extends BaseModalProps<z.infer<typeof savingsAccountSchema>> {
		savingsAccountForm: SuperValidated<z.infer<typeof savingsAccountSchema>>;
	}

	let { open = $bindable(), initialData, isEditing, savingsAccountForm }: Props = $props();

	// svelte-ignore state_referenced_locally
	const { form, errors, enhance, submitting } = superForm(savingsAccountForm, {
		resetForm: true,
		onUpdate: ({ form }) => {
			// Read form.message, not $message: superforms clears the store on submit and only
			// repopulates it after onUpdate has run, so the store is always undefined here.
			if (form.message?.type === 'success') {
				open = false;
				toast.success(form.message.text);
			} else if (form.message?.type === 'error') {
				toast.error(form.message.text);
			}
		},
		onError: ({ result }) => {
			// Catastrophic DB crashes (Form data is lost)
			toast.error(
				`There was an error ${isEditing ? 'updating' : 'creating'} the savings account. Reason: ${result.error.message}`
			);
		}
	});

	$effect(() => {
		if (open) {
			if (initialData) {
				$form.id = initialData.id || '';
				$form.title = initialData.title || '';
				$form.description = initialData.description || '';
				$form.amount = initialData.amount || 0;
			} else {
				$form.id = '';
				$form.title = '';
				$form.description = '';
				$form.amount = 0;
			}
		}
	});
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-106.25">
		<Dialog.Header>
			<Dialog.Title>{isEditing ? 'Edit savings account' : 'Add savings account'}</Dialog.Title>
			<Dialog.Description>
				{isEditing
					? 'Update this savings account. Modify the title, description, or amount as needed.'
					: 'Create a new savings account. Add a title, optional description, and the current amount.'}
			</Dialog.Description>
		</Dialog.Header>
		<form
			class="space-y-4"
			method="POST"
			action={isEditing ? '/savings?/update' : '/savings?/create'}
			use:enhance
		>
			<input type="hidden" name="id" bind:value={$form.id} />
			<div class="space-y-2">
				<label for="savings-account-title" class="text-sm font-medium">Title</label>
				<Input
					id="savings-account-title"
					name="title"
					bind:value={$form.title}
					placeholder="e.g., Emergency Fund, Vacation Savings"
					class={$errors.title ? 'border-destructive' : ''}
					required
				/>
				{#if $errors.title}
					<p class="text-destructive text-sm">{$errors.title}</p>
				{/if}
			</div>

			<div class="space-y-2">
				<label for="savings-account-description" class="text-sm font-medium"
					>Description (Optional)</label
				>
				<Textarea
					id="savings-account-description"
					name="description"
					bind:value={$form.description}
					placeholder="Add additional details about this savings account"
					class={$errors.description ? 'border-destructive' : ''}
					rows={2}
				/>
				{#if $errors.description}
					<p class="text-destructive text-sm">{$errors.description}</p>
				{/if}
			</div>

			<div class="space-y-2">
				<label for="savings-account-amount" class="text-sm font-medium">Amount</label>
				<Input
					id="savings-account-amount"
					name="amount"
					type="number"
					inputmode="decimal"
					step="0.01"
					min="0"
					bind:value={$form.amount}
					placeholder="0.00"
					class={$errors.amount ? 'border-destructive' : ''}
					required
				/>
				{#if $errors.amount}
					<p class="text-destructive text-sm">{$errors.amount}</p>
				{/if}
			</div>

			<Dialog.Footer>
				<Dialog.Close><Button type="reset" variant="outline">Cancel</Button></Dialog.Close>
				<Button type="submit" disabled={$submitting}>
					{$submitting ? 'Saving...' : isEditing ? 'Save' : 'Create'}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
