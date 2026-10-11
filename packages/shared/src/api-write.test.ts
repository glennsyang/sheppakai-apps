import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { ApiWriteError, createHandleApiWrite, parseJsonBody } from './api-write';

const mockRecordApiWrite = vi.fn<(...args: unknown[]) => Promise<void>>();
const mockLoggerError = vi.fn<(...args: unknown[]) => void>();

const handleApiWrite = createHandleApiWrite({
	recordApiWrite: mockRecordApiWrite,
	logger: { error: mockLoggerError }
});

const context = {
	apiKeyId: 'key-1',
	userId: 'user-1',
	method: 'POST',
	path: '/api/v1/tasks',
	action: 'tasks:write'
};

describe('handleApiWrite', () => {
	beforeEach(() => {
		mockRecordApiWrite.mockClear();
		mockLoggerError.mockClear();
	});

	it('returns the success envelope and records a success audit entry', async () => {
		const response = await handleApiWrite(context, async () => ({ id: 'task-1' }), {
			successStatus: 201,
			failureMessage: 'Failed to create task'
		});

		expect(response.status).toBe(201);
		expect(await response.json()).toEqual({ data: { id: 'task-1' } });
		expect(mockRecordApiWrite).toHaveBeenCalledWith({ ...context, statusCode: 201 });
	});

	it('defaults to a 201 success status', async () => {
		const response = await handleApiWrite(context, async () => ({ id: 'task-1' }), {
			failureMessage: 'Failed to create task'
		});

		expect(response.status).toBe(201);
	});

	it('maps a thrown ApiWriteError to its typed error response and status', async () => {
		const response = await handleApiWrite(
			context,
			async () => {
				throw new ApiWriteError('not_found', 'Task not found.', 404);
			},
			{ failureMessage: 'Failed to update task' }
		);

		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({
			error: { code: 'not_found', message: 'Task not found.' }
		});
		expect(mockRecordApiWrite).toHaveBeenCalledWith({ ...context, statusCode: 404 });
		expect(mockLoggerError).not.toHaveBeenCalled();
	});

	it('maps an unexpected error to a logged 500', async () => {
		const response = await handleApiWrite(
			context,
			async () => {
				throw new Error('boom');
			},
			{ failureMessage: 'Failed to create task' }
		);

		expect(response.status).toBe(500);
		expect(await response.json()).toEqual({
			error: { code: 'internal_error', message: 'Failed to create task.' }
		});
		expect(mockRecordApiWrite).toHaveBeenCalledWith({ ...context, statusCode: 500 });
		expect(mockLoggerError).toHaveBeenCalled();
	});
});

describe('ApiWriteError', () => {
	it('carries the code, message, and status', () => {
		const error = new ApiWriteError('not_found', 'Task not found.', 404);
		expect(error).toBeInstanceOf(Error);
		expect(error.name).toBe('ApiWriteError');
		expect(error.code).toBe('not_found');
		expect(error.message).toBe('Task not found.');
		expect(error.status).toBe(404);
	});
});

describe('parseJsonBody', () => {
	const schema = z.object({ title: z.string().min(1, 'Title is required') });

	function jsonRequest(body: string) {
		return new Request('http://localhost/api/v1/tasks', { method: 'POST', body });
	}

	it('returns the parsed data', async () => {
		expect(await parseJsonBody(jsonRequest('{"title":"Hi"}'), schema)).toEqual({
			ok: true,
			data: { title: 'Hi' }
		});
	});

	it('answers invalid_json for a non-JSON body', async () => {
		const result = await parseJsonBody(jsonRequest('{nope'), schema);
		if (result.ok) throw new Error('expected failure');
		expect(result.response.status).toBe(400);
		expect(await result.response.json()).toMatchObject({ error: { code: 'invalid_json' } });
	});

	it('answers validation_failed with the issue messages', async () => {
		const result = await parseJsonBody(jsonRequest('{"title":""}'), schema);
		if (result.ok) throw new Error('expected failure');
		expect(result.response.status).toBe(400);
		expect(await result.response.json()).toEqual({
			error: { code: 'validation_failed', message: 'Title is required' }
		});
	});
});
