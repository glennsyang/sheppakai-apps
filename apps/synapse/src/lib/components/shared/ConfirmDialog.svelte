<script lang="ts">
	import { enhance, type ActionResult } from '$app/forms';
	import { actionMessage } from '@sheppakai/shared/action-message';
	import { toast } from 'svelte-sonner';

	import { Button } from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';

	import Input from '../ui/input/input.svelte';

	interface Props {
		open: boolean;
		title: string;
		message: string;
		confirmButtonText: string;
		id?: string;
		actionUrl?: string;
		hiddenFields?: Record<string, string | number | boolean>;
	}

	let {
		open = $bindable(),
		title,
		message,
		id,
		confirmButtonText,
		actionUrl,
		hiddenFields
	}: Props = $props();

	// Daily Agenda actions answer with their own `agendaAction` payload (see the exception in
	// docs/ERROR_HANDLING_POLICY.md); everything else carries a superforms message.
	type AgendaActionData = { agendaAction?: { text?: string } };

	function getResultMessage(result: ActionResult): App.Superforms.Message {
		const fallbacks = { success: `${title} successful!`, error: `${title} failed!` };
		const agendaText =
			result.type === 'success' || result.type === 'failure'
				? (result.data as AgendaActionData | undefined)?.agendaAction?.text
				: undefined;

		if (typeof agendaText === 'string') {
			return { type: result.type === 'success' ? 'success' : 'error', text: agendaText };
		}

		return actionMessage(result, fallbacks);
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-106.25">
		<Dialog.Header>
			<Dialog.Title>{title}</Dialog.Title>
			<Dialog.Description>{message}</Dialog.Description>
		</Dialog.Header>
		<form
			method="POST"
			action={actionUrl}
			use:enhance={() => {
				open = false;

				return async ({ result, update }) => {
					const resultMessage = getResultMessage(result);

					if (resultMessage.type === 'success') {
						toast.success(resultMessage.text);
					} else {
						toast.error(resultMessage.text);
					}

					// Stay on this page even when the action lives on another route (SvelteKit 3 navigates by default).
					await update({ navigate: false });
				};
			}}
		>
			<Input type="hidden" name="id" value={id} />
			{#if hiddenFields}
				{#each Object.entries(hiddenFields) as [name, value] (name)}
					<Input type="hidden" {name} value={String(value)} />
				{/each}
			{/if}
			<Dialog.Footer>
				<Dialog.Close><Button type="reset" variant="outline">Cancel</Button></Dialog.Close>
				<Button type="submit">{confirmButtonText}</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
