<script lang="ts">
	import { refreshAll } from '$app/navigation';
	import { GripVertical } from '@lucide/svelte/icons';
	import { actionMessage } from '@sheppakai/shared/action-message';
	import {
		isSessionExpired,
		postAction,
		SESSION_EXPIRED_MESSAGE
	} from '@sheppakai/shared/post-action';
	import type { DndEvent } from 'svelte-dnd-action';
	import { dndzone } from 'svelte-dnd-action';
	import { toast } from 'svelte-sonner';
	import { flip } from 'svelte/animate';

	import { Button } from '#lib/components/ui/button/index.js';
	import type { TopicEntry } from '#lib/schemas/family-worship.js';

	import TopicActionButton from './TopicActionButton.svelte';
	import TopicCard from './TopicCard.svelte';

	interface Props {
		topics: TopicEntry[];
		onEdit: (topic: TopicEntry) => void;
		onDelete: (topic: TopicEntry) => void;
	}

	let { topics, onEdit, onDelete }: Props = $props();

	const flipDurationMs = 180;
	const touchStartDelayMs = 120;

	let items = $derived([...topics]);
	let isSaving = $state(false);
	let dragSnapshot: TopicEntry[] | null = null;

	function handleConsider(event: CustomEvent<DndEvent<TopicEntry>>) {
		dragSnapshot ??= [...items];
		items = event.detail.items;
	}

	async function handleFinalize(event: CustomEvent<DndEvent<TopicEntry>>) {
		const snapshot = dragSnapshot ?? [...items];
		dragSnapshot = null;
		items = event.detail.items;

		const unchanged = items.every((topic, index) => topic.id === snapshot[index]?.id);
		if (unchanged) return;

		isSaving = true;
		const formData = new FormData();
		formData.set('topicIds', items.map((topic) => topic.id).join(','));

		try {
			const result = await postAction('reorderTopicQueue', formData);
			if (isSessionExpired(result)) throw new Error(SESSION_EXPIRED_MESSAGE);
			const resultMessage = actionMessage(result, {
				success: 'Topic Queue saved.',
				error: 'Could not save the Topic Queue.'
			});
			if (resultMessage.type !== 'success') throw new Error(resultMessage.text);

			toast.success(resultMessage.text);
			await refreshAll();
		} catch (error) {
			items = snapshot;
			const reason = error instanceof Error ? error.message : 'Could not save the Topic Queue.';
			toast.error(`${reason} The queue was restored.`);
		} finally {
			isSaving = false;
		}
	}
</script>

<ol
	class="flex flex-col gap-2.5"
	aria-label="Topic Queue"
	use:dndzone={{
		items,
		flipDurationMs,
		type: 'topic-queue',
		dragDisabled: isSaving,
		delayTouchStart: touchStartDelayMs,
		dropTargetClasses: ['ring-2', 'ring-pen-worship/35', 'ring-offset-2', 'ring-offset-background']
	}}
	onconsider={handleConsider}
	onfinalize={(event) => void handleFinalize(event)}
>
	{#each items as topic, index (topic.id)}
		<li animate:flip={{ duration: flipDurationMs }} aria-label={topic.title}>
			<TopicCard {topic} position={index + 1}>
				{#snippet handle()}
					<GripVertical class="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
				{/snippet}
				{#snippet actions()}
					<Button type="button" variant="ghost" size="sm" onclick={() => onEdit(topic)}>
						Edit
					</Button>
					<TopicActionButton action="archiveTopic" id={topic.id} label="Archive" />
					<Button
						type="button"
						variant="ghost"
						size="sm"
						class="text-destructive hover:text-destructive"
						onclick={() => onDelete(topic)}
					>
						Delete
					</Button>
				{/snippet}
			</TopicCard>
		</li>
	{/each}
</ol>
