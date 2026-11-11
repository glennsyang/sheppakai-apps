import { describe, expect, it } from 'vitest';

import { apiAgendaQuerySchema } from './agenda';

describe('apiAgendaQuerySchema', () => {
	it('accepts no date', () => {
		const result = apiAgendaQuerySchema.safeParse({});
		expect(result.success).toBe(true);
		expect(result.data?.date).toBeUndefined();
	});

	it('accepts a YYYY-MM-DD date', () => {
		expect(apiAgendaQuerySchema.safeParse({ date: '2026-11-11' }).data?.date).toBe('2026-11-11');
	});

	it('rejects a malformed date', () => {
		expect(apiAgendaQuerySchema.safeParse({ date: '11-11-2026' }).success).toBe(false);
		expect(apiAgendaQuerySchema.safeParse({ date: 'today' }).success).toBe(false);
	});
});
