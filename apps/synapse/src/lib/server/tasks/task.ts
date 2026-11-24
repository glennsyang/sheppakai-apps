// The Task module: the one place that owns Task Number allocation, Task State transitions,
// `completedAt` and kanban sort order. Form actions, the kanban board and `/api/v1` are thin
// adapters over `createTask`, `updateTask` and `moveTask`.
//
// The better-sqlite3 driver runs transaction callbacks synchronously, so every query inside a
// transaction uses its sync execution method (`.all()` / `.get()` / `.run()`) rather than `await`.
import { and, asc, eq, ne, sql } from 'drizzle-orm';

import type { TaskState } from '#lib/schemas/task.js';
import type { getDb } from '#lib/server/db/index.js';
import { tasks } from '#lib/server/db/schema/index.js';

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type DbClient = Db | Tx;

export type Task = typeof tasks.$inferSelect;

export type TaskFields = {
	title: string;
	description: string | null;
	tags: string[] | null;
	dueDate: string | null;
	priority: number;
	state: TaskState;
};

export type TaskPatch = Partial<TaskFields>;

export type TaskWriteResult =
	| { ok: true; task: Task }
	| { ok: false; reason: 'duplicate_title' | 'not_found' };

export type TaskMoveResult =
	| { ok: true; fromState: TaskState; toState: TaskState }
	| { ok: false; reason: 'not_found' };

type WriteOptions = { now?: Date };

const MAX_TASK_NUMBER_ATTEMPTS = 3;
const TASK_NUMBER_CONSTRAINT_TEXT = 'UNIQUE constraint failed: tasks.task_number';

/** Index that puts a task at the bottom of its target column. */
const END_OF_COLUMN = Number.MAX_SAFE_INTEGER;

function isTaskNumberConflict(error: unknown): boolean {
	return error instanceof Error && error.message.includes(TASK_NUMBER_CONSTRAINT_TEXT);
}

function tagsToJson(tags: string[] | null | undefined): string | null {
	if (!tags || tags.length === 0) return null;
	return JSON.stringify(tags);
}

/**
 * `completedAt` follows the Task State: set when a task enters `done`, cleared when it leaves,
 * untouched (undefined) otherwise.
 */
function completedAtForStateChange(
	fromState: TaskState,
	toState: TaskState,
	now: Date
): Date | null | undefined {
	if (fromState !== 'done' && toState === 'done') return now;
	if (fromState === 'done' && toState !== 'done') return null;
	return undefined;
}

function hasDuplicateTitle(
	db: DbClient,
	userId: string,
	title: string,
	excludeTaskId?: string
): boolean {
	const duplicate = db
		.select({ id: tasks.id })
		.from(tasks)
		.where(
			excludeTaskId
				? and(eq(tasks.userId, userId), eq(tasks.title, title), ne(tasks.id, excludeTaskId))
				: and(eq(tasks.userId, userId), eq(tasks.title, title))
		)
		.get();
	return duplicate !== undefined;
}

function findOwnedTask(db: DbClient, userId: string, taskId: string): Task | undefined {
	return db
		.select()
		.from(tasks)
		.where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)))
		.get();
}

function loadColumnTaskIds(db: DbClient, userId: string, state: TaskState): string[] {
	return db
		.select({ id: tasks.id })
		.from(tasks)
		.where(and(eq(tasks.userId, userId), eq(tasks.state, state)))
		.orderBy(asc(tasks.sortOrder), asc(tasks.taskNumber))
		.all()
		.map((row) => row.id);
}

function writeColumnOrder(db: DbClient, userId: string, taskIds: string[], now: Date): void {
	taskIds.forEach((id, index) => {
		db.update(tasks)
			.set({ sortOrder: index, updatedAt: now })
			.where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
			.run();
	});
}

function insertAt(taskIds: string[], taskId: string, index: number): string[] {
	const next = taskIds.filter((id) => id !== taskId);
	next.splice(Math.min(Math.max(index, 0), next.length), 0, taskId);
	return next;
}

