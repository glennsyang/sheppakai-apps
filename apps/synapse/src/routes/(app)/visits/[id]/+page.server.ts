import { error, isHttpError, isRedirect, redirect } from '@sveltejs/kit';
import { and, desc, eq } from 'drizzle-orm';
import { message, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import type { z } from 'zod';

import { noFieldsSchema } from '#lib/schemas/common.js';
import {
	deleteVisitSchema,
	personSchema,
	scheduleVisitSchema,
	visitSchema
} from '#lib/schemas/visits.js';
import { getUser, requireAuth } from '#lib/server/actions/auth-guard.js';
import { deleteAction } from '#lib/server/actions/crud-helpers.js';
import {
	getOwnedEntityOrNull,
	getOwnedEntityOrThrow
} from '#lib/server/actions/edit-route-helpers.js';
import { invalidForm } from '#lib/server/actions/form-responses.js';
import { splitCommaSeparated } from '#lib/server/actions/string-parsers.js';
import { getDb } from '#lib/server/db/index.js';
import { people, visits } from '#lib/server/db/schema/index.js';
import { withTimestampsForUpdate } from '#lib/server/db/utils.js';
import { loadGroupStatuses } from '#lib/server/group-status.js';
import { stringListSchema, safeParse } from '#lib/server/json.js';
import { logger } from '#lib/server/logger.js';
import { logVisit, updateVisit, type VisitFields } from '#lib/server/visits/visit.js';
import { getTodayString } from '#lib/utils/date.js';

import type { Actions, PageServerLoad } from './$types';

const toVisitFields = (data: z.infer<typeof visitSchema>): VisitFields => ({
	date: data.date,
	time: data.time || null,
	companions: splitCommaSeparated(data.companions),
	notes: data.notes || null,
	nextVisitDate: data.nextVisitDate || null
});

export const load: PageServerLoad = async ({ locals, params }) => {
	const userId = getUser(locals).id;

	try {
		const db = getDb();

		// Load person
		const person = await getOwnedEntityOrThrow(
			() =>
				db.query.people.findFirst({
					where: and(eq(people.id, params.id), eq(people.userId, userId))
				}),
			{ type: 'error', message: 'Group member not found', status: 404 }
		);

		if (person.isArchived) {
			throw redirect(303, '/visits');
		}

		// Load all visits for this person
		const personVisits = await db.query.visits.findMany({
			where: eq(visits.personId, params.id),
			orderBy: [desc(visits.date), desc(visits.createdAt)]
		});

		const parsedVisits = personVisits.map((visit) => ({
			...visit,
			companions: safeParse(visit.companions, stringListSchema, null, 'visit.companions')
		}));
		const [statusInfo] = await loadGroupStatuses(db, {
			userId,
			personId: person.id,
			today: getTodayString()
		});

		// Initialize forms
		const visitForm = await superValidate(zod4(visitSchema));
		visitForm.data.date = getTodayString(); // Set default to today

		const editForm = await superValidate(person, zod4(personSchema));
		const scheduleForm = await superValidate(
			{ scheduledVisitDate: person.scheduledVisitDate ?? undefined },
			zod4(scheduleVisitSchema)
		);

		return {
			person: {
				...person,
				status: statusInfo.status,
				daysSinceLastVisit: statusInfo.daysSinceLastVisit
			},
			visits: parsedVisits,
			visitForm,
			editForm,
			scheduleForm
		};
	} catch (err) {
		if (isHttpError(err) || isRedirect(err)) throw err;
		logger.error('Failed to load visit page data', err, { personId: params.id, userId });
		throw error(500, 'Failed to load page data');
	}
};

export const actions = {
	logVisit: requireAuth(async ({ request, params }, user) => {
		const form = await superValidate(request, zod4(visitSchema));

		if (!form.valid) {
			logger.warn('Invalid visit form data', { errors: form.errors });
			return invalidForm(form);
		}

		try {
			const visit = logVisit(getDb(), user.id, params.id, toVisitFields(form.data));

			if (!visit) {
				return message(form, { type: 'error', text: 'Group member not found' }, { status: 404 });
			}

			logger.info('Visit logged', {
				visitId: visit.id,
				personId: params.id,
				userId: user.id
			});

			return message(form, {
				type: 'success',
				text: 'Visit logged successfully!'
			});
		} catch (err) {
			logger.error('Failed to log visit', err);
			return message(
				form,
				{
					type: 'error',
					text: 'An error occurred while logging the visit. Please try again.'
				},
				{ status: 500 }
			);
		}
	}),

	updateVisit: requireAuth(async ({ request, params }, user) => {
		const formData = await request.formData();
		const visitId = formData.get('visitId');
		const form = await superValidate(formData, zod4(visitSchema));

		if (!form.valid) {
			logger.warn('Invalid visit update form data', { errors: form.errors });
			return invalidForm(form);
		}

		if (typeof visitId !== 'string' || !visitId) {
			return message(form, { type: 'error', text: 'Visit ID is required' }, { status: 400 });
		}

		try {
			// Editing a visit leaves the member's Next Visit alone.
			const { nextVisitDate: _nextVisitDate, ...patch } = toVisitFields(form.data);
			const visit = updateVisit(getDb(), user.id, visitId, patch, { personId: params.id });

			if (!visit) {
				return message(form, { type: 'error', text: 'Visit not found' }, { status: 404 });
			}

			logger.info('Visit updated', {
				visitId,
				personId: params.id,
				userId: user.id
			});

			return message(form, {
				type: 'success',
				text: 'Visit updated successfully!'
			});
		} catch (err) {
			logger.error('Failed to update visit', err);
			return message(
				form,
				{
					type: 'error',
					text: 'An error occurred while updating the visit. Please try again.'
				},
				{ status: 500 }
			);
		}
	}),

	updatePerson: requireAuth(async ({ request, params }, user) => {
		const form = await superValidate(request, zod4(personSchema));

		if (!form.valid) {
			logger.warn('Invalid person form data', { errors: form.errors });
			return invalidForm(form);
		}

		try {
			const db = getDb();

			// Verify person belongs to user
			const person = await getOwnedEntityOrNull(() =>
				db.query.people.findFirst({
					where: and(eq(people.id, params.id), eq(people.userId, user.id))
				})
			);

			if (!person) {
				return message(form, { type: 'error', text: 'Group member not found' }, { status: 404 });
			}

			await db
				.update(people)
				.set({
					name: form.data.name,
					isExempt: form.data.isExempt,
					...withTimestampsForUpdate()
				})
				.where(and(eq(people.id, params.id), eq(people.userId, user.id)));

			logger.info('Person updated', { personId: params.id, userId: user.id });

			return message(form, {
				type: 'success',
				text: 'Group member updated successfully!'
			});
		} catch (err) {
			logger.error('Failed to update person', err);
			return message(
				form,
				{
					type: 'error',
					text: 'An error occurred while updating the group member. Please try again.'
				},
				{ status: 500 }
			);
		}
	}),

	scheduleVisit: requireAuth(async ({ request, params }, user) => {
		const form = await superValidate(request, zod4(scheduleVisitSchema));

		if (!form.valid) {
			logger.warn('Invalid schedule visit form data', { errors: form.errors });
			return invalidForm(form);
		}

		try {
			const db = getDb();

			// Verify person belongs to user
			const person = await getOwnedEntityOrNull(() =>
				db.query.people.findFirst({
					where: and(eq(people.id, params.id), eq(people.userId, user.id))
				})
			);

			if (!person) {
				return message(form, { type: 'error', text: 'Group member not found' }, { status: 404 });
			}

			await db
				.update(people)
				.set({
					scheduledVisitDate: form.data.scheduledVisitDate,
					...withTimestampsForUpdate()
				})
				.where(and(eq(people.id, params.id), eq(people.userId, user.id)));

			logger.info('Next Visit set', { personId: params.id, userId: user.id });

			return message(form, {
				type: 'success',
				text: 'Next Visit set.'
			});
		} catch (err) {
			logger.error('Failed to set Next Visit', err);
			return message(
				form,
				{
					type: 'error',
					text: 'An error occurred while setting the Next Visit. Please try again.'
				},
				{ status: 500 }
			);
		}
	}),

	cancelScheduledVisit: requireAuth(async ({ request, params }, user) => {
		const form = await superValidate(request, zod4(noFieldsSchema));

		try {
			const db = getDb();

			// Verify person belongs to user
			const person = await getOwnedEntityOrNull(() =>
				db.query.people.findFirst({
					where: and(eq(people.id, params.id), eq(people.userId, user.id))
				})
			);

			if (!person) {
				return message(form, { type: 'error', text: 'Group member not found' }, { status: 404 });
			}

			await db
				.update(people)
				.set({ scheduledVisitDate: null, ...withTimestampsForUpdate() })
				.where(and(eq(people.id, params.id), eq(people.userId, user.id)));

			logger.info('Next Visit cleared', { personId: params.id, userId: user.id });

			return message(form, { type: 'success', text: 'Next Visit cleared.' });
		} catch (err) {
			logger.error('Failed to clear Next Visit', err);
			return message(form, { type: 'error', text: 'Failed to clear Next Visit' }, { status: 500 });
		}
	}),

	archivePerson: requireAuth(async ({ request, params }, user) => {
		const form = await superValidate(request, zod4(noFieldsSchema));

		try {
			const db = getDb();

			// Verify person belongs to user
			const person = await getOwnedEntityOrNull(() =>
				db.query.people.findFirst({
					where: and(eq(people.id, params.id), eq(people.userId, user.id))
				})
			);

			if (!person) {
				return message(form, { type: 'error', text: 'Group member not found' }, { status: 404 });
			}

			const now = new Date();
			await db
				.update(people)
				.set({
					isArchived: true,
					archivedAt: now,
					...withTimestampsForUpdate(now)
				})
				.where(and(eq(people.id, params.id), eq(people.userId, user.id)));

			logger.info('Person archived', { personId: params.id, userId: user.id });
		} catch (err) {
			logger.error('Failed to archive person', err);
			return message(
				form,
				{ type: 'error', text: 'Failed to archive group member' },
				{ status: 500 }
			);
		}

		throw redirect(303, '/visits');
	}),

	deletePerson: deleteAction({
		schema: noFieldsSchema,
		table: people,
		entityName: 'Group member',
		// Visits cascade with the person.
		getId: (_form, { params }) => params.id ?? '',
		onSuccess: () => {
			throw redirect(303, '/visits');
		}
	}),

	deleteVisit: deleteAction({
		schema: deleteVisitSchema,
		table: visits,
		entityName: 'Visit',
		invalidMessage: 'Visit ID is required',
		getId: (form) => form.data.visitId,
		onSuccess: (form) => message(form, { type: 'success', text: 'Visit deleted.' })
	})
} satisfies Actions;
