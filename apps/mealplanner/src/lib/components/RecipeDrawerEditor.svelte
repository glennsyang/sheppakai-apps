<script lang="ts">
	import { defaults, superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';

	import RecipeForm from '#lib/components/RecipeForm.svelte';
	import { recipeFormSchema, suggestionToForm } from '#lib/schemas/recipes.js';
	import type { MealSuggestion } from '#lib/types.js';

	interface Props {
		recipeId: string;
		/** The meal the drawer shows; seeds the form once, when editing starts. */
		suggestion: MealSuggestion;
		/** Called after a successful save. */
		onSaved: () => Promise<void> | void;
		onCancel: () => void;
	}

	let { recipeId, suggestion, onSaved, onCancel }: Props = $props();

	// The drawer mounts this only while editing, keyed by recipe, so each edit session gets a
	// fresh superForm seeded from the current recipe.
	// svelte-ignore state_referenced_locally — superForm is intentionally initialized once from props
	const editForm = superForm(defaults(suggestionToForm(suggestion), zod4Client(recipeFormSchema)), {
		id: `drawer-recipe-${recipeId}`,
		validators: zod4Client(recipeFormSchema),
		// The form stays mounted after a save until onSaved closes it; don't snap back to the seed.
		resetForm: false,
		async onUpdated({ form }) {
			if (form.valid && form.message?.type === 'success') await onSaved();
		}
	});
</script>

<RecipeForm
	superform={editForm}
	action="/recipes/{recipeId}?/update"
	submitLabel="Save recipe"
	{onCancel}
/>
