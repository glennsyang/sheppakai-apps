<script lang="ts">
	import type { SuperForm } from 'sveltekit-superforms';
	import type { z } from 'zod';

	import AuthFormMessage from '#lib/components/AuthFormMessage.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import type { recipeFormSchema } from '#lib/schemas/recipes.js';
	import type { Ingredient } from '#lib/types.js';

	interface Props {
		superform: SuperForm<z.infer<typeof recipeFormSchema>>;
		/** Form action, e.g. `?/create`. */
		action: string;
		submitLabel: string;
		onCancel?: () => void;
	}

	let { superform, action, submitLabel, onCancel }: Props = $props();

	// svelte-ignore state_referenced_locally — the superForm instance is fixed for the component's life
	const { form, errors, constraints, enhance, message, submitting } = superform;

	function parseList<T>(raw: string, isItem: (item: unknown) => item is T): T[] {
		try {
			const parsed: unknown = JSON.parse(raw);
			return Array.isArray(parsed) ? parsed.filter(isItem) : [];
		} catch {
			return [];
		}
	}

	const isIngredient = (item: unknown): item is Ingredient =>
		typeof item === 'object' && item !== null && typeof (item as Ingredient).name === 'string';
	const isStep = (item: unknown): item is string => typeof item === 'string';

	const blankIngredient = (): Ingredient => ({ quantity: '', unit: '', name: '' });

	// Row editors, seeded once from the form. A parent that replaces the form data (an import)
	// remounts this component with {#key} so the rows reseed.
	const initialIngredients = parseList($form.ingredientsJson, isIngredient);
	const initialSteps = parseList($form.instructionsJson, isStep);
	let ingredients = $state<Ingredient[]>(
		initialIngredients.length ? initialIngredients.map((ing) => ({ ...ing })) : [blankIngredient()]
	);
	let steps = $state<string[]>(initialSteps.length ? initialSteps : ['']);

	/** Write the filled rows into the form's JSON fields. Runs after every row edit. */
	function syncLists() {
		$form.ingredientsJson = JSON.stringify(
			ingredients
				.map((ing) => ({
					quantity: ing.quantity.trim(),
					unit: ing.unit.trim(),
					name: ing.name.trim()
				}))
				.filter((ing) => ing.name)
		);
		$form.instructionsJson = JSON.stringify(steps.map((step) => step.trim()).filter(Boolean));
	}

	function addIngredient() {
		ingredients.push(blankIngredient());
	}
	function removeIngredient(i: number) {
		ingredients.splice(i, 1);
		if (ingredients.length === 0) ingredients.push(blankIngredient());
		syncLists();
	}
	function addStep() {
		steps.push('');
	}
	function removeStep(i: number) {
		steps.splice(i, 1);
		if (steps.length === 0) steps.push('');
		syncLists();
	}
</script>

<form method="POST" {action} use:enhance class="space-y-6">
	<AuthFormMessage message={$message} />

	<input type="hidden" name="ingredientsJson" value={$form.ingredientsJson} />
	<input type="hidden" name="instructionsJson" value={$form.instructionsJson} />
	<input type="hidden" name="source" value={$form.source} />
	<input type="hidden" name="sourceUrl" value={$form.sourceUrl} />

	<Label>
		<span class="font-semibold">Name</span>
		<Input
			name="name"
			bind:value={$form.name}
			class="text-lg"
			aria-invalid={$errors.name ? 'true' : undefined}
			{...$constraints.name}
			placeholder="Grandma's lasagne"
		/>
		{#if $errors.name}<span class="ink-red text-sm">{$errors.name}</span>{/if}
	</Label>

	<Label>
		<span class="font-semibold">Notes</span>
		<Textarea
			name="description"
			bind:value={$form.description}
			rows={3}
			aria-invalid={$errors.description ? 'true' : undefined}
			placeholder="What it is, where it's from"
		/>
	</Label>

	<div class="grid grid-cols-2 gap-3 sm:max-w-sm">
		<Label>
			<span class="font-semibold">Time (min)</span>
			<Input
				type="number"
				name="prepTimeMinutes"
				bind:value={$form.prepTimeMinutes}
				class="tabular"
				min={0}
				max={1440}
				aria-invalid={$errors.prepTimeMinutes ? 'true' : undefined}
			/>
		</Label>
		<Label>
			<span class="font-semibold">Serves</span>
			<Input
				type="number"
				name="servings"
				bind:value={$form.servings}
				class="tabular"
				min={1}
				max={100}
				aria-invalid={$errors.servings ? 'true' : undefined}
			/>
		</Label>
	</div>

	<fieldset class="space-y-2" oninput={syncLists}>
		<legend class="mb-2 font-semibold">Ingredients</legend>
		{#each ingredients as ingredient, i (i)}
			<div class="grid grid-cols-[4.5rem_5rem_minmax(0,1fr)_auto] gap-2">
				<Input
					bind:value={ingredient.quantity}
					aria-label="Ingredient {i + 1} amount"
					placeholder="2"
				/>
				<Input
					bind:value={ingredient.unit}
					aria-label="Ingredient {i + 1} unit"
					placeholder="cups"
				/>
				<Input
					bind:value={ingredient.name}
					aria-label="Ingredient {i + 1} name"
					placeholder="flour"
				/>
				<Button
					type="button"
					variant="outline"
					size="icon"
					aria-label="Remove ingredient {i + 1}"
					onclick={() => removeIngredient(i)}
				>
					<Icon name="x" size={16} />
				</Button>
			</div>
		{/each}
		{#if $errors.ingredientsJson}<p class="ink-red text-sm">{$errors.ingredientsJson}</p>{/if}
		<Button type="button" variant="link" onclick={addIngredient}>
			<Icon name="plus" size={16} /> Add ingredient
		</Button>
	</fieldset>

	<fieldset class="space-y-2" oninput={syncLists}>
		<legend class="mb-2 font-semibold">Steps</legend>
		{#each steps as _, i (i)}
			<div class="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-start gap-2">
				<span class="marker ink-soft tabular pt-2 text-right">{i + 1}</span>
				<Textarea bind:value={steps[i]} rows={2} aria-label="Step {i + 1}" />
				<Button
					type="button"
					variant="outline"
					size="icon"
					aria-label="Remove step {i + 1}"
					onclick={() => removeStep(i)}
				>
					<Icon name="x" size={16} />
				</Button>
			</div>
		{/each}
		{#if $errors.instructionsJson}<p class="ink-red text-sm">{$errors.instructionsJson}</p>{/if}
		<Button type="button" variant="link" onclick={addStep}>
			<Icon name="plus" size={16} /> Add step
		</Button>
	</fieldset>

	<div class="flex flex-wrap gap-3">
		<Button type="submit" disabled={$submitting} class="px-5 py-2.5">
			<Icon name="check" />
			{$submitting ? 'Saving…' : submitLabel}
		</Button>
		{#if onCancel}
			<Button type="button" variant="outline" onclick={onCancel}>Cancel</Button>
		{/if}
	</div>
</form>