/** Moves a task within or across columns inside an open transaction. */
function moveWithin(
	tx: DbClient,
	userId: string,
	taskId: string,
	toState: TaskState,
	toIndex: number,
	now: Date
): TaskMoveResult {
	const existing = findOwnedTask(tx, userId, taskId);
	if (!existing) return { ok: false, reason: 'not_found' };

	const fromState = existing.state;

	if (fromState === toState) {
		const column = loadColumnTaskIds(tx, userId, toState);
		writeColumnOrder(tx, userId, insertAt(column, taskId, toIndex), now);
		return { ok: true, fromState, toState };
	}

	const source = loadColumnTaskIds(tx, userId, fromState).filter((id) => id !== taskId);
	const target = insertAt(loadColumnTaskIds(tx, userId, toState), taskId, toIndex);

	const completedAt = completedAtForStateChange(fromState, toState, now);
	tx.update(tasks)
		.set({
			state: toState,
			updatedAt: now,
			...(completedAt !== undefined && { completedAt })
		})
		.where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)))
		.run();

	writeColumnOrder(tx, userId, source, now);
	writeColumnOrder(tx, userId, target, now);

	return { ok: true, fromState, toState };
}

/**
 * Creates a task with the next global Task Number at the bottom of its column. Task Numbers are
 * unique across all users, so a concurrent create can claim the same number; the insert is then
 * retried with a freshly read number.
 */
export function createTask(
	db: Db,
	userId: string,
	fields: TaskFields,
	{ now = new Date() }: WriteOptions = {}
): TaskWriteResult {
	for (let attempt = 1; attempt <= MAX_TASK_NUMBER_ATTEMPTS; attempt += 1) {
		try {
			return db.transaction((tx): TaskWriteResult => {
				if (hasDuplicateTitle(tx, userId, fields.title)) {
					return { ok: false, reason: 'duplicate_title' };
				}

				const taskNumberRow = tx
					.select({ next: sql<number>`coalesce(max(${tasks.taskNumber}), 0) + 1` })
					.from(tasks)
					.get();

				const sortOrderRow = tx
					.select({ max: sql<number>`coalesce(max(${tasks.sortOrder}), -1)` })
					.from(tasks)
					.where(and(eq(tasks.userId, userId), eq(tasks.state, fields.state)))
					.get();

				const task = tx
					.insert(tasks)
					.values({
						userId,
						taskNumber: taskNumberRow?.next ?? 1,
						title: fields.title,
						description: fields.description,
						tags: tagsToJson(fields.tags),
						dueDate: fields.dueDate,
						priority: fields.priority,
						state: fields.state,
						sortOrder: (sortOrderRow?.max ?? -1) + 1,
						completedAt: fields.state === 'done' ? now : null,
						createdAt: now,
						updatedAt: now
					})
					.returning()
					.get();

				return { ok: true, task };
			});
		} catch (error) {
			if (isTaskNumberConflict(error) && attempt < MAX_TASK_NUMBER_ATTEMPTS) continue;
			throw error;
		}
	}

	throw new Error('Failed to allocate a task number');
}

/**
 * Applies a partial update. A Task State change moves the task to the bottom of its new column,
 * closes the gap in the old one and sets or clears `completedAt`.
 */
export function updateTask(
	db: Db,
	userId: string,
	taskId: string,
	patch: TaskPatch,
	{ now = new Date() }: WriteOptions = {}
): TaskWriteResult {
	return db.transaction((tx): TaskWriteResult => {
		const existing = findOwnedTask(tx, userId, taskId);
		if (!existing) return { ok: false, reason: 'not_found' };

		if (patch.title !== undefined && hasDuplicateTitle(tx, userId, patch.title, taskId)) {
			return { ok: false, reason: 'duplicate_title' };
		}

		tx.update(tasks)
			.set({
				updatedAt: now,
				...(patch.title !== undefined && { title: patch.title }),
				...(patch.description !== undefined && { description: patch.description }),
				...(patch.tags !== undefined && { tags: tagsToJson(patch.tags) }),
				...(patch.dueDate !== undefined && { dueDate: patch.dueDate }),
				...(patch.priority !== undefined && { priority: patch.priority })
			})
			.where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)))
			.run();

		if (patch.state !== undefined && patch.state !== existing.state) {
			moveWithin(tx, userId, taskId, patch.state, END_OF_COLUMN, now);
		}

		const task = findOwnedTask(tx, userId, taskId);
		return task ? { ok: true, task } : { ok: false, reason: 'not_found' };
	});
}

/**
 * Moves a task to `toIndex` in the `toState` column (clamped to the column's bounds) and
 * renumbers the affected columns.
 */
export function moveTask(
	db: Db,
	userId: string,
	taskId: string,
	toState: TaskState,
	toIndex: number,
	{ now = new Date() }: WriteOptions = {}
): TaskMoveResult {
	return db.transaction((tx) => moveWithin(tx, userId, taskId, toState, toIndex, now));
}
