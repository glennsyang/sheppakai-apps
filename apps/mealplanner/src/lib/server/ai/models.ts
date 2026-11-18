// One Gemini model ID for suggestions (gemini.ts) and recipe import (recipe-import/ai-extract.ts).
// Preview models are served only on the v1beta API, so any client calling this model must use
// v1beta: `@google/genai` defaults to v1 (#290); `@sheppakai/shared/ai-vision` already uses v1beta.
export const GEMINI_MODEL = 'gemini-3-flash-preview';
export const GEMINI_API_VERSION = 'v1beta';
// Recipe import falls back to Claude when Gemini filters its own answer (e.g. RECITATION on a
// cookbook photo). Matches budget's receipt-scan default.
export const CLAUDE_IMPORT_MODEL = 'claude-haiku-5-5';
