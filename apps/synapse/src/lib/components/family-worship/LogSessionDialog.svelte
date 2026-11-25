<script lang="ts">
	import { untrack } from 'svelte';
	import { toast } from 'svelte-sonner';
	import type { Infer, SuperValidated } from 'sveltekit-superforms';
	import { superForm } from 'sveltekit-superforms';

	import { Button } from '#lib/components/ui/button/index.js';
	import { Checkbox } from '#lib/components/ui/checkbox/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import type { SessionEntry, sessionSchema } from '#lib/schemas/family-worship.js';

	/** Logging posts the session fields; editing also posts the session `id`. */
	type SessionFormData = Infer<typeof sessionSchema> & { id?: string };
	type TopicOption = { id: string; title: string };

	let {
		formData,
		editEntry = null,
		onClose,
		open = $bindable(),
		instanceId = 'default',
		topics,
		defaults,
		today,
		actionPath = ''
	}: {
		formData: SuperValidated<SessionFormData>;
		editEntry?: SessionEntry | null;
		onClose?: () => void;
		open?: boolean;
		instanceId?: string;
		/** The active topics to choose from. */
		topics: TopicOption[];
		/** What a new session starts with: today and the week's planned (or suggested) topic. */
		defaults?: { date: string; topicId: string | null };
		/** Today (YYYY-MM-DD, Pacific): the latest date a session can have. */
		today: string;
		/** Route that owns the session actions, when the dialog is used elsewhere. */
		actionPath?: string;
	} = $props();

	const isEditing = $derived(editEntry !== null);

	let internalOpen = $state(false);
	const dialogOpen = $derived(open !== undefined ? open : internalOpen);

	// Open dialog externally when editEntry is provided
	$effect(() => {
		if (editEntry && open === undefined) {
			internalOpen = true;
		}
	});

	const formId = $derived(editEntry ? `edit-session-${editEntry.id}` : `log-session-${instanceId}`);

	/** The follow-up question the server asked for, if any. */
	let followUp = $state<'unskip' | 'conflict' | null>(null);
	let followUpText = $state('');
	let existingSessionText = $state('');

	function resetFollowUp() {
		followUp = null;
		followUpText = '';
		existingSessionText = '';
		$form.confirmUnskip = false;
		$form.nextWeekConflict = '';
	}

	// svelte-ignore state_referenced_locally
	const { form, errors, enhance, submitting } = superForm(formData, {
		id: formId,
		dataType: 'json',
		// Parent-controlled dialogs start with no editEntry, so `!isEditing` alone would reset an
		// edit form too; only reset a self-opened log dialog.
		resetForm: !isEditing && open === undefined,
		onUpdate: ({ form }) => {
			const result = form.message;
			if (result?.reason === 'week_skipped') {
				followUp = 'unskip';
				followUpText = result.text;
				return;
			}
			if (result?.reason === 'next_week_conflict') {
				followUp = 'conflict';
				followUpText = result.text;
				return;
			}
			if (result?.reason === 'week_has_session') {
				existingSessionText = result.text;
				return;
			}
			if (result?.type === 'success') {
				resetFollowUp();
				if (open === undefined) {
					internalOpen = false;
				}
				toast.success(result.text);
				onClose?.();
				return;
			}
			if (result?.type === 'error') {
				toast.error(result.text);
			}
		},
		onError: ({ result }) => {
			toast.error(`There was an error saving the session. Reason: ${result.error.message}`);
		}
	});

	// Populate the form when editing, or start a new session from the week's defaults. Only
	// editEntry, the open state and the defaults are tracked, so typing never re-runs this.
	$effect(() => {
		const entry = editEntry;
		const start = dialogOpen && !entry ? defaults : undefined;
		untrack(() => {
			if (entry) {
				$form.id = entry.id;
				$form.date = entry.date;
				$form.topicId = entry.topicId;
				$form.note = entry.note ?? '';
				$form.continueNextWeek = false;
			} else if (start) {
				// A parent-controlled dialog isn't reset after a save, so start each log fresh.
				$form.date = start.date;
				$form.topicId = start.topicId ?? '';
				$form.note = '';
				$form.continueNextWeek = false;
			}
		});
	});

	/** The topics to choose from; an edited session keeps its topic even if it's archived. */
	const topicOptions = $derived(
		editEntry && !topics.some((t) => t.id === editEntry.topicId)
			? [{ id: editEntry.topicId, title: editEntry.topicTitle }, ...topics]
			: topics
	);
	const selectedTitle = $derived(topicOptions.find((t) => t.id === $form.topicId)?.title);

	function handleOpenChange(isOpen: boolean) {
		if (!isOpen) resetFollowUp();
		if (open !== undefined) {
			// Externally controlled - notify via onClose
			if (!isOpen && onClose) {
				onClose();
			}
		} else {
			// Internally controlled
			internalOpen = isOpen;
			if (!isOpen) {
				onClose?.();
			}
		}
	}
