<script lang="ts">
	import { enhance } from '$app/forms';
	import CameraIcon from '@lucide/svelte/icons/camera';
	import { actionMessage } from '@sheppakai/shared/action-message';
	import { isRecord } from '@sheppakai/shared/guards';
	import { toast } from 'svelte-sonner';
	import type { z } from 'zod';

	import { Button } from '#lib/components/ui/button/index.js';
	import type { receiptScanResultSchema } from '#lib/formSchemas/index.js';
	import { resizeImage } from '#lib/utils/resizeImage.js';

	type ReceiptScan = z.infer<typeof receiptScanResultSchema>;

	interface Props {
		onScanned: (scan: ReceiptScan) => void;
	}

	let { onScanned }: Props = $props();

	let formEl = $state<HTMLFormElement>();
	let fileInput = $state<HTMLInputElement>();
	let photo: Blob | undefined;
	let scanning = $state(false);

	async function onPhotoChosen(event: Event & { currentTarget: HTMLInputElement }) {
		const file = event.currentTarget.files?.[0];
		if (!file) return;
		scanning = true;
		try {
			photo = await resizeImage(file);
			formEl?.requestSubmit();
		} catch {
			scanning = false;
			toast.error("Couldn't prepare that photo. Try another one.");
		}
	}

	/**
	 * The scan carried back as the action's form data. The scanReceipt action already validated
	 * it with receiptScanResultSchema; this only guards the shape without shipping zod here.
	 */
	function scanFrom(data: unknown): ReceiptScan | undefined {
		const form = isRecord(data) ? data.form : undefined;
		const scan = isRecord(form) ? form.data : undefined;
		if (!isRecord(scan) || typeof scan.total !== 'number' || typeof scan.payee !== 'string') {
			return undefined;
		}
		return scan as ReceiptScan;
	}
</script>

<form
	bind:this={formEl}
	method="POST"
	action="?/scanReceipt"
	enctype="multipart/form-data"
	use:enhance={({ formData }) => {
		if (photo) formData.set('receipt', photo, 'receipt.jpg');

		return async ({ result }) => {
			scanning = false;
			photo = undefined;
			if (fileInput) fileInput.value = '';

			const { type, text } = actionMessage(result, {
				success: 'Receipt scanned.',
				error: 'Receipt scanning failed.'
			});
			const scan = result.type === 'success' ? scanFrom(result.data) : undefined;
			if (type === 'success' && scan) {
				onScanned(scan);
			} else {
				toast.error(type === 'error' ? text : 'Receipt scanning failed.');
			}
		};
	}}
>
	<input
		bind:this={fileInput}
		class="hidden"
		type="file"
		name="receipt"
		accept="image/*"
		onchange={onPhotoChosen}
	/>
	<Button type="button" variant="outline" disabled={scanning} onclick={() => fileInput?.click()}>
		<CameraIcon />
		{scanning ? 'Scanning…' : 'Scan receipt'}
	</Button>
</form>
