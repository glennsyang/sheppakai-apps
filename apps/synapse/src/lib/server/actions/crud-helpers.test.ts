import type { RequestEvent } from '@sveltejs/kit';
import { isRedirect, redirect } from '@sveltejs/kit';
import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { message } from 'sveltekit-superforms';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

// A real in-memory table, so the userId scoping is checked against SQL rather than a mock.
const notes = sqliteTable('notes', {
	id: text('id').primaryKey(),
	userId: text('userId').notNull(),
	body: text('body').notNull(),
	createdAt: integer('createdAt', { mode: 'timestamp' }).notNull(),
	updatedAt: integer('updatedAt', { mode: 'timestamp' }).notNull()
});

const state = vi.hoisted(() => ({ db: null as unknown }));

vi.mock('$lib/server/db', () => ({ getDb: () => state.db }));
vi.mock('$lib/server/logger', () => ({
	logger: { info: vi.fn<() => void>(), error: vi.fn<() => void>(), warn: vi.fn<() => void>() }
}));

import { createAction, deleteAction, updateAction } from './crud-helpers';

const noteSchema = z.object({ body: z.string().min(1) });
const updateNoteSchema = noteSchema.extend({ id: z.string().min(1) });
const idSchema = z.object({ id: z.string().min(1) });

const OWNER = { id: 'owner', name: 'Owner', email: 'o@example.com', role: 'user' };
const OTHER = { id: 'other', name: 'Other', email: 'x@example.com', role: 'user' };

function event(user: unknown, body: Record<string, string>, params: Record<string, string> = {}) {
	return {
		locals: { user },
		params,
		request: new Request('http://localhost/notes?/act', {
			method: 'POST',
			body: new URLSearchParams(body)
		})
	} as unknown as RequestEvent;
}

function seed(id: string, userId: string, body = 'original') {
	const now = new Date();
	(state.db as ReturnType<typeof drizzle>)
		.insert(notes)
		.values({ id, userId, body, createdAt: now, updatedAt: now })
		.run();
}

function rows() {
	return (state.db as ReturnType<typeof drizzle>).select().from(notes).all();
}

beforeEach(() => {
	const sqlite = new Database(':memory:');
	sqlite.exec(
		'CREATE TABLE notes (id TEXT PRIMARY KEY, userId TEXT NOT NULL, body TEXT NOT NULL, createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL)'
	);
	state.db = drizzle(sqlite);
});

describe('createAction', () => {
	const create = createAction({
		schema: noteSchema,
		table: notes,
		entityName: 'Note',
		toRow: (data) => ({ body: data.body })
	});

	it('rejects an anonymous caller with 401', async () => {
		expect(await create(event(null, { body: 'hi' }))).toMatchObject({ status: 401 });
		expect(rows()).toHaveLength(0);
	});

	it('returns the invalid-form message for a bad form', async () => {
		expect(await create(event(OWNER, { body: '' }))).toMatchObject({ status: 400 });
		expect(rows()).toHaveLength(0);
	});

	it('inserts a row owned by the caller and returns { success, create, form }', async () => {
		const result = await create(event(OWNER, { body: 'hi' }));

		expect(result).toMatchObject({ success: true, create: true, form: { valid: true } });
		expect(rows()).toEqual([expect.objectContaining({ userId: 'owner', body: 'hi' })]);
	});
});

describe('updateAction', () => {
	const update = updateAction({
		schema: updateNoteSchema,
		table: notes,
		entityName: 'Note',
		toRow: (data) => ({ body: data.body })
	});

	it("updates the caller's own row", async () => {
		seed('n1', 'owner');

		const result = await update(event(OWNER, { id: 'n1', body: 'edited' }));

		expect(result).toMatchObject({ success: true, update: true });
		expect(rows()[0].body).toBe('edited');
	});

	it("answers 404 and leaves another user's row alone", async () => {
		seed('n1', 'owner');

		const result = await update(event(OTHER, { id: 'n1', body: 'hijack' }));

		expect(result).toMatchObject({
			status: 404,
			data: { form: { message: { type: 'error', text: 'Note not found.' } } }
		});
		expect(rows()[0].body).toBe('original');
	});

	it('answers 500 with a banner when the write throws', async () => {
		state.db = {
			update: () => {
				throw new Error('disk full');
			}
		};

		const result = await update(event(OWNER, { id: 'n1', body: 'x' }));

		expect(result).toMatchObject({
			status: 500,
			data: { form: { message: { text: 'Failed to update note. Please try again.' } } }
		});
	});
});

describe('deleteAction', () => {
	it("deletes the caller's own row and returns { success: true }", async () => {
		seed('n1', 'owner');
		const remove = deleteAction({ schema: idSchema, table: notes, entityName: 'Note' });

		expect(await remove(event(OWNER, { id: 'n1' }))).toEqual({ success: true });
		expect(rows()).toHaveLength(0);
	});

	it("answers 404 and keeps another user's row", async () => {
		seed('n1', 'owner');
		const remove = deleteAction({ schema: idSchema, table: notes, entityName: 'Note' });

		expect(await remove(event(OTHER, { id: 'n1' }))).toMatchObject({ status: 404 });
		expect(rows()).toHaveLength(1);
	});

	it('uses the custom invalid message', async () => {
		const remove = deleteAction({
			schema: idSchema,
			table: notes,
			entityName: 'Note',
			invalidMessage: 'Invalid note id'
		});

		expect(await remove(event(OWNER, { id: '' }))).toMatchObject({
			status: 400,
			data: { form: { message: { text: 'Invalid note id' } } }
		});
	});

	it('takes the id from getId and lets onSuccess redirect', async () => {
		seed('n1', 'owner');
		const remove = deleteAction({
			schema: z.object({}),
			table: notes,
			entityName: 'Note',
			getId: (_form, { params }) => params.id ?? '',
			onSuccess: () => {
				throw redirect(303, '/notes');
			}
		});

		const thrown = await remove(event(OWNER, {}, { id: 'n1' })).catch((e: unknown) => e);

		expect(isRedirect(thrown) && thrown.location).toBe('/notes');
		expect(
			(state.db as ReturnType<typeof drizzle>).select().from(notes).where(eq(notes.id, 'n1')).all()
		).toHaveLength(0);
	});

	it('lets onSuccess return a message', async () => {
		seed('n1', 'owner');
		const remove = deleteAction({
			schema: idSchema,
			table: notes,
			entityName: 'Note',
			onSuccess: (form) => message(form, { type: 'success', text: 'Note deleted.' })
		});

		expect(await remove(event(OWNER, { id: 'n1' }))).toMatchObject({
			form: { message: { type: 'success', text: 'Note deleted.' } }
		});
	});
});
