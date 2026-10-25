import { readFileSync } from 'node:fs';

import { MAX_AI_IMAGE_BYTES } from '@sheppakai/shared/ai-vision';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { scanReceiptMock, isEnabledMock, findAllCategoriesMock, loggerMock } = vi.hoisted(() => ({
	scanReceiptMock: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
	isEnabledMock: vi.fn<() => boolean>(),
	findAllCategoriesMock: vi.fn<() => Promise<unknown[]>>(),
	loggerMock: {
		error: vi.fn<() => void>(),
		warn: vi.fn<() => void>(),
		info: vi.fn<() => void>(),
		debug: vi.fn<() => void>()
	}
}));

vi.mock('$app/env/private', () => ({}));
vi.mock('#lib/server/db/index.js', () => ({ getDb: vi.fn<() => void>() }));
vi.mock('#lib/server/logger.js', () => ({ logger: loggerMock }));
vi.mock('#lib/server/db/queries/index.js', () => ({
	budgetQueries: {},
	transactionQueries: {},
	categoryQueries: { findAll: findAllCategoriesMock }
}));

// The providers are tested in src/lib/server/receipt-scan; this covers the action around them.
vi.mock('#lib/server/receipt-scan/index.js', async (importOriginal) => {
	const actual = await importOriginal<typeof import('#lib/server/receipt-scan/index.js')>();
	return { ...actual, isReceiptScanEnabled: isEnabledMock, scanReceipt: scanReceiptMock };
});

import { UnreadableReceiptError } from '#lib/server/receipt-scan/index.js';

import { actions } from './+page.server';

const scan = {
	payee: 'Costco',
	date: '2026-10-21',
	total: 56.96,
	gstAmount: 2.71,
	notes: 'Fuel - 29.997 L @ $1.899/L',
	categoryId: 'cat-gas'
};

let userCounter = 0;

function scanEvent(receipt: File | null, userId = `user-${++userCounter}`) {
	const body = new FormData();
	if (receipt) body.set('receipt', receipt);
	return {
		request: new Request('https://budget.example.com/transactions?/scanReceipt', {
			method: 'POST',
			body
		}),
		locals: { user: { id: userId } },
		getClientAddress: () => '127.0.0.1',
		url: new URL('https://budget.example.com/transactions?/scanReceipt'),
		cookies: { get: () => undefined, set: () => undefined }
	} as never;
}

const jpeg = () => new File(['image'], 'receipt.jpg', { type: 'image/jpeg' });

type ActionOutcome = {
	status?: number;
	data?: { form: { data: unknown; message: App.Superforms.Message } };
	form?: { data: unknown; message: App.Superforms.Message };
};

async function runScan(event: never): Promise<ActionOutcome> {
	return (await actions.scanReceipt(event)) as ActionOutcome;
}

describe('transactions scanReceipt action', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		isEnabledMock.mockReturnValue(true);
		findAllCategoriesMock.mockResolvedValue([{ id: 'cat-gas', name: 'Gas' }]);
		scanReceiptMock.mockResolvedValue(scan);
	});

	it('returns the scan as the form data with a success message, saving nothing', async () => {
		const result = await runScan(scanEvent(jpeg()));

		expect(result.form?.data).toEqual(scan);
		expect(result.form?.message.type).toBe('success');
		expect(scanReceiptMock).toHaveBeenCalledWith({ mimeType: 'image/jpeg', base64: 'aW1hZ2U=' }, [
			{ id: 'cat-gas', name: 'Gas' }
		]);
	});

	it('refuses with 503 when scanning is not configured', async () => {
		isEnabledMock.mockReturnValue(false);
		const result = await runScan(scanEvent(jpeg()));
		expect(result.status).toBe(503);
		expect(scanReceiptMock).not.toHaveBeenCalled();
	});

	it('rejects a missing or non-image upload with 400', async () => {
		expect((await runScan(scanEvent(null))).status).toBe(400);
		const pdf = new File(['x'], 'r.pdf', { type: 'application/pdf' });
		expect((await runScan(scanEvent(pdf))).status).toBe(400);
		expect(scanReceiptMock).not.toHaveBeenCalled();
	});

	it('answers 422 with a retake hint when the receipt is unreadable', async () => {
		scanReceiptMock.mockRejectedValue(new UnreadableReceiptError('bad'));
		const result = await runScan(scanEvent(jpeg()));
		expect(result.status).toBe(422);
		expect(result.data?.form.message.text).toMatch(/clearer/);
	});

	it('answers 502 and logs when the provider fails', async () => {
		scanReceiptMock.mockRejectedValue(new Error('status 500'));
		const result = await runScan(scanEvent(jpeg()));
		expect(result.status).toBe(502);
		expect(loggerMock.error).toHaveBeenCalled();
	});

	it('rate-limits a user after 20 scans in an hour', async () => {
		for (let i = 0; i < 20; i++) {
			expect((await runScan(scanEvent(jpeg(), 'busy-user'))).status).toBeUndefined();
		}
		expect((await runScan(scanEvent(jpeg(), 'busy-user'))).status).toBe(429);
	});

	it('answers 413 when the upload body cannot be read (over BODY_SIZE_LIMIT)', async () => {
		const event = scanEvent(jpeg()) as { request: Request };
		event.request = {
			formData: () => Promise.reject(new Error('Content-length of 7000000 exceeds limit'))
		} as unknown as Request;
		const result = await runScan(event as never);
		expect(result.status).toBe(413);
		expect(scanReceiptMock).not.toHaveBeenCalled();
	});

	it('returns 401 without a signed-in user', async () => {
		const event = scanEvent(jpeg());
		(event as { locals: App.Locals }).locals = { user: null, session: null };
		expect((await runScan(event)).status).toBe(401);
	});
});

// adapter-node rejects bodies over BODY_SIZE_LIMIT (default 512K) before the action reads them,
// and `vite dev` doesn't enforce it, so a drift here only shows up in production.
describe('fly.toml BODY_SIZE_LIMIT', () => {
	it('leaves room for a MAX_AI_IMAGE_BYTES photo plus multipart overhead', () => {
		const flyToml = readFileSync(new URL('../../../../fly.toml', import.meta.url), 'utf8');
		const match = flyToml.match(/^\s*BODY_SIZE_LIMIT\s*=\s*'(\d+)([KMG]?)'/m);
		expect(match, 'BODY_SIZE_LIMIT must be set in fly.toml [env]').not.toBeNull();
		const [, amount, unit] = match as RegExpMatchArray;
		const multiplier = { '': 1, K: 1024, M: 1024 ** 2, G: 1024 ** 3 }[unit] ?? 1;
		expect(Number(amount) * multiplier).toBeGreaterThan(MAX_AI_IMAGE_BYTES + 64 * 1024);
	});
});
