import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks — must be defined before any module imports
// ---------------------------------------------------------------------------

type MessagePayload = { type: string; text: string };

type MockState = {
	updateAction: ReturnType<typeof vi.fn>;
	deleteAction: ReturnType<typeof vi.fn>;
	superValidateResult: { valid: boolean; data: Record<string, unknown> };
	findById: ReturnType<typeof vi.fn>;
	markInvoiced: ReturnType<typeof vi.fn>;
	sendInvoiceEmail: ReturnType<typeof vi.fn>;
	loggerError: ReturnType<typeof vi.fn>;
};

const mockState: MockState = vi.hoisted((): MockState => {
	return {
		updateAction: vi.fn<() => ReturnType<typeof vi.fn<() => void>>>(() => vi.fn<() => void>()),
		deleteAction: vi.fn<() => ReturnType<typeof vi.fn<() => void>>>(() => vi.fn<() => void>()),
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
// Keep the real row mapper (the transformUpdate tests below exercise it); stub only the write
vi.mock('#lib/server/db/writes/window-cleaning-jobs.js', async (importOriginal) => ({
	...(await importOriginal<Record<string, unknown>>()),
	markWindowCleaningJobInvoiced: mockState.markInvoiced
}));
// The writes module pulls in the db client
vi.mock('#lib/server/db/index.js', () => ({ getDb: vi.fn<() => void>() }));
vi.mock('#lib/utils/dates.js', () => ({
	formatDateForStorage: (d: string) => `stored:${d}`
}));

vi.mock('./crud-helpers', () => ({
	updateAction: mockState.updateAction,
	deleteAction: mockState.deleteAction
}));

// Mock schema and schema-dependent modules after mocks are wired
vi.mock('#lib/formSchemas/index.js', () => ({
	idSchema: { _tag: 'id-schema' },
	windowCleaningJobSchema: { _tag: 'mock-schema' }
}));
vi.mock('#lib/server/db/schema/index.js', () => ({
	windowCleaningJob: { id: 'id-column', _tag: 'mock-table' }
}));
vi.mock('#lib/server/db/queries/index.js', () => ({
	windowCleaningJobQueries: { findById: mockState.findById }
}));

import { sendInvoice } from './window-cleaning-jobs';

// Capture the config objects synchronously, right after the import above
// registers them — Vitest's `clearMocks` (on by default) wipes call history
// before each `it` runs, so reading `mock.calls` from inside a test would
// always see an empty array.
const [updateConfig] = mockState.updateAction.mock.calls[0] ?? [];
const [deleteConfig] = mockState.deleteAction.mock.calls[0] ?? [];

// ---------------------------------------------------------------------------
// updateJob
// ---------------------------------------------------------------------------

describe('updateJob', () => {
	it('calls updateAction with the correct entityName and schema', () => {
		expect(updateConfig).toEqual(
			expect.objectContaining({
				entityName: 'Job',
				schema: { _tag: 'mock-schema' },
				table: expect.objectContaining({ _tag: 'mock-table' })
			})
		);
	});

	it('transformUpdate maps all fields correctly', () => {
		const config = updateConfig as {
			transformUpdate: (data: Record<string, unknown>) => Record<string, unknown>;
		};

		const result = config.transformUpdate({
			customerId: 'cust-1',
			jobDate: '2026-06-20',
			jobTime: '10:00',
			amountCharged: 150,
			tip: 20,
			durationHours: 2.5,
			notes: 'Back windows'
		});

		expect(result).toEqual({
			customerId: 'cust-1',
			jobDate: 'stored:2026-06-20',
			jobTime: '10:00',
			amountCharged: 150,
			tip: 20,
			durationHours: 2.5,
			notes: 'Back windows'
		});
	});

	it('transformUpdate coerces falsy optional fields to null', () => {
		const config = updateConfig as {
			transformUpdate: (data: Record<string, unknown>) => Record<string, unknown>;
		};

		const result = config.transformUpdate({
			customerId: 'cust-2',
			jobDate: '2026-06-01',
			jobTime: '',
			amountCharged: 100,
			tip: undefined,
			durationHours: undefined,
			notes: ''
		});

		expect(result).toEqual({
			customerId: 'cust-2',
			jobDate: 'stored:2026-06-01',
			jobTime: null,
			amountCharged: 100,
			tip: 0,
			durationHours: null,
			notes: null
		});
	});
});

// ---------------------------------------------------------------------------
// deleteJob
// ---------------------------------------------------------------------------

describe('deleteJob', () => {
	// deleteJob is now nothing but a deleteAction, so all this file owes is the wiring —
	// validation, the delete itself, and the response contract are covered in crud-helpers.test.ts.
	it('delegates to deleteAction with the correct table and entityName', () => {
		expect(deleteConfig).toEqual({
			entityName: 'Job',
			table: expect.objectContaining({ _tag: 'mock-table' })
		});
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
		mockState.superValidateResult = { valid: true, data: { id: 'job-1' } };
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
			notes: 'Back windows'
		});
		expect(mockState.markInvoiced).toHaveBeenCalledWith('job-1', expect.any(Date));
		expect(result.status).toBe(200);
		expect(result.message).toEqual({ type: 'success', text: 'Invoice sent to jane@example.com' });
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
