import { and, eq, like, or } from 'drizzle-orm';

import type { TaskState } from '#lib/schemas/task.js';
import { parseTaskTags } from '#lib/server/actions/string-parsers.js';
import { getDb } from '#lib/server/db/index.js';
import { tasks } from '#lib/server/db/schema/index.js';
import { getDateUrgencyStatus, getTodayString } from '#lib/utils/date.js';

/**
 * Get all unique tags across the user's tasks
 */
export async function getAllTags(userId: string): Promise<string[]> {
	const taskRows = await getDb().query.tasks.findMany({
		where: eq(tasks.userId, userId),
		columns: { tags: true }
	});

	const tagSet = new Set<string>();
	for (const task of taskRows) {
		for (const tag of parseTaskTags(task.tags) ?? []) {
			tagSet.add(tag);
		}
	}

	return Array.from(tagSet).sort((a, b) => a.localeCompare(b));
}

export async function loadTaskBoardData(
	userId: string,
	filters: {
		keyword?: string;
		priority: number[];
		tag: string[];
		state?: TaskState;
		dueDate: ('overdue' | 'today' | 'upcoming')[];
	}
) {
	const conditions = [eq(tasks.userId, userId)];

	if (filters.state) {
		conditions.push(eq(tasks.state, filters.state));
	}

	if (filters.priority.length > 0) {
		const priorityCondition = or(...filters.priority.map((value) => eq(tasks.priority, value)));
		if (priorityCondition) {
			conditions.push(priorityCondition);
		}
	}

	if (filters.keyword) {
		const keywordPattern = `%${filters.keyword}%`;
		const keywordCondition = or(
			like(tasks.title, keywordPattern),
			like(tasks.description, keywordPattern)
		);
		if (keywordCondition) {
			conditions.push(keywordCondition);
		}
	}

	if (filters.tag.length > 0) {
		const tagCondition = or(...filters.tag.map((value) => like(tasks.tags, `%"${value}"%`)));
		if (tagCondition) {
			conditions.push(tagCondition);
		}
	}

	let taskRows = await getDb().query.tasks.findMany({
		where: and(...conditions),
		orderBy: [tasks.state, tasks.sortOrder, tasks.priority, tasks.dueDate, tasks.taskNumber]
	});

	// Apply due date filtering after database query since we need to calculate urgency status
	if (filters.dueDate.length > 0) {
		const today = getTodayString();
		taskRows = taskRows.filter((task) => {
			const urgencyStatus = getDateUrgencyStatus(task.dueDate, today);
			return urgencyStatus && filters.dueDate.includes(urgencyStatus);
		});
	}

	return taskRows.map((task) => ({
		...task,
		taskNumber: task.taskNumber,
		state: task.state,
		tags: parseTaskTags(task.tags)
	}));
}
