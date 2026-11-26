<script lang="ts">
	import { refreshAll } from '$app/navigation';
	import { tick } from 'svelte';
	import { defaults, superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';

	import { actionFailureText } from '#lib/action-result.js';
	import AuthFormMessage from '#lib/components/AuthFormMessage.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import Modal from '#lib/components/Modal.svelte';
	import RecipeDrawer from '#lib/components/RecipeDrawer.svelte';
	import { Alert } from '#lib/components/ui/alert/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import VariationsPanel from '#lib/components/VariationsPanel.svelte';
	import WeeklyPlanner from '#lib/components/WeeklyPlanner.svelte';
	import { addWeeks, getMondayOf } from '#lib/dates.js';
	import { recipeAsSuggestion } from '#lib/recipes.js';
	import {
		addCustomMealSchema,
		saveAndAddSchema,
		suggestionListSchema,
		suggestionSchema
	} from '#lib/schemas/mealPlan.js';
	import { trackToday } from '#lib/today.svelte.js';
	import { DAY_LABELS } from '#lib/types.js';
	import type { MealPlanEntryWithRecipe, Suggestion } from '#lib/types.js';

	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Writable derived: tracks data.entries, but handleEntryRemoved can optimistically
	// drop a row until the next load replaces it.
	let entries = $derived<MealPlanEntryWithRecipe[]>(data.entries);
	let pendingSuggestion = $state<Suggestion | null>(null);
	let showDayPicker = $state(false);

	// Custom meal modal state
	let showCustomModal = $state(false);
	let customModalDay = $state(0);

	// Variations state
	let variationsList = $state<Suggestion[] | null>(null);
	let variationsDay = $state<number | null>(null);
	let variationsMealName = $state('');
	let variationsLoading = $state(false);
	let drawerSuggestion = $state<Suggestion | null>(null);
	// A planned meal opened from the board is already on it, so its drawer has no save action,
	// but it can be edited. Tracked by id so the drawer picks up the saved recipe after a reload.
	let plannedEntryId = $state<string | null>(null);
	const plannedEntry = $derived(entries.find((e) => e.entry.id === plannedEntryId) ?? null);
	const plannedRecipe = $derived(plannedEntry ? recipeAsSuggestion(plannedEntry.recipe) : null);
	let stuckDay = $state<number | null>(null);

	const today = trackToday(() => data.weekStartDate);
	const isCurrentWeek = $derived(data.weekStartDate === getMondayOf(new Date()));
	const takenDays = $derived(new Map(entries.map((e) => [e.entry.dayOfWeek, e.recipe.name])));

	// Single page-level banner for failed planner actions.
	let actionError = $state<string | null>(null);

	$effect(() => {
		const stored = sessionStorage.getItem('pendingSuggestion');
		if (stored) {
			try {
				const parsed = suggestionSchema.safeParse(JSON.parse(stored));
				if (parsed.success) {
					pendingSuggestion = parsed.data;
					showDayPicker = true;
				}
			} catch {
				// ignore parse errors
			}
			sessionStorage.removeItem('pendingSuggestion');
		}
	});

	const PLAN_FAILED = 'Could not add that dinner to the week plan. Please try again.';

	// The client adapter can't derive defaults from the schema, so start from an empty plan.
	const EMPTY_PLAN = {
		weekStartDate: '',
		dayOfWeek: 0,
		name: '',
		description: '',
		ingredientsJson: '',
		instructionsJson: '',
		prepTimeMinutes: 1,
		servings: 1
	};

	// One "Plan Dinner" form for both a Suggestion (via "Which night?") and a Variation.
	// Created once at init; its <form> is always rendered so submit() has a real form.
	const {
		form: planForm,
		enhance: planEnhance,
		submitting: planSubmitting,
		submit: submitPlanForm
	} = superForm(defaults(EMPTY_PLAN, zod4Client(saveAndAddSchema)), {
		id: 'plan-dinner',
		validators: zod4Client(saveAndAddSchema),
		resetForm: false,
		onResult({ result, cancel }) {
			// A redirect (expired session) is applied by superforms: it goes to sign-in.
			if (result.type === 'redirect') return;
			if (result.type !== 'success') {
				actionError = actionFailureText(result, PLAN_FAILED);
				// The banner is the whole failure UI; skip superforms' own failure handling.
				cancel();
				return;
			}
			actionError = null;
			stuckDay = $planForm.dayOfWeek;
			showDayPicker = false;
			pendingSuggestion = null;
			variationsList = null;
			variationsDay = null;
			drawerSuggestion = null;
		},
		onError() {
			actionError = PLAN_FAILED;
		}
	});

	/** Put a Suggestion or Variation on `day` of the week being viewed. */
	async function planDinner(suggestion: Suggestion, day: number): Promise<void> {
		$planForm = {
			weekStartDate: data.weekStartDate,
			dayOfWeek: day,
			name: suggestion.name,
			description: suggestion.description,
			ingredientsJson: JSON.stringify(suggestion.ingredients),
			instructionsJson: JSON.stringify(suggestion.steps),
			prepTimeMinutes: suggestion.prepTimeMinutes,
			servings: suggestion.servings
		};
		// Let the hidden inputs pick up the store before the form posts.
		await tick();
		submitPlanForm();
	}

	// svelte-ignore state_referenced_locally
	const {
		form: customForm,
		errors: customErrors,
		message: customMessage,
		enhance: customEnhance,
		submitting: customSubmitting
	} = superForm(data.addCustomForm, {
		validators: zod4Client(addCustomMealSchema),
		onResult({ result }) {
			if (result.type === 'success') {
				stuckDay = customModalDay;
				showCustomModal = false;
				refreshAll();
			}
		}
	});

	function handleEntryRemoved(entryId: string): void {
		actionError = null;
		entries = entries.filter((e) => e.entry.id !== entryId);
	}

	function closeDayPicker(): void {
		showDayPicker = false;
		pendingSuggestion = null;
	}

	function handleAddCustom(dayOfWeek: number): void {
		$customForm.weekStartDate = data.weekStartDate;
		$customForm.dayOfWeek = dayOfWeek;
		customModalDay = dayOfWeek;
		showCustomModal = true;
	}

	async function handleRequestVariations(dayOfWeek: number, mealName: string): Promise<void> {
		variationsDay = dayOfWeek;
		variationsMealName = mealName;
		variationsLoading = true;
		variationsList = null;

		try {
			const res = await fetch('/api/variations', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ meal: mealName })
			});
			const body = (await res.json().catch(() => ({}))) as {
				data?: unknown;
				error?: { code: string; message: string };
			};
			const parsed = suggestionListSchema.safeParse(body.data);
			if (res.ok && parsed.success) {
				variationsList = parsed.data;
			} else {
				actionError =
					body.error?.message ?? `Could not load variations for ${mealName}. Please try again.`;
			}
		} catch {
			actionError = `Could not load variations for ${mealName}. Please try again.`;
		} finally {
			variationsLoading = false;
		}
	}

	function handleVariationAddToPlanner(suggestion: Suggestion): void {
		if (variationsDay === null) {
			actionError = 'Pick a day first: open variations from a planned dinner.';
			return;
		}
		void planDinner(suggestion, variationsDay);
	}

	function getWeekLabel(weekStartDate: string): string {
		const monday = new Date(weekStartDate + 'T00:00:00');
		const sunday = new Date(monday);
		sunday.setDate(monday.getDate() + 6);
		const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
		return `${fmt(monday)} – ${fmt(sunday)}`;
	}

	function navigateWeek(offset: number): string {
		return '?week=' + addWeeks(data.weekStartDate, offset);
	}
