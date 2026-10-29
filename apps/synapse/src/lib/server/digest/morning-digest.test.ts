import { describe, expect, it } from 'vitest';

import type { DailyAgendaEntry } from '#lib/types.js';

import type { TasksDueTodayTaskSummary } from '../email/tasks-due-today-digest';
import {
	buildMorningDigestMessage,
	buildMorningDigestTitle,
	isMorningDigestDue,
	selectBillsDueThisWeek,
	type DigestRecurring,
	type MorningDigestSections
} from './morning-digest';

const TODAY = '2026-10-28';

function createBill(overrides: Partial<DigestRecurring> = {}): DigestRecurring {
	return {
		merchant: 'Hydro',
		description: 'Electricity',
		cadence: 'Monthly',
		amount: 120,
		paid: false,
		dueDay: 30,
		dueMonth: null,
		...overrides
	};
}

function createEntry(overrides: Partial<DailyAgendaEntry> = {}): DailyAgendaEntry {
	return {
		id: 'entry-1',
		templateId: null,
		templateGroupId: null,
		date: TODAY,
		title: 'Review top priorities',
		sourceType: 'custom',
		sortOrder: 0,
		completed: false,
		completedAt: null,
		...overrides
	};
}

function createTask(overrides: Partial<TasksDueTodayTaskSummary> = {}): TasksDueTodayTaskSummary {
	return {
		id: 'task-1',
		taskNumber: 12,
		title: 'Submit grocery list',
		priority: 2,
		dueDate: TODAY,
		state: 'new',
		...overrides
	};
}

const emptySections: MorningDigestSections = {
	agenda: [],
	tasksDue: [],
	dinner: null,
	bills: [],
	visits: []
};

describe('selectBillsDueThisWeek', () => {
	it('keeps unpaid bills due today through six days out, soonest first', () => {
		const bills = selectBillsDueThisWeek(
			[
				createBill({ merchant: 'Rent', dueDay: 1 }),
				createBill({ merchant: 'Hydro', dueDay: 30 }),
				createBill({ merchant: 'Phone', dueDay: 28 }),
				createBill({ merchant: 'Gym', dueDay: 3 })
			],
			TODAY
		);

		expect(bills.map((bill) => [bill.merchant, bill.dueDate])).toEqual([
			['Phone', '2026-10-28'],
			['Hydro', '2026-10-30'],
			['Rent', '2026-11-01'],
			['Gym', '2026-11-03']
		]);
	});

	it('excludes paid bills, bills past the window and bills without a due day', () => {
		const bills = selectBillsDueThisWeek(
			[
				createBill({ merchant: 'Paid', paid: true }),
				createBill({ merchant: 'Later', dueDay: 5 }),
				createBill({ merchant: 'Earlier', dueDay: 27 }),
				createBill({ merchant: 'Undated', dueDay: null })
			],
			TODAY
		);

		expect(bills).toEqual([]);
	});

	it('clamps a day-31 bill to the end of a short month', () => {
		const bills = selectBillsDueThisWeek([createBill({ dueDay: 31 })], '2026-02-25');

		expect(bills[0]?.dueDate).toBe('2026-02-28');
	});

	it('wraps a monthly bill into January from late December', () => {
		const bills = selectBillsDueThisWeek([createBill({ dueDay: 2 })], '2026-12-29');

		expect(bills[0]?.dueDate).toBe('2027-01-02');
	});

	it('only includes a yearly bill in its due month', () => {
		const yearly = createBill({ merchant: 'Insurance', cadence: 'Yearly', dueDay: 31 });

		expect(selectBillsDueThisWeek([{ ...yearly, dueMonth: 10 }], TODAY)).toHaveLength(1);
		expect(selectBillsDueThisWeek([{ ...yearly, dueMonth: 3 }], TODAY)).toEqual([]);
		expect(selectBillsDueThisWeek([{ ...yearly, dueMonth: null }], TODAY)).toEqual([]);
	});
});

describe('buildMorningDigestMessage', () => {
	it('returns null when every section is empty', () => {
		expect(buildMorningDigestMessage(emptySections, TODAY)).toBeNull();
	});

	it('renders every section that has content', () => {
		const message = buildMorningDigestMessage(
			{
				agenda: [
					createEntry({ title: 'Stretch', completed: true }),
					createEntry({ title: 'Read' })
				],
				tasksDue: [createTask()],
				dinner: 'Chicken tikka masala',
				bills: [
					{ merchant: 'Phone', amount: 45.5, dueDate: TODAY },
					{ merchant: 'Hydro', amount: 120, dueDate: '2026-10-30' }
				],
				visits: [{ name: 'Jane Doe', status: 'critical', lastVisitDate: '2026-09-02' }]
			},
			TODAY
		);

		expect(message).toContain('🗓️ Agenda\n✅ Stretch\n⚪ Read');
		expect(message).toContain('🗂️ Tasks due today\n• Submit grocery list');
		expect(message).toContain('🍽️ Dinner tonight\nChicken tikka masala');
		expect(message).toContain('• Phone $45.50 — today');
		expect(message).toContain('• Hydro $120.00 — Oct 30');
		expect(message).toContain('🚀 ');
	});

	it('names each overdue person with their status and last visit date', () => {
		const message = buildMorningDigestMessage(
			{
				...emptySections,
				visits: [
					{ name: 'Jane Doe', status: 'critical', lastVisitDate: '2026-09-02' },
					{ name: 'Sam Lee', status: 'yellow', lastVisitDate: '2026-10-01' }
				]
			},
			TODAY
		);

		expect(message).toContain('👥 Visits overdue');
		expect(message).toContain('🔴 Jane Doe — last visit September 2, 2026');
		expect(message).toContain('🟡 Sam Lee — last visit October 1, 2026');
	});

	it('leaves out empty sections', () => {
		const message = buildMorningDigestMessage({ ...emptySections, dinner: 'Tacos' }, TODAY);

		expect(message).toContain('Dinner tonight');
		expect(message).not.toContain('Agenda');
		expect(message).not.toContain('Tasks due');
		expect(message).not.toContain('Bills');
		expect(message).not.toContain('Visits');
	});
});

describe('buildMorningDigestTitle', () => {
	it('includes the formatted date', () => {
		expect(buildMorningDigestTitle(TODAY)).toBe('Morning Digest - Wed, Oct 28');
	});

	it('is a valid HTTP header value (ntfy sends it as the Title header)', () => {
		expect(() => new Headers({ Title: buildMorningDigestTitle(TODAY) })).not.toThrow();
	});
});

describe('isMorningDigestDue', () => {
	it('is due from the send time through the end of the day', () => {
		expect(isMorningDigestDue('06', '59', '07:00')).toBe(false);
		expect(isMorningDigestDue('07', '00', '07:00')).toBe(true);
		expect(isMorningDigestDue('23', '59', '07:00')).toBe(true);
	});

	it('stays due all day for an early send time', () => {
		expect(isMorningDigestDue('19', '40', '00:00')).toBe(true);
		expect(isMorningDigestDue('23', '59', '04:30')).toBe(true);
	});
});
