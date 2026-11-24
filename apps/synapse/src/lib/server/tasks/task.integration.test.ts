// Runs the Task module against the app's real schema and migrations in in-memory SQLite.
import { and, asc, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TaskState } from '#lib/schemas/task.js';

import * as schema from '../db/schema';
import type { Db } from '../notification-jobs/run-job';
import { buildTestDb, TEST_USER } from '../notification-jobs/test-harness';
import { createTask, moveTask, type TaskFields, updateTask } from './task';

const OTHER_USER = { id: 'user-2', name: 'Other', email: 'other@example.com' };
const T0 = new Date('2026-11-24T10:00:00Z');
const T1 = new Date('2026-11-24T11:00:00Z');
const T2 = new Date('2026-11-24T12:00:00Z');

let db: Db;

beforeEach(() => {
	db = buildTestDb();
	db.insert(schema.user)
		.values({ ...OTHER_USER, createdAt: T0, updatedAt: T0 })
		.run();
});

function fields(title: string, overrides: Partial<TaskFields> = {}): TaskFields {
	return {
		title,
		description: null,
		tags: null,
		dueDate: null,
		priority: 2,
		state: 'new',
		...overrides
	};
}

function create(title: string, overrides: Partial<TaskFields> = {}, userId = TEST_USER.id) {
	const result = createTask(db, userId, fields(title, overrides), { now: T0 });
	if (!result.ok) throw new Error(`create ${title} failed: ${result.reason}`);
	return result.task;
}

function column(state: TaskState, userId = TEST_USER.id) {
	return db
		.select({ title: schema.tasks.title, sortOrder: schema.tasks.sortOrder })
		.from(schema.tasks)
		.where(and(eq(schema.tasks.userId, userId), eq(schema.tasks.state, state)))
		.orderBy(asc(schema.tasks.sortOrder))
		.all();
}

function titles(state: TaskState) {
	return column(state).map((row) => row.title);
}

function load(id: string) {
	const task = db.select().from(schema.tasks).where(eq(schema.tasks.id, id)).get();
	if (!task) throw new Error(`task ${id} missing`);
	return task;
}

