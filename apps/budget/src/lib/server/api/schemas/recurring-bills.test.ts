import { describe, expect, it } from 'vitest';

import { apiMarkRecurringBillPaidSchema } from './recurring-bills';

describe('apiMarkRecurringBillPaidSchema', () => {
	it('accepts paid: true', () => {
		expect(apiMarkRecurringBillPaidSchema.safeParse({ paid: true }).success).toBe(true);
	});

	it('accepts paid: false', () => {
		expect(apiMarkRecurringBillPaidSchema.safeParse({ paid: false }).success).toBe(true);
	});

	it('rejects a missing paid field', () => {
		expect(apiMarkRecurringBillPaidSchema.safeParse({}).success).toBe(false);
	});

	it('rejects a non-boolean paid field', () => {
		expect(apiMarkRecurringBillPaidSchema.safeParse({ paid: 'yes' }).success).toBe(false);
	});
});
