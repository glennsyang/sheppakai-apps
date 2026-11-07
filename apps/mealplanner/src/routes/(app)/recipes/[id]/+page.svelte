<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import { actionMessage } from '@sheppakai/shared/action-message';
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';

	import AuthFormMessage from '#lib/components/AuthFormMessage.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import Modal from '#lib/components/Modal.svelte';
	import RecipeForm from '#lib/components/RecipeForm.svelte';
	import { Alert } from '#lib/components/ui/alert/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { NativeSelect } from '#lib/components/ui/native-select/index.js';
	import { toLocalIsoDate, weekdayIndex } from '#lib/dates.js';
	import { formatCookedOn } from '#lib/recipes.js';
	import { recipeFormSchema } from '#lib/schemas/recipes.js';
	import { DAY_LABELS } from '#lib/types.js';

	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const recipe = $derived(data.recipe);
	const cooks = $derived(data.cooks);

	let editing = $state(false);
	let confirmingDelete = $state(false);
	/** Feedback from the small one-click forms (rating, planner, cook log rows, delete). */
	let notice = $state<App.Superforms.Message | undefined>();

	// svelte-ignore state_referenced_locally — superForm is intentionally initialized once from props
	const editForm = superForm(data.form, {
		validators: zod4Client(recipeFormSchema),
		// Keep the saved values: the default reset would return to the first load's data, so a
		// second edit would quietly re-submit the original recipe.
		resetForm: false,
		onUpdated({ form }) {
			if (form.valid && form.message?.type === 'success') editing = false;
		}
	});

	const today = new Date();
	const todayIso = toLocalIsoDate(today);

	// The cook date lives outside the superForm: its default is the viewer's own today, which
	// the server can't know, and superforms re-syncs the form from page data on every reload.
	// The server validates it (logCookSchema), so there's no client validator to trip on.
	let cookDate = $state(todayIso);

	// svelte-ignore state_referenced_locally — superForm is intentionally initialized once from props
	const cookSf = superForm(data.cookForm, { resetForm: true });
	const { form: cookForm, message: cookMessage, submitting: cookSubmitting } = cookSf;

	// svelte-ignore state_referenced_locally — the default pick is set once
	let plannerWeek = $state(data.plannerWeeks[0]);
	let plannerDay = $state(String(weekdayIndex(today)));

	function weekLabel(isoDate: string, index: number): string {
		if (index === 0) return 'This week';
		if (index === 1) return 'Next week';
		return `Week of ${formatCookedOn(isoDate).replace(/, \d{4}$/, '')}`;
	}

	/**
	 * A plain `use:enhance` that reports the action's message and reloads the page data. No
	 * reset, so the planner pickers keep their choice.
	 */
	function noticeEnhance(fallbacks: { success: string; error: string }): SubmitFunction {
		return () =>
			async ({ result, update }) => {
				notice = actionMessage(result, fallbacks);
				await update({ reset: false });
			};
	}
</script>

<svelte:head>
	<title>{recipe ? recipe.name : 'Recipe'} — Meal Planner</title>
</svelte:head>

