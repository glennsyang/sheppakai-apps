import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks — must be defined before any module imports
// ---------------------------------------------------------------------------

type MessagePayload = { type: string; text: string };

type MockState = {
	writeUpdateAction: ReturnType<typeof vi.fn>;
	writeDeleteAction: ReturnType<typeof vi.fn>;
	superValidateResult: { valid: boolean; data: Record<string, unknown> };
	findById: ReturnType<typeof vi.fn>;
	markInvoiced: ReturnType<typeof vi.fn>;
	sendInvoiceEmail: ReturnType<typeof vi.fn>;
	loggerError: ReturnType<typeof vi.fn>;
};

const mockState: MockState = vi.hoisted((): MockState => {
	return {
		writeUpdateAction: vi.fn<() => ReturnType<typeof vi.fn<() => void>>>(() => vi.fn<() => void>()),
		writeDeleteAction: vi.fn<() => ReturnType<typeof vi.fn<() => void>>>(() => vi.fn<() => void>()),
		superValidateResult: { valid: true, data: { id: 'job-1' } },
		findById: vi.fn<(id: string) => Promise<unknown>>(),
		markInvoiced: vi.fn<(id: string, at: Date) => Promise<void>>(),
		sendInvoiceEmail: vi.fn<(payload: unknown) => Promise<void>>(),
		loggerError: vi.fn<() => void>()
	};
});

vi.mock('sveltekit-superforms', () => ({
	superValidate: async () => mockState.superValidateResult,
	message: (form: unknown, message: MessagePayload, opts?: { status: number }) => ({
		form,
		message,
		status: opts?.status ?? 200
	})
}));
vi.mock('sveltekit-superforms/adapters', () => ({ zod4: (schema: unknown) => schema }));
vi.mock('./form-responses', () => ({
	invalidForm: (form: unknown, text: string) => ({
		form,
		message: { type: 'error', text },
		status: 400
	})
}));
vi.mock('./auth-guard', () => ({
	requireAuth:
		(handler: (event: unknown, user: { id: string }) => Promise<unknown>) => (event: unknown) =>
			handler(event, { id: 'user-1' })
}));
vi.mock('#lib/server/email/index.js', () => ({
	sendWindowCleaningInvoiceEmail: mockState.sendInvoiceEmail
}));
vi.mock('#lib/server/logger.js', () => ({
	logger: { info: vi.fn<() => void>(), error: mockState.loggerError }
}));
// Keep the real writes so the wiring below can be checked against them; stub only the invoice stamp
vi.mock('#lib/server/db/writes/window-cleaning-jobs.js', async (importOriginal) => ({
	...(await importOriginal<Record<string, unknown>>()),
	markWindowCleaningJobInvoiced: mockState.markInvoiced
}));
// The writes module pulls in the db client
vi.mock('#lib/server/db/index.js', () => ({ getDb: vi.fn<() => void>() }));

vi.mock('./crud-helpers', () => ({
	writeUpdateAction: mockState.writeUpdateAction,
	writeDeleteAction: mockState.writeDeleteAction
}));

// Mock schema and schema-dependent modules after mocks are wired
vi.mock('#lib/formSchemas/index.js', () => ({
	sendInvoiceSchema: { _tag: 'send-invoice-schema' },
	windowCleaningJobSchema: { _tag: 'mock-schema' }
}));
vi.mock('#lib/server/db/schema/index.js', () => ({
	windowCleaningJob: { id: 'id-column', _tag: 'mock-table' }
}));
vi.mock('#lib/server/db/queries/index.js', () => ({
	windowCleaningJobQueries: { findById: mockState.findById }
}));

import {
	deleteWindowCleaningJob,
	updateWindowCleaningJob
} from '#lib/server/db/writes/window-cleaning-jobs.js';

import { sendInvoice } from './window-cleaning-jobs';

// Capture the config objects synchronously, right after the import above
// registers them — Vitest's `clearMocks` (on by default) wipes call history
// before each `it` runs, so reading `mock.calls` from inside a test would
// always see an empty array.
const [updateConfig, updateWrite] = mockState.writeUpdateAction.mock.calls[0] ?? [];
const [deleteConfig, deleteWrite] = mockState.writeDeleteAction.mock.calls[0] ?? [];

// ---------------------------------------------------------------------------
// updateJob
// ---------------------------------------------------------------------------

