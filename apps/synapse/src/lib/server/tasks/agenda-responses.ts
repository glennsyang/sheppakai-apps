import { fail } from '@sveltejs/kit';
import type { superValidate } from 'sveltekit-superforms';

// Response shapes for the daily-agenda actions on /tasks. These answer with an `agendaAction`
// payload rather than a superforms message, because the agenda editor isn't a superform.
import { DailyAgendaMutationError } from '#lib/server/daily-agenda.js';
import { logger } from '#lib/server/logger.js';

type AgendaActionScope =
	| 'create-template'
	| 'update-template'
	| 'delete-template'
	| 'create-entry'
	| 'update-entry'
	| 'delete-entry'
	| 'toggle-entry';

type AgendaActionPayload = {
	scope: AgendaActionScope;
	type: 'success' | 'error' | 'validation-error';
	text: string;
	fieldErrors?: unknown;
	values?: Record<string, unknown>;
	entityId?: string;
	date?: string;
};

export function buildAgendaActionPayload(
	scope: AgendaActionScope,
	payload: Omit<AgendaActionPayload, 'scope'>
) {
	return {
		agendaAction: {
			scope,
			...payload
		}
	};
}

export function failAgendaValidation(
	scope: AgendaActionScope,
	form: Awaited<ReturnType<typeof superValidate>>,
	extra: Partial<AgendaActionPayload> = {}
) {
	return fail(
		400,
		buildAgendaActionPayload(scope, {
			type: 'validation-error',
			text: 'Please correct the highlighted fields.',
			fieldErrors: form.errors,
			values: form.data,
			...extra
		})
	);
}

export function failAgendaMutation(
	scope: AgendaActionScope,
	error: unknown,
	context: {
		userId: string;
		entityId?: string;
		date?: string;
		message: string;
		logMessage: string;
	}
) {
	if (error instanceof DailyAgendaMutationError) {
		const status = error.code === 'not_found' ? 404 : 400;
		return fail(
			status,
			buildAgendaActionPayload(scope, {
				type: 'error',
				text: error.message,
				entityId: context.entityId,
				date: context.date
			})
		);
	}

	logger.error(context.logMessage, error, {
		userId: context.userId,
		entityId: context.entityId,
		date: context.date
	});

	return fail(
		500,
		buildAgendaActionPayload(scope, {
			type: 'error',
			text: context.message,
			entityId: context.entityId,
			date: context.date
		})
	);
}
