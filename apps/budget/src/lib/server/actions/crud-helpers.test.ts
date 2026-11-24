import { ApiWriteError } from '@sheppakai/shared/api-write';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { z } from 'zod';

type MockState = {
	superValidateResult: { valid: boolean; data: Record<string, unknown> };
	message: ReturnType<typeof vi.fn>;
	superValidate: ReturnType<typeof vi.fn>;
	insertReturning: ReturnType<typeof vi.fn>;
	insertValues: ReturnType<typeof vi.fn>;
	insert: ReturnType<typeof vi.fn>;
	updateWhere: ReturnType<typeof vi.fn>;
	updateSet: ReturnType<typeof vi.fn>;
	update: ReturnType<typeof vi.fn>;
	deleteWhere: ReturnType<typeof vi.fn>;
	deleteFrom: ReturnType<typeof vi.fn>;
	db: {
		insert: ReturnType<typeof vi.fn>;
		update: ReturnType<typeof vi.fn>;
		delete: ReturnType<typeof vi.fn>;
	};
	beforeCreate: Mock<
		(data: Record<string, unknown>, userId: string) => Promise<void | { error: string }>
	>;
	beforeUpdate: Mock<
		(id: string, data: Record<string, unknown>, userId: string) => Promise<unknown>
	>;
	beforeDelete: Mock<(id: string, userId: string) => Promise<void | { error: string }>>;
	loggerInfo: ReturnType<typeof vi.fn>;
	loggerError: ReturnType<typeof vi.fn>;
	requireAuth: ReturnType<typeof vi.fn>;
};

const mockState: MockState = vi.hoisted((): MockState => {
	const state = {
		superValidateResult: { valid: true, data: {} as Record<string, unknown> },
		message: vi.fn<
			(
				form: Record<string, unknown>,
				payload: { type: string; text: string },
				opts?: { status: number }
			) => {
				status: number;
				form: Record<string, unknown>;
				message: { type: string; text: string };
				__message: boolean;
			}
		>(
			(
				form: Record<string, unknown>,
				payload: { type: string; text: string },
				opts?: { status: number }
			) => ({
				status: opts?.status ?? 200,
				form,
				message: payload,
				__message: true
			})
		),
		superValidate: vi.fn<() => void>(),
		insertReturning: vi.fn<() => void>(),
		insertValues: vi.fn<() => void>(),
		insert: vi.fn<() => void>(),
		updateWhere: vi.fn<() => void>(),
		updateSet: vi.fn<() => void>(),
		update: vi.fn<() => void>(),
		deleteWhere: vi.fn<() => void>(),
		deleteFrom: vi.fn<() => void>(),
		db: {
			insert: vi.fn<() => void>(),
			update: vi.fn<() => void>(),
			delete: vi.fn<() => void>()
		},
		beforeCreate: vi.fn<() => void>(),
		beforeUpdate: vi.fn<() => void>(),
		beforeDelete: vi.fn<() => void>(),
		loggerInfo: vi.fn<() => void>(),
		loggerError: vi.fn<() => void>(),
		requireAuth: vi.fn<() => void>()
	} as unknown as MockState;

	state.superValidate = vi.fn<() => Promise<unknown>>(async () => state.superValidateResult);
	state.insertReturning = vi.fn<() => Promise<unknown[]>>(async () => [
		{ id: 'new-id', name: 'created' }
	]);
	state.insertValues = vi.fn<() => unknown>(() => ({
		returning: state.insertReturning
	}));
	state.insert = vi.fn<() => unknown>(() => ({ values: state.insertValues }));
	state.updateWhere = vi.fn<() => Promise<unknown[]>>(async () => []);
	state.updateSet = vi.fn<() => unknown>(() => ({ where: state.updateWhere }));
	state.update = vi.fn<() => unknown>(() => ({ set: state.updateSet }));
	state.deleteWhere = vi.fn<() => Promise<unknown[]>>(async () => []);
	state.deleteFrom = vi.fn<() => unknown>(() => ({ where: state.deleteWhere }));
	state.beforeCreate = vi.fn<
		(data: Record<string, unknown>, userId: string) => Promise<void | { error: string }>
	>(async () => undefined);
	state.beforeUpdate = vi.fn<
		(id: string, data: Record<string, unknown>, userId: string) => Promise<unknown>
	>(async () => undefined);
	state.beforeDelete = vi.fn<(id: string, userId: string) => Promise<void | { error: string }>>(
		async () => undefined
	);
	state.requireAuth = vi.fn<
		(
			handler: (event: unknown, user: { id: string }) => Promise<unknown>
		) => (event: unknown) => Promise<unknown>
	>((handler: (event: unknown, user: { id: string }) => Promise<unknown>) => {
		return async (event: unknown) => handler(event, { id: 'user-1' });
	});

	state.db = {
		insert: state.insert,
		update: state.update,
		delete: state.deleteFrom
	};

	return state;
});

