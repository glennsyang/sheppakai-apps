// Turns the household's cook log and ratings into prompt context for meal suggestions,
// and enforces "don't re-suggest what we just ate" on the model's output (#197).

import { sanitizePromptText } from './promptSafety';

// Matches the recipe name bound in src/lib/schemas/recipes.ts.
const MAX_RECIPE_NAME_LENGTH = 200;

export interface SuggestionHistory {
	/** Recipes cooked inside the avoid window, most recent first. */
	recentlyCooked: string[];
	/** Highly rated recipes not cooked recently. */
	favorites: string[];
	/** Low-rated recipes. */
	disliked: string[];
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
export function buildHistoryPrompt(history: SuggestionHistory | undefined): string {
	if (!history) return '';
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
