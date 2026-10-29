import { describe, expect, it } from 'vitest';

import {
	buildTasksDueTodayDigestTitle,
	buildTasksDueTodayEmailHtml,
	type TasksDueTodayTaskSummary
} from './tasks-due-today-digest';

function createTask(overrides: Partial<TasksDueTodayTaskSummary> = {}): TasksDueTodayTaskSummary {
	return {
		id: 'task-1',
		taskNumber: 12,
		title: 'Review weekly training plan',
		priority: 2,
		dueDate: '2026-03-30',
		state: 'new',
		...overrides
	};
}

describe('tasks-due-today-digest', () => {
	it('builds a due-today title with the formatted date', () => {
		const title = buildTasksDueTodayDigestTitle('2026-03-30');

		expect(title).toContain('Synapse - Tasks Due Today');
		expect(title).toContain('Mar');
	});
});

describe('buildTasksDueTodayEmailHtml', () => {
	it('escapes the recipient name and task titles', () => {
		const html = buildTasksDueTodayEmailHtml(
			'<b>Jane</b>',
			[createTask({ title: '<img src=x onerror=alert(1)>' })],
			'2026-03-30'
		);

		expect(html).not.toContain('<img');
		expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
		expect(html).toContain('Hi &lt;b&gt;Jane&lt;/b&gt;,');
		expect(html).toContain('Task #12');
	});
});