</script>

<Dialog.Root open={dialogOpen} onOpenChange={handleOpenChange}>
	<Dialog.Content class="max-h-[90dvh] overflow-y-auto sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>{isEditing ? 'Edit Session' : 'Log Session'}</Dialog.Title>
			<Dialog.Description>
				{isEditing ? 'Fix the date, topic or note' : 'Record the Family Worship you held'}
			</Dialog.Description>
		</Dialog.Header>
		<form
			method="POST"
			action={`${actionPath}${isEditing ? '?/updateSession' : '?/logSession'}`}
			use:enhance
		>
			<div class="grid gap-4 py-4">
				<div class="grid gap-2">
					<Label for="session-date-{formId}">Date</Label>
					<Input
						id="session-date-{formId}"
						type="date"
						max={today}
						bind:value={$form.date}
						oninput={resetFollowUp}
						class={$errors.date ? 'border-destructive' : ''}
						required
					/>
					{#if $errors.date}
						<p class="text-destructive text-sm">{$errors.date}</p>
					{/if}
				</div>
				<div class="grid gap-2">
					<Label for="session-topic-{formId}">Topic</Label>
					<Select.Root type="single" bind:value={$form.topicId} onValueChange={resetFollowUp}>
						<Select.Trigger id="session-topic-{formId}" class="w-full">
							<span class="truncate">{selectedTitle ?? 'Choose a topic'}</span>
						</Select.Trigger>
						<Select.Content>
							{#each topicOptions as topic (topic.id)}
								<Select.Item value={topic.id} label={topic.title}>{topic.title}</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
					{#if $errors.topicId}
						<p class="text-destructive text-sm">{$errors.topicId}</p>
					{/if}
				</div>
				<div class="grid gap-2">
					<Label for="session-note-{formId}">Note (optional)</Label>
					<Textarea
						id="session-note-{formId}"
						rows={3}
						placeholder="What you read or talked about"
						bind:value={$form.note}
						class={$errors.note ? 'border-destructive' : ''}
					/>
					{#if $errors.note}
						<p class="text-destructive text-sm">{$errors.note}</p>
					{/if}
				</div>
				{#if !isEditing}
					<div class="flex items-center gap-2">
						<Checkbox
							id="session-continue-{formId}"
							bind:checked={$form.continueNextWeek}
							onCheckedChange={resetFollowUp}
						/>
						<Label for="session-continue-{formId}" class="font-normal">Continue next week</Label>
					</div>
				{/if}

				{#if existingSessionText}
					<p class="text-destructive text-sm" role="alert">
						{existingSessionText}
						<a href="/family-worship/history" class="underline underline-offset-2">Open History</a>
					</p>
				{/if}

				{#if followUp === 'unskip'}
					<div class="bg-muted grid gap-3 rounded-[3px] p-3 text-sm" role="alert">
						<p>{followUpText}</p>
						<Button
							type="submit"
							size="sm"
							class="bg-pen-worship hover:bg-pen-worship justify-self-start text-white"
							disabled={$submitting}
							onclick={() => ($form.confirmUnskip = true)}
						>
							Log it and remove the skip
						</Button>
					</div>
				{:else if followUp === 'conflict'}
					<div class="bg-muted grid gap-3 rounded-[3px] p-3 text-sm" role="alert">
						<p>{followUpText} What should happen to it?</p>
						<div class="flex flex-wrap gap-2">
							<Button
								type="submit"
								size="sm"
								variant="outline"
								disabled={$submitting}
								onclick={() => ($form.nextWeekConflict = 'replace')}
							>
								Replace it
							</Button>
							<Button
								type="submit"
								size="sm"
								variant="outline"
								disabled={$submitting}
								onclick={() => ($form.nextWeekConflict = 'shift')}
							>
								Push the plan back a week
							</Button>
						</div>
					</div>
				{/if}
			</div>
			<Dialog.Footer>
				<Dialog.Close><Button type="reset" variant="outline">Cancel</Button></Dialog.Close>
				<Button
					type="submit"
					disabled={$submitting || followUp !== null}
					class="bg-pen-worship hover:bg-pen-worship text-white"
				>
					{$submitting ? 'Saving...' : isEditing ? 'Update' : 'Log Session'}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
