<script lang="ts">
	import { enhance } from '$app/forms';
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
	import { actionMessage } from '@sheppakai/shared/action-message';
	import { toast } from 'svelte-sonner';

	import { getTodayString } from '#lib/utils/date.js';
	import { getFrequentMeals } from '#lib/utils/meal.js';

	interface Meal {
		date: string;
		timeOfDay: string;
		description: string;
		caloriesEstimate: number | null;
	}

	let { meals }: { meals: Meal[] } = $props();

	const frequentMeals = $derived(getFrequentMeals(meals));

	// The description of the meal being logged, so its chip shows progress and others wait.
	let pending = $state<string | null>(null);
</script>

{#if frequentMeals.length > 0}
	<section class="mb-6" aria-labelledby="quick-relog-heading">
		<h2
			id="quick-relog-heading"
			class="text-muted-foreground mb-2 flex items-center gap-2 text-xs font-medium tracking-wide uppercase"
		>
			<RotateCcw class="h-3.5 w-3.5" />
			Log again today
		</h2>
		<div class="flex flex-wrap gap-2">
			{#each frequentMeals as meal (meal.description)}
				<form
					method="POST"
					action="?/logMeal"
					use:enhance={() => {
						pending = meal.description;

						return async ({ result, update }) => {
							const resultMessage = actionMessage(result, {
								success: `Logged ${meal.description}`,
								error: `Couldn't log ${meal.description}`
							});
							if (resultMessage.type === 'success') {
								toast.success(`Logged ${meal.description}`);
							} else {
								toast.error(resultMessage.text);
							}
							await update({ reset: false });
							pending = null;
						};
					}}
				>
					<input type="hidden" name="date" value={getTodayString()} />
					<input type="hidden" name="timeOfDay" value={meal.timeOfDay} />
					<input type="hidden" name="description" value={meal.description} />
					<input type="hidden" name="caloriesEstimate" value={meal.caloriesEstimate ?? ''} />
					<button
						type="submit"
						disabled={pending !== null}
						title={`Log "${meal.description}" as today's ${meal.timeOfDay}`}
						class="border-rule hover:border-pen-fitness hover:text-pen-fitness flex max-w-64 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors disabled:opacity-50"
					>
						<span class="truncate">
							{pending === meal.description ? 'Logging…' : meal.description}
						</span>
						{#if meal.caloriesEstimate != null && pending !== meal.description}
							<span class="text-muted-foreground shrink-0 text-xs">
								{meal.caloriesEstimate} cal
							</span>
						{/if}
					</button>
				</form>
			{/each}
		</div>
	</section>
{/if}
