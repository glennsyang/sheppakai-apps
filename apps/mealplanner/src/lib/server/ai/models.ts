// One Gemini model ID for Suggestions (suggestions/) and recipe import (recipe-import/ai-extract.ts).
// Preview models are served only on the v1beta API; `@sheppakai/shared/ai-vision` uses v1beta.
export const GEMINI_MODEL = 'gemini-3-flash-preview';
// Recipe import falls back to Claude when Gemini filters its own answer (e.g. RECITATION on a
// cookbook photo). Matches budget's receipt-scan default.
export const CLAUDE_IMPORT_MODEL = 'claude-haiku-5-5';
// Suggestions fall back to Claude on any Gemini failure.
export const CLAUDE_SUGGESTION_MODEL = 'claude-sonnet-5-5';
