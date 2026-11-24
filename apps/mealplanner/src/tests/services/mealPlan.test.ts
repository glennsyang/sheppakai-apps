import { describe, it, expect } from 'vitest';

describe('addMealPlanEntrySchema', () => {
	it('validates correct entry data', async () => {
		const { addMealPlanEntrySchema } = await import('../../lib/schemas/mealPlan');
		const result = addMealPlanEntrySchema.safeParse({
			weekStartDate: '2026-03-02',
			dayOfWeek: 0,
			recipeId: 'some-recipe-id'
		});
		expect(result.success).toBe(true);
	});

	it('rejects invalid day of week', async () => {
		const { addMealPlanEntrySchema } = await import('../../lib/schemas/mealPlan');
		const result = addMealPlanEntrySchema.safeParse({
			weekStartDate: '2026-03-02',
			dayOfWeek: 7,
			recipeId: 'some-recipe-id'
		});
		expect(result.success).toBe(false);
	});

	it('rejects malformed date', async () => {
		const { addMealPlanEntrySchema } = await import('../../lib/schemas/mealPlan');
		const result = addMealPlanEntrySchema.safeParse({
			weekStartDate: 'not-a-date',
			dayOfWeek: 0,
			recipeId: 'some-recipe-id'
		});
		expect(result.success).toBe(false);
	});
});
