<script lang="ts">
	import { enhance } from '$app/forms';
	import CameraIcon from '@lucide/svelte/icons/camera';
	import ImageIcon from '@lucide/svelte/icons/image';
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
		class?: string;
	}

	let { onScanned, class: className }: Props = $props();

	let formEl = $state<HTMLFormElement>();
	let cameraInput = $state<HTMLInputElement>();
	let galleryInput = $state<HTMLInputElement>();
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
	class={className}
	method="POST"
	action="?/scanReceipt"
	enctype="multipart/form-data"
	use:enhance={({ formData }) => {
		if (photo) formData.set('receipt', photo, 'receipt.jpg');

		return async ({ result }) => {
			scanning = false;
			photo = undefined;
			if (cameraInput) cameraInput.value = '';
			if (galleryInput) galleryInput.value = '';

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
	<!-- On phones `capture` opens the rear camera; desktop browsers ignore it and show a file picker. -->
	<input
		bind:this={cameraInput}
		class="hidden"
		type="file"
		accept="image/*"
		capture="environment"
		onchange={onPhotoChosen}
	/>
	<input
		bind:this={galleryInput}
		class="hidden"
		type="file"
		accept="image/*"
		onchange={onPhotoChosen}
	/>
	<div class="flex">
		<Button
			type="button"
			variant="outline"
			class="min-w-0 flex-1 pointer-coarse:rounded-r-none"
			disabled={scanning}
			onclick={() => cameraInput?.click()}
		>
			<CameraIcon />
			{scanning ? 'Scanning…' : 'Scan receipt'}
		</Button>
		<!-- Touch only: camera capture replaces the photo picker there, so keep a way to pick a saved photo. -->
		<Button
			type="button"
			variant="outline"
			size="icon"
			class="hidden rounded-l-none border-l-0 pointer-coarse:inline-flex"
			aria-label="Choose a saved receipt photo"
			disabled={scanning}
			onclick={() => galleryInput?.click()}
		>
			<ImageIcon />
		</Button>
	</div>
</form>
