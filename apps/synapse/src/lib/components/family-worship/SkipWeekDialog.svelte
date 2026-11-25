<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';

	import WeekActionForm from './WeekActionForm.svelte';

	/** Marks a week as skipped, with an optional reason (assembly, illness, travel). */
	interface Props {
		open: boolean;
		/** The week to skip, or null while closed. */
		week: { weekStart: string; dateLabel: string } | null;
		onClose: () => void;
	}

	let { open = $bindable(), week, onClose }: Props = $props();
</script>

<Dialog.Root
	{open}
	onOpenChange={(isOpen) => {
		if (!isOpen) onClose();
	}}
>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Skip this week</Dialog.Title>
			<Dialog.Description>
				{week ? `No Family Worship the week of ${week.dateLabel}.` : ''} Any planned topic goes back to
				the front of the Topic Queue.
			</Dialog.Description>
		</Dialog.Header>
		{#if week}
			<WeekActionForm action="skipWeek" weekStart={week.weekStart} onDone={onClose}>
				{#snippet children({ submitting })}
					<div class="grid gap-2 py-4">
						<Label for="skip-reason">Reason (optional)</Label>
						<Input
							id="skip-reason"
							name="reason"
							maxlength={200}
							placeholder="Assembly, illness, travel…"
						/>
					</div>
					<Dialog.Footer>
						<Button type="button" variant="outline" onclick={onClose}>Cancel</Button>
						<Button
							type="submit"
							disabled={submitting}
							class="bg-pen-worship hover:bg-pen-worship text-white"
						>
							{submitting ? 'Saving...' : 'Skip week'}
						</Button>
					</Dialog.Footer>
				{/snippet}
			</WeekActionForm>
		{/if}
	</Dialog.Content>
</Dialog.Root>
