import { and, eq } from 'drizzle-orm';

import { getDb } from '#lib/server/db/index.js';
import { apiKey } from '#lib/server/db/schema/index.js';

/**
 * Disables every enabled API key a user owns (on ban or demotion). Disabled rather than
 * deleted so the admin page still shows what the user had; `verifyApiKey` rejects a
 * disabled key, and unbanning or re-promoting the user does not silently revive it.
 * Returns how many keys were disabled.
 */
export async function disableApiKeysForUser(userId: string): Promise<number> {
	const disabled = await getDb()
		.update(apiKey)
		.set({ enabled: false, updatedAt: new Date() })
		.where(and(eq(apiKey.referenceId, userId), eq(apiKey.enabled, true)))
		.returning({ id: apiKey.id });
	return disabled.length;
}