</script>

<svelte:head>
	<title>The Week — Meal Planner</title>
</svelte:head>

<!-- Day picker for a suggestion brought over from Suggest -->
<Modal
	open={showDayPicker && pendingSuggestion !== null}
	onClose={closeDayPicker}
	ariaLabel="Put on the week"
>
	{#if pendingSuggestion}
		<div class="card-head -mx-6 px-6 pb-3">
			<h2 class="text-xl leading-snug font-bold">Which night?</h2>
			<p class="ink-soft mt-1">
				<span class="marker ink-blue">{pendingSuggestion.name}</span>
			</p>
		</div>

		<div class="space-y-5">
			<fieldset class="ruled">
				<legend class="sr-only">Night of the week ({getWeekLabel(data.weekStartDate)})</legend>
				{#each DAY_LABELS as day, i (day)}
					<label class="night">
						<input
							type="radio"
							name="planDay"
							value={i}
							bind:group={$planForm.dayOfWeek}
							class="sr-only"
						/>
						<span class="marker w-24 shrink-0">{day}</span>
						<span class="ink-faint min-w-0 truncate text-sm">
							{takenDays.has(i) ? `replaces ${takenDays.get(i)}` : 'open'}
						</span>
					</label>
				{/each}
			</fieldset>

			<div class="flex gap-2">
				<Button
					type="button"
					disabled={$planSubmitting}
					onclick={() => pendingSuggestion && planDinner(pendingSuggestion, $planForm.dayOfWeek)}
					class="flex-1 py-2.5"
				>
					{$planSubmitting ? 'Sticking it on…' : `Put on ${DAY_LABELS[$planForm.dayOfWeek]}`}
				</Button>

				<Button type="button" onclick={closeDayPicker} variant="outline" class="py-2.5"
					>Cancel</Button
				>
			</div>
		</div>
	{/if}
</Modal>

<!-- The one Plan Dinner form: the day picker and the variations panel / drawer submit it. -->
<form method="POST" action="?/saveAndAdd" use:planEnhance hidden>
	<input type="hidden" name="weekStartDate" value={$planForm.weekStartDate} />
	<input type="hidden" name="dayOfWeek" value={$planForm.dayOfWeek} />
	<input type="hidden" name="name" value={$planForm.name} />
	<input type="hidden" name="description" value={$planForm.description} />
	<input type="hidden" name="ingredientsJson" value={$planForm.ingredientsJson} />
	<input type="hidden" name="instructionsJson" value={$planForm.instructionsJson} />
	<input type="hidden" name="prepTimeMinutes" value={$planForm.prepTimeMinutes} />
	<input type="hidden" name="servings" value={$planForm.servings} />
</form>

<!-- Write in a dinner by hand -->

<Modal
	open={showCustomModal}
	onClose={() => (showCustomModal = false)}
	ariaLabel="Write in a dinner"
>
	<div class="card-head -mx-6 px-6 pb-3">
		<h2 class="text-xl leading-snug font-bold">
			Write in <span class="marker ink-blue">{DAY_LABELS[customModalDay]}</span>
		</h2>
	</div>

	<form method="POST" action="?/addCustom" use:customEnhance class="space-y-4">
		<input type="hidden" name="weekStartDate" value={data.weekStartDate} />

		<input type="hidden" name="dayOfWeek" value={customModalDay} />

		<AuthFormMessage message={$customMessage} />

		<Label class="space-y-1.5">
			<span class="font-semibold">What's for dinner?</span>
			<Input
				type="text"
				name="name"
				bind:value={$customForm.name}
				placeholder="Spaghetti bolognese"
				required
			/>
			{#if $customErrors.name}
				<span class="ink-red text-sm">{$customErrors.name}</span>
			{/if}
		</Label>

		<Label class="space-y-1.5">
			<span class="font-semibold">Notes <span class="ink-faint font-normal">(optional)</span></span>
			<Textarea
				name="notes"
				bind:value={$customForm.notes}
				rows={3}
				placeholder="Double batch, freeze half"
			/>
		</Label>

		<div class="flex gap-2">
			<Button type="submit" disabled={$customSubmitting} class="flex-1 py-2.5"
				>{$customSubmitting ? 'Writing it in…' : 'Write it in'}</Button
			>

			<Button
				type="button"
				onclick={() => (showCustomModal = false)}
				variant="outline"
				class="py-2.5"
			>
				Cancel
			</Button>
		</div>
	</form>
</Modal>

<VariationsPanel
	variations={variationsList}
	mealName={variationsMealName}
	onClose={() => {
		variationsList = null;
		variationsDay = null;
	}}
	onViewRecipe={(s) => {
		drawerSuggestion = s;
	}}
	onAddToPlanner={handleVariationAddToPlanner}
/>

<!-- Recipe for a variation (can be put on the week) -->
<RecipeDrawer
	suggestion={drawerSuggestion}
	onClose={() => (drawerSuggestion = null)}
	onSaveToPlanner={handleVariationAddToPlanner}
/>

<!-- Recipe for a planned dinner already on the board -->
<RecipeDrawer
	suggestion={plannedRecipe}
	onClose={() => (plannedEntryId = null)}
	recipeId={plannedEntry?.recipe.id}
	onSaved={refreshAll}
/>

<div class="px-5 pt-8 pb-4 sm:px-10 sm:pt-12">
	<div class="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
		<div>
			<h1 class="text-[2rem] leading-tight font-bold tracking-tight sm:text-[2.5rem]">The week</h1>
			<p class="ink-soft mt-1 text-lg">One dinner a night, shared by the two of you.</p>
		</div>

		<nav class="flex items-center gap-1" aria-label="Choose week">
			<a href={navigateWeek(-1)} class="week-step" aria-label="Previous week">
				<Icon name="left" size={20} />
			</a>
			<span class="marker tabular min-w-[9.5rem] text-center text-lg" aria-live="polite">
				{getWeekLabel(data.weekStartDate)}
			</span>
			<a href={navigateWeek(1)} class="week-step" aria-label="Next week">
				<Icon name="right" size={20} />
			</a>
		</nav>
	</div>
	<div class="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
		<a
			href="/shopping?week={data.weekStartDate}"
			class="act-text ink-blue inline-flex items-center gap-1.5"
		>
			<Icon name="list" size={18} />
			Shopping list
		</a>
		{#if !isCurrentWeek}
			<a href="/planner" class="act-text ink-blue">Back to this week</a>
		{/if}
	</div>

	{#if data.loadError}
		<Alert variant="destructive" class="mt-6" role="alert">{data.loadError}</Alert>
	{/if}
	{#if actionError}
		<Alert variant="destructive" class="mt-6 flex items-center justify-between gap-4" role="alert">
			<span>{actionError}</span>
			<button
				type="button"
				class="act-text shrink-0 text-sm"
				onclick={() => (actionError = null)}
				aria-label="Dismiss error"
			>
				Dismiss
			</button>
		</Alert>
	{/if}
</div>

<div class="px-3 pb-6 sm:px-8">
	<WeeklyPlanner
		weekStartDate={data.weekStartDate}
		{entries}
		todayIndex={today.index}
		{stuckDay}
		onOpenRecipe={(e) => (plannedEntryId = e.entry.id)}
		actions={{
			onEntryRemoved: handleEntryRemoved,
			onRemoveFailed: (text) => (actionError = text),
			onAddCustom: handleAddCustom,
			onRequestVariations: handleRequestVariations,
			loadingVariationsDay: variationsLoading ? variationsDay : null
		}}
	/>
</div>

<div class="foot flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-6 sm:px-10">
	<Button href="/suggest" class="px-5 py-2.5">
		<Icon name="sparkles" />
		Get dinner ideas
	</Button>
	<p class="ink-soft text-sm">
		Ideas come from what's in the pantry. Tap a dinner to read its recipe.
	</p>
</div>

<style>
	.week-step {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2.75rem;
		height: 2.75rem;
		border-radius: 999px;
		color: var(--ink-soft);
		box-shadow: inset 0 0 0 1.5px var(--rule);
	}
	.week-step:hover {
		color: var(--ink);
		box-shadow: inset 0 0 0 1.5px var(--ink);
	}

	.night {
		display: flex;
		align-items: baseline;
		gap: 0.75rem;
		padding: 0.6rem 0.5rem;
		border-radius: 6px;
		cursor: pointer;
	}
	.night:hover {
		background: color-mix(in oklch, var(--marker-blue) 6%, transparent);
	}
	.night:has(input:checked) {
		background: color-mix(in oklch, var(--marker-blue) 12%, transparent);
		box-shadow: inset 0 0 0 1.5px var(--marker-blue);
	}
	.night:has(input:checked) .marker {
		color: var(--marker-blue);
	}
	.night:has(input:focus-visible) {
		outline: 2.5px solid var(--marker-blue);
		outline-offset: 2px;
	}

	.foot {
		border-top: 1px solid var(--rule-strong);
	}
</style>
