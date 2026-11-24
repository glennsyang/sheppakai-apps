// The Journal Entry write module: the new/edit journal form actions and `/api/v1/journal` are thin
// adapters over `createJournalEntry` and `updateJournalEntry`.
import { and, eq } from 'drizzle-orm';

import { buildWeatherJson, storedWeatherSchema } from '#lib/schemas/journal.js';
import type { getDb } from '#lib/server/db/index.js';
import { journalEntries } from '#lib/server/db/schema/index.js';
import {
	generateId,
	withTimestampsForCreate,
	withTimestampsForUpdate
} from '#lib/server/db/utils.js';
import { safeParse } from '#lib/server/json.js';

type Db = ReturnType<typeof getDb>;

export type JournalEntry = typeof journalEntries.$inferSelect;

export type JournalEntryFields = {
	date: string;
	content: string;
	location: string | null;
	weatherTemp: number | null;
	weatherCondition: string | null;
};

/** Fields left `undefined` keep their stored value; `null` clears a nullable one. */
export type JournalEntryPatch = Partial<JournalEntryFields>;

/**
 * Temperature and condition share one `weather` JSON column, so patching one of them keeps the
 * other.
 */
function patchedWeatherJson(existing: string | null, patch: JournalEntryPatch): string | null {
	if (patch.weatherTemp === undefined && patch.weatherCondition === undefined) return existing;

	const stored = safeParse(existing, storedWeatherSchema, {}, 'journal.weather');
	const temp = patch.weatherTemp !== undefined ? (patch.weatherTemp ?? undefined) : stored.temp;
	const condition =
		patch.weatherCondition !== undefined ? (patch.weatherCondition ?? undefined) : stored.condition;

	return buildWeatherJson(temp, condition);
}

export function createJournalEntry(
	db: Db,
	userId: string,
	{ weatherTemp, weatherCondition, ...fields }: JournalEntryFields,
	now = new Date()
): JournalEntry {
	return db
		.insert(journalEntries)
		.values({
			id: generateId(),
			userId,
			...fields,
			weather: buildWeatherJson(weatherTemp ?? undefined, weatherCondition ?? undefined),
			...withTimestampsForCreate(now)
		})
		.returning()
		.get();
}

/** Updates the user's own Journal Entry; `null` when they have no entry with that id. */
export function updateJournalEntry(
	db: Db,
	userId: string,
	entryId: string,
	patch: JournalEntryPatch,
	now = new Date()
): JournalEntry | null {
	const owned = and(eq(journalEntries.id, entryId), eq(journalEntries.userId, userId));

	return db.transaction((tx) => {
		const existing = tx.select().from(journalEntries).where(owned).get();
		if (!existing) return null;

		const { weatherTemp: _temp, weatherCondition: _condition, ...fields } = patch;

		// Drizzle leaves out `undefined` values in `.set()`, so a patch only touches the fields it
		// names.
		return (
			tx
				.update(journalEntries)
				.set({
					...fields,
					weather: patchedWeatherJson(existing.weather, patch),
					...withTimestampsForUpdate(now)
				})
				.where(owned)
				.returning()
				.get() ?? null
		);
	});
}
