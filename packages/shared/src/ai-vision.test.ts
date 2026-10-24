import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
	type AiImage,
	extractJson,
	type ExtractJsonRequest,
	MAX_AI_IMAGE_BYTES,
	toAiImage
} from './ai-vision';

const image: AiImage = { mimeType: 'image/jpeg', base64: 'aW1hZ2U=' };
const payload = { name: 'Costco', total: 56.96 };
const schemas = { claude: { type: 'object' }, gemini: { type: 'OBJECT' } };

function request(overrides: Partial<ExtractJsonRequest> = {}): ExtractJsonRequest {
	return {
		provider: 'gemini',
		apiKey: 'test-key',
		model: 'test-model',
		prompt: 'Read this.',
		image,
		schemas,
		...overrides
	};
}

function geminiResponse(text: string) {
	return Response.json({
		candidates: [{ content: { parts: [{ thought: true, text: 'thinking…' }, { text }] } }]
	});
}

function claudeResponse(text: string, stopReason = 'end_turn') {
	return Response.json({ stop_reason: stopReason, content: [{ type: 'text', text }] });
}

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
	fetchMock.mockReset();
	vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
	vi.unstubAllGlobals();
});

function sentRequest() {
	const [url, init] = fetchMock.mock.calls[0];
	return {
		url: url as string,
		headers: init?.headers as Record<string, string>,
		body: JSON.parse(init?.body as string)
	};
}

describe('toAiImage', () => {
	it('base64-encodes an allowed image', async () => {
		const file = new File(['image'], 'r.jpg', { type: 'image/jpeg' });
		expect(await toAiImage(file)).toEqual(image);
	});

	it('rejects a missing value, a string, an empty file, a non-image and an oversized file', async () => {
		expect(await toAiImage(null)).toBeNull();
		expect(await toAiImage('not a file')).toBeNull();
		expect(await toAiImage(new File([], 'r.jpg', { type: 'image/jpeg' }))).toBeNull();
		expect(await toAiImage(new File(['x'], 'r.pdf', { type: 'application/pdf' }))).toBeNull();
		const big = new File([new Uint8Array(MAX_AI_IMAGE_BYTES + 1)], 'r.jpg', {
			type: 'image/jpeg'
		});
		expect(await toAiImage(big)).toBeNull();
	});
});

describe('extractJson with Gemini', () => {
	it('sends the image, prompt and schema, and returns the parsed answer', async () => {
		fetchMock.mockResolvedValue(geminiResponse(JSON.stringify(payload)));

		expect(await extractJson(request())).toEqual(payload);

		const { url, headers, body } = sentRequest();
		expect(url).toContain('/models/test-model:generateContent');
		expect(headers['x-goog-api-key']).toBe('test-key');
		const [imagePart, textPart] = body.contents[0].parts;
		expect(imagePart.inline_data).toEqual({ mime_type: 'image/jpeg', data: 'aW1hZ2U=' });
		expect(textPart.text).toBe('Read this.');
		expect(body.generationConfig.responseSchema).toEqual(schemas.gemini);
		expect(body.generationConfig.thinkingConfig).toEqual({ thinkingLevel: 'low' });
	});

	it('sends only the prompt when there is no image', async () => {
		fetchMock.mockResolvedValue(geminiResponse(JSON.stringify(payload)));

		await extractJson(request({ image: null }));

		expect(sentRequest().body.contents[0].parts).toEqual([{ text: 'Read this.' }]);
	});

	it('throws on a non-2xx response', async () => {
		fetchMock.mockResolvedValue(new Response('quota', { status: 429 }));
		await expect(extractJson(request())).rejects.toThrow('status 429');
	});

	it('throws a SyntaxError on malformed JSON', async () => {
		fetchMock.mockResolvedValue(geminiResponse('{not json'));
		await expect(extractJson(request())).rejects.toBeInstanceOf(SyntaxError);
	});

	it('refuses to call without an API key', async () => {
		await expect(extractJson(request({ apiKey: undefined }))).rejects.toThrow('GEMINI_API_KEY');
		expect(fetchMock).not.toHaveBeenCalled();
	});
});

describe('extractJson with Claude', () => {
	it('sends a base64 image with a JSON schema output format', async () => {
		fetchMock.mockResolvedValue(claudeResponse(JSON.stringify(payload)));

		expect(await extractJson(request({ provider: 'claude' }))).toEqual(payload);

		const { url, headers, body } = sentRequest();
		expect(url).toBe('https://api.anthropic.com/v1/messages');
		expect(headers['x-api-key']).toBe('test-key');
		expect(headers['anthropic-version']).toBe('2026-10-21');
		expect(body.model).toBe('test-model');
		expect(body.output_config.format).toEqual({ type: 'json_schema', schema: schemas.claude });
		const [imageBlock, textBlock] = body.messages[0].content;
		expect(imageBlock.source).toEqual({
			type: 'base64',
			media_type: 'image/jpeg',
			data: 'aW1hZ2U='
		});
		expect(textBlock).toEqual({ type: 'text', text: 'Read this.' });
	});

	it('sends only the prompt when there is no image', async () => {
		fetchMock.mockResolvedValue(claudeResponse(JSON.stringify(payload)));

		await extractJson(request({ provider: 'claude', image: null }));

		expect(sentRequest().body.messages[0].content).toEqual([{ type: 'text', text: 'Read this.' }]);
	});

	it('throws when Claude stops for any reason but end_turn', async () => {
		fetchMock.mockResolvedValue(claudeResponse(JSON.stringify(payload), 'refusal'));
		await expect(extractJson(request({ provider: 'claude' }))).rejects.toThrow('refusal');
	});
});
