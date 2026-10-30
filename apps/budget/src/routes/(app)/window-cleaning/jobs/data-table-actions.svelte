<script lang="ts">
	import type { WindowCleaningJob } from '#lib';
	import ConfirmModal from '#lib/components/ConfirmModal.svelte';
	import RowActionsMenu from '#lib/components/RowActionsMenu.svelte';
	import SendInvoiceMenuItem from '#lib/components/SendInvoiceMenuItem.svelte';
	import WindowCleaningJobModal from '#lib/components/WindowCleaningJobModal.svelte';
	import { jobFormContext } from '#lib/contexts/index.js';

	let { jobData }: { jobData: WindowCleaningJob } = $props();

	let openEditModal = $state(false);
	let openDeleteModal = $state(false);

	const jobForm = jobFormContext.get();
</script>

<RowActionsMenu onEdit={() => (openEditModal = true)} onDelete={() => (openDeleteModal = true)}>
	<SendInvoiceMenuItem
		jobId={jobData.id}
		customerEmail={jobData.customer.email}
		invoiceSentAt={jobData.invoiceSentAt}
		actionUrl="/window-cleaning/jobs?/sendInvoice"
	/>
</RowActionsMenu>

<WindowCleaningJobModal
	bind:open={openEditModal}
	initialData={jobData}
	isEditing
	{jobForm}
	preselectedCustomerId={jobData.customerId}
/>

<ConfirmModal
	bind:open={openDeleteModal}
	id={jobData.id}
	actionUrl="/window-cleaning/jobs?/deleteJob"
	title="Delete job"
	message="Are you sure you want to delete this job? This cannot be undone."
	confirmButtonText="Delete"
/>
