<script lang="ts">
	import { ArrowRight, Plus } from '@lucide/svelte/icons';
	import type { Infer, SuperValidated } from 'sveltekit-superforms';

	import LogMealDialog from '#lib/components/fitness/dialogs/LogMealDialog.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import type { logMealSchema, MealType } from '#lib/schemas/fitness.js';
	import type { TodayMeals } from '#lib/utils/meal.js';

	interface Props {
		todayMeals: TodayMeals;
		mealForm: SuperValidated<Infer<typeof logMealSchema>>;
	}

	let { todayMeals, mealForm }: Props = $props();

	// One dialog serves every slot; the button that opens it picks the meal type.
	let dialogOpen = $state(false);
	let selectedType = $state<MealType>('breakfast');

	function openLog(type: MealType) {
		selectedType = type;
		dialogOpen = true;
	}

	const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
</script>

<section aria-labelledby="meals-h" class="min-w-0">
	<div class="ruled mb-1 flex items-baseline gap-3 pb-2">
		<h2 id="meals-h" class="text-2xl font-black tracking-tight">Today's food log</h2>
		<span class="text-muted-foreground text-sm tabular-nums">
			<span class="text-foreground font-black">{todayMeals.totalCalories.toLocaleString()}</span>
			{#if todayMeals.targetCalories}
				/ {todayMeals.targetCalories.toLocaleString()}
			{/if}
			cal
		</span>
		<a
			href="/fitness"
			class="text-pen-fitness ml-auto flex items-center gap-1 text-xs font-bold hover:underline"
			>Fitness<ArrowRight class="size-3" aria-hidden="true" /></a
		>
	</div>

	<ul>
		{#each todayMeals.slots as slot (slot.type)}
			<li class="border-rule flex min-h-11 items-center gap-3 border-b">
				<span class="text-muted-foreground w-20 shrink-0 text-sm font-medium">
					{capitalize(slot.type)}
				</span>
				{#if slot.description}
					<span class="min-w-0 flex-1 truncate text-[0.95rem]" title={slot.description}>
						{slot.description}
					</span>
					<span class="text-muted-foreground shrink-0 text-sm tabular-nums">
						{slot.calories != null ? `${slot.calories.toLocaleString()} cal` : '—'}
					</span>
					<Button
						variant="ghost"
						size="icon-sm"
						class="text-muted-foreground hover:text-pen-fitness shrink-0"
						aria-label={`Add to ${slot.type}`}
						title={`Add to ${slot.type}`}
						onclick={() => openLog(slot.type)}
					>
						<Plus class="size-4" />
					</Button>
				{:else}
					<span class="text-muted-foreground flex-1 text-[0.95rem] italic">Missing</span>
					<Button
						variant="outline"
						size="sm"
						class="hover:text-pen-fitness hover:border-pen-fitness shrink-0"
						aria-label={`Log ${slot.type}`}
						onclick={() => openLog(slot.type)}
					>
						Log
					</Button>
				{/if}
			</li>
		{/each}
	</ul>

	<LogMealDialog
		formData={mealForm}
		bind:open={dialogOpen}
		instanceId="dashboard"
		actionPath="/fitness"
		defaultTimeOfDay={selectedType}
		onClose={() => (dialogOpen = false)}
	/>
</section>
