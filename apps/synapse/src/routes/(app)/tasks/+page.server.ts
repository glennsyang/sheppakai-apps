import { redirect } from '@sveltejs/kit';
import { and, asc, eq, gte, lte } from 'drizzle-orm';
import { message, setError, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';

import {
	createDailyAgendaEntrySchema,
	createDailyAgendaTemplateSchema,
	dailyAgendaPageQuerySchema,
	deleteDailyAgendaEntrySchema,
	deleteDailyAgendaTemplateSchema,
	toggleDailyAgendaEntrySchema,
	updateDailyAgendaEntrySchema,
	updateDailyAgendaTemplateSchema
} from '#lib/schemas/daily-agenda.js';
import { moodLogSchema } from '#lib/schemas/mood.js';
import {
	deleteTaskSchema,
	moveTaskBoardSchema,
	taskFilterSchema,
	updateTaskStateSchema
} from '#lib/schemas/task.js';
import { getUser, requireAuth } from '#lib/server/actions/auth-guard.js';
import { deleteAction } from '#lib/server/actions/crud-helpers.js';
import { invalidForm } from '#lib/server/actions/form-responses.js';
import {
	createDailyAgendaCustomEntry,
	createDailyAgendaTemplate,
	deleteDailyAgendaCustomEntry,
	deleteDailyAgendaTemplate,
	loadDailyAgendaData,
	toggleDailyAgendaEntry,
	updateDailyAgendaCustomEntry,
	updateDailyAgendaTemplate
} from '#lib/server/daily-agenda.js';
import { getDb } from '#lib/server/db/index.js';
import { moodLogs, tasks } from '#lib/server/db/schema/index.js';
import { upsertMood } from '#lib/server/db/writes/mood.js';
import { logger } from '#lib/server/logger.js';
import {
	buildAgendaActionPayload,
	failAgendaMutation,
	failAgendaValidation
} from '#lib/server/tasks/agenda-responses.js';
import { getAllTags, loadTaskBoardData, moveTaskWithinBoard } from '#lib/server/tasks/board.js';
import {
	buildEmptyMood,
	buildMoodForm,
	getMoodRangeStart,
	getSelectedPeriod,
	summarizeMood
} from '#lib/server/tasks/mood.js';
import {
	formatDateShort,
	getDateRange,
	getStartOfMonth,
	getStartOfWeek,
	getTodayString
} from '#lib/utils/date.js';
import { isMoodValue } from '#lib/utils/mood.js';

import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const userId = getUser(locals).id;
	const today = getTodayString();

	const pageState = dailyAgendaPageQuerySchema.safeParse({
		tab: url.searchParams.get('tab') ?? undefined,
		week: url.searchParams.get('week') ?? undefined
	});
	const activeTab = pageState.success ? pageState.data.tab : 'kanban';
	const agendaWeek = pageState.success ? pageState.data.week : getStartOfWeek();
	let agenda: Awaited<ReturnType<typeof loadDailyAgendaData>> | null = null;
	let agendaLoadError: string | undefined;
	try {
		agenda = await loadDailyAgendaData(userId, agendaWeek);
	} catch (error) {
		logger.error('Failed to load daily agenda', error, { userId });
		agendaLoadError = 'Failed to load your daily agenda. Please try refreshing the page.';
	}
	const filters = taskFilterSchema.safeParse({
		keyword: url.searchParams.get('keyword') ?? undefined,
		priority: url.searchParams.get('priority') ?? undefined,
		tag: url.searchParams.get('tag') ?? undefined,
		state: url.searchParams.get('state') ?? undefined,
		dueDate: url.searchParams.get('dueDate') ?? undefined
	});

	// Mood range vars are only needed when the mood tab is active — compute lazily.
	const selectedPeriod =
		activeTab === 'mood' ? getSelectedPeriod(url.searchParams.get('period')) : 'week';
	const moodRangeStart = activeTab === 'mood' ? getMoodRangeStart(today, selectedPeriod) : today;
	const moodRangeDates = activeTab === 'mood' ? getDateRange(moodRangeStart, today) : [];
	const calendarMonthStart = activeTab === 'mood' ? getStartOfMonth(today) : today;
	const rangeLabel =
		activeTab === 'mood' ? `${formatDateShort(moodRangeStart)} – ${formatDateShort(today)}` : '';

	const emptyMood = buildEmptyMood(selectedPeriod, rangeLabel, moodRangeDates.length);

	if (!filters.success) {
		logger.error('Invalid task filter parameters', filters.error, { userId });

		return {
			activeTab,
			agenda,
			tasks: [],
			allTags: userId ? await getAllTags(userId) : [],
			moodForm: await buildMoodForm(),
			mood: emptyMood,
			loadError: agendaLoadError
		};
	}

	try {
		const db = getDb();

		if (activeTab !== 'mood') {
			const [tasksWithParsedFields, allTags] = await Promise.all([
				loadTaskBoardData(userId, filters.data),
				getAllTags(userId)
			]);

			return {
				activeTab,
				agenda,
				tasks: tasksWithParsedFields,
				allTags,
				moodForm: await buildMoodForm(),
				mood: emptyMood,
				loadError: agendaLoadError
			};
		}

		const [tasksWithParsedFields, allTags, moodEntries, calendarEntries] = await Promise.all([
			loadTaskBoardData(userId, filters.data),
			getAllTags(userId),
			db.query.moodLogs.findMany({
				where: and(
					eq(moodLogs.userId, userId),
					gte(moodLogs.date, moodRangeStart),
					lte(moodLogs.date, today)
				),
				orderBy: [asc(moodLogs.date)]
			}),
			db.query.moodLogs.findMany({
				where: and(
					eq(moodLogs.userId, userId),
					gte(moodLogs.date, calendarMonthStart),
					lte(moodLogs.date, today)
				),
				orderBy: [asc(moodLogs.date)]
			})
		]);

		const todayLog = moodEntries.find((e) => e.date === today) ?? null;
		const moodForm = await buildMoodForm(todayLog);
		return {
			activeTab,
			agenda,
			tasks: tasksWithParsedFields,
			allTags,
			moodForm,
			loadError: agendaLoadError,
			mood: summarizeMood({
				selectedPeriod,
				rangeLabel,
				moodEntries,
				calendarEntries,
				moodRangeDates,
				todayLog
			})
		};
	} catch (error) {
		logger.error('Failed to load tasks', error, { userId });
		return {
			activeTab,
			agenda,
			tasks: [],
			allTags: [],
			moodForm: await buildMoodForm(),
			mood: emptyMood,
			loadError: 'Failed to load tasks. Please try refreshing the page.'
		};
	}
};

