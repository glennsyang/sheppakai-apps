// The Suggestion module bound to the real providers: Gemini first, Claude as the fallback.
import { ANTHROPIC_API_KEY, GEMINI_API_KEY } from '$app/env/private';
import { extractJson } from '@sheppakai/shared/ai-vision';

import { CLAUDE_SUGGESTION_MODEL, GEMINI_MODEL } from '#lib/server/ai/models.js';

import { outputSchemas } from './prompts';
import { createSuggester, type SuggestionModel } from './suggester';

export { createSuggester, type SuggestionModels, type SuggestionRequest } from './suggester';

const gemini: SuggestionModel = (request) =>
	extractJson({
		provider: 'gemini',
		apiKey: GEMINI_API_KEY,
		model: GEMINI_MODEL,
		...request,
		schemas: outputSchemas
	});

const claude: SuggestionModel = (request) =>
	extractJson({
		provider: 'claude',
		apiKey: ANTHROPIC_API_KEY,
		model: CLAUDE_SUGGESTION_MODEL,
		...request,
		schemas: outputSchemas
	});

export const suggest = createSuggester({
	models: { gemini: GEMINI_API_KEY ? gemini : null, claude },
	now: () => new Date()
});
