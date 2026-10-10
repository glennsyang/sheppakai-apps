import { getDb } from '$lib/server/db';
import { savingsGoal } from '$lib/server/db/schema';
import { withUpdatedAt } from '$lib/server/db/utils';
import { eq } from 'drizzle-orm';

/** Returns an archived goal to active (admin use). */
export async function unarchiveSavingsGoal(goalId: string): Promise<void> {
	await getDb()
		.update(savingsGoal)
		.set(withUpdatedAt({ status: 'active' as const }))
		.where(eq(savingsGoal.id, goalId));
}
