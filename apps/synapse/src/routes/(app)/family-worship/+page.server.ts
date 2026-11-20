import { ApiWriteError } from '@sheppakai/shared/api-write';
import { message, superValidate, type SuperValidated } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';

import { idSchema } from '#lib/schemas/common.js';
import { scheduleWeekSchema, sessionSchema, topicSchema } from '#lib/schemas/family-worship.js';
import { getUser, requireAuth } from '#lib/server/actions/auth-guard.js';
import { invalidForm } from '#lib/server/actions/form-responses.js';
import { getDb } from '#lib/server/db/index.js';
import {
	createTopic,
	deleteSession,
	deleteTopic,
	logSession,
	setTopicArchived,
	setWeekTopic,
	updateSession,
	updateTopic
} from '#lib/server/db/writes/family-worship.js';
import { loadFamilyWorship } from '#lib/server/family-worship.js';
import { logger } from '#lib/server/logger.js';
import { getTodayString } from '#lib/utils/date.js';
import { parseLinkLines } from '#lib/utils/family-worship.js';

import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const userId = getUser(locals).id;
	const today = getTodayString();

	const forms = {
		topicForm: await superValidate(zod4(topicSchema)),
		sessionForm: await superValidate(zod4(sessionSchema))
	};

	try {
		const data = await loadFamilyWorship(getDb(), userId, today);
		return { today, ...data, ...forms };
	} catch (error) {
		logger.error('Failed to load family worship data', error, { userId });
		const empty: Awaited<ReturnType<typeof loadFamilyWorship>> = {
			topics: [],
			sessions: [],
			upcoming: []
		};
		return {
			today,
			...empty,
			...forms,
			loadError: 'Failed to load family worship. Please try refreshing the page.'
		};
	}
};

/**
 * Run a write and answer with a superforms message. `ApiWriteError`s (not found, archived
 * topic, week clash) keep their status; anything else is a logged 500.
 */
async function runWrite<T extends Record<string, unknown>>(
	form: SuperValidated<T>,
	successText: string,
	failureLog: string,
	write: () => Promise<unknown>
) {
	try {
		await write();
	} catch (error) {
		if (error instanceof ApiWriteError) {
			const status = error.status === 404 || error.status === 409 ? error.status : 400;
			return message(form, { type: 'error', text: error.message }, { status });
		}
		logger.error(failureLog, error);
		return message(
			form,
			{ type: 'error', text: 'Something went wrong. Please try again.' },
			{ status: 500 }
		);
	}
	return message(form, { type: 'success', text: successText });
}

export const actions = {
	createTopic: requireAuth(async ({ request }, user) => {
		const form = await superValidate(request, zod4(topicSchema));
		if (!form.valid) return invalidForm(form);

		return runWrite(form, 'Topic added.', 'Failed to create family worship topic', () =>
			createTopic(user.id, {
				title: form.data.title,
				description: form.data.description,
				notes: form.data.notes,
				scriptureRefs: form.data.scriptureRefs,
				links: parseLinkLines(form.data.links)
			})
		);
	}),

	updateTopic: requireAuth(async ({ request }, user) => {
		const form = await superValidate(request, zod4(topicSchema));
		if (!form.valid) return invalidForm(form);

		const { id, ...input } = form.data;
		if (!id) {
			return message(form, { type: 'error', text: 'Topic ID is required' }, { status: 400 });
		}
		return runWrite(form, 'Topic updated.', 'Failed to update family worship topic', () =>
			updateTopic(user.id, id, {
				title: input.title,
				description: input.description ?? null,
				notes: input.notes ?? null,
				scriptureRefs: input.scriptureRefs ?? null,
				links: parseLinkLines(input.links)
			})
		);
	}),

	archiveTopic: requireAuth(async ({ request }, user) => {
		const form = await superValidate(request, zod4(idSchema));
		if (!form.valid) return invalidForm(form);

		return runWrite(form, 'Topic archived.', 'Failed to archive family worship topic', () =>
			setTopicArchived(user.id, form.data.id, true)
		);
	}),

	restoreTopic: requireAuth(async ({ request }, user) => {
		const form = await superValidate(request, zod4(idSchema));
		if (!form.valid) return invalidForm(form);

		return runWrite(form, 'Topic restored.', 'Failed to restore family worship topic', () =>
			setTopicArchived(user.id, form.data.id, false)
		);
	}),

	deleteTopic: requireAuth(async ({ request }, user) => {
		const form = await superValidate(request, zod4(idSchema));
		if (!form.valid) return invalidForm(form);

		return runWrite(form, 'Topic deleted.', 'Failed to delete family worship topic', () =>
			deleteTopic(user.id, form.data.id)
		);
	}),

	setWeekTopic: requireAuth(async ({ request }, user) => {
		const form = await superValidate(request, zod4(scheduleWeekSchema));
		if (!form.valid) return invalidForm(form);

		const topicId = form.data.topicId || null;
		return runWrite(
			form,
			topicId ? 'Week scheduled.' : 'Week cleared.',
			'Failed to schedule family worship week',
			() => setWeekTopic(user.id, form.data.weekOf, topicId)
		);
	}),

	logSession: requireAuth(async ({ request }, user) => {
		const form = await superValidate(request, zod4(sessionSchema));
		if (!form.valid) return invalidForm(form);

		const { status, date, topicId, notes, continueNextWeek } = form.data;
		return runWrite(
			form,
			status === 'skipped' ? 'Week marked skipped.' : 'Session logged.',
			'Failed to log family worship session',
			() =>
				logSession(user.id, {
					status,
					date,
					topicId: topicId || null,
					notes: notes ?? null,
					continueNextWeek
				})
		);
	}),

	updateSession: requireAuth(async ({ request }, user) => {
		const form = await superValidate(request, zod4(sessionSchema));
		if (!form.valid) return invalidForm(form);

		const { id, status, date, topicId, notes } = form.data;
		if (!id) {
			return message(form, { type: 'error', text: 'Session ID is required' }, { status: 400 });
		}
		return runWrite(form, 'Session updated.', 'Failed to update family worship session', () =>
			updateSession(user.id, id, { status, date, topicId: topicId || null, notes: notes ?? null })
		);
	}),

	deleteSession: requireAuth(async ({ request }, user) => {
		const form = await superValidate(request, zod4(idSchema));
		if (!form.valid) return invalidForm(form);

		return runWrite(form, 'Session deleted.', 'Failed to delete family worship session', () =>
			deleteSession(user.id, form.data.id)
		);
	})
} satisfies Actions;
