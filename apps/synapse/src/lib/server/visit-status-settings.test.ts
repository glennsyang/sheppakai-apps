import { DEFAULT_VISIT_STATUS_THRESHOLDS } from '$lib/utils/visit-status';
import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/db', () => ({ getDb: vi.fn<() => unknown>() }));

import {
	getVisitStatusThresholdsByUserIds,
	getVisitStatusThresholdsForUser
} from './visit-status-settings';

type Row = {
	userId: string;
	recentToOverdueDays: number;
	overdueToCriticalDays: number;
};

function makeDb({ first, many = [] }: { first?: Row; many?: Row[] } = {}) {
	const findFirst = vi.fn<() => Promise<Row | undefined>>().mockResolvedValue(first);
	const findMany = vi.fn<() => Promise<Row[]>>().mockResolvedValue(many);
	const db = { query: { visitStatusSettings: { findFirst, findMany } } };
	return {
		db: db as unknown as Parameters<typeof getVisitStatusThresholdsForUser>[1],
		findFirst,
		findMany
	};
}

describe('getVisitStatusThresholdsForUser', () => {
	it('returns defaults when the user has no settings row', async () => {
		const { db } = makeDb();
		expect(await getVisitStatusThresholdsForUser('u1', db)).toEqual(
			DEFAULT_VISIT_STATUS_THRESHOLDS
		);
	});

	it('returns the stored thresholds when a row exists', async () => {
		const { db } = makeDb({
			first: {
				userId: 'u1',
				recentToOverdueDays: 10,
				overdueToCriticalDays: 40
			}
		});
		expect(await getVisitStatusThresholdsForUser('u1', db)).toEqual({
			recentToOverdueDays: 10,
			overdueToCriticalDays: 40
		});
	});

	it('falls back to defaults when the stored row is invalid', async () => {
		const { db } = makeDb({
			first: {
				userId: 'u1',
				recentToOverdueDays: 50,
				overdueToCriticalDays: 10
			}
		});
		expect(await getVisitStatusThresholdsForUser('u1', db)).toEqual(
			DEFAULT_VISIT_STATUS_THRESHOLDS
		);
	});
});

describe('getVisitStatusThresholdsByUserIds', () => {
	it('returns an empty map without querying when no ids are given', async () => {
		const { db, findMany } = makeDb();
		const result = await getVisitStatusThresholdsByUserIds([], db);
		expect(result.size).toBe(0);
		expect(findMany).not.toHaveBeenCalled();
	});

	it('dedupes ids, defaults missing users, and applies stored rows', async () => {
		const { db, findMany } = makeDb({
			many: [{ userId: 'u2', recentToOverdueDays: 7, overdueToCriticalDays: 21 }]
		});
		const result = await getVisitStatusThresholdsByUserIds(['u1', 'u2', 'u1'], db);

		expect(findMany).toHaveBeenCalledTimes(1);
		expect([...result.keys()]).toEqual(['u1', 'u2']);
		expect(result.get('u1')).toEqual(DEFAULT_VISIT_STATUS_THRESHOLDS);
		expect(result.get('u2')).toEqual({
			recentToOverdueDays: 7,
			overdueToCriticalDays: 21
		});
	});
});
