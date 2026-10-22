import { isHttpError, isRedirect } from '@sveltejs/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Detail-page loads follow the "Detail-page loads throw `error()`" exception in
 * docs/ERROR_HANDLING_POLICY.md: a missing entity is a 404 (or a redirect), and a failed
 * query is logged and thrown as `error(500)` rather than escaping as a raw Error.
 */

const mockState = vi.hoisted(() => ({
	mode: 'throw' as 'throw' | 'missing',
	dbError: new Error('database is locked'),
	loggerError: vi.fn<(...args: unknown[]) => void>()
}));

vi.mock('#lib/server/db/index.js', () => ({
	getDb: () => {
		if (mockState.mode === 'throw') throw mockState.dbError;
		// Every `db.query.<table>.findFirst` finds nothing.
		const findFirst = async () => undefined;
		return { query: new Proxy({}, { get: () => ({ findFirst }) }) };
	}
}));

vi.mock('#lib/server/auth.js', () => ({ auth: { api: {} }, allowedEmails: new Set<string>() }));

vi.mock('#lib/server/logger.js', () => ({
	logger: {
		debug: vi.fn<(...args: unknown[]) => void>(),
		info: vi.fn<(...args: unknown[]) => void>(),
		warn: vi.fn<(...args: unknown[]) => void>(),
		error: mockState.loggerError
	}
}));

import { load as journalEntryLoad } from './journal/[id]/+page.server';
import { load as routineLoad } from './meditation/routines/[id]/+page.server';
import { load as taskEditLoad } from './tasks/[id]/edit/+page.server';
import { load as personLoad } from './visits/[id]/+page.server';

const sessionUser = { id: 'user-1', name: 'Test User', email: 'user@example.com', role: 'user' };

function event() {
	const url = new URL('https://synapse.example.com/detail/missing-id');
	return {
		url,
		params: { id: 'missing-id' },
		locals: { user: sessionUser },
		request: new Request(url)
	} as never;
}

async function thrownBy(load: (event: never) => unknown): Promise<unknown> {
	try {
		await load(event());
	} catch (err) {
		return err;
	}
	throw new Error('Expected the load to throw');
}

/** What a load threw, reduced to the part these tests compare. */
function outcome(err: unknown) {
	if (isHttpError(err)) return { status: err.status };
	if (isRedirect(err)) return { redirect: err.location };
	return { thrown: err };
}

const withContext = [expect.any(Object)];

const cases = [
	{
		name: 'journal/[id]',
		load: journalEntryLoad,
		missing: { status: 404 },
		logContext: withContext
	},
	{
		name: 'tasks/[id]/edit',
		load: taskEditLoad,
		missing: { redirect: '/tasks' },
		logContext: withContext
	},
	{ name: 'meditation/routines/[id]', load: routineLoad, missing: { status: 404 }, logContext: [] },
	{ name: 'visits/[id]', load: personLoad, missing: { status: 404 }, logContext: withContext }
];

describe.each(cases)('$name load', ({ load, missing, logContext }) => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('throws error(500) and logs the cause on a database failure', async () => {
		mockState.mode = 'throw';

		const err = await thrownBy(load);

		expect(outcome(err)).toEqual({ status: 500 });
		expect(mockState.loggerError).toHaveBeenCalledWith(
			expect.stringMatching(/^Failed to load /),
			mockState.dbError,
			...logContext
		);
	});

	it('answers a missing entity without logging an error', async () => {
		mockState.mode = 'missing';

		expect(outcome(await thrownBy(load))).toEqual(missing);
		expect(mockState.loggerError).not.toHaveBeenCalled();
	});
});