describe('updateJob', () => {
	// The row mapping lives in the Job write module and is tested in writes/window-cleaning-jobs.test.ts.
	it('wraps the Job write module in the update envelope', () => {
		expect(updateConfig).toEqual({ entityName: 'Job', schema: { _tag: 'mock-schema' } });
		expect(updateWrite).toBe(updateWindowCleaningJob);
	});
});

// ---------------------------------------------------------------------------
// deleteJob
// ---------------------------------------------------------------------------

describe('deleteJob', () => {
	// Validation and the response contract are covered in crud-helpers.test.ts.
	it('wraps the Job write module in the delete envelope', () => {
		expect(deleteConfig).toEqual({ entityName: 'Job' });
		expect(deleteWrite).toBe(deleteWindowCleaningJob);
	});
});

// ---------------------------------------------------------------------------
// sendInvoice
// ---------------------------------------------------------------------------

describe('sendInvoice', () => {
	type Result = { message: MessagePayload; status: number };
	const run = () =>
		(sendInvoice as unknown as (event: unknown) => Promise<Result>)({ request: {} });

	const job = {
		id: 'job-1',
		jobDate: '2026-06-20 10:00:00',
		amountCharged: 150,
		notes: 'Back windows',
		customer: {
			name: 'Jane Smith',
			email: 'jane@example.com',
			address: '123 Main St',
			city: 'Vancouver',
			unitNumber: '4B'
		}
	};

	beforeEach(() => {
		mockState.superValidateResult = { valid: true, data: { id: 'job-1', paid: false } };
		mockState.findById.mockResolvedValue(job);
		mockState.sendInvoiceEmail.mockResolvedValue(undefined);
		mockState.markInvoiced.mockResolvedValue(undefined);
	});

	it('emails the customer and records invoiceSentAt', async () => {
		const result = await run();

		expect(mockState.sendInvoiceEmail).toHaveBeenCalledWith({
			to: 'jane@example.com',
			name: 'Jane Smith',
			address: 'Unit 4B, 123 Main St, Vancouver',
			jobDate: '2026-06-20 10:00:00',
			amountCharged: 150,
			paid: false
		});
		expect(mockState.markInvoiced).toHaveBeenCalledWith('job-1', expect.any(Date));
		expect(result.status).toBe(200);
		expect(result.message).toEqual({ type: 'success', text: 'Invoice sent to jane@example.com' });
	});

	it('passes the paid flag through to the email', async () => {
		mockState.superValidateResult = { valid: true, data: { id: 'job-1', paid: true } };

		await run();

		expect(mockState.sendInvoiceEmail).toHaveBeenCalledWith(
			expect.objectContaining({ paid: true })
		);
	});

	it('returns 400 without sending when the form is invalid', async () => {
		mockState.superValidateResult = { valid: false, data: {} };

		const result = await run();

		expect(result.status).toBe(400);
		expect(mockState.sendInvoiceEmail).not.toHaveBeenCalled();
	});

	it('returns 404 when the job does not exist', async () => {
		mockState.findById.mockResolvedValue(undefined);

		const result = await run();

		expect(result.status).toBe(404);
		expect(mockState.sendInvoiceEmail).not.toHaveBeenCalled();
	});

	it('returns 400 when the customer has no email', async () => {
		mockState.findById.mockResolvedValue({ ...job, customer: { ...job.customer, email: null } });

		const result = await run();

		expect(result.status).toBe(400);
		expect(result.message.text).toContain('Jane Smith');
		expect(mockState.sendInvoiceEmail).not.toHaveBeenCalled();
	});

	it('returns 502 and leaves the job unmarked when Brevo fails', async () => {
		mockState.sendInvoiceEmail.mockRejectedValue(new Error('Brevo down'));

		const result = await run();

		expect(result.status).toBe(502);
		expect(result.message.type).toBe('error');
		expect(mockState.markInvoiced).not.toHaveBeenCalled();
		expect(mockState.loggerError).toHaveBeenCalled();
	});

	it('still reports success when the email went out but the stamp failed', async () => {
		mockState.markInvoiced.mockRejectedValue(new Error('db locked'));

		const result = await run();

		expect(result.status).toBe(200);
		expect(result.message.type).toBe('success');
		expect(result.message.text).toContain('could not be marked as sent');
	});

	it('returns 500 when the job lookup fails', async () => {
		mockState.findById.mockRejectedValue(new Error('db down'));

		const result = await run();

		expect(result.status).toBe(500);
		expect(mockState.sendInvoiceEmail).not.toHaveBeenCalled();
	});
});
