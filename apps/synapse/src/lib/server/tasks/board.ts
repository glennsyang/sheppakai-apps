import { and, asc, eq, like, or } from 'drizzle-orm';

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

type TaskBoardClient = Pick<ReturnType<typeof getDb>, 'select' | 'update'>;

function clampBoardIndex(index: number, maxLength: number): number {
	if (index < 0) {
		return 0;
	}

	if (index > maxLength) {
		return maxLength;
	}

	return index;
}

function moveTaskIdToIndex(taskIds: string[], taskId: string, targetIndex: number): string[] {
	const reorderedTaskIds = taskIds.filter((id) => id !== taskId);
	const safeIndex = clampBoardIndex(targetIndex, reorderedTaskIds.length);
	reorderedTaskIds.splice(safeIndex, 0, taskId);
	return reorderedTaskIds;
}

function getCompletedAtForTaskStateChange(
	fromState: TaskState,
	toState: TaskState,
	timestamp: Date
): Date | null | undefined {
	if (fromState !== 'done' && toState === 'done') {
		return timestamp;
	}

	if (fromState === 'done' && toState !== 'done') {
		return null;
	}

	return undefined;
}

function loadTaskIdsByState(db: TaskBoardClient, userId: string, state: TaskState): string[] {
	const rows = db
		.select({ id: tasks.id })
		.from(tasks)
		.where(and(eq(tasks.userId, userId), eq(tasks.state, state)))
		.orderBy(asc(tasks.sortOrder), asc(tasks.taskNumber))
		.all();

	return rows.map((row) => row.id);
}

function applyTaskSortOrder(
	db: TaskBoardClient,
	userId: string,
	taskIds: string[],
	timestamp: Date
): void {
	for (let index = 0; index < taskIds.length; index += 1) {
		db.update(tasks)
			.set({
				sortOrder: index,
				updatedAt: timestamp
			})
			.where(and(eq(tasks.id, taskIds[index]), eq(tasks.userId, userId)))
			.run();
	}
}

type MoveTaskWithinBoardResult = {
	fromState: TaskState;
	toState: TaskState;
};

export function moveTaskWithinBoard(
	db: TaskBoardClient,
	userId: string,
	taskId: string,
	toState: TaskState,
	toIndex: number,
	timestamp: Date
): MoveTaskWithinBoardResult | null {
	const existing = db
		.select({ id: tasks.id, state: tasks.state })
		.from(tasks)
		.where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)))
		.get();

	if (!existing) {
		return null;
	}

	const fromState = existing.state as TaskState;

	if (fromState === toState) {
		const columnTaskIds = loadTaskIdsByState(db, userId, toState);
		const reorderedTaskIds = moveTaskIdToIndex(columnTaskIds, taskId, toIndex);
		applyTaskSortOrder(db, userId, reorderedTaskIds, timestamp);
		return { fromState, toState };
	}

	const sourceTaskIds = loadTaskIdsByState(db, userId, fromState);
	const targetTaskIds = loadTaskIdsByState(db, userId, toState);

	const nextSourceTaskIds = sourceTaskIds.filter((id) => id !== taskId);
	const nextTargetTaskIds = moveTaskIdToIndex(targetTaskIds, taskId, toIndex);

	const completedAt = getCompletedAtForTaskStateChange(fromState, toState, timestamp);
	const stateUpdate: {
		state: TaskState;
		updatedAt: Date;
		completedAt?: Date | null;
	} = {
		state: toState,
		updatedAt: timestamp
	};

	if (completedAt !== undefined) {
		stateUpdate.completedAt = completedAt;
	}

	db.update(tasks)
		.set(stateUpdate)
		.where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)))
		.run();

	applyTaskSortOrder(db, userId, nextSourceTaskIds, timestamp);
	applyTaskSortOrder(db, userId, nextTargetTaskIds, timestamp);

	return { fromState, toState };
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
		state: task.state as TaskState,
		tags: parseTaskTags(task.tags)
	}));
}
