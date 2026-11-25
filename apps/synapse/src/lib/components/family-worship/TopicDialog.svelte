<script lang="ts">
	import PlusIcon from '@lucide/svelte/icons/plus';
	import TrashIcon from '@lucide/svelte/icons/trash-2';
	import { toast } from 'svelte-sonner';
	import type { Infer, SuperValidated } from 'sveltekit-superforms';
	import { superForm } from 'sveltekit-superforms';

	import { Button } from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import type { TopicEntry, topicSchema } from '#lib/schemas/family-worship.js';

	/** Create posts the topic fields; edit also posts the topic `id`. */
	type TopicFormData = Infer<typeof topicSchema> & { id?: string };

	let {
		formData,
		editEntry = null,
		onClose,
		open = $bindable(),
		instanceId = 'default'
	}: {
		formData: SuperValidated<TopicFormData>;
		editEntry?: TopicEntry | null;
		onClose?: () => void;
		open?: boolean;
		instanceId?: string;
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

	const formId = $derived(editEntry ? `edit-topic-${editEntry.id}` : `log-topic-${instanceId}`);

	// svelte-ignore state_referenced_locally
	const { form, errors, enhance, submitting } = superForm(formData, {
		id: formId,
		dataType: 'json',
		// Only the self-open Add Topic dialog resets after a save. The parent-controlled edit
		// dialog starts with no editEntry, so `!isEditing` would wrongly reset it too.
		resetForm: !isEditing && open === undefined,
		onUpdate: ({ form }) => {
			if (form.valid) {
				if (open === undefined) {
					internalOpen = false;
				}
				toast.success(isEditing ? 'Topic updated.' : 'Topic added to the back of the queue.');
				onClose?.();
			}
			if (form.message?.type === 'error') {
				toast.error(
					`Error ${isEditing ? 'updating' : 'adding'} topic. Reason: ${form.message.text}`
				);
			}
		},
		onError: ({ result }) => {
			toast.error(
				`There was an error ${isEditing ? 'updating' : 'adding'} the topic. Reason: ${result.error.message}`
			);
		}
	});

	// Populate form fields when editing
	$effect(() => {
		if (editEntry) {
			$form.id = editEntry.id;
			$form.title = editEntry.title;
			$form.description = editEntry.description;
			$form.notes = editEntry.notes ?? '';
			$form.scriptureReferences = editEntry.scriptureReferences ?? '';
			$form.publicationLinks = editEntry.publicationLinks.map((link) => ({
				label: link.label ?? '',
				url: link.url
			}));
		}
	});

	function addLink() {
		$form.publicationLinks = [...$form.publicationLinks, { label: '', url: '' }];
	}

	function removeLink(index: number) {
		$form.publicationLinks = $form.publicationLinks.filter((_, i) => i !== index);
	}

	function handleOpenChange(isOpen: boolean) {
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
				{isEditing ? 'Refine this topic' : 'New topics join the back of the Topic Queue'}
			</Dialog.Description>
		</Dialog.Header>
		<form method="POST" action={isEditing ? '?/updateTopic' : '?/logTopic'} use:enhance>
			<div class="grid gap-4 py-4">
				<div class="grid gap-2">
					<Label for="topic-title-{formId}">Title</Label>
					<Input
						id="topic-title-{formId}"
						bind:value={$form.title}
						class={$errors.title ? 'border-destructive' : ''}
						required
					/>
					{#if $errors.title}
						<p class="text-destructive text-sm">{$errors.title}</p>
					{/if}
				</div>
				<div class="grid gap-2">
					<Label for="topic-description-{formId}">Description</Label>
					<Textarea
						id="topic-description-{formId}"
						rows={3}
						bind:value={$form.description}
						class={$errors.description ? 'border-destructive' : ''}
						required
					/>
					{#if $errors.description}
						<p class="text-destructive text-sm">{$errors.description}</p>
					{/if}
				</div>
				<div class="grid gap-2">
					<Label for="topic-scripture-{formId}">Scripture references (optional)</Label>
					<Input
						id="topic-scripture-{formId}"
						placeholder="Matthew 6:9-13; Psalm 65:2"
						bind:value={$form.scriptureReferences}
						class={$errors.scriptureReferences ? 'border-destructive' : ''}
					/>
					{#if $errors.scriptureReferences}
						<p class="text-destructive text-sm">{$errors.scriptureReferences}</p>
					{/if}
				</div>
				<div class="grid gap-2">
					<Label for="topic-notes-{formId}">Notes (optional)</Label>
					<Textarea
						id="topic-notes-{formId}"
						rows={3}
						placeholder="How you plan to approach it"
						bind:value={$form.notes}
						class={$errors.notes ? 'border-destructive' : ''}
					/>
					{#if $errors.notes}
						<p class="text-destructive text-sm">{$errors.notes}</p>
					{/if}
				</div>
				<fieldset class="grid gap-2">
					<legend class="mb-2 text-sm leading-none font-medium">Publication links (optional)</legend
					>
					{#each $form.publicationLinks as _, index (index)}
						{@const linkErrors = $errors.publicationLinks?.[index]}
						<div class="grid gap-1.5 rounded-[3px] border p-2.5">
							<div class="flex gap-2">
								<Input
									aria-label="Link {index + 1} label"
									placeholder="Label (optional)"
									bind:value={$form.publicationLinks[index].label}
								/>
								<Button
									type="button"
									variant="ghost"
									size="icon"
									aria-label="Remove link {index + 1}"
									onclick={() => removeLink(index)}
								>
									<TrashIcon class="size-4" />
								</Button>
							</div>
							<Input
								type="url"
								aria-label="Link {index + 1} URL"
								placeholder="https://"
								bind:value={$form.publicationLinks[index].url}
								class={linkErrors?.url ? 'border-destructive' : ''}
							/>
							{#if linkErrors?.url}
								<p class="text-destructive text-sm">{linkErrors.url}</p>
							{/if}
						</div>
					{/each}
					<Button
						type="button"
						variant="outline"
						size="sm"
						class="justify-self-start"
						onclick={addLink}
					>
						<PlusIcon class="mr-1 size-4" />
						Add link
					</Button>
				</fieldset>
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
