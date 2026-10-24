import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => ({
	RECEIPT_SCAN_PROVIDER: 'gemini' as 'gemini' | 'claude',
	GEMINI_API_KEY: 'test-gemini-key' as string | undefined,
	GEMINI_RECEIPT_MODEL: 'gemini-test',
	ANTHROPIC_API_KEY: 'test-anthropic-key' as string | undefined,
	CLAUDE_RECEIPT_MODEL: 'claude-test'
}));

vi.mock('$app/env/private', () => ({
	get RECEIPT_SCAN_PROVIDER() {
		return env.RECEIPT_SCAN_PROVIDER;
	},
	get GEMINI_API_KEY() {
		return env.GEMINI_API_KEY;
	},
	get GEMINI_RECEIPT_MODEL() {
		return env.GEMINI_RECEIPT_MODEL;
	},
	get ANTHROPIC_API_KEY() {
		return env.ANTHROPIC_API_KEY;
	},
	get CLAUDE_RECEIPT_MODEL() {
		return env.CLAUDE_RECEIPT_MODEL;
	}
}));

vi.mock('#lib/server/logger.js', () => ({
	logger: { info: vi.fn<() => void>(), warn: vi.fn<() => void>(), error: vi.fn<() => void>() }
}));

import type { AiImage } from '@sheppakai/shared/ai-vision';

import { isReceiptScanEnabled, scanReceipt, UnreadableReceiptError } from './index';

const image: AiImage = { mimeType: 'image/jpeg', base64: 'aW1hZ2U=' };
const categories = [
	{ id: 'cat-gas', name: 'Gas' },
	{ id: 'cat-food', name: 'Groceries' }
];
const extraction = {
	payee: 'Costco',
	date: '2026-10-21',
	total: 56.96,
	gstAmount: 2.71,
	notes: 'Fuel - 29.997 L @ $1.899/L',
	categoryId: 'cat-gas'
};

function geminiResponse(payload: unknown) {
	return Response.json({
		candidates: [
			{
				content: {
					parts: [
						{ thought: true, text: 'thinking…' },
						{ text: typeof payload === 'string' ? payload : JSON.stringify(payload) }
					]
				}
			}
		]
	});
}

function claudeResponse(payload: unknown) {
	return Response.json({
		stop_reason: 'end_turn',
		content: [{ type: 'text', text: JSON.stringify(payload) }]
	});
}

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
	env.RECEIPT_SCAN_PROVIDER = 'gemini';
	env.GEMINI_API_KEY = 'test-gemini-key';
	env.ANTHROPIC_API_KEY = 'test-anthropic-key';
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

describe('isReceiptScanEnabled', () => {
	it("follows the selected provider's API key", () => {
		expect(isReceiptScanEnabled()).toBe(true);
		env.GEMINI_API_KEY = undefined;
		expect(isReceiptScanEnabled()).toBe(false);
		env.RECEIPT_SCAN_PROVIDER = 'claude';
		expect(isReceiptScanEnabled()).toBe(true);
		env.ANTHROPIC_API_KEY = '';
		expect(isReceiptScanEnabled()).toBe(false);
	});
});

describe('scanReceipt with Gemini', () => {
	it('sends the image and categories, and returns the validated extraction', async () => {
		fetchMock.mockResolvedValue(geminiResponse(extraction));

		expect(await scanReceipt(image, categories)).toEqual(extraction);

		const { url, headers, body } = sentRequest();
		expect(url).toContain('/models/gemini-test:generateContent');
		expect(headers['x-goog-api-key']).toBe('test-gemini-key');
		const [imagePart, textPart] = body.contents[0].parts;
		expect(imagePart.inline_data).toEqual({ mime_type: 'image/jpeg', data: 'aW1hZ2U=' });
		expect(textPart.text).toContain('cat-gas: Gas');
		expect(body.generationConfig.thinkingConfig).toEqual({ thinkingLevel: 'low' });
	});

	it('treats malformed JSON as an unreadable receipt', async () => {
		fetchMock.mockResolvedValue(geminiResponse('{not json'));
		await expect(scanReceipt(image, categories)).rejects.toBeInstanceOf(UnreadableReceiptError);
	});
});

describe('scanReceipt with Claude', () => {
	beforeEach(() => {
		env.RECEIPT_SCAN_PROVIDER = 'claude';
	});

	// The wire format is tested in @sheppakai/shared/ai-vision; this covers the budget's inputs.
	it('sends the configured model, the receipt image and the receipt schema', async () => {
		fetchMock.mockResolvedValue(claudeResponse(extraction));

		expect(await scanReceipt(image, categories)).toEqual(extraction);

		const { headers, body } = sentRequest();
		expect(headers['x-api-key']).toBe('test-anthropic-key');
		expect(body.model).toBe('claude-test');
		expect(body.output_config.format.schema.required).toContain('gstAmount');
		expect(body.messages[0].content[0].source.data).toBe('aW1hZ2U=');
	});
});

describe('scanReceipt validation', () => {
	it('drops a categoryId that is not one of the real categories', async () => {
		fetchMock.mockResolvedValue(geminiResponse({ ...extraction, categoryId: 'made-up' }));
		expect((await scanReceipt(image, categories)).categoryId).toBeNull();
	});

	it('rejects output that does not match the schema', async () => {
		fetchMock.mockResolvedValue(geminiResponse({ ...extraction, total: -5, date: 'Oct 21' }));
		await expect(scanReceipt(image, categories)).rejects.toBeInstanceOf(UnreadableReceiptError);
	});
});
