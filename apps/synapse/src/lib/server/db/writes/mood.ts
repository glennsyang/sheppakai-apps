import { getDb } from '#lib/server/db/index.js';
import { moodLogs } from '#lib/server/db/schema/index.js';
import {
	generateId,
	withTimestampsForCreate,
	withTimestampsForUpdate
} from '#lib/server/db/utils.js';
import { normalizeOptionalMoodText } from '#lib/utils/mood.js';
import type { MoodValue } from '#lib/utils/mood.js';

export interface MoodLogInput {
	date: string;
	mood: MoodValue;
	customMood?: string | null;
	notes?: string | null;
}

/**
 * Create-or-update the user's mood log for `input.date` in one atomic statement. Shared by
 * the `upsertMood` action in src/routes/(app)/tasks/+page.server.ts and `POST /api/v1/mood`.
 * Concurrent saves for the same day can't race into the unique `(userId, date)` index; on
 * conflict the existing row keeps its `id` and `createdAt`. `created` tells the two apart.
 */
export async function upsertMood(userId: string, input: MoodLogInput, db = getDb()) {
	const values = {
		mood: input.mood,
		customMood: input.mood === 'custom' ? normalizeOptionalMoodText(input.customMood) : null,
		notes: normalizeOptionalMoodText(input.notes)
	};

	const id = generateId();
	const [moodLog] = await db
		.insert(moodLogs)
		.values({ id, userId, date: input.date, ...values, ...withTimestampsForCreate() })
		.onConflictDoUpdate({
			target: [moodLogs.userId, moodLogs.date],
			set: { ...values, ...withTimestampsForUpdate() }
		})
		.returning();

	return { moodLog, created: moodLog.id === id };
}
