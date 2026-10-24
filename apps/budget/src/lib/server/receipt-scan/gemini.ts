import { GEMINI_API_KEY, GEMINI_RECEIPT_MODEL } from '$app/env/private';
import { isRecord } from '@sheppakai/shared/guards';

import { buildReceiptPrompt, type ReceiptExtractor, REQUEST_TIMEOUT_MS } from './prompt';

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

// Gemini's OpenAPI-style schema dialect (uppercase types, `nullable`).
const responseSchema = {
	type: 'OBJECT',
	required: ['payee', 'date', 'total', 'gstAmount', 'notes', 'categoryId'],
	properties: {
		payee: { type: 'STRING' },
		date: { type: 'STRING' },
		total: { type: 'NUMBER' },
		gstAmount: { type: 'NUMBER', nullable: true },
		notes: { type: 'STRING' },
		categoryId: { type: 'STRING', nullable: true }
	}
};

/** The first non-thought text part of the first candidate. */
function responseText(body: unknown): string | undefined {
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

export const extractWithGemini: ReceiptExtractor = async (image, categories) => {
	if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not set');

	const response = await fetch(
		`${ENDPOINT}/${encodeURIComponent(GEMINI_RECEIPT_MODEL)}:generateContent`,
		{
			method: 'POST',
			headers: { 'content-type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
			body: JSON.stringify({
				contents: [
					{
						parts: [
							{ inline_data: { mime_type: image.mimeType, data: image.base64 } },
							{ text: buildReceiptPrompt(categories) }
						]
					}
				],
				generationConfig: {
					// 'low' measured ~2.5s vs ~12s at the default, with the same extraction.
					thinkingConfig: { thinkingLevel: 'low' },
					responseMimeType: 'application/json',
					responseSchema
				}
			}),
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
		}
	);

	if (!response.ok) throw new Error(`Gemini request failed with status ${response.status}`);

	const text = responseText(await response.json());
	if (!text) throw new Error('Gemini returned no text content');
	return JSON.parse(text);
};
