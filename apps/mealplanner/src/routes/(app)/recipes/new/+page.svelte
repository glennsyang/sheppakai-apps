<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import { actionMessage } from '@sheppakai/shared/action-message';
	import { isRecord } from '@sheppakai/shared/guards';
	import { resizeImage } from '@sheppakai/shared/image-resize';
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import type { z } from 'zod';

	import AuthFormMessage from '#lib/components/AuthFormMessage.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import RecipeForm from '#lib/components/RecipeForm.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { recipeFormSchema } from '#lib/schemas/recipes.js';

	import type { PageData } from './$types';

	type RecipeFormData = z.infer<typeof recipeFormSchema>;

	let { data }: { data: PageData } = $props();

	// svelte-ignore state_referenced_locally — superForm is intentionally initialized once from props
	const recipeForm = superForm(data.form, { validators: zod4Client(recipeFormSchema) });
	const { form } = recipeForm;

	// Bumped after each import so RecipeForm remounts and reseeds its row editors.
	let importVersion = $state(0);
	let importing = $state<'url' | 'photo' | null>(null);
	let importMessage = $state<App.Superforms.Message | undefined>();
	let photoForm = $state<HTMLFormElement>();
	let photoInput = $state<HTMLInputElement>();
	let photo: Blob | undefined;

	/**
	 * The import carried back as the action's form data. The action already validated it
	 * against recipeFormSchema; this only guards the shape without re-running zod.
	 */
	function importedFrom(result: unknown): RecipeFormData | undefined {
		const formData = isRecord(result) ? result.form : undefined;
		const recipe = isRecord(formData) ? formData.data : undefined;
		return isRecord(recipe) && typeof recipe.name === 'string' && recipe.name
			? (recipe as RecipeFormData)
			: undefined;
	}

	function importEnhance(kind: 'url' | 'photo'): SubmitFunction {
		return ({ formData, cancel }) => {
			if (importing) return cancel();
			if (kind === 'photo' && photo) formData.set('photo', photo, 'recipe.jpg');
			importing = kind;
			importMessage = undefined;

			return async ({ result }) => {
				importing = null;
				photo = undefined;
				if (photoInput) photoInput.value = '';

				importMessage = actionMessage(result, {
					success: 'Recipe imported. Check the details, then save.',
					error: 'Importing failed. Try again, or add the recipe by hand.'
				});
				const imported = result.type === 'success' ? importedFrom(result.data) : undefined;
				if (imported) {
					form.set(imported);
					importVersion++;
				} else if (importMessage.type === 'success') {
					importMessage = {
						type: 'error',
						text: 'Importing failed. Try again, or add the recipe by hand.'
					};
				}
			};
		};
	}

	async function onPhotoChosen(event: Event & { currentTarget: HTMLInputElement }) {
		const file = event.currentTarget.files?.[0];
		if (!file) return;
		try {
			photo = await resizeImage(file);
		} catch {
			importMessage = { type: 'error', text: "Couldn't prepare that photo. Try another one." };
			return;
		}
		photoForm?.requestSubmit();
	}
</script>

<svelte:head>
	<title>Add recipe — Meal Planner</title>
</svelte:head>

<div class="mx-auto max-w-3xl px-5 pt-8 pb-12 sm:px-10 sm:pt-12">
	<a href="/recipes" class="ink-soft inline-flex items-center gap-1 text-sm font-semibold">
		<Icon name="left" size={16} /> Recipes
	</a>
	<h1 class="mt-3 text-[2rem] leading-tight font-bold tracking-tight sm:text-[2.5rem]">
		Add a recipe
	</h1>

	<section class="import mt-8 space-y-4 pb-8" aria-labelledby="import-heading">
		<h2 id="import-heading" class="text-xl font-bold tracking-tight">Bring one in</h2>
		<p class="ink-soft">
			Paste a link or snap a photo. You can check everything before it's saved.
		</p>

		<form
			method="POST"
			action="?/importUrl"
			use:enhance={importEnhance('url')}
			class="flex flex-col gap-2 sm:flex-row"
		>
			<Input
				type="url"
				name="url"
				required
				maxlength={2000}
				class="text-lg"
				aria-label="Recipe web address"
				placeholder="https://…"
			/>
			<Button type="submit" variant="outline" disabled={importing !== null}>
				<Icon name="link" />
				{importing === 'url' ? 'Reading page…' : 'Import link'}
			</Button>
		</form>

		{#if data.photoImportEnabled}
			<form
				bind:this={photoForm}
				method="POST"
				action="?/importPhoto"
				enctype="multipart/form-data"
				use:enhance={importEnhance('photo')}
			>
				<!-- No `capture`: phones then offer both the camera and saved photos (a cookbook screenshot). -->
				<input
					bind:this={photoInput}
					class="hidden"
					type="file"
					accept="image/*"
					onchange={onPhotoChosen}
				/>
				<Button
					type="button"
					variant="outline"
					disabled={importing !== null}
					onclick={() => photoInput?.click()}
				>
					<Icon name="camera" />
					{importing === 'photo' ? 'Reading photo…' : 'Import from a photo'}
				</Button>
			</form>
		{/if}

		<div aria-live="polite">
			<AuthFormMessage message={importMessage} />
		</div>
	</section>

	<section class="mt-8" aria-labelledby="recipe-heading">
		<h2 id="recipe-heading" class="mb-4 text-xl font-bold tracking-tight">
			{$form.source === 'imported' ? 'Check the import' : 'Or write it in'}
		</h2>
		{#key importVersion}
			<RecipeForm superform={recipeForm} action="?/create" submitLabel="Save recipe" />
		{/key}
	</section>
</div>

<style>
	.import {
		border-bottom: 1px solid var(--rule-strong);
	}
</style>
