<script lang="ts">
	import PlusIcon from '@lucide/svelte/icons/plus';
	import { toast } from 'svelte-sonner';
	import type { Infer, SuperValidated } from 'sveltekit-superforms';
	import { superForm } from 'sveltekit-superforms';

	import { Button } from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import type { topicSchema } from '#lib/schemas/family-worship.js';
	import type { TopicEntry } from '#lib/utils/family-worship.js';

	type TopicData = Infer<typeof topicSchema>;

	let {
		formData,
		editEntry = null,
		onClose,
		open = $bindable(),
		instanceId = 'default',
		actionPath = ''
	}: {
		formData: SuperValidated<TopicData>;
		editEntry?: TopicEntry | null;
		onClose?: () => void;
		open?: boolean;
		instanceId?: string;
		/** Route that owns the actions; empty means the current page. */
		actionPath?: string;
	} = $props();

	const isEditing = $derived(editEntry !== null);

	let internalOpen = $state(false);
	const dialogOpen = $derived(open !== undefined ? open : internalOpen);

	$effect(() => {
		if (editEntry && open === undefined) {
			internalOpen = true;
		}
	});

	const formId = $derived(editEntry ? `edit-topic-${editEntry.id}` : `add-topic-${instanceId}`);

	// svelte-ignore state_referenced_locally
	const { form, errors, enhance, message, submitting } = superForm(formData, {
		id: formId,
		resetForm: !isEditing,
		onUpdate: ({ form }) => {
			if (form.valid) {
				if (open === undefined) {
					internalOpen = false;
				}
				toast.success(isEditing ? 'Topic updated.' : 'Topic added.');
				onClose?.();
			}
			if ($message?.type === 'error') {
				toast.error(`Error saving topic. Reason: ${$message.text}`);
			}
		},
		onError: ({ result }) => {
			toast.error(`There was an error saving the topic. Reason: ${result.error.message}`);
		}
	});

	$effect(() => {
		if (editEntry) {
			$form.id = editEntry.id;
			$form.title = editEntry.title;
			$form.description = editEntry.description ?? '';
			$form.notes = editEntry.notes ?? '';
			$form.scriptureRefs = editEntry.scriptureRefs ?? '';
			$form.links = editEntry.links.join('\n');
		}
	});

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
					<PlusIcon class="mr-2 h-4 w-4" />
					Add Topic
				</Button>
			{/snippet}
		</Dialog.Trigger>
	{/if}
	<Dialog.Content class="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title>{isEditing ? 'Edit Topic' : 'Add Topic'}</Dialog.Title>
			<Dialog.Description>
				{isEditing ? 'Update this study topic' : 'Add a topic to the family worship catalog'}
			</Dialog.Description>
		</Dialog.Header>
		<form
			method="POST"
			action={`${actionPath}${isEditing ? '?/updateTopic' : '?/createTopic'}`}
			use:enhance
		>
			{#if isEditing && editEntry}
				<input type="hidden" name="id" value={editEntry.id} />
			{/if}
			<div class="grid gap-4 py-4">
				<div class="grid gap-2">
					<Label for="topic-title-{formId}">Title</Label>
					<Input
						id="topic-title-{formId}"
						name="title"
						placeholder="e.g. Lessons from Jonah"
						bind:value={$form.title}
						class={$errors.title ? 'border-destructive' : ''}
						required
					/>
					{#if $errors.title}
						<p class="text-destructive text-sm">{$errors.title}</p>
					{/if}
				</div>
				<div class="grid gap-2">
					<Label for="topic-description-{formId}">What it is</Label>
					<Textarea
						id="topic-description-{formId}"
						name="description"
						rows={3}
						bind:value={$form.description}
						class={$errors.description ? 'border-destructive' : ''}
					/>
					{#if $errors.description}
						<p class="text-destructive text-sm">{$errors.description}</p>
					{/if}
				</div>
				<div class="grid gap-2">
					<Label for="topic-scripture-{formId}">Scripture references (optional)</Label>
					<Input
						id="topic-scripture-{formId}"
						name="scriptureRefs"
						placeholder="e.g. Jonah 1-4; Matthew 12:40"
						bind:value={$form.scriptureRefs}
						class={$errors.scriptureRefs ? 'border-destructive' : ''}
					/>
					{#if $errors.scriptureRefs}
						<p class="text-destructive text-sm">{$errors.scriptureRefs}</p>
					{/if}
				</div>
				<div class="grid gap-2">
					<Label for="topic-links-{formId}">Publication links (optional, one per line)</Label>
					<Textarea
						id="topic-links-{formId}"
						name="links"
						rows={2}
						placeholder="https://wol.jw.org/..."
						bind:value={$form.links}
						class={$errors.links ? 'border-destructive' : ''}
					/>
					{#if $errors.links}
						<p class="text-destructive text-sm">{$errors.links}</p>
					{/if}
				</div>
				<div class="grid gap-2">
					<Label for="topic-notes-{formId}">Notes (optional)</Label>
					<Textarea
						id="topic-notes-{formId}"
						name="notes"
						rows={3}
						bind:value={$form.notes}
						class={$errors.notes ? 'border-destructive' : ''}
					/>
					{#if $errors.notes}
						<p class="text-destructive text-sm">{$errors.notes}</p>
					{/if}
				</div>
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
