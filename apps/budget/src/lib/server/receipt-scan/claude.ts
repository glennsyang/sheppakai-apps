import { ANTHROPIC_API_KEY, CLAUDE_RECEIPT_MODEL } from '$app/env/private';
import { isRecord } from '@sheppakai/shared/guards';

import { buildReceiptPrompt, type ReceiptExtractor, REQUEST_TIMEOUT_MS } from './prompt';

const ENDPOINT = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2026-10-21';

// Structured outputs (`output_config.format`) take standard JSON Schema; every object needs
// `additionalProperties: false`.
const outputSchema = {
	type: 'object',
	additionalProperties: false,
	required: ['payee', 'date', 'total', 'gstAmount', 'notes', 'categoryId'],
	properties: {
		payee: { type: 'string' },
		date: { type: 'string', format: 'date' },
		total: { type: 'number' },
		gstAmount: { anyOf: [{ type: 'number' }, { type: 'null' }] },
		notes: { type: 'string' },
		categoryId: { anyOf: [{ type: 'string' }, { type: 'null' }] }
	}
};

export const extractWithClaude: ReceiptExtractor = async (image, categories) => {
	if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set');

	const response = await fetch(ENDPOINT, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			'x-api-key': ANTHROPIC_API_KEY,
			'anthropic-version': API_VERSION
		},
		body: JSON.stringify({
			model: CLAUDE_RECEIPT_MODEL,
			max_tokens: 4096,
			output_config: { effort: 'low', format: { type: 'json_schema', schema: outputSchema } },
			messages: [
				{
					role: 'user',
					content: [
						{
							type: 'image',
							source: { type: 'base64', media_type: image.mimeType, data: image.base64 }
						},
						{ type: 'text', text: buildReceiptPrompt(categories) }
					]
				}
			]
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

	const content = Array.isArray(body.content) ? (body.content as unknown[]) : [];
	const textBlock = content.find((block) => isRecord(block) && block.type === 'text');
	if (!isRecord(textBlock) || typeof textBlock.text !== 'string') {
		throw new Error('Claude returned no text content');
	}
	return JSON.parse(textBlock.text);
};