export const actions = {
	moveBoardTask: requireAuth(async ({ request }, user) => {
		const form = await superValidate(request, zod4(moveTaskBoardSchema));
		if (!form.valid) return invalidForm(form);

		try {
			const timestamp = new Date();
			const moveResult = getDb().transaction((tx) =>
				moveTaskWithinBoard(
					tx,
					user.id,
					form.data.id,
					form.data.toState,
					form.data.toIndex,
					timestamp
				)
			);

			if (!moveResult) {
				return message(form, { type: 'error', text: 'Task not found' }, { status: 404 });
			}

			return { form };
		} catch (error) {
			logger.error('Failed to move task on board', error, { form, userId: user.id });
			return message(form, { type: 'error', text: 'Failed to move task' }, { status: 500 });
		}
	}),

	/**
	 * Update task state from the kanban board
	 */
	updateState: requireAuth(async ({ request }, user) => {
		const form = await superValidate(request, zod4(updateTaskStateSchema));
		if (!form.valid) return invalidForm(form);

		try {
			const existing = await getDb().query.tasks.findFirst({
				where: and(eq(tasks.id, form.data.id), eq(tasks.userId, user.id)),
				columns: {
					id: true,
					state: true
				}
			});

			if (!existing) {
				return message(form, { type: 'error', text: 'Task not found' }, { status: 404 });
			}

			if (existing.state === form.data.state) {
				return { form };
			}

			const timestamp = new Date();
			const moveResult = getDb().transaction((tx) =>
				moveTaskWithinBoard(
					tx,
					user.id,
					form.data.id,
					form.data.state,
					Number.MAX_SAFE_INTEGER,
					timestamp
				)
			);

			if (!moveResult) {
				return message(form, { type: 'error', text: 'Task not found' }, { status: 404 });
			}

			return { form };
		} catch (error) {
			logger.error('Failed to update task state', error, { form, userId: user.id });
			return message(form, { type: 'error', text: 'Failed to update task state' }, { status: 500 });
		}
	}),

	delete: deleteAction({
		schema: deleteTaskSchema,
		table: tasks,
		entityName: 'Task',
		onSuccess: () => {
			throw redirect(303, '/tasks');
		}
	}),

	createAgendaTemplate: requireAuth(async ({ request }, user) => {
		const form = await superValidate(request, zod4(createDailyAgendaTemplateSchema));
		if (!form.valid) {
			return failAgendaValidation('create-template', form);
		}

		try {
			await createDailyAgendaTemplate(user.id, form.data.title, form.data.daysOfWeek);

			return buildAgendaActionPayload('create-template', {
				type: 'success',
				text: 'Default item added.'
			});
		} catch (error) {
			return failAgendaMutation('create-template', error, {
				userId: user.id,
				message: 'Failed to add default item.',
				logMessage: 'Failed to create Daily Agenda template'
			});
		}
	}),

	updateAgendaTemplate: requireAuth(async ({ request }, user) => {
		const form = await superValidate(request, zod4(updateDailyAgendaTemplateSchema));
		if (!form.valid) {
			return failAgendaValidation('update-template', form, { entityId: form.data.id });
		}

		try {
			await updateDailyAgendaTemplate(user.id, form.data.id, form.data.title, form.data.daysOfWeek);

			return buildAgendaActionPayload('update-template', {
				type: 'success',
				text: 'Default item updated.',
				entityId: form.data.id
			});
		} catch (error) {
			return failAgendaMutation('update-template', error, {
				userId: user.id,
				entityId: form.data.id,
				message: 'Failed to update default item.',
				logMessage: 'Failed to update Daily Agenda template'
			});
		}
	}),

	deleteAgendaTemplate: requireAuth(async ({ request }, user) => {
		const form = await superValidate(request, zod4(deleteDailyAgendaTemplateSchema));
		if (!form.valid) {
			return failAgendaValidation('delete-template', form, { entityId: form.data.id });
		}

		try {
			await deleteDailyAgendaTemplate(user.id, form.data.id);

			return buildAgendaActionPayload('delete-template', {
				type: 'success',
				text: 'Default item deleted.',
				entityId: form.data.id
			});
		} catch (error) {
			return failAgendaMutation('delete-template', error, {
				userId: user.id,
				entityId: form.data.id,
				message: 'Failed to delete default item.',
				logMessage: 'Failed to delete Daily Agenda template'
			});
		}
	}),

	createAgendaEntry: requireAuth(async ({ request }, user) => {
		const form = await superValidate(request, zod4(createDailyAgendaEntrySchema));
		if (!form.valid) {
			return failAgendaValidation('create-entry', form, { date: form.data.date });
		}

		try {
			await createDailyAgendaCustomEntry(user.id, form.data);

			return buildAgendaActionPayload('create-entry', {
				type: 'success',
				text: 'Agenda item added.',
				date: form.data.date
			});
		} catch (error) {
			return failAgendaMutation('create-entry', error, {
				userId: user.id,
				date: form.data.date,
				message: 'Failed to add agenda item.',
				logMessage: 'Failed to create Daily Agenda entry'
			});
		}
	}),

	updateAgendaEntry: requireAuth(async ({ request }, user) => {
		const form = await superValidate(request, zod4(updateDailyAgendaEntrySchema));
		if (!form.valid) {
			return failAgendaValidation('update-entry', form, { entityId: form.data.id });
		}

		try {
			await updateDailyAgendaCustomEntry(user.id, form.data.id, form.data.title);

			return buildAgendaActionPayload('update-entry', {
				type: 'success',
				text: 'Agenda item updated.',
				entityId: form.data.id
			});
		} catch (error) {
			return failAgendaMutation('update-entry', error, {
				userId: user.id,
				entityId: form.data.id,
				message: 'Failed to update agenda item.',
				logMessage: 'Failed to update Daily Agenda entry'
			});
		}
	}),

	deleteAgendaEntry: requireAuth(async ({ request }, user) => {
		const form = await superValidate(request, zod4(deleteDailyAgendaEntrySchema));
		if (!form.valid) {
			return failAgendaValidation('delete-entry', form, { entityId: form.data.id });
		}

		try {
			await deleteDailyAgendaCustomEntry(user.id, form.data.id);

			return buildAgendaActionPayload('delete-entry', {
				type: 'success',
				text: 'Agenda item deleted.',
				entityId: form.data.id
			});
		} catch (error) {
			return failAgendaMutation('delete-entry', error, {
				userId: user.id,
				entityId: form.data.id,
				message: 'Failed to delete agenda item.',
				logMessage: 'Failed to delete Daily Agenda entry'
			});
		}
	}),

	toggleAgendaEntry: requireAuth(async ({ request }, user) => {
		const form = await superValidate(request, zod4(toggleDailyAgendaEntrySchema));
		if (!form.valid) {
			return failAgendaValidation('toggle-entry', form, { entityId: form.data.id });
		}

		try {
			await toggleDailyAgendaEntry(user.id, form.data.id, form.data.completed);

			return buildAgendaActionPayload('toggle-entry', {
				type: 'success',
				text: form.data.completed ? 'Agenda item marked done.' : 'Agenda item marked incomplete.',
				entityId: form.data.id
			});
		} catch (error) {
			return failAgendaMutation('toggle-entry', error, {
				userId: user.id,
				entityId: form.data.id,
				message: 'Failed to update agenda item.',
				logMessage: 'Failed to toggle Daily Agenda entry'
			});
		}
	}),

	upsertMood: requireAuth(async ({ request }, user) => {
		const form = await superValidate(request, zod4(moodLogSchema));

		if (!form.valid) {
			logger.warn('Invalid mood log form data', { errors: form.errors, userId: user.id });
			return invalidForm(form);
		}

		const today = getTodayString();
		if (form.data.date > today) {
			return setError(form, 'date', 'You cannot log a mood in the future');
		}

		// The schema already rejects unknown moods; this narrows the type for the insert.
		const { mood } = form.data;
		if (!isMoodValue(mood)) {
			return setError(form, 'mood', 'Choose a valid mood');
		}

		try {
			const { moodLog, created } = await upsertMood(user.id, { ...form.data, mood });

			logger.info(created ? 'Mood log created' : 'Mood log updated', {
				moodLogId: moodLog.id,
				userId: user.id
			});
			return message(form, {
				type: 'success',
				text: created ? "Today's mood was logged." : "Today's mood was updated."
			});
		} catch (error) {
			logger.error('Failed to upsert mood log', error, { userId: user.id });
			return message(
				form,
				{ type: 'error', text: 'Failed to save your mood. Please try again.' },
				{ status: 500 }
			);
		}
	})
} satisfies Actions;
