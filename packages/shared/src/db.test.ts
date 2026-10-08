import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createGetDb } from './db';

const dirs: string[] = [];

afterEach(() => {
	for (const dir of dirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

function tempDbUrl() {
	const dir = mkdtempSync(join(tmpdir(), 'shared-db-'));
	dirs.push(dir);
	// A nested path proves the parent directory is created.
	return `file://${join(dir, 'nested', 'app.db')}`;
}

describe('createGetDb', () => {
	it('opens the database lazily, in WAL mode, and reuses the connection', () => {
		const onSpy = vi.spyOn(process, 'on');
		const getDb = createGetDb({
			url: tempDbUrl(),
			schema: {},
			logger: { info: vi.fn() },
			queryLogging: false
		});

		expect(onSpy).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
		expect(onSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));

		const db = getDb();
		expect(db.$client.pragma('journal_mode', { simple: true })).toBe('wal');
		expect(getDb()).toBe(db);

		db.$client.close();
		onSpy.mockRestore();
	});
});
