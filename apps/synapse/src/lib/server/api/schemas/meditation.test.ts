import { describe, expect, it } from 'vitest';

import { apiMeditationListQuerySchema } from './meditation';

describe('apiMeditationListQuerySchema', () => {
	it('accepts no date range and defaults limit to 50', () => {
		const result = apiMeditationListQuerySchema.safeParse({});
		expect(result.success).toBe(true);
		expect(result.data?.limit).toBe(50);
	});

	it('accepts a matched startDate/endDate pair', () => {
		expect(
			apiMeditationListQuerySchema.safeParse({ startDate: '2026-08-01', endDate: '2026-08-31' })
				.success
		).toBe(true);
	});

	it('rejects a startDate without an endDate', () => {
		expect(apiMeditationListQuerySchema.safeParse({ startDate: '2026-08-01' }).success).toBe(false);
	});

	it('rejects an endDate without a startDate', () => {
		expect(apiMeditationListQuerySchema.safeParse({ endDate: '2026-08-31' }).success).toBe(false);
	});

	it('rejects a malformed date', () => {
		expect(
			apiMeditationListQuerySchema.safeParse({ startDate: '08-01-2026', endDate: '2026-08-31' })
				.success
		).toBe(false);
	});

	it('coerces a string limit', () => {
		expect(apiMeditationListQuerySchema.safeParse({ limit: '20' }).data?.limit).toBe(20);
	});

	it('rejects a limit outside 1-200', () => {
		expect(apiMeditationListQuerySchema.safeParse({ limit: '0' }).success).toBe(false);
		expect(apiMeditationListQuerySchema.safeParse({ limit: '201' }).success).toBe(false);
	});
});
