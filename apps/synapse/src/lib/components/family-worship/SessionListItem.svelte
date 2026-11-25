<script lang="ts">
	import { Check } from '@lucide/svelte/icons';

	import { Button } from '#lib/components/ui/button/index.js';
	import type { SessionEntry } from '#lib/schemas/family-worship.js';
	import { formatDateMedium } from '#lib/utils/date.js';

	/** One Family Worship Session in a history list, with edit and delete. */
	interface Props {
		session: SessionEntry;
		/** Show the topic title (a list spanning topics); a topic's own page leaves it out. */
		showTopic?: boolean;
		onEdit: (session: SessionEntry) => void;
		onDelete: (session: SessionEntry) => void;
	}

	let { session, showTopic = true, onEdit, onDelete }: Props = $props();
</script>

<div class="flex items-start gap-2.5 py-2.5">
	<Check class="text-pen-worship mt-1 size-4 shrink-0" aria-hidden="true" />
	<div class="min-w-0 flex-1">
		<p class="text-sm font-semibold">{formatDateMedium(session.date)}</p>
		{#if showTopic}
			<a href="/family-worship/topics/{session.topicId}" class="block break-words hover:underline">
				{session.topicTitle}
			</a>
		{/if}
		{#if session.note}
			<p class="text-muted-foreground text-sm break-words whitespace-pre-line">{session.note}</p>
		{/if}
	</div>
	<div class="flex shrink-0 gap-0.5">
		<Button type="button" variant="ghost" size="sm" onclick={() => onEdit(session)}>Edit</Button>
		<Button
			type="button"
			variant="ghost"
			size="sm"
			class="text-destructive hover:text-destructive"
			onclick={() => onDelete(session)}
		>
			Delete
		</Button>
	</div>
</div>
