import type { z } from 'zod';

import type { mealSuggestionSchema } from '#lib/schemas/mealPlan.js';

export interface PantryItem {
	id: string;
	userId: string | null;
	name: string;
	quantity: number | null;
	unit: string | null;
	createdAt: Date;
	updatedAt: Date;
}

export interface Ingredient {
	name: string;
	quantity: string;
	unit: string;
}

// Derived from the runtime schema so the type and the validation can't drift (#171).
export type MealSuggestion = z.output<typeof mealSuggestionSchema>;

export type RecipeSource = 'ai' | 'custom' | 'imported';

export interface Recipe {
	id: string;
	userId: string | null;
	name: string;
	description: string;
	ingredientsJson: Ingredient[];
	instructionsJson: string[];
	prepTimeMinutes: number;
	servings: number;
	source: RecipeSource;
	/** 1–5, null until rated. */
	rating: number | null;
	sourceUrl: string | null;
	createdAt: Date;
	updatedAt: Date;
}

/** A recipe in the library list, with the date it was last cooked. */
export interface RecipeListItem extends Recipe {
	lastCookedOn: string | null;
}

/** One entry in a recipe's "cooked it" log. */
export interface RecipeCook {
	id: string;
	recipeId: string;
	userId: string | null;
	cookedOn: string;
	notes: string;
	createdAt: Date;
	updatedAt: Date;
}

export interface MealPlan {
	id: string;
	userId: string | null;
	weekStartDate: string;
	createdAt: Date;
	updatedAt: Date;
}

export interface MealPlanEntry {
	id: string;
	mealPlanId: string;
	dayOfWeek: number;
	recipeId: string;
	createdAt: Date;
	updatedAt: Date;
}

export interface MealPlanEntryWithRecipe {
	entry: MealPlanEntry;
	recipe: Recipe;
}

export const DAY_LABELS = [
	'Monday',
	'Tuesday',
	'Wednesday',
	'Thursday',
	'Friday',
	'Saturday',
	'Sunday'
] as const;
