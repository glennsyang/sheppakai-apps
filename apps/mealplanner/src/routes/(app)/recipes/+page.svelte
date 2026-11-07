<script lang="ts">
	import Icon from '#lib/components/Icon.svelte';
	import { Alert } from '#lib/components/ui/alert/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { formatCookedOn } from '#lib/recipes.js';

	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Recipes — Meal Planner</title>
</svelte:head>

<div class="px-5 pt-8 pb-10 sm:px-10 sm:pt-12">
	{#if data.loadError}
		<Alert variant="destructive" class="mb-6" role="alert">{data.loadError}</Alert>
	{/if}

	<div class="flex flex-wrap items-end justify-between gap-4">
		<div>
			<h1 class="text-[2rem] leading-tight font-bold tracking-tight sm:text-[2.5rem]">Recipes</h1>
			<p class="ink-soft mt-2 max-w-[56ch] text-lg leading-relaxed">
				The family cookbook. Add your own, or bring one in from a link or a photo.
			</p>
		</div>
		<Button href="/recipes/new" class="px-5 py-2.5">
			<Icon name="plus" />
			Add recipe
		</Button>
	</div>

	<form method="GET" class="mt-8 flex max-w-xl gap-2" role="search">
		<Input
			type="search"
			name="q"
			value={data.q}
			maxlength={100}
			class="text-lg"
			aria-label="Search recipes by name or ingredient"
			placeholder="Search by name or ingredient"
		/>
		<Button type="submit" variant="outline" aria-label="Search">
			<Icon name="search" />
		</Button>
	</form>

	{#if data.recipes.length === 0}
		<p class="marker ink-faint mt-10 text-xl">
			{#if data.q}
				Nothing matches “{data.q}”. <a href="/recipes" class="underline">Show all recipes</a>
			{:else}
				No recipes yet. Add the first one above.
			{/if}
		</p>
	{:else}
		<p class="ink-soft tabular mt-6 text-sm">
			{data.recipes.length}
			{data.recipes.length === 1 ? 'recipe' : 'recipes'}{data.q ? ` matching “${data.q}”` : ''}
		</p>
		<ul class="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
			{#each data.recipes as recipe (recipe.id)}
				<li>
					<a href="/recipes/{recipe.id}" class="index-card block h-full px-5 py-4">
						<span class="block text-lg leading-snug font-bold">{recipe.name}</span>
						<span class="ink-soft mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
							{#if recipe.rating}
								<span
									class="ink-blue inline-flex items-center gap-1"
									aria-label="{recipe.rating} of 5 stars"
								>
									<Icon name="star" size={14} class="fill-current" />{recipe.rating}
								</span>
							{/if}
							{#if recipe.prepTimeMinutes}
								<span class="tabular inline-flex items-center gap-1">
									<Icon name="clock" size={14} />{recipe.prepTimeMinutes} min
								</span>
							{/if}
							<span>
								{recipe.lastCookedOn
									? `Cooked ${formatCookedOn(recipe.lastCookedOn)}`
									: 'Not cooked yet'}
							</span>
						</span>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</div>