<div class="mx-auto max-w-3xl px-5 pt-8 pb-12 sm:px-10 sm:pt-12">
	<a href="/recipes" class="ink-soft inline-flex items-center gap-1 text-sm font-semibold">
		<Icon name="left" size={16} /> Recipes
	</a>

	{#if data.loadError || !recipe}
		<Alert variant="destructive" class="mt-6" role="alert">
			{data.loadError ?? 'Recipe not found.'}
		</Alert>
	{:else}
		<div class="mt-3 flex flex-wrap items-start justify-between gap-4">
			<div class="min-w-0">
				<h1 class="text-[2rem] leading-tight font-bold tracking-tight sm:text-[2.5rem]">
					{recipe.name}
				</h1>
				<div class="ink-soft mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm font-semibold">
					{#if recipe.prepTimeMinutes}
						<span class="tabular inline-flex items-center gap-1.5">
							<Icon name="clock" size={16} />{recipe.prepTimeMinutes} min
						</span>
					{/if}
					<span class="tabular inline-flex items-center gap-1.5">
						<Icon name="servings" size={16} />Serves {recipe.servings}
					</span>
					{#if recipe.sourceUrl}
						<a
							href={recipe.sourceUrl}
							target="_blank"
							rel="noopener noreferrer nofollow"
							class="inline-flex items-center gap-1.5 underline"
						>
							<Icon name="link" size={16} />{new URL(recipe.sourceUrl).hostname}
						</a>
					{/if}
				</div>
			</div>
			{#if !editing}
				<div class="flex gap-2">
					<Button variant="outline" size="sm" onclick={() => (editing = true)}>
						<Icon name="pencil" size={16} /> Edit
					</Button>
					<Button variant="tonal-destructive" size="sm" onclick={() => (confirmingDelete = true)}>
						<Icon name="x" size={16} /> Delete
					</Button>
				</div>
			{/if}
		</div>

		<div aria-live="polite" class="mt-4">
			<AuthFormMessage message={notice} />
		</div>

		{#if editing}
			<section class="mt-6" aria-label="Edit recipe">
				<RecipeForm
					superform={editForm}
					action="?/update"
					submitLabel="Save changes"
					onCancel={() => (editing = false)}
				/>
			</section>
		{:else}
			<!-- Rating -->
			<form
				method="POST"
				action="?/rate"
				use:enhance={noticeEnhance({
					success: 'Rating saved.',
					error: 'Could not save that rating.'
				})}
				class="mt-6 flex items-center gap-1"
				aria-label="Rating"
			>
				{#each [1, 2, 3, 4, 5] as star (star)}
					{@const filled = (recipe.rating ?? 0) >= star}
					<button
						type="submit"
						name="rating"
						value={recipe.rating === star ? 0 : star}
						class="star"
						class:filled
						aria-label={recipe.rating === star ? `Clear rating` : `Rate ${star} of 5`}
						aria-pressed={recipe.rating === star}
					>
						<Icon name="star" size={24} class={filled ? 'fill-current' : ''} />
					</button>
				{/each}
				<span class="ink-soft ml-2 text-sm">
					{recipe.rating ? `${recipe.rating} of 5` : 'Not rated'}
				</span>
			</form>

			{#if recipe.description}
				<p class="mt-6 max-w-[60ch] text-lg leading-relaxed">{recipe.description}</p>
			{/if}

			<div class="mt-8 grid gap-8 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
				<section aria-labelledby="ingredients-heading">
					<h2 id="ingredients-heading" class="mb-3 text-xl font-bold tracking-tight">
						Ingredients
					</h2>
					{#if recipe.ingredientsJson.length}
						<ul class="space-y-1.5">
							{#each recipe.ingredientsJson as ing, i (i)}
								<li>
									{#if ing.quantity || ing.unit}
										<span class="tabular font-semibold"
											>{[ing.quantity, ing.unit].filter(Boolean).join(' ')}</span
										>
									{/if}
									{ing.name}
								</li>
							{/each}
						</ul>
					{:else}
						<p class="ink-faint">None listed.</p>
					{/if}
				</section>
				<section aria-labelledby="steps-heading">
					<h2 id="steps-heading" class="mb-3 text-xl font-bold tracking-tight">Steps</h2>
					{#if recipe.instructionsJson.length}
						<ol class="space-y-3">
							{#each recipe.instructionsJson as step, i (i)}
								<li class="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-2">
									<span class="marker ink-blue tabular text-right">{i + 1}</span>
									<span class="leading-relaxed">{step}</span>
								</li>
							{/each}
						</ol>
					{:else}
						<p class="ink-faint">None listed.</p>
					{/if}
				</section>
			</div>

			<!-- Add to planner -->
			<section class="panel mt-10 pt-6" aria-labelledby="planner-heading">
				<h2 id="planner-heading" class="mb-3 text-xl font-bold tracking-tight">Add to planner</h2>
				<form
					method="POST"
					action="?/addToPlanner"
					use:enhance={noticeEnhance({
						success: 'Added to the planner.',
						error: 'Could not add that to the planner.'
					})}
					class="grid grid-cols-2 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
				>
					<Label>
						<span class="font-semibold">Week</span>
						<NativeSelect name="weekStartDate" bind:value={plannerWeek} class="w-full">
							{#each data.plannerWeeks as week, i (week)}
								<option value={week}>{weekLabel(week, i)}</option>
							{/each}
						</NativeSelect>
					</Label>
					<Label>
						<span class="font-semibold">Day</span>
						<NativeSelect name="dayOfWeek" bind:value={plannerDay} class="w-full">
							{#each DAY_LABELS as label, i (label)}
								<option value={String(i)}>{label}</option>
							{/each}
						</NativeSelect>
					</Label>
					<Button type="submit" variant="secondary" class="col-span-2 sm:col-span-1">
						<Icon name="calendar" /> Add
					</Button>
				</form>
				<p class="ink-soft mt-2 text-sm">
					Replaces whatever is planned that day.
					<a href="/planner?week={plannerWeek}" class="underline">Open the planner</a>
				</p>
			</section>

			<!-- Cooked it -->
			<section class="panel mt-10 pt-6" aria-labelledby="cooks-heading">
				<h2 id="cooks-heading" class="mb-3 text-xl font-bold tracking-tight">Cooked it</h2>
				<form
					method="POST"
					action="?/logCook"
					use:cookSf.enhance
					class="grid grid-cols-1 gap-3 sm:grid-cols-[10rem_minmax(0,1fr)_auto] sm:items-end"
				>
					<Label>
						<span class="font-semibold">Date</span>
						<Input type="date" name="cookedOn" bind:value={cookDate} max={todayIso} required />
					</Label>
					<Label>
						<span class="font-semibold">Notes</span>
						<Input
							name="notes"
							bind:value={$cookForm.notes}
							maxlength={500}
							placeholder="Doubled the garlic. Kids loved it."
						/>
					</Label>
					<Button type="submit" disabled={$cookSubmitting}>
						<Icon name="check" />
						{$cookSubmitting ? 'Logging…' : 'Log it'}
					</Button>
				</form>
				<div class="mt-2"><AuthFormMessage message={$cookMessage} /></div>

				{#if cooks.length}
					<ul class="mt-5 space-y-2">
						{#each cooks as cook (cook.id)}
							<li class="flex items-start justify-between gap-3">
								<div>
									<span class="tabular font-semibold">{formatCookedOn(cook.cookedOn)}</span>
									{#if cook.notes}<span class="ink-soft"> — {cook.notes}</span>{/if}
								</div>
								<form
									method="POST"
									action="?/deleteCook"
									use:enhance={noticeEnhance({
										success: 'Entry removed.',
										error: 'Could not remove that entry.'
									})}
								>
									<input type="hidden" name="cookId" value={cook.id} />
									<button
										type="submit"
										class="ink-soft p-1"
										aria-label="Remove the {formatCookedOn(cook.cookedOn)} entry"
									>
										<Icon name="x" size={16} />
									</button>
								</form>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="ink-faint mt-4">Not cooked yet.</p>
				{/if}
			</section>
		{/if}

		<Modal
			open={confirmingDelete}
			onClose={() => (confirmingDelete = false)}
			ariaLabel="Delete {recipe.name}"
		>
			<div class="space-y-4 p-6">
				<h2 class="text-xl font-bold">Delete “{recipe.name}”?</h2>
				<p class="ink-soft">
					It comes off any week it's planned for, and its cook log goes with it. This can't be
					undone.
				</p>
				<form
					method="POST"
					action="?/delete"
					use:enhance={() =>
						async ({ result, update }) => {
							if (result.type !== 'redirect') {
								confirmingDelete = false;
								notice = actionMessage(result, {
									success: 'Recipe deleted.',
									error: 'Could not delete that recipe.'
								});
							}
							await update();
						}}
					class="flex gap-3"
				>
					<Button type="submit" variant="destructive">Delete recipe</Button>
					<Button type="button" variant="outline" onclick={() => (confirmingDelete = false)}>
						Keep it
					</Button>
				</form>
			</div>
		</Modal>
	{/if}
</div>

<style>
	.panel {
		border-top: 1px solid var(--rule-strong);
	}
	.star {
		color: var(--ink-faint);
		padding: 0.125rem;
	}
	.star.filled {
		color: var(--marker-blue);
	}
</style>
