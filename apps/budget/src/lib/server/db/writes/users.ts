import { eq } from 'drizzle-orm';

import { getDb } from '#lib/server/db/index.js';
import { user } from '#lib/server/db/schema/index.js';

export async function updateUserName(userId: string, name: string): Promise<void> {
	await getDb().update(user).set({ name }).where(eq(user.id, userId));
}
