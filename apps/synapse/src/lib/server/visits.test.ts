import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_VISIT_STATUS_THRESHOLDS } from '#lib/utils/visit-status.js';

vi.mock('#lib/server/db/index.js', () => ({ getDb: vi.fn<() => unknown>() }));

import { getLatestVisitsByPersonId, getPersonVisitStatus } from './visits';

type Row = { id: string; personId: string; date: string; followUpDate: string | null };

function makeDb(rows: Row[] = []) {
	const findMany = vi.fn<(args: unknown) => Promise<Row[]>>().mockResolvedValue(rows);
	const db = { query: { visits: { findMany } } };
	return {
		db: db as unknown as Parameters<typeof getLatestVisitsByPersonId>[2],
		findMany
	};
}

describe('getLatestVisitsByPersonId', () => {
	it('skips the query when there are no people', async () => {
		const { db, findMany } = makeDb();
		const result = await getLatestVisitsByPersonId([], 'u1', db);
		expect(result.size).toBe(0);
		expect(findMany).not.toHaveBeenCalled();
	});

	it('keeps the first (latest) row per person', async () => {
		const { db } = makeDb([
			{ id: 'v1', personId: 'p1', date: '2026-10-01', followUpDate: null },
			{ id: 'v2', personId: 'p1', date: '2026-09-01', followUpDate: null },
			{ id: 'v3', personId: 'p2', date: '2026-08-01', followUpDate: null }
		]);
		const result = await getLatestVisitsByPersonId(['p1', 'p2'], 'u1', db);
		expect(result.get('p1')?.id).toBe('v1');
		expect(result.get('p2')?.id).toBe('v3');
	});

	it('queries without a user filter for cross-user lookups', async () => {
		const { db, findMany } = makeDb();
		await getLatestVisitsByPersonId(['p1'], undefined, db);
		expect(findMany).toHaveBeenCalledOnce();
	});
});

describe('getPersonVisitStatus', () => {
	const today = '2026-10-22';
	const thresholds = DEFAULT_VISIT_STATUS_THRESHOLDS;

	it('uses the person schedule when there are no visits', () => {
		const result = getPersonVisitStatus(
			{ isExempt: false, scheduledVisitDate: '2026-10-30' },
			undefined,
			today,
			thresholds
		);
		expect(result.status).toBe('scheduled');
		expect(result.effectiveFollowUpDate).toBe('2026-10-30');
	});

	it("uses the latest visit's follow-up over the person schedule", () => {
		const result = getPersonVisitStatus(
			{ isExempt: false, scheduledVisitDate: '2026-10-30' },
			{ date: '2026-10-20', followUpDate: null },
			today,
			thresholds
		);
		expect(result.status).toBe('green');
		expect(result.effectiveFollowUpDate).toBeNull();
		expect(result.daysSinceLastVisit).toBe(2);
	});

	it('returns none when there is no visit or schedule', () => {
		const result = getPersonVisitStatus(
			{ isExempt: false, scheduledVisitDate: null },
			undefined,
			today,
			thresholds
		);
		expect(result.status).toBe('none');
	});

	it('marks exempt people as exempt', () => {
		const result = getPersonVisitStatus(
			{ isExempt: true, scheduledVisitDate: null },
			{ date: '2025-01-01', followUpDate: null },
			today,
			thresholds
		);
		expect(result.status).toBe('exempt');
	});
});
