import { error, isHttpError, isRedirect, redirect } from '@sveltejs/kit';
import { and, desc, eq } from 'drizzle-orm';
import { message, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';

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
import { toCommaSeparatedJson } from '#lib/server/actions/string-parsers.js';
import { getDb } from '#lib/server/db/index.js';
import { people, visits } from '#lib/server/db/schema/index.js';
import {
	generateId,
	withTimestampsForCreate,
	withTimestampsForUpdate
} from '#lib/server/db/utils.js';
import { stringListSchema, safeParse } from '#lib/server/json.js';
import { logger } from '#lib/server/logger.js';
import { getVisitStatusThresholdsForUser } from '#lib/server/visit-status-settings.js';
import { getTodayString } from '#lib/utils/date.js';
import { calculatePersonVisitStatus, getEffectiveFollowUpDate } from '#lib/utils/visit-status.js';

import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const db = getDb();
	const userId = getUser(locals).id;

	try {
		// Load person
		const person = await getOwnedEntityOrThrow(
			() =>
				db.query.people.findFirst({
					where: and(eq(people.id, params.id), eq(people.userId, userId))
				}),
			{ type: 'error', message: 'Person not found', status: 404 }
		);

		if (person.isArchived) {
			throw redirect(303, '/visits');
		}

		// Load all visits for this person
		const personVisits = await db.query.visits.findMany({
			where: eq(visits.personId, params.id),
			orderBy: [desc(visits.date)]
		});

		const parsedVisits = personVisits.map((visit) => ({
			...visit,
			companions: safeParse(visit.companions, stringListSchema, null, 'visit.companions')
		}));
		const visitStatusThresholds = await getVisitStatusThresholdsForUser(userId, db);

		// Calculate status
		const latestVisit = personVisits[0];
		const effectiveFollowUpDate = getEffectiveFollowUpDate(
			personVisits.length > 0,
			latestVisit?.followUpDate,
			person.scheduledVisitDate
		);
		const statusInfo = calculatePersonVisitStatus(
			latestVisit?.date ?? null,
			person.isExempt,
			effectiveFollowUpDate,
			getTodayString(),
			visitStatusThresholds
		);

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
			const db = getDb();

			// Verify person belongs to user
			const person = await getOwnedEntityOrNull(() =>
				db.query.people.findFirst({
					where: and(eq(people.id, params.id), eq(people.userId, user.id))
				})
			);

			if (!person) {
				return message(form, { type: 'error', text: 'Person not found' }, { status: 404 });
			}

			const companions = toCommaSeparatedJson(form.data.companions);

			const visitId = generateId();
			// One timestamp for the visit and the person it clears
			const now = new Date();

			await db.insert(visits).values({
				id: visitId,
				personId: params.id,
				userId: user.id,
				date: form.data.date,
				time: form.data.time || null,
				companions,
				notes: form.data.notes || null,
				followUpDate: form.data.followUpDate || null,
				...withTimestampsForCreate(now)
			});

			// A real visit's follow-up date now takes over as the source of truth
			if (person.scheduledVisitDate) {
				await db
					.update(people)
					.set({ scheduledVisitDate: null, ...withTimestampsForUpdate(now) })
					.where(and(eq(people.id, params.id), eq(people.userId, user.id)));
			}

			logger.info('Visit logged', {
				visitId,
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
			const db = getDb();

			const visit = await getOwnedEntityOrNull(() =>
				db.query.visits.findFirst({
					where: and(
						eq(visits.id, visitId),
						eq(visits.userId, user.id),
						eq(visits.personId, params.id)
					)
				})
			);

			if (!visit) {
				return message(form, { type: 'error', text: 'Visit not found' }, { status: 404 });
			}

			const companions = toCommaSeparatedJson(form.data.companions);

			await db
				.update(visits)
				.set({
					date: form.data.date,
					time: form.data.time || null,
					companions,
					notes: form.data.notes || null,
					followUpDate: form.data.followUpDate || null,
					...withTimestampsForUpdate()
				})
				.where(
					and(eq(visits.id, visitId), eq(visits.userId, user.id), eq(visits.personId, params.id))
				);

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
				return message(form, { type: 'error', text: 'Person not found' }, { status: 404 });
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
				text: 'Person updated successfully!'
			});
		} catch (err) {
			logger.error('Failed to update person', err);
			return message(
				form,
				{
					type: 'error',
					text: 'An error occurred while updating the person. Please try again.'
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
				return message(form, { type: 'error', text: 'Person not found' }, { status: 404 });
			}

			await db
				.update(people)
				.set({
					scheduledVisitDate: form.data.scheduledVisitDate,
					...withTimestampsForUpdate()
				})
				.where(and(eq(people.id, params.id), eq(people.userId, user.id)));

			logger.info('Visit scheduled', { personId: params.id, userId: user.id });

			return message(form, {
				type: 'success',
				text: 'Visit scheduled successfully!'
			});
		} catch (err) {
			logger.error('Failed to schedule visit', err);
			return message(
				form,
				{
					type: 'error',
					text: 'An error occurred while scheduling the visit. Please try again.'
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
				return message(form, { type: 'error', text: 'Person not found' }, { status: 404 });
			}

			await db
				.update(people)
				.set({ scheduledVisitDate: null, ...withTimestampsForUpdate() })
				.where(and(eq(people.id, params.id), eq(people.userId, user.id)));

			logger.info('Scheduled visit cancelled', { personId: params.id, userId: user.id });

			return message(form, { type: 'success', text: 'Scheduled visit cleared.' });
		} catch (err) {
			logger.error('Failed to cancel scheduled visit', err);
			return message(
				form,
				{ type: 'error', text: 'Failed to cancel scheduled visit' },
				{ status: 500 }
			);
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
				return message(form, { type: 'error', text: 'Person not found' }, { status: 404 });
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
			return message(form, { type: 'error', text: 'Failed to archive person' }, { status: 500 });
		}

		throw redirect(303, '/visits');
	}),

	deletePerson: deleteAction({
		schema: noFieldsSchema,
		table: people,
		entityName: 'Person',
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
