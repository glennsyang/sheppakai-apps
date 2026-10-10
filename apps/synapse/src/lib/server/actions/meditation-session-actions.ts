import { deleteSessionSchema, editSessionSchema } from '$lib/schemas/meditation';
import { invalidForm } from '$lib/server/actions/form-responses';
import { getDb } from '$lib/server/db';
import { meditationSessions } from '$lib/server/db/schema';
import { withTimestampsForUpdate } from '$lib/server/db/utils';
import { logger } from '$lib/server/logger';
import { and, eq } from 'drizzle-orm';
import { message, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';

export async function handleUpdateSession(request: Request, userId: string) {
	const form = await superValidate(request, zod4(editSessionSchema));

	if (!form.valid) {
		logger.warn('Invalid edit session form data', { errors: form.errors });
		return invalidForm(form);
	}

	try {
		const db = getDb();

		const session = await db.query.meditationSessions.findFirst({
			where: and(eq(meditationSessions.id, form.data.id), eq(meditationSessions.userId, userId))
		});

		if (!session) {
			return message(form, { type: 'error', text: 'Session not found' }, { status: 404 });
		}

		await db
			.update(meditationSessions)
			.set({
				completedAt: new Date(form.data.completed_at).toISOString(),
				preMoodRating: form.data.pre_mood_rating ?? null,
				moodRating: form.data.mood_rating ?? null,
				notes: form.data.notes || null,
				...withTimestampsForUpdate()
			})
			.where(and(eq(meditationSessions.id, form.data.id), eq(meditationSessions.userId, userId)));

		logger.info('Meditation session updated', { sessionId: form.data.id, userId });
		return message(form, { type: 'success', text: 'Session updated successfully!' });
	} catch (err) {
		logger.error('Failed to update session', err);
		return message(
			form,
			{ type: 'error', text: 'An error occurred while updating the session.' },
			{ status: 500 }
		);
	}
}

export async function handleDeleteSession(request: Request, userId: string) {
	const form = await superValidate(request, zod4(deleteSessionSchema));

	if (!form.valid) {
		return invalidForm(form, 'Session ID is required');
	}

	const sessionId = form.data.session_id;

	try {
		const db = getDb();

		await db
			.delete(meditationSessions)
			.where(and(eq(meditationSessions.id, sessionId), eq(meditationSessions.userId, userId)));

		logger.info('Meditation session deleted', { sessionId, userId });
		return message(form, { type: 'success', text: 'Session deleted.' });
	} catch (err) {
		logger.error('Failed to delete session', err);
		return message(form, { type: 'error', text: 'Failed to delete session' }, { status: 500 });
	}
}
