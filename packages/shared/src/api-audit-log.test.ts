import { describe, expect, it, vi } from 'vitest';

import { createRecordApiWrite } from './api-audit-log';

const entry = {
	apiKeyId: 'key-1',
	userId: 'user-1',
	method: 'POST',
	path: '/api/v1/transactions',
	action: 'transactions:write',
	statusCode: 201
};

describe('recordApiWrite', () => {
	it('inserts the given entry', async () => {
		const insert = vi.fn<() => Promise<void>>(async () => undefined);
		const recordApiWrite = createRecordApiWrite({ insert, logger: { error: vi.fn<() => void>() } });

		await recordApiWrite(entry);

		expect(insert).toHaveBeenCalledWith(entry);
	});

	it('logs and swallows a DB failure instead of throwing', async () => {
		const failure = new Error('db down');
		const logger = { error: vi.fn<() => void>() };
		const recordApiWrite = createRecordApiWrite({
			insert: vi.fn<() => Promise<void>>(async () => {
				throw failure;
			}),
			logger
		});

		await expect(recordApiWrite(entry)).resolves.toBeUndefined();
		expect(logger.error).toHaveBeenCalledWith('Failed to write API audit log entry', failure);
	});
});
