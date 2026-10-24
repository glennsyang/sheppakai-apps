// Photo and/or text → structured JSON from Gemini or Claude. Apps own the prompt, the output
// schemas and the validation of what comes back; this module owns the uploaded image and the
// provider wire formats. Budget's receipt scan and synapse's meal estimate both use it.
import { isRecord } from './guards';

export const AI_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export type AiImage = {
	base64: string;
	mimeType: (typeof AI_IMAGE_TYPES)[number];
};

export type AiProvider = 'gemini' | 'claude';

export const MAX_AI_IMAGE_BYTES = 5 * 1024 * 1024;

const REQUEST_TIMEOUT_MS = 30_000;

/** The uploaded form value as a provider-ready image, or null if it isn't an allowed image. */
export async function toAiImage(value: FormDataEntryValue | null): Promise<AiImage | null> {
	if (!(value instanceof File) || value.size === 0 || value.size > MAX_AI_IMAGE_BYTES) return null;
	const mimeType = AI_IMAGE_TYPES.find((type) => type === value.type);
	if (!mimeType) return null;
	return { mimeType, base64: Buffer.from(await value.arrayBuffer()).toString('base64') };
}

export type ExtractJsonRequest = {
	provider: AiProvider;
	apiKey: string | undefined;
	model: string;
	prompt: string;
	/** Left out for text-only requests. */
	image?: AiImage | null;
	/**
	 * The output shape in each provider's dialect. Claude takes standard JSON Schema (every
	 * object needs `additionalProperties: false`); Gemini takes its OpenAPI-style schema
	 * (uppercase types, `nullable`).
	 */
	schemas: { claude: object; gemini: object };
};

/**
 * Sends the prompt (and image) to the provider and returns its parsed JSON, unvalidated: the
 * caller checks it against its own Zod schema. Throws a `SyntaxError` when the provider answers
 * with malformed JSON, and a plain `Error` for transport and provider failures.
 */
export async function extractJson(request: ExtractJsonRequest): Promise<unknown> {
	return request.provider === 'claude' ? extractWithClaude(request) : extractWithGemini(request);
}

const CLAUDE_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const CLAUDE_API_VERSION = '2026-10-21';

async function extractWithClaude({
	apiKey,
	model,
	prompt,
	image,
	schemas
}: ExtractJsonRequest): Promise<unknown> {
	if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');

	const content: object[] = [{ type: 'text', text: prompt }];
	if (image) {
		content.unshift({
			type: 'image',
			source: { type: 'base64', media_type: image.mimeType, data: image.base64 }
		});
	}

	const response = await fetch(CLAUDE_ENDPOINT, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			'x-api-key': apiKey,
			'anthropic-version': CLAUDE_API_VERSION
		},
		body: JSON.stringify({
			model,
			max_tokens: 4096,
			output_config: { effort: 'low', format: { type: 'json_schema', schema: schemas.claude } },
			messages: [{ role: 'user', content }]
		}),
		signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
	});

	if (!response.ok) throw new Error(`Claude request failed with status ${response.status}`);

	const body: unknown = await response.json();
	if (!isRecord(body)) throw new Error('Claude returned a non-object response');
	// A refusal or a max_tokens cut-off may not match the schema.
	if (body.stop_reason !== 'end_turn') {
		throw new Error(`Claude stopped with ${String(body.stop_reason)}`);
	}

	const blocks = Array.isArray(body.content) ? (body.content as unknown[]) : [];
	const textBlock = blocks.find((block) => isRecord(block) && block.type === 'text');
	if (!isRecord(textBlock) || typeof textBlock.text !== 'string') {
		throw new Error('Claude returned no text content');
	}
	return JSON.parse(textBlock.text);
}

const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

/** The first non-thought text part of the first candidate. */
function geminiResponseText(body: unknown): string | undefined {
	if (!isRecord(body) || !Array.isArray(body.candidates)) return undefined;
	const [candidate] = body.candidates as unknown[];
	if (!isRecord(candidate) || !isRecord(candidate.content)) return undefined;
	const parts = candidate.content.parts;
	if (!Array.isArray(parts)) return undefined;
	for (const part of parts as unknown[]) {
		if (isRecord(part) && part.thought !== true && typeof part.text === 'string') {
			return part.text;
		}
	}
	return undefined;
}

async function extractWithGemini({
	apiKey,
	model,
	prompt,
	image,
	schemas
}: ExtractJsonRequest): Promise<unknown> {
	if (!apiKey) throw new Error('GEMINI_API_KEY is not set');

	const parts: object[] = [{ text: prompt }];
	if (image) parts.unshift({ inline_data: { mime_type: image.mimeType, data: image.base64 } });

	const response = await fetch(`${GEMINI_ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
		body: JSON.stringify({
			contents: [{ parts }],
			generationConfig: {
				// 'low' measured ~2.5s vs ~12s at the default, with the same extraction.
				thinkingConfig: { thinkingLevel: 'low' },
				responseMimeType: 'application/json',
				responseSchema: schemas.gemini
			}
		}),
		signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
	});

	if (!response.ok) throw new Error(`Gemini request failed with status ${response.status}`);

	const text = geminiResponseText(await response.json());
	if (!text) throw new Error('Gemini returned no text content');
	return JSON.parse(text);
}