mockState.db = {
	insert: mockState.insert,
	update: mockState.update,
	delete: mockState.deleteFrom
};

vi.mock('sveltekit-superforms', () => ({
	superValidate: mockState.superValidate,
	message: mockState.message
}));

// invalidForm comes from @sheppakai/shared, which imports superforms' server entry.
vi.mock('sveltekit-superforms/server', () => ({
	superValidate: mockState.superValidate,
	message: mockState.message
}));

vi.mock('sveltekit-superforms/adapters', () => ({
	zod4: (schema: unknown) => schema
}));

vi.mock('drizzle-orm', () => ({
	eq: (field: unknown, value: unknown) => ({ field, value }),
	getTableColumns: () => ({ id: 'id-column' })
}));

vi.mock('#lib/server/db/index.js', () => ({
	getDb: () => mockState.db
}));

vi.mock('#lib/server/logger.js', () => ({
	logger: {
		info: mockState.loggerInfo,
		error: mockState.loggerError
	}
}));

vi.mock('./auth-guard', () => ({
	requireAuth: mockState.requireAuth
}));

import { createAction, createWriteActions, deleteAction, updateAction } from './crud-helpers';

describe('crud-helpers', () => {
	const baseSchema = z.object({
		id: z.string().optional(),
		name: z.string(),
		amount: z.number().optional()
	});

	const mockTable = { id: 'id-column' } as unknown as Parameters<typeof createAction>[0]['table'];

	const makeEvent = (formEntries: Array<[string, string]> = []) => {
		const formData = new FormData();
		for (const [key, value] of formEntries) {
			formData.append(key, value);
		}
		return {
			request: {
				formData: async () => formData
			},
			locals: {
				user: { id: 'event-user' }
			}
		} as unknown;
	};

	beforeEach(() => {
		mockState.superValidateResult = {
			valid: true,
			data: { id: 'record-1', name: 'Row 1', amount: 10 }
		};
		mockState.message.mockClear();
		mockState.superValidate.mockClear();
		mockState.insertReturning.mockReset();
		mockState.insertReturning.mockResolvedValue([{ id: 'new-id', name: 'created' }]);
		mockState.insertValues.mockClear();
		mockState.insert.mockClear();
		mockState.updateWhere.mockClear();
		mockState.updateSet.mockClear();
		mockState.update.mockClear();
		mockState.deleteWhere.mockClear();
		mockState.deleteFrom.mockClear();
		mockState.beforeCreate.mockClear();
		mockState.beforeUpdate.mockClear();
		mockState.beforeDelete.mockClear();
		mockState.loggerInfo.mockClear();
		mockState.loggerError.mockClear();
	});

	it('createAction returns a 400 message when form is invalid', async () => {
		mockState.superValidateResult = { valid: false, data: {} };
		const action = createAction({
			schema: baseSchema,
			table: mockTable,
			entityName: 'Thing'
		});

		const result = await action(makeEvent() as never);

		expect(mockState.message).toHaveBeenCalledWith(
			mockState.superValidateResult,
			{ type: 'error', text: 'Please correct the errors in the form.' },
			{ status: 400 }
		);
		expect(result).toEqual({
			status: 400,
			form: mockState.superValidateResult,
			message: {
				type: 'error',
				text: 'Please correct the errors in the form.'
			},
			__message: true
		});
	});

	it('createAction inserts transformed data after the beforeCreate hook', async () => {
		const beforeCreate = mockState.beforeCreate as unknown as NonNullable<
			Parameters<typeof createAction>[0]['beforeCreate']
		>;

		const action = createAction({
			schema: baseSchema,
			table: mockTable,
			entityName: 'Thing',
			beforeCreate,
			transformCreate: (data) => ({ ...data, id: 'should-be-removed' })
		});

		const result = await action(makeEvent() as never);

		expect(mockState.beforeCreate).toHaveBeenCalledWith(
			{ id: 'record-1', name: 'Row 1', amount: 10 },
			'user-1'
		);
		expect(mockState.insert).toHaveBeenCalledWith(mockTable);
		expect(mockState.insertValues).toHaveBeenCalledTimes(1);
		const inserted = mockState.insertValues.mock.calls[0][0] as Record<string, unknown>;
		expect(inserted.id).toBeUndefined();
		expect(inserted.userId).toBe('user-1');
		expect(inserted).not.toHaveProperty('createdBy');
		expect(inserted).not.toHaveProperty('updatedBy');
		expect(mockState.message).toHaveBeenCalledWith(mockState.superValidateResult, {
			type: 'success',
			text: 'Thing created successfully'
		});
		expect(result).toEqual({
			status: 200,
			form: mockState.superValidateResult,
			message: { type: 'success', text: 'Thing created successfully' },
			__message: true
		});
	});

	it('updateAction requires id', async () => {
		mockState.superValidateResult = { valid: true, data: { name: 'No ID' } };
		const action = updateAction({
			schema: baseSchema,
			table: mockTable,
			entityName: 'Thing'
		});

		const result = await action(makeEvent() as never);

		expect(mockState.message).toHaveBeenCalledWith(
			mockState.superValidateResult,
			{ type: 'error', text: 'ID is required for update' },
			{ status: 400 }
		);
		expect(result).toEqual({
			status: 400,
			form: mockState.superValidateResult,
			message: { type: 'error', text: 'ID is required for update' },
			__message: true
		});
	});

	it('updateAction updates the record after the beforeUpdate hook', async () => {
		const beforeUpdate = mockState.beforeUpdate as unknown as NonNullable<
			Parameters<typeof updateAction>[0]['beforeUpdate']
		>;

		const action = updateAction({
			schema: baseSchema,
			table: mockTable,
			entityName: 'Thing',
			beforeUpdate,
			transformUpdate: (data) => ({ ...data, id: 'remove-me' })
		});

		const result = await action(makeEvent() as never);

		expect(mockState.beforeUpdate).toHaveBeenCalledWith(
			'record-1',
			{ id: 'record-1', name: 'Row 1', amount: 10 },
			'user-1'
		);
		expect(mockState.update).toHaveBeenCalledWith(mockTable);
		expect(mockState.updateSet).toHaveBeenCalledTimes(1);
		const updated = mockState.updateSet.mock.calls[0][0] as Record<string, unknown>;
		expect(updated.id).toBeUndefined();
		expect(updated.updatedAt).toBeInstanceOf(Date);
		expect(mockState.updateWhere).toHaveBeenCalledWith({
			field: 'id-column',
			value: 'record-1'
		});
		expect(mockState.message).toHaveBeenCalledWith(mockState.superValidateResult, {
			type: 'success',
			text: 'Thing updated successfully'
		});
		expect(result).toEqual({
			status: 200,
			form: mockState.superValidateResult,
			message: { type: 'success', text: 'Thing updated successfully' },
			__message: true
		});
	});

	it('createAction returns hook error from beforeCreate without inserting', async () => {
		mockState.beforeCreate.mockResolvedValueOnce({
			error: 'Name already taken'
		});
		const beforeCreate = mockState.beforeCreate as unknown as NonNullable<
			Parameters<typeof createAction>[0]['beforeCreate']
		>;

		const action = createAction({
			schema: baseSchema,
			table: mockTable,
			entityName: 'Thing',
			beforeCreate
		});

		const result = await action(makeEvent() as never);

		expect(result).toEqual({
			status: 400,
			form: mockState.superValidateResult,
			message: { type: 'error', text: 'Name already taken' },
			__message: true
		});
		expect(mockState.insert).not.toHaveBeenCalled();
		expect(mockState.loggerError).not.toHaveBeenCalled();
	});

	it('updateAction returns hook error from beforeUpdate without updating', async () => {
		mockState.beforeUpdate.mockResolvedValueOnce({
			error: 'Only completed goals can be archived'
		});
		const beforeUpdate = mockState.beforeUpdate as unknown as NonNullable<
			Parameters<typeof updateAction>[0]['beforeUpdate']
		>;

		const action = updateAction({
			schema: baseSchema,
			table: mockTable,
			entityName: 'Thing',
			beforeUpdate
		});

		const result = await action(makeEvent() as never);

		expect(result).toEqual({
			status: 400,
			form: mockState.superValidateResult,
			message: { type: 'error', text: 'Only completed goals can be archived' },
			__message: true
		});
		expect(mockState.update).not.toHaveBeenCalled();
		expect(mockState.loggerError).not.toHaveBeenCalled();
	});

	it('deleteAction without id fails validation', async () => {
		mockState.superValidateResult = { valid: false, data: {} };
		const action = deleteAction({ table: mockTable, entityName: 'Thing' });

		const result = await action(makeEvent() as never);

		expect(mockState.message).toHaveBeenCalledWith(
			mockState.superValidateResult,
			{ type: 'error', text: 'Please correct the errors in the form.' },
			{ status: 400 }
		);
		expect(result).toEqual({
			status: 400,
			form: mockState.superValidateResult,
			message: {
				type: 'error',
				text: 'Please correct the errors in the form.'
			},
			__message: true
		});
		expect(mockState.deleteFrom).not.toHaveBeenCalled();
	});

	it('deleteAction deletes the record and returns a success message', async () => {
		mockState.superValidateResult = { valid: true, data: { id: 'row-1' } };

		const action = deleteAction({
			table: mockTable,
			entityName: 'Thing'
		});

		const result = await action(makeEvent([['id', 'row-1']]) as never);

		expect(mockState.deleteFrom).toHaveBeenCalledWith(mockTable);
		expect(mockState.deleteWhere).toHaveBeenCalledWith({
			field: 'id-column',
			value: 'row-1'
		});
		expect(result).toEqual({
			status: 200,
			form: mockState.superValidateResult,
			message: { type: 'success', text: 'Thing deleted successfully' },
			__message: true
		});
	});

	it('deleteAction returns hook error from beforeDelete', async () => {
		mockState.superValidateResult = { valid: true, data: { id: 'row-2' } };
		mockState.beforeDelete.mockResolvedValue({
			error: 'Blocked by dependency'
		});
		const beforeDelete = mockState.beforeDelete as unknown as NonNullable<
			Parameters<typeof deleteAction>[0]['beforeDelete']
		>;

		const action = deleteAction({
			table: mockTable,
			entityName: 'Thing',
			beforeDelete
		});

		const result = await action(makeEvent([['id', 'row-2']]) as never);

		expect(mockState.beforeDelete).toHaveBeenCalledWith('row-2', 'user-1');
		expect(mockState.message).toHaveBeenCalledWith(
			mockState.superValidateResult,
			{ type: 'error', text: 'Blocked by dependency' },
			{ status: 400 }
		);
		expect(result).toEqual({
			status: 400,
			form: mockState.superValidateResult,
			message: { type: 'error', text: 'Blocked by dependency' },
			__message: true
		});
		expect(mockState.deleteFrom).not.toHaveBeenCalled();
	});

	it('deleteAction returns a 500 message on database exception', async () => {
		mockState.superValidateResult = { valid: true, data: { id: 'row-3' } };
		mockState.deleteWhere.mockRejectedValueOnce(new Error('delete failed'));

		const action = deleteAction({ table: mockTable, entityName: 'Thing' });

		const result = await action(makeEvent([['id', 'row-3']]) as never);

		expect(mockState.loggerError).toHaveBeenCalled();
		expect(result).toEqual({
			status: 500,
			form: mockState.superValidateResult,
			message: {
				type: 'error',
				text: 'Failed to delete thing. A database error occurred.'
			},
			__message: true
		});
	});

	it('createAction returns message on database exception', async () => {
		mockState.insertValues.mockImplementationOnce(() => {
			throw new Error('write failed');
		});
		const action = createAction({
			schema: baseSchema,
			table: mockTable,
			entityName: 'Thing'
		});

		const result = await action(makeEvent() as never);

		expect(mockState.loggerError).toHaveBeenCalled();
		expect(mockState.message).toHaveBeenCalledWith(
			mockState.superValidateResult,
			{
				type: 'error',
				text: 'Failed to create thing. A database error occurred.'
			},
			{ status: 500 }
		);
		expect(result).toEqual({
			status: 500,
			form: mockState.superValidateResult,
			message: {
				type: 'error',
				text: 'Failed to create thing. A database error occurred.'
			},
			__message: true
		});
	});

	describe('createWriteActions (write-module envelope)', () => {
		const writes = {
			create: vi.fn<(data: Record<string, unknown>, userId: string) => Promise<unknown>>(),
			update:
				vi.fn<(id: string, data: Record<string, unknown>, userId: string) => Promise<unknown>>(),
			delete: vi.fn<(id: string, userId: string) => Promise<unknown>>()
		};
		const actions = () =>
			createWriteActions({ schema: baseSchema, entityName: 'Thing', ...writes });

		beforeEach(() => {
			writes.create.mockReset().mockResolvedValue({ id: 'new-id' });
			writes.update.mockReset().mockResolvedValue(undefined);
			writes.delete.mockReset().mockResolvedValue(undefined);
		});

		it('create passes the validated data and user to the write, and touches no table', async () => {
			const result = await actions().create(makeEvent() as never);

			expect(writes.create).toHaveBeenCalledWith(
				{ id: 'record-1', name: 'Row 1', amount: 10 },
				'user-1'
			);
			expect(mockState.insert).not.toHaveBeenCalled();
			expect(result).toEqual({
				status: 200,
				form: mockState.superValidateResult,
				message: { type: 'success', text: 'Thing created successfully' },
				__message: true
			});
		});

		it('create answers a 500 message when the write throws', async () => {
			writes.create.mockRejectedValueOnce(new Error('write failed'));

			const result = await actions().create(makeEvent() as never);

			expect(mockState.loggerError).toHaveBeenCalled();
			expect(result).toEqual({
				status: 500,
				form: mockState.superValidateResult,
				message: { type: 'error', text: 'Failed to create thing. A database error occurred.' },
				__message: true
			});
		});

		it('update passes the form id, data and user to the write', async () => {
			const result = await actions().update(makeEvent() as never);

			expect(writes.update).toHaveBeenCalledWith(
				'record-1',
				{ id: 'record-1', name: 'Row 1', amount: 10 },
				'user-1'
			);
			expect(result).toMatchObject({
				status: 200,
				message: { type: 'success', text: 'Thing updated successfully' }
			});
		});

		it('update requires an id and does not call the write without one', async () => {
			mockState.superValidateResult = { valid: true, data: { name: 'No ID' } };

			const result = await actions().update(makeEvent() as never);

			expect(writes.update).not.toHaveBeenCalled();
			expect(result).toMatchObject({
				status: 400,
				message: { type: 'error', text: 'ID is required for update' }
			});
		});

		it('update answers a 400 banner when the write rejects on a business rule', async () => {
			writes.update.mockResolvedValueOnce({ error: 'Not allowed' });

			const result = await actions().update(makeEvent() as never);

			expect(mockState.loggerError).not.toHaveBeenCalled();
			expect(result).toMatchObject({
				status: 400,
				message: { type: 'error', text: 'Not allowed' }
			});
		});

		it("update answers with an ApiWriteError's own text and status", async () => {
			writes.update.mockRejectedValueOnce(
				new ApiWriteError('not_found', 'This customer has been deleted.', 404)
			);

			const result = await actions().update(makeEvent() as never);

			expect(mockState.loggerError).not.toHaveBeenCalled();
			expect(result).toMatchObject({
				status: 404,
				message: { type: 'error', text: 'This customer has been deleted.' }
			});
		});

		it('delete passes the id and user to the write', async () => {
			mockState.superValidateResult = { valid: true, data: { id: 'row-9' } };

			const result = await actions().delete(makeEvent([['id', 'row-9']]) as never);

			expect(writes.delete).toHaveBeenCalledWith('row-9', 'user-1');
			expect(mockState.deleteFrom).not.toHaveBeenCalled();
			expect(result).toMatchObject({
				status: 200,
				message: { type: 'success', text: 'Thing deleted successfully' }
			});
		});
	});
});
