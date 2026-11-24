<script lang="ts">
	import { enhance } from '$app/forms';

	import { actionFailureText } from '#lib/action-result.js';
	import Icon from '#lib/components/Icon.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import type { Suggestion } from '#lib/types.js';

	interface Props {
		suggestion: Suggestion;
		index: number;
		onViewRecipe: (suggestion: Suggestion) => void;
		onSaveToPlanner: (suggestion: Suggestion) => void;
	}

	let { suggestion, index, onViewRecipe, onSaveToPlanner }: Props = $props();

	const KEY_INGREDIENTS = 4;
	const keyIngredients = $derived(suggestion.ingredients.slice(0, KEY_INGREDIENTS));
	const moreCount = $derived(Math.max(0, suggestion.ingredients.length - KEY_INGREDIENTS));
	// Cards are stuck on one after another, and each hangs a hair off true.
	const tilt = $derived([-0.6, 0.45, -0.25, 0.7, -0.5][index % 5]);

	// "Save to Library" posts to the one action on the Recipes route. The result is handled
	// here without update(): SvelteKit would otherwise navigate to /recipes and the
	// Suggestions on screen (client state only) would be lost.
	const SAVE_FAILED = 'Could not save that dinner to your Library. Please try again.';
	let saving = $state(false);
	let saved = $state<{ recipeId: string; reused: boolean } | null>(null);
	let saveError = $state<string | null>(null);
</script>

<article
	class="index-card animate-stick flex flex-col"
	style="animation-delay: {index * 110}ms; rotate: {tilt}deg"
>
	<span class="magnet" class:magnet-blue={index % 3 === 1} class:magnet-green={index % 3 === 2}
	></span>

	<header class="card-head px-5 pt-6 pb-3">
		<h3 class="text-[1.3rem] leading-snug font-bold tracking-tight">{suggestion.name}</h3>
		<div class="ink-soft mt-2 flex gap-4 text-sm font-semibold">
			<span class="tabular inline-flex items-center gap-1.5">
				<Icon name="clock" size={15} />{suggestion.prepTimeMinutes} min
			</span>
			<span class="tabular inline-flex items-center gap-1.5">
				<Icon name="servings" size={15} />Serves {suggestion.servings}
			</span>
		</div>
	</header>

	<div class="flex flex-1 flex-col gap-3 px-5 pt-3 pb-5">
		<p class="ink-soft line-clamp-3 leading-relaxed">{suggestion.description}</p>
		{#if keyIngredients.length > 0}
			<p class="text-sm leading-relaxed">
				<span class="marker ink-blue">uses</span>
				{keyIngredients.map((ing) => ing.name).join(', ')}{#if moreCount > 0}<span class="ink-faint"
						>, +{moreCount} more</span
					>{/if}
			</p>
		{/if}

		<div class="mt-auto flex flex-wrap gap-2 pt-2">
			<Button
				type="button"
				onclick={() => onSaveToPlanner(suggestion)}
				class="flex-1 text-[0.95rem]"
			>
				Put on the week
			</Button>
			<Button
				type="button"
				onclick={() => onViewRecipe(suggestion)}
				variant="outline"
				class="text-[0.95rem]"
			>
				<Icon name="book" size={16} />
				Recipe
			</Button>
		</div>

		{#if saved}
			<div class="flex flex-wrap items-center gap-x-3" role="status">
				<Button href="/recipes/{saved.recipeId}" variant="link" class="px-0 text-[0.95rem]">
					<Icon name="check" size={16} />
					In your Library
				</Button>
				<span class="ink-soft text-sm font-semibold">
					{saved.reused ? 'Already in your Library' : 'Saved to your Library'}
				</span>
			</div>
		{:else}
			<form
				method="POST"
				action="/recipes?/saveSuggestion"
				use:enhance={() => {
					saving = true;
					saveError = null;
					return async ({ result }) => {
						saving = false;
						const data = result.type === 'success' ? result.data : undefined;
						if (typeof data?.recipeId === 'string') {
							saved = { recipeId: data.recipeId, reused: data.reused === true };
						} else {
							saveError = actionFailureText(result, SAVE_FAILED);
						}
					};
				}}
			>
				<input type="hidden" name="name" value={suggestion.name} />
				<input type="hidden" name="description" value={suggestion.description} />
				<input
					type="hidden"
					name="ingredientsJson"
					value={JSON.stringify(suggestion.ingredients)}
				/>
				<input type="hidden" name="instructionsJson" value={JSON.stringify(suggestion.steps)} />
				<input type="hidden" name="prepTimeMinutes" value={suggestion.prepTimeMinutes} />
				<input type="hidden" name="servings" value={suggestion.servings} />
				<Button type="submit" variant="link" disabled={saving} class="px-0 text-[0.95rem]">
					<Icon name="plus" size={16} />
					{saving ? 'Saving…' : 'Save to Library'}
				</Button>
			</form>
			{#if saveError}
				<p class="text-destructive text-sm font-semibold" role="alert">{saveError}</p>
			{/if}
		{/if}
	</div>
</article>
