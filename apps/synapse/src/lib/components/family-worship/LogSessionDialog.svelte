<script lang="ts">
	import BookOpenCheck from '@lucide/svelte/icons/book-open-check';
	import { untrack } from 'svelte';
	import { toast } from 'svelte-sonner';
	import type { Infer, SuperValidated } from 'sveltekit-superforms';
	import { superForm } from 'sveltekit-superforms';

	import { Button } from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import type { sessionSchema } from '#lib/schemas/family-worship.js';
	import { getTodayString } from '#lib/utils/date.js';
	import type { TopicRef, WorshipSessionSummary } from '#lib/utils/family-worship.js';

	type SessionData = Infer<typeof sessionSchema>;

	let {
		formData,
		editEntry = null,
		onClose,
		open = $bindable(),
		instanceId = 'default',
		actionPath = '',
		topics,
		defaultDate,
		defaultTopicId = null
	}: {
		formData: SuperValidated<SessionData>;
		editEntry?: WorshipSessionSummary | null;
		onClose?: () => void;
		open?: boolean;
		instanceId?: string;
		/** Route that owns the actions; empty means the current page. */
		actionPath?: string;
		/** Topics to choose from (active ones, plus the edited session's own topic). */
		topics: TopicRef[];
		/** Date a new entry starts on; today when unset. */
		defaultDate?: string;
		/** Topic a new entry starts on: the week's scheduled or suggested topic. */
		defaultTopicId?: string | null;
	} = $props();

	const isEditing = $derived(editEntry !== null);

	let internalOpen = $state(false);
	const dialogOpen = $derived(open !== undefined ? open : internalOpen);

	$effect(() => {
		if (editEntry && open === undefined) {
			internalOpen = true;
		}
	});

	const formId = $derived(
		editEntry ? `edit-worship-session-${editEntry.id}` : `log-worship-session-${instanceId}`
	);

	// svelte-ignore state_referenced_locally
	const { form, errors, enhance, message, submitting } = superForm(formData, {
		id: formId,
		resetForm: !isEditing,
		onUpdate: ({ form }) => {
			if (form.valid) {
				if (open === undefined) {
					internalOpen = false;
				}
				toast.success(
					isEditing
						? 'Session updated.'
						: form.data.status === 'skipped'
							? 'Week marked skipped.'
							: 'Session logged.'
				);
				onClose?.();
			}
			if ($message?.type === 'error') {
				toast.error(`Error saving session. Reason: ${$message.text}`);
			}
		},
		onError: ({ result }) => {
			toast.error(`There was an error saving the session. Reason: ${result.error.message}`);
		}
	});

	$effect(() => {
		if (editEntry) {
			$form.id = editEntry.id;
			$form.status = editEntry.status;
			$form.date = editEntry.date;
			$form.topicId = editEntry.topicId ?? '';
			$form.notes = editEntry.notes ?? '';
			$form.continueNextWeek = false;
		}
	});

	// Each time a new-entry dialog opens, start it on the week it was opened for.
	$effect(() => {
		if (dialogOpen && !isEditing) {
			const date = defaultDate ?? getTodayString();
			const topicId = defaultTopicId ?? '';
			untrack(() => {
				$form.status = 'done';
				$form.date = date;
				$form.topicId = topicId;
			});
		}
	});

	const selectedTopicTitle = $derived(
		topics.find((topic) => topic.id === $form.topicId)?.title ?? 'Select a topic'
	);

	function handleOpenChange(isOpen: boolean) {
		if (open !== undefined) {
			if (!isOpen && onClose) {
				onClose();
			}
		} else {
			internalOpen = isOpen;
			if (!isOpen) {
				onClose?.();
			}
		}
	}
</script>

