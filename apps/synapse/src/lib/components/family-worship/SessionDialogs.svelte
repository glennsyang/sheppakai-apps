<script lang="ts">
	import type { Infer, SuperValidated } from 'sveltekit-superforms';

	import ConfirmDialog from '#lib/components/shared/ConfirmDialog.svelte';
	import type { SessionEntry, TopicRef, updateSessionSchema } from '#lib/schemas/family-worship.js';
	import { formatDateMedium } from '#lib/utils/date.js';

	import LogSessionDialog from './LogSessionDialog.svelte';

	/**
	 * The edit and delete dialogs for a session, for pages outside /family-worship. Bind `editing`
	 * or `deleting` to a session to open the matching dialog.
	 */
	interface Props {
		formData: SuperValidated<Infer<typeof updateSessionSchema>>;
		topics: TopicRef[];
		today: string;
		editing: SessionEntry | null;
		deleting: SessionEntry | null;
	}

	let { formData, topics, today, editing = $bindable(), deleting = $bindable() }: Props = $props();

	let showEdit = $state(false);
	let showDelete = $state(false);

	$effect(() => {
		if (editing) showEdit = true;
	});
	$effect(() => {
		if (deleting) showDelete = true;
	});
	$effect(() => {
		if (!showDelete) deleting = null;
	});
</script>

<LogSessionDialog
	bind:open={showEdit}
	{formData}
	editEntry={editing}
	{topics}
	{today}
	instanceId="edit-history"
	actionPath="/family-worship"
	onClose={() => {
		showEdit = false;
		editing = null;
	}}
/>

<ConfirmDialog
	bind:open={showDelete}
	title="Delete Session"
	message={deleting
		? `Delete the session on ${formatDateMedium(deleting.date)}? The week's plan is kept.`
		: ''}
	confirmButtonText="Delete"
	id={deleting?.id}
	actionUrl="/family-worship?/deleteSession"
/>
