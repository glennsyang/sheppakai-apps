import { eq } from 'drizzle-orm';

import { getDb } from '#lib/server/db/index.js';
import { savingsGoal } from '#lib/server/db/schema/index.js';
import { withUpdatedAt } from '#lib/server/db/utils.js';

/** Returns an archived goal to active (admin use). */
export async function unarchiveSavingsGoal(goalId: string): Promise<void> {
	await getDb()
		.update(savingsGoal)
		.set(withUpdatedAt({ status: 'active' as const }))
		.where(eq(savingsGoal.id, goalId));
}