<Dialog.Root open={dialogOpen} onOpenChange={handleOpenChange}>
	{#if !isEditing && open === undefined}
		<Dialog.Trigger>
			{#snippet child({ props })}
				<Button {...props} class="bg-pen-worship hover:bg-pen-worship text-white">
					<BookOpenCheck class="mr-2 h-4 w-4" />
					Log Session
				</Button>
			{/snippet}
		</Dialog.Trigger>
	{/if}
	<Dialog.Content class="max-h-[90dvh] overflow-y-auto sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>{isEditing ? 'Edit Session' : 'Log Family Worship'}</Dialog.Title>
			<Dialog.Description>
				Record that the week's study happened, or that it was skipped.
			</Dialog.Description>
		</Dialog.Header>
		<form
			method="POST"
			action={`${actionPath}${isEditing ? '?/updateSession' : '?/logSession'}`}
			use:enhance
		>
			{#if isEditing && editEntry}
				<input type="hidden" name="id" value={editEntry.id} />
			{/if}
			<div class="grid gap-4 py-4">
				<fieldset class="grid gap-2">
					<legend class="mb-2 text-sm font-medium">What happened?</legend>
					<div class="grid grid-cols-2 gap-2">
						{#each [{ value: 'done', label: 'We did it' }, { value: 'skipped', label: 'Skipped' }] as option (option.value)}
							<label
								class={[
									'flex min-h-11 cursor-pointer items-center justify-center rounded-md border text-sm font-bold',
									$form.status === option.value
										? 'border-pen-worship bg-pen-worship/10 text-pen-worship'
										: 'border-input text-muted-foreground'
								]}
							>
								<input
									type="radio"
									name="status"
									value={option.value}
									bind:group={$form.status}
									class="sr-only"
								/>
								{option.label}
							</label>
						{/each}
					</div>
				</fieldset>

				<div class="grid gap-2">
					<Label for="session-date-{formId}">Date</Label>
					<Input
						id="session-date-{formId}"
						name="date"
						type="date"
						bind:value={$form.date}
						class={$errors.date ? 'border-destructive' : ''}
						required
					/>
					{#if $errors.date}
						<p class="text-destructive text-sm">{$errors.date}</p>
					{/if}
				</div>

				{#if $form.status === 'done'}
					<div class="grid gap-2">
						<Label for="session-topic-{formId}">Topic</Label>
						<Select.Root type="single" name="topicId" bind:value={$form.topicId}>
							<Select.Trigger
								id="session-topic-{formId}"
								class={['w-full', $errors.topicId && 'border-destructive']}
							>
								{selectedTopicTitle}
							</Select.Trigger>
							<Select.Content>
								{#each topics as topic (topic.id)}
									<Select.Item value={topic.id} label={topic.title}>{topic.title}</Select.Item>
								{/each}
							</Select.Content>
						</Select.Root>
						{#if $errors.topicId}
							<p class="text-destructive text-sm">{$errors.topicId}</p>
						{/if}
					</div>
				{/if}

				<div class="grid gap-2">
					<Label for="session-notes-{formId}">
						{$form.status === 'done' ? 'What we covered (optional)' : 'Reason (optional)'}
					</Label>
					<Textarea
						id="session-notes-{formId}"
						name="notes"
						rows={3}
						bind:value={$form.notes}
						class={$errors.notes ? 'border-destructive' : ''}
					/>
					{#if $errors.notes}
						<p class="text-destructive text-sm">{$errors.notes}</p>
					{/if}
				</div>

				{#if !isEditing && $form.status === 'done'}
					<label class="flex min-h-11 items-center gap-3 text-sm">
						<input
							type="checkbox"
							name="continueNextWeek"
							bind:checked={$form.continueNextWeek}
							class="accent-pen-worship size-4"
						/>
						Continue this topic next week
					</label>
				{/if}
			</div>
			<Dialog.Footer>
				<Dialog.Close><Button type="reset" variant="outline">Cancel</Button></Dialog.Close>
				<Button
					type="submit"
					disabled={$submitting}
					class="bg-pen-worship hover:bg-pen-worship text-white"
				>
					{$submitting ? 'Saving...' : isEditing ? 'Update' : 'Save'}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
