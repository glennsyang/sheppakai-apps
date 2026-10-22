import { describe, expect, it, vi } from 'vitest';

vi.mock('#lib/server/db/index.js', () => ({ getDb: vi.fn<() => unknown>() }));

import { moodLogs } from '#lib/server/db/schema/index.js';

import { upsertMood } from './mood';

type Db = Parameters<typeof upsertMood>[2];

/** `returnedId: null` echoes the inserted id back (a fresh row); a string simulates a conflict. */
function makeDb(returnedId: string | null = null) {
	let insertedId = '';
	const returning = vi.fn<() => Promise<unknown[]>>(async () => [{ id: returnedId ?? insertedId }]);
	const onConflictDoUpdate = vi.fn<(config: unknown) => unknown>(() => ({ returning }));
	const values = vi.fn<(row: { id: string }) => unknown>((row) => {
		insertedId = row.id;
		return { onConflictDoUpdate };
	});
	const insert = vi.fn<(table: unknown) => unknown>(() => ({ values }));
	return { db: { insert } as unknown as Db, insert, values, onConflictDoUpdate };
}

describe('upsertMood', () => {
	it('inserts a full new row and reports it as created', async () => {
		const { db, insert, values } = makeDb();

		const result = await upsertMood(
			'u1',
			{ date: '2026-10-22', mood: 'calm', notes: '  slept well  ' },
			db
		);

		expect(insert).toHaveBeenCalledWith(moodLogs);
		expect(values).toHaveBeenCalledWith({
			id: expect.any(String),
			userId: 'u1',
			date: '2026-10-22',
			mood: 'calm',
			customMood: null,
			notes: 'slept well',
			createdAt: expect.any(Date),
			updatedAt: expect.any(Date)
		});
		expect(result.created).toBe(true);
	});

	it('on a (userId, date) conflict, updates only the mood fields and updatedAt', async () => {
		const { db, onConflictDoUpdate } = makeDb('existing-id');

		const result = await upsertMood(
			'u1',
			{ date: '2026-10-22', mood: 'custom', customMood: ' Grateful ', notes: '' },
			db
		);

		expect(onConflictDoUpdate).toHaveBeenCalledWith({
			target: [moodLogs.userId, moodLogs.date],
			set: { mood: 'custom', customMood: 'Grateful', notes: null, updatedAt: expect.any(Date) }
		});
		expect(result).toEqual({ moodLog: { id: 'existing-id' }, created: false });
	});

	it('drops a custom label when the mood is not custom', async () => {
		const { db, values } = makeDb();

		await upsertMood('u1', { date: '2026-10-22', mood: 'happy', customMood: 'Grateful' }, db);

		expect(values).toHaveBeenCalledWith(expect.objectContaining({ customMood: null }));
	});
});
