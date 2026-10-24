// Receipt photo → transaction fields. The provider is picked by RECEIPT_SCAN_PROVIDER, so
// switching between Gemini and Claude is a config change; both are held to the same
// `receiptScanResultSchema`.
import {
	ANTHROPIC_API_KEY,
	CLAUDE_RECEIPT_MODEL,
	GEMINI_API_KEY,
	GEMINI_RECEIPT_MODEL,
	RECEIPT_SCAN_PROVIDER
} from '$app/env/private';
import { type AiImage, extractJson } from '@sheppakai/shared/ai-vision';
import type { z } from 'zod';

import { receiptScanResultSchema } from '#lib/formSchemas/index.js';
import { logger } from '#lib/server/logger.js';

import { buildReceiptPrompt, receiptOutputSchemas, type ScanCategory } from './prompt';

export type ReceiptScanResult = z.infer<typeof receiptScanResultSchema>;

const providers: Record<
	typeof RECEIPT_SCAN_PROVIDER,
	{ model: () => string; apiKey: () => string | undefined }
> = {
	gemini: { model: () => GEMINI_RECEIPT_MODEL, apiKey: () => GEMINI_API_KEY },
	claude: { model: () => CLAUDE_RECEIPT_MODEL, apiKey: () => ANTHROPIC_API_KEY }
};

/** The provider answered, but not with usable receipt fields (not a receipt, too blurry). */
export class UnreadableReceiptError extends Error {}

/** False until the selected provider's API key is set; the page hides the scan button. */
export function isReceiptScanEnabled(): boolean {
	return Boolean(providers[RECEIPT_SCAN_PROVIDER].apiKey());
}

export async function scanReceipt(
	image: AiImage,
	categories: ScanCategory[]
): Promise<ReceiptScanResult> {
	const provider = RECEIPT_SCAN_PROVIDER;
	const started = Date.now();

	let raw: unknown;
	try {
		raw = await extractJson({
			provider,
			apiKey: providers[provider].apiKey(),
			model: providers[provider].model(),
			prompt: buildReceiptPrompt(categories),
			image,
			schemas: receiptOutputSchemas
		});
	} catch (err) {
		if (err instanceof SyntaxError)
			throw new UnreadableReceiptError('Malformed JSON', { cause: err });
		throw err;
	}

	const parsed = receiptScanResultSchema.safeParse(raw);
	logger.info('Receipt scanned', { provider, ms: Date.now() - started, valid: parsed.success });
	if (!parsed.success) throw new UnreadableReceiptError('Scan result failed validation');

	const { categoryId } = parsed.data;
	const knownCategory = categoryId !== null && categories.some((c) => c.id === categoryId);
	return { ...parsed.data, categoryId: knownCategory ? categoryId : null };
}
