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

import {
	isReceiptScanEnabled,
	MAX_RECEIPT_BYTES,
	scanReceipt,
	toReceiptImage,
	UnreadableReceiptError
} from './index';
import type { ReceiptImage } from './prompt';

const image: ReceiptImage = { mimeType: 'image/jpeg', base64: 'aW1hZ2U=' };
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

function claudeResponse(payload: unknown, stopReason = 'end_turn') {
	return Response.json({
		stop_reason: stopReason,
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

describe('toReceiptImage', () => {
	it('base64-encodes an allowed image', async () => {
		const file = new File(['image'], 'r.jpg', { type: 'image/jpeg' });
		expect(await toReceiptImage(file)).toEqual({ mimeType: 'image/jpeg', base64: 'aW1hZ2U=' });
	});

	it('rejects a missing value, a string, an empty file, a non-image and an oversized file', async () => {
		expect(await toReceiptImage(null)).toBeNull();
		expect(await toReceiptImage('not a file')).toBeNull();
		expect(await toReceiptImage(new File([], 'r.jpg', { type: 'image/jpeg' }))).toBeNull();
		expect(await toReceiptImage(new File(['x'], 'r.pdf', { type: 'application/pdf' }))).toBeNull();
		const big = new File([new Uint8Array(MAX_RECEIPT_BYTES + 1)], 'r.jpg', { type: 'image/jpeg' });
		expect(await toReceiptImage(big)).toBeNull();
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

	it('throws on a non-2xx response', async () => {
		fetchMock.mockResolvedValue(new Response('quota', { status: 429 }));
		await expect(scanReceipt(image, categories)).rejects.toThrow('status 429');
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

	it('sends a base64 image with a JSON schema output format', async () => {
		fetchMock.mockResolvedValue(claudeResponse(extraction));

		expect(await scanReceipt(image, categories)).toEqual(extraction);

		const { url, headers, body } = sentRequest();
		expect(url).toBe('https://api.anthropic.com/v1/messages');
		expect(headers['x-api-key']).toBe('test-anthropic-key');
		expect(headers['anthropic-version']).toBe('2026-10-21');
		expect(body.model).toBe('claude-test');
		expect(body.output_config.format.type).toBe('json_schema');
		expect(body.messages[0].content[0].source).toEqual({
			type: 'base64',
			media_type: 'image/jpeg',
			data: 'aW1hZ2U='
		});
	});

	it('throws when Claude stops for any reason but end_turn', async () => {
		fetchMock.mockResolvedValue(claudeResponse(extraction, 'refusal'));
		await expect(scanReceipt(image, categories)).rejects.toThrow('refusal');
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
