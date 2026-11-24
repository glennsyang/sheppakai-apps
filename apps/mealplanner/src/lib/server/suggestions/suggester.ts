// A Suggestion: dinner ideas from the pantry, or variations on a named dish. The module owns
// the rules: load the household's history, ask Gemini (falling back to Claude), keep only
// valid suggestions, and drop what was just cooked.
import { isRecord } from '@sheppakai/shared/guards';

import { pickValidSuggestions } from '#lib/schemas/mealPlan.js';
import { logger } from '#lib/server/logger.js';
import type { Suggestion } from '#lib/types.js';

import { dropRecentRepeats, loadHistory } from './history';
import { pantryPrompt, type SuggestionPrompt, variationPrompt } from './prompts';

export type SuggestionRequest =
	| { kind: 'pantry'; items: string[] }
	| { kind: 'variation'; of: string };

/** Sends one prompt to a provider and returns its parsed, unvalidated JSON. */
export type SuggestionModel = (request: SuggestionPrompt) => Promise<unknown>;

export interface SuggestionModels {
	/** Null when GEMINI_API_KEY isn't set: every Suggestion goes straight to Claude. */
	gemini: SuggestionModel | null;
	claude: SuggestionModel;
}

async function ask(
	provider: string,
	model: SuggestionModel,
	request: SuggestionPrompt
): Promise<Suggestion[]> {
	const raw = await model(request);
	const { suggestions, rejected } = pickValidSuggestions(
		isRecord(raw) ? raw.suggestions : undefined
	);
	if (rejected > 0) {
		logger.warn('Dropped malformed AI suggestions', {
			provider,
			rejected,
			kept: suggestions.length
		});
	}
	if (suggestions.length === 0) {
		throw new Error(`${provider} returned no valid suggestions`);
	}
	return suggestions;
}

export function createSuggester({ models, now }: { models: SuggestionModels; now: () => Date }) {
	return async function suggest(request: SuggestionRequest): Promise<Suggestion[]> {
		const history = loadHistory(now(), { favorites: request.kind === 'pantry' });
		const prompt =
			request.kind === 'pantry'
				? pantryPrompt(request.items, history)
				: variationPrompt(request.of, history);

		logger.info('Requesting suggestions', { kind: request.kind });

		let suggestions: Suggestion[] | undefined;
		if (models.gemini) {
			try {
				suggestions = await ask('gemini', models.gemini, prompt);
			} catch (err) {
				logger.warn('Gemini suggestion failed; retrying with Claude', {
					kind: request.kind,
					reason: String(err)
				});
			}
		}
		suggestions ??= await ask('claude', models.claude, prompt);

		const fresh = dropRecentRepeats(suggestions, history.recentlyCooked);
		logger.info('Suggestions received', {
			kind: request.kind,
			count: fresh.length,
			droppedRecent: suggestions.length - fresh.length
		});
		return fresh;
	};
}
