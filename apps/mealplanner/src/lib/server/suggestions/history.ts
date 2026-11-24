// The household's cook log and ratings, as prompt context for a Suggestion, and the
// "don't re-suggest what we just ate" rule on the model's output (#197).
import { and, desc, eq, gte, lte, max, notInArray } from 'drizzle-orm';

import { toLocalIsoDate } from '#lib/dates.js';
import { sanitizePromptText } from '#lib/server/ai/promptSafety.js';
import { getDb } from '#lib/server/db/index.js';
import { recipeCooks, recipes } from '#lib/server/db/schema/index.js';
import { logger } from '#lib/server/logger.js';

/** Recipes cooked within this many days are not re-suggested. */
const RECENT_COOK_WINDOW_DAYS = 14;

const MAX_RECENT = 15;
const MAX_FAVORITES = 10;
const MAX_DISLIKED = 10;

// Matches the recipe name bound in src/lib/schemas/recipes.ts.
const MAX_RECIPE_NAME_LENGTH = 200;

export interface SuggestionHistory {
	/** Recipes cooked inside the avoid window, most recent first. */
	recentlyCooked: string[];
	/** Highly rated recipes not cooked recently. Empty unless asked for. */
	favorites: string[];
	/** Low-rated recipes. */
	disliked: string[];
}

/** The household's history as of `today`. Favorites are only queried when asked for. */
export function loadHistory(today: Date, options: { favorites: boolean }): SuggestionHistory {
	const db = getDb();
	const cutoff = new Date(
		today.getFullYear(),
		today.getMonth(),
		today.getDate() - RECENT_COOK_WINDOW_DAYS
	);
	const cutoffIso = toLocalIsoDate(cutoff);

	const lastCooked = max(recipeCooks.cookedOn);
	const recentRows = db
		.select({ id: recipes.id, name: recipes.name, lastCooked })
		.from(recipeCooks)
		.innerJoin(recipes, eq(recipeCooks.recipeId, recipes.id))
		.where(gte(recipeCooks.cookedOn, cutoffIso))
		.groupBy(recipes.id)
		.orderBy(desc(lastCooked))
		.limit(MAX_RECENT)
		.all();
	const recentIds = recentRows.map((row) => row.id);

	const favorites = options.favorites
		? db
				.select({ name: recipes.name })
				.from(recipes)
				.where(
					and(
						gte(recipes.rating, 4),
						recentIds.length > 0 ? notInArray(recipes.id, recentIds) : undefined
					)
				)
				.orderBy(desc(recipes.rating), desc(recipes.updatedAt))
				.limit(MAX_FAVORITES)
				.all()
		: [];

	const disliked = db
		.select({ name: recipes.name })
		.from(recipes)
		.where(lte(recipes.rating, 2))
		.orderBy(desc(recipes.updatedAt))
		.limit(MAX_DISLIKED)
		.all();

	const history = {
		recentlyCooked: recentRows.map((row) => row.name),
		favorites: favorites.map((row) => row.name),
		disliked: disliked.map((row) => row.name)
	};
	logger.debug('Suggestion history loaded', {
		cutoff: cutoffIso,
		recent: history.recentlyCooked.length,
		favorites: history.favorites.length,
		disliked: history.disliked.length
	});
	return history;
}

function safeNames(names: string[]): string[] {
	return names.flatMap((name) => {
		try {
			return [sanitizePromptText(name, MAX_RECIPE_NAME_LENGTH)];
		} catch {
			return [];
		}
	});
}

function block(tag: string, names: string[]): string {
	const safe = safeNames(names);
	return safe.length > 0 ? `<${tag}>\n${safe.join('\n')}\n</${tag}>` : '';
}

/** Prompt section describing the household's history, or `''` when there is none. */
export function buildHistoryPrompt(history: SuggestionHistory): string {
	return [
		block('recently_cooked', history.recentlyCooked),
		block('family_favorites', history.favorites),
		block('disliked', history.disliked)
	]
		.filter(Boolean)
		.join('\n');
}

function normalizeName(name: string): string {
	return name.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Drops suggestions whose name matches a recently cooked recipe. If that would leave
 * nothing, returns the original list: a repeat beats an empty result.
 */
export function dropRecentRepeats<T extends { name: string }>(
	suggestions: T[],
	recentNames: string[]
): T[] {
	if (recentNames.length === 0) return suggestions;
	const recent = new Set(recentNames.map(normalizeName));
	const kept = suggestions.filter((s) => !recent.has(normalizeName(s.name)));
	return kept.length > 0 ? kept : suggestions;
}
