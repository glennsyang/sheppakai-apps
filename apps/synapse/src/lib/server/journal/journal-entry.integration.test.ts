// Runs the Journal Entry write module against the app's real schema and migrations in in-memory
// SQLite.
import { describe, expect, it } from 'vitest';

import { buildTestDb, TEST_USER } from '../notification-jobs/test-harness';
import { createJournalEntry, type JournalEntryFields, updateJournalEntry } from './journal-entry';
import { toJournalEntryFields } from './journal-entry-form';

const FIELDS: JournalEntryFields = {
	date: '2026-11-24',
	content: 'A quiet day.',
	location: 'Home',
	weatherTemp: 12,
	weatherCondition: 'Rain'
};

describe('Journal Entry module', () => {
	it('stores weather as one JSON column', () => {
		const db = buildTestDb();
		const entry = createJournalEntry(db, TEST_USER.id, FIELDS);
		expect(JSON.parse(entry.weather ?? '')).toEqual({ temp: 12, condition: 'Rain' });
	});

	it('patching the temperature keeps the condition', () => {
		const db = buildTestDb();
		const { id } = createJournalEntry(db, TEST_USER.id, FIELDS);

		const updated = updateJournalEntry(db, TEST_USER.id, id, { weatherTemp: 20 });

		expect(updated?.content).toBe('A quiet day.');
		expect(JSON.parse(updated?.weather ?? '')).toEqual({ temp: 20, condition: 'Rain' });
	});

	it('clearing both weather fields clears the column', () => {
		const db = buildTestDb();
		const { id } = createJournalEntry(db, TEST_USER.id, FIELDS);

		const updated = updateJournalEntry(db, TEST_USER.id, id, {
			weatherTemp: null,
			weatherCondition: null
		});

		expect(updated?.weather).toBeNull();
	});

	it("returns null for another user's entry", () => {
		const db = buildTestDb();
		const { id } = createJournalEntry(db, TEST_USER.id, FIELDS);
		expect(updateJournalEntry(db, 'someone-else', id, { content: 'x' })).toBeNull();
	});

	it('the form defaults a blank location to Home and blank weather to none', () => {
		expect(toJournalEntryFields({ date: '2026-11-24', content: 'Hi', location: '  ' })).toEqual({
			date: '2026-11-24',
			content: 'Hi',
			location: 'Home',
			weatherTemp: null,
			weatherCondition: null
		});
	});
});
