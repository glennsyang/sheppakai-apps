// Receipt photo → transaction fields. The provider is picked by RECEIPT_SCAN_PROVIDER, so
// switching between Gemini and Claude is a config change; both are held to the same
// `receiptScanResultSchema`.
import { ANTHROPIC_API_KEY, GEMINI_API_KEY, RECEIPT_SCAN_PROVIDER } from '$app/env/private';
import type { z } from 'zod';

import { receiptScanResultSchema } from '#lib/formSchemas/index.js';
import { logger } from '#lib/server/logger.js';

import { extractWithClaude } from './claude';
import { extractWithGemini } from './gemini';
import {
	RECEIPT_IMAGE_TYPES,
	type ReceiptExtractor,
	type ReceiptImage,
	type ScanCategory
} from './prompt';

export type ReceiptScanResult = z.infer<typeof receiptScanResultSchema>;

export const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;

const providers: Record<
	typeof RECEIPT_SCAN_PROVIDER,
	{ extract: ReceiptExtractor; apiKey: () => string | undefined }
> = {
	gemini: { extract: extractWithGemini, apiKey: () => GEMINI_API_KEY },
	claude: { extract: extractWithClaude, apiKey: () => ANTHROPIC_API_KEY }
};

/** The provider answered, but not with usable receipt fields (not a receipt, too blurry). */
export class UnreadableReceiptError extends Error {}

/** False until the selected provider's API key is set; the page hides the scan button. */
export function isReceiptScanEnabled(): boolean {
	return Boolean(providers[RECEIPT_SCAN_PROVIDER].apiKey());
}

/** The uploaded form value as a provider-ready image, or null if it isn't an allowed image. */
export async function toReceiptImage(
	value: FormDataEntryValue | null
): Promise<ReceiptImage | null> {
	if (!(value instanceof File) || value.size === 0 || value.size > MAX_RECEIPT_BYTES) return null;
	const mimeType = RECEIPT_IMAGE_TYPES.find((type) => type === value.type);
	if (!mimeType) return null;
	return { mimeType, base64: Buffer.from(await value.arrayBuffer()).toString('base64') };
}

export async function scanReceipt(
	image: ReceiptImage,
	categories: ScanCategory[]
): Promise<ReceiptScanResult> {
	const provider = RECEIPT_SCAN_PROVIDER;
	const started = Date.now();

	let raw: unknown;
	try {
		raw = await providers[provider].extract(image, categories);
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