describe('createTask', () => {
	it('allocates Task Numbers globally across users', () => {
		expect(create('A').taskNumber).toBe(1);
		expect(create('B', {}, OTHER_USER.id).taskNumber).toBe(2);
		expect(create('C').taskNumber).toBe(3);
	});

	it('gives every concurrent create a distinct Task Number', async () => {
		const results = await Promise.all(
			Array.from({ length: 10 }, (_, i) =>
				Promise.resolve().then(() =>
					createTask(db, i % 2 ? OTHER_USER.id : TEST_USER.id, fields(`Task ${i}`))
				)
			)
		);
		const numbers = results.map((r) => (r.ok ? r.task.taskNumber : -1));
		expect(new Set(numbers).size).toBe(10);
		expect([...numbers].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
	});

	it('retries with a fresh Task Number when a concurrent create claims the same one', () => {
		create('A');
		const realTransaction = db.transaction.bind(db);
		let raced = false;
		const spy = vi.spyOn(db, 'transaction').mockImplementation((fn) => {
			if (!raced) {
				raced = true;
				// Another request inserts Task Number 2 between our read and our insert.
				db.insert(schema.tasks)
					.values({ userId: OTHER_USER.id, taskNumber: 2, title: 'Racer', priority: 1 })
					.run();
				throw new Error('UNIQUE constraint failed: tasks.task_number');
			}
			return realTransaction(fn);
		});

		const result = createTask(db, TEST_USER.id, fields('B'));
		spy.mockRestore();

		expect(result.ok && result.task.taskNumber).toBe(3);
	});

	it('gives up after repeated Task Number conflicts', () => {
		const spy = vi.spyOn(db, 'transaction').mockImplementation(() => {
			throw new Error('UNIQUE constraint failed: tasks.task_number');
		});
		expect(() => createTask(db, TEST_USER.id, fields('A'))).toThrow(/task_number/);
		expect(spy).toHaveBeenCalledTimes(3);
		spy.mockRestore();
	});

	it('rejects a duplicate title for the same user only', () => {
		create('A');
		expect(createTask(db, TEST_USER.id, fields('A'))).toEqual({
			ok: false,
			reason: 'duplicate_title'
		});
		expect(createTask(db, OTHER_USER.id, fields('A')).ok).toBe(true);
	});

	it('appends to the bottom of its column and stores tags as JSON', () => {
		create('A');
		const b = create('B', { tags: ['x', 'y'] });
		create('C', { state: 'blocked' });
		expect(column('new')).toEqual([
			{ title: 'A', sortOrder: 0 },
			{ title: 'B', sortOrder: 1 }
		]);
		expect(column('blocked')).toEqual([{ title: 'C', sortOrder: 0 }]);
		expect(b.tags).toBe('["x","y"]');
	});

	it('sets completedAt only when created in done', () => {
		expect(create('A').completedAt).toBeNull();
		expect(create('B', { state: 'done' }).completedAt).toEqual(T0);
	});
});

describe('Task State transitions and completedAt', () => {
	it('sets completedAt on entering done and clears it on leaving', () => {
		const task = create('A');

		updateTask(db, TEST_USER.id, task.id, { state: 'done' }, { now: T1 });
		expect(load(task.id).completedAt).toEqual(T1);

		updateTask(db, TEST_USER.id, task.id, { state: 'in_progress' }, { now: T2 });
		expect(load(task.id).completedAt).toBeNull();
	});

	it('keeps completedAt when a done task is edited or reordered within done', () => {
		const task = create('A');
		create('B', { state: 'done' });
		moveTask(db, TEST_USER.id, task.id, 'done', 0, { now: T1 });

		updateTask(db, TEST_USER.id, task.id, { title: 'A2', state: 'done' }, { now: T2 });
		moveTask(db, TEST_USER.id, task.id, 'done', 5, { now: T2 });

		expect(load(task.id).completedAt).toEqual(T1);
	});

	it('does not touch completedAt between two non-done states', () => {
		const task = create('A');
		moveTask(db, TEST_USER.id, task.id, 'blocked', 0, { now: T1 });
		expect(load(task.id).completedAt).toBeNull();
	});

	it('applies the same rule on the kanban move path', () => {
		const task = create('A');
		moveTask(db, TEST_USER.id, task.id, 'done', 0, { now: T1 });
		expect(load(task.id).completedAt).toEqual(T1);
		moveTask(db, TEST_USER.id, task.id, 'new', 0, { now: T2 });
		expect(load(task.id).completedAt).toBeNull();
	});
});

describe('sort order', () => {
	beforeEach(() => {
		for (const title of ['A', 'B', 'C']) create(title);
		for (const title of ['X', 'Y']) create(title, { state: 'in_progress' });
	});

	function id(title: string) {
		const row = db.select().from(schema.tasks).where(eq(schema.tasks.title, title)).get();
		if (!row) throw new Error(title);
		return row.id;
	}

	it('reorders within a column', () => {
		moveTask(db, TEST_USER.id, id('C'), 'new', 0);
		expect(column('new')).toEqual([
			{ title: 'C', sortOrder: 0 },
			{ title: 'A', sortOrder: 1 },
			{ title: 'B', sortOrder: 2 }
		]);
	});

	it('moves across columns, closing the gap and inserting at the index', () => {
		const result = moveTask(db, TEST_USER.id, id('B'), 'in_progress', 1);
		expect(result).toEqual({ ok: true, fromState: 'new', toState: 'in_progress' });
		expect(column('new')).toEqual([
			{ title: 'A', sortOrder: 0 },
			{ title: 'C', sortOrder: 1 }
		]);
		expect(column('in_progress')).toEqual([
			{ title: 'X', sortOrder: 0 },
			{ title: 'B', sortOrder: 1 },
			{ title: 'Y', sortOrder: 2 }
		]);
	});

	it('clamps an out-of-range index to the column bounds', () => {
		moveTask(db, TEST_USER.id, id('A'), 'in_progress', 99);
		expect(titles('in_progress')).toEqual(['X', 'Y', 'A']);
		moveTask(db, TEST_USER.id, id('A'), 'in_progress', -5);
		expect(titles('in_progress')).toEqual(['A', 'X', 'Y']);
	});

	it('puts a task changed by updateTask at the bottom of its new column', () => {
		updateTask(db, TEST_USER.id, id('A'), { state: 'in_progress' });
		expect(column('new')).toEqual([
			{ title: 'B', sortOrder: 0 },
			{ title: 'C', sortOrder: 1 }
		]);
		expect(titles('in_progress')).toEqual(['X', 'Y', 'A']);
	});

	it("leaves other users' columns alone", () => {
		create('Other', {}, OTHER_USER.id);
		moveTask(db, TEST_USER.id, id('A'), 'in_progress', 0);
		expect(column('new', OTHER_USER.id)).toEqual([{ title: 'Other', sortOrder: 0 }]);
	});
});

describe('ownership and updates', () => {
	it("cannot move or update another user's task", () => {
		const task = create('Theirs', {}, OTHER_USER.id);
		expect(moveTask(db, TEST_USER.id, task.id, 'done', 0)).toEqual({
			ok: false,
			reason: 'not_found'
		});
		expect(updateTask(db, TEST_USER.id, task.id, { title: 'Mine' })).toEqual({
			ok: false,
			reason: 'not_found'
		});
		expect(load(task.id).title).toBe('Theirs');
	});

	it('rejects renaming onto another task title but allows keeping its own', () => {
		create('A');
		const b = create('B');
		expect(updateTask(db, TEST_USER.id, b.id, { title: 'A' })).toEqual({
			ok: false,
			reason: 'duplicate_title'
		});
		expect(updateTask(db, TEST_USER.id, b.id, { title: 'B' }).ok).toBe(true);
	});

	it('only writes the fields present in the patch', () => {
		const task = create('A', { description: 'keep', tags: ['t'], priority: 3 });
		const result = updateTask(db, TEST_USER.id, task.id, { priority: 1, tags: [] });
		expect(result.ok && result.task).toMatchObject({
			description: 'keep',
			priority: 1,
			tags: null
		});
	});
});
