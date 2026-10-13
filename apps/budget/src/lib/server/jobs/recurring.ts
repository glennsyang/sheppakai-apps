import { getDb } from '#lib/server/db/index.js';
import { recurring } from '#lib/server/db/schema/index.js';

export async function runResetRecurringPaid() {
	await getDb().update(recurring).set({ paid: false });
}
