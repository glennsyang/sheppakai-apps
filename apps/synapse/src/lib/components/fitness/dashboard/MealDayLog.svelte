<script lang="ts">
	import { ChevronLeft, ChevronRight, UtensilsCrossed } from '@lucide/svelte/icons';
	import type { Infer, SuperValidated } from 'sveltekit-superforms';

	import LogMealDialog from '#lib/components/fitness/dialogs/LogMealDialog.svelte';
	import type { logMealSchema } from '#lib/schemas/fitness.js';
	import {
		addDaysToDateString,
		formatDateMedium,
		getRelativeDateLabel,
		getTodayString
	} from '#lib/utils/date.js';
	import { sortMealsForDay, sumCalories } from '#lib/utils/meal.js';

	interface Meal {
		id: string;
		timeOfDay: string;
		description: string;
		caloriesEstimate: number | null;
	}

	interface Props {
		/** The YYYY-MM-DD day being shown. */
		day: string;
		/** That day's logged meals. */
		meals: Meal[];
		mealForm: SuperValidated<Infer<typeof logMealSchema>>;
	}

	let { day, meals, mealForm }: Props = $props();

	const today = $derived(getTodayString());
	const isToday = $derived(day === today);
	const relativeLabel = $derived(getRelativeDateLabel(day, today));
	const dayLabel = $derived(relativeLabel ?? formatDateMedium(day));
	const heading = $derived(isToday ? "Today's meals" : `Meals · ${dayLabel}`);

	const sortedMeals = $derived(sortMealsForDay(meals));
	const totalCalories = $derived(sumCalories(meals));

	const previousDay = $derived(addDaysToDateString(day, -1));
	const nextDay = $derived(addDaysToDateString(day, 1));
	// Today drops the param so the plain /fitness URL stays the default view.
	const nextHref = $derived(nextDay === today ? '?' : `?day=${nextDay}`);

	const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
</script>

<section class="mb-6" aria-labelledby="meal-day-heading">
	<div class="mb-2 flex items-center justify-between gap-2">
		<h2
			id="meal-day-heading"
			class="text-muted-foreground flex min-w-0 items-center gap-2 text-xs font-medium tracking-wide uppercase"
		>
			<UtensilsCrossed class="h-3.5 w-3.5 shrink-0" />
			<span class="truncate">{heading}</span>
			{#if meals.length > 0}
				<span class="text-foreground shrink-0 normal-case">
					· {totalCalories.toLocaleString()} cal
				</span>
			{/if}
		</h2>

		<nav class="flex shrink-0 items-center gap-1" aria-label="Meal history">
			<a
				href={`?day=${previousDay}`}
				data-sveltekit-noscroll
				data-sveltekit-replacestate
				class="text-muted-foreground hover:text-foreground rounded p-1"
				aria-label="Previous day"
				title="Previous day"
			>
				<ChevronLeft class="h-4 w-4" />
			</a>
			{#if isToday}
				<span class="text-muted-foreground/40 p-1" aria-hidden="true">
					<ChevronRight class="h-4 w-4" />
				</span>
			{:else}
				<a
					href={nextHref}
					data-sveltekit-noscroll
					data-sveltekit-replacestate
					class="text-muted-foreground hover:text-foreground rounded p-1"
					aria-label="Next day"
					title="Next day"
				>
					<ChevronRight class="h-4 w-4" />
				</a>
			{/if}
		</nav>
	</div>

	{#if sortedMeals.length > 0}
		<ul class="divide-rule divide-y text-sm">
			{#each sortedMeals as meal (meal.id)}
				<li class="flex items-baseline gap-3 py-1.5">
					<span class="text-muted-foreground w-18 shrink-0 text-xs">
						{capitalize(meal.timeOfDay)}
					</span>
					<span class="min-w-0 flex-1 truncate">{meal.description}</span>
					<span class="text-muted-foreground shrink-0 text-xs tabular-nums">
						{meal.caloriesEstimate != null ? `${meal.caloriesEstimate} cal` : '—'}
					</span>
				</li>
			{/each}
		</ul>
	{:else if isToday}
		<div class="flex flex-wrap items-center gap-3 text-sm">
			<span class="text-muted-foreground">Nothing logged yet today.</span>
			<LogMealDialog formData={mealForm} instanceId="day-log" />
		</div>
	{:else}
		<p class="text-muted-foreground text-sm">
			Nothing logged {relativeLabel ? relativeLabel.toLowerCase() : `on ${dayLabel}`}.
		</p>
	{/if}
</section>
