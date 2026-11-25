<script lang="ts">
	import { enhance } from '$app/forms';
	import { actionMessage } from '@sheppakai/shared/action-message';
	import type { Snippet } from 'svelte';
	import { toast } from 'svelte-sonner';

	/**
	 * A one-tap Planned Week action (plan, clear, skip, undo a skip): posts the week and any extra
	 * fields to the Family Worship page and toasts the result.
	 */
	interface Props {
		action: 'planWeek' | 'clearWeek' | 'skipWeek' | 'unskipWeek';
		weekStart: string;
		fields?: Record<string, string>;
		/** Lets a control elsewhere submit this form (`form={id}`), or call `requestSubmit()`. */
		id?: string;
		formElement?: HTMLFormElement;
		onDone?: () => void;
		children?: Snippet<[{ submitting: boolean }]>;
	}

	let {
		action,
		weekStart,
		fields = {},
		id,
		formElement = $bindable(),
		onDone,
		children
	}: Props = $props();

	let submitting = $state(false);
</script>

<form
	bind:this={formElement}
	{id}
	method="POST"
	action="/family-worship?/{action}"
	class="contents"
	use:enhance={() => {
		submitting = true;
		return async ({ result, update }) => {
			const resultMessage = actionMessage(result, {
				success: 'Saved.',
				error: 'Something went wrong. Please try again.'
			});
			if (resultMessage.type === 'success') toast.success(resultMessage.text);
			else toast.error(resultMessage.text);
			await update({ navigate: false });
			submitting = false;
			if (resultMessage.type === 'success') onDone?.();
		};
	}}
>
	<input type="hidden" name="weekStart" value={weekStart} />
	{#each Object.entries(fields) as [name, value] (name)}
		<input type="hidden" {name} {value} />
	{/each}
	{@render children?.({ submitting })}
</form>
