import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => ({
	dbError: new Error('database is locked'),
	loggerError: vi.fn<(...args: unknown[]) => void>()
}));

vi.mock('$lib/server/db', () => ({
	getDb: () => {
		throw mockState.dbError;
	}
}));

vi.mock('$lib/server/auth', () => ({ auth: { api: {} }, allowedEmails: new Set<string>() }));

vi.mock('$lib/server/logger', () => ({
	logger: {
		debug: vi.fn<(...args: unknown[]) => void>(),
		info: vi.fn<(...args: unknown[]) => void>(),
		warn: vi.fn<(...args: unknown[]) => void>(),
		error: mockState.loggerError
	}
}));

import { load as adminLoad } from './admin/+page.server';
import { load as dashboardLoad } from './dashboard/+page.server';
import { load as fitnessLoad } from './fitness/+page.server';
import { load as journalLoad } from './journal/+page.server';
import { load as meditationLoad } from './meditation/+page.server';
import { load as profileLoad } from './profile/+page.server';
import { load as tasksLoad } from './tasks/+page.server';
import { load as visitsLoad } from './visits/+page.server';

const sessionUser = { id: 'user-1', name: 'Test User', email: 'user@example.com', role: 'admin' };

function event(path: string) {
	const url = new URL(`https://synapse.example.com${path}`);
	return { url, locals: { user: sessionUser }, request: new Request(url) } as never;
}

type LoadCase = {
	name: string;
	load: (event: never) => unknown;
	path: string;
	fallback: Record<string, unknown>;
	forms: string[];
	/** Structured context (e.g. `{ userId }`) the load logs after the error. */
	logContext?: unknown[];
};

const cases: LoadCase[] = [
	{
		name: 'admin',
		load: adminLoad,
		path: '/admin',
		fallback: { users: [], archivedPeople: [], apiKeys: [], apiLogs: [] },
		forms: ['createApiKeyForm', 'createUserForm']
	},
	{
		name: 'dashboard',
		load: dashboardLoad,
		path: '/dashboard',
		fallback: { dueSoonTasks: [] },
		forms: []
	},
	{
		name: 'fitness',
		load: fitnessLoad,
		path: '/fitness',
		fallback: { weightEntries: [], workouts: [], meals: [], reminders: [] },
		forms: ['calorieForm', 'weightForm', 'goalForm', 'workoutForm', 'mealForm', 'reminderForm']
	},
	{ name: 'journal', load: journalLoad, path: '/journal', fallback: { entries: [] }, forms: [] },
	{
		name: 'meditation',
		load: meditationLoad,
		path: '/meditation',
		fallback: { routines: [], schedules: [], sessions: [] },
		forms: ['editSessionForm']
	},
	{
		name: 'profile',
		load: profileLoad,
		path: '/profile',
		fallback: { user: sessionUser, passwordUpdatedAt: null },
		forms: ['profileForm', 'passwordForm', 'visitSettingsForm', 'dashboardGoalSettingsForm'],
		logContext: [expect.any(Object)]
	},
	{
		name: 'tasks',
		load: tasksLoad,
		path: '/tasks',
		fallback: { agenda: null, tasks: [], allTags: [] },
		forms: ['moodForm'],
		logContext: [expect.any(Object)]
	},
	{ name: 'visits', load: visitsLoad, path: '/visits', fallback: { people: [] }, forms: [] }
];

describe.each(cases)(
	'$name load on a database failure',
	({ load, path, fallback, forms, logContext = [] }) => {
		beforeEach(() => {
			vi.clearAllMocks();
		});

		it('returns empty fallbacks and a loadError instead of throwing', async () => {
			const result = (await load(event(path))) as Record<string, unknown>;

			expect(result).toMatchObject(fallback);
			expect(result.loadError).toEqual(expect.stringMatching(/^Failed to load .+ Please try/));
			for (const form of forms) {
				expect(result[form]).toEqual(expect.objectContaining({ id: expect.any(String) }));
			}
		});

		it('logs the underlying error', async () => {
			await load(event(path));

			expect(mockState.loggerError).toHaveBeenCalledWith(
				expect.stringMatching(/^Failed to load /),
				mockState.dbError,
				...logContext
			);
		});
	}
);
