<script lang="ts">
	import { enhance } from '$app/forms';
	import CameraIcon from '@lucide/svelte/icons/camera';
	import ImageIcon from '@lucide/svelte/icons/image';
	import SparklesIcon from '@lucide/svelte/icons/sparkles';
	import { actionMessage } from '@sheppakai/shared/action-message';
	import { isRecord } from '@sheppakai/shared/guards';
	import { resizeImage } from '@sheppakai/shared/image-resize';
	import { toast } from 'svelte-sonner';
	import type { z } from 'zod';

	import { Button } from '#lib/components/ui/button/index.js';
	import type { mealEstimateResultSchema } from '#lib/schemas/fitness.js';

	type MealEstimate = z.infer<typeof mealEstimateResultSchema>;

	interface Props {
		/** What the user has typed as the description so far; sent along as the note. */
		note: string;
		onEstimated: (estimate: MealEstimate) => void;
	}

	let { note, onEstimated }: Props = $props();

	let formEl = $state<HTMLFormElement>();
	let cameraInput = $state<HTMLInputElement>();
	let galleryInput = $state<HTMLInputElement>();
	let photo: Blob | undefined;
	let estimating = $state(false);

	async function onPhotoChosen(event: Event & { currentTarget: HTMLInputElement }) {
		const file = event.currentTarget.files?.[0];
		if (!file) return;
		estimating = true;
		try {
			photo = await resizeImage(file);
			formEl?.requestSubmit();
		} catch {
			estimating = false;
			toast.error("Couldn't prepare that photo. Try another one.");
		}
	}

	/**
	 * The estimate carried back as the action's form data. The estimateMeal action already
	 * validated it with mealEstimateResultSchema; this only guards the shape without shipping zod.
	 */
	function estimateFrom(data: unknown): MealEstimate | undefined {
		const form = isRecord(data) ? data.form : undefined;
		const estimate = isRecord(form) ? form.data : undefined;
		if (
			!isRecord(estimate) ||
			typeof estimate.caloriesEstimate !== 'number' ||
			typeof estimate.description !== 'string'
		) {
			return undefined;
		}
		return estimate as MealEstimate;
	}
</script>

<form
	bind:this={formEl}
	method="POST"
	action="?/estimateMeal"
	enctype="multipart/form-data"
	class="bg-muted/50 rounded-lg p-3"
	use:enhance={({ formData }) => {
		estimating = true;
		formData.set('note', note);
		if (photo) formData.set('photo', photo, 'meal.jpg');

		return async ({ result }) => {
			estimating = false;
			photo = undefined;
			if (cameraInput) cameraInput.value = '';
			if (galleryInput) galleryInput.value = '';

			const { type, text } = actionMessage(result, {
				success: 'Meal estimated.',
				error: 'Estimating failed.'
			});
			const estimate = result.type === 'success' ? estimateFrom(result.data) : undefined;
			if (type === 'success' && estimate) {
				onEstimated(estimate);
			} else {
				toast.error(type === 'error' ? text : 'Estimating failed.');
			}
		};
	}}
>
	<p class="text-muted-foreground mb-2 flex items-center gap-1.5 text-xs">
		<SparklesIcon class="h-3.5 w-3.5" />
		Snap a photo or type a description, and AI fills in the calories.
	</p>
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
	<div class="flex gap-2">
		<div class="flex flex-1">
			<Button
				type="button"
				variant="outline"
				size="sm"
				class="min-w-0 flex-1 pointer-coarse:rounded-r-none"
				disabled={estimating}
				onclick={() => cameraInput?.click()}
			>
				<CameraIcon />
				Photo
			</Button>
			<!-- Touch only: camera capture replaces the photo picker there, so keep a way to pick a saved photo. -->
			<Button
				type="button"
				variant="outline"
				size="sm"
				class="hidden rounded-l-none border-l-0 pointer-coarse:inline-flex"
				aria-label="Choose a saved meal photo"
				disabled={estimating}
				onclick={() => galleryInput?.click()}
			>
				<ImageIcon />
			</Button>
		</div>
		<Button
			type="submit"
			variant="outline"
			size="sm"
			class="flex-1"
			disabled={estimating || !note.trim()}
			title={note.trim() ? undefined : 'Type a description below first'}
		>
			<SparklesIcon />
			{estimating ? 'Estimating…' : 'Estimate from text'}
		</Button>
	</div>
</form>
