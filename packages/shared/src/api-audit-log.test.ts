import { describe, expect, it, vi } from 'vitest';

import {
	API_AUDIT_LOG_LIMIT,
	createListApiAuditEntries,
	createRecordApiWrite
} from './api-audit-log';

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

describe('listApiAuditEntries', () => {
	const row = (id: string, apiKeyId: string) => ({
		id,
		apiKeyId,
		userId: 'user-1',
		user: { name: 'Ada', email: 'ada@example.com' },
		method: 'POST',
		path: '/api/v1/transactions',
		action: 'transactions:write',
		statusCode: 201,
		createdAt: new Date('2026-01-01T00:00:00Z')
	});

	it('resolves key names and flags keys that no longer exist', async () => {
		const findKeyNames = vi.fn<(ids: string[]) => Promise<{ id: string; name: string | null }[]>>(
			async () => [
				{ id: 'key-1', name: 'CI' },
				{ id: 'key-3', name: null }
			]
		);
		const listApiAuditEntries = createListApiAuditEntries({
			findEntries: async () => [
				row('a', 'key-1'),
				row('b', 'key-1'),
				row('c', 'key-2'),
				row('d', 'key-3')
			],
			findKeyNames
		});

		const entries = await listApiAuditEntries();

		expect(findKeyNames).toHaveBeenCalledWith(['key-1', 'key-2', 'key-3']);
		expect(
			entries.map(({ id, apiKeyName, apiKeyExists }) => ({ id, apiKeyName, apiKeyExists }))
		).toEqual([
			{ id: 'a', apiKeyName: 'CI', apiKeyExists: true },
			{ id: 'b', apiKeyName: 'CI', apiKeyExists: true },
			{ id: 'c', apiKeyName: null, apiKeyExists: false },
			{ id: 'd', apiKeyName: null, apiKeyExists: true }
		]);
		expect(entries[0]).toMatchObject(row('a', 'key-1'));
	});

	it('reads at most API_AUDIT_LOG_LIMIT entries', async () => {
		const findEntries = vi.fn<(limit: number) => Promise<ReturnType<typeof row>[]>>(async () => []);
		const listApiAuditEntries = createListApiAuditEntries({
			findEntries,
			findKeyNames: async () => []
		});

		await listApiAuditEntries();

		expect(findEntries).toHaveBeenCalledWith(API_AUDIT_LOG_LIMIT);
	});

	it('skips the key lookup when there are no entries', async () => {
		const findKeyNames = vi.fn<(ids: string[]) => Promise<{ id: string; name: string | null }[]>>(
			async () => []
		);
		const listApiAuditEntries = createListApiAuditEntries({
			findEntries: async () => [],
			findKeyNames
		});

		await expect(listApiAuditEntries()).resolves.toEqual([]);
		expect(findKeyNames).not.toHaveBeenCalled();
	});
});
