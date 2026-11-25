import { message, type SuperValidated } from 'sveltekit-superforms';

import type {
	LogSessionResult,
	UpdateSessionResult,
	WeekResult
} from '#lib/server/family-worship/family-worship.js';

type Form = SuperValidated<Record<string, unknown>>;
type Failure<R> = Extract<R, { ok: false }>;

const WEEK_TEXT: Record<Failure<WeekResult>['reason'], { status: 400 | 404 | 409; text: string }> =
	{
		invalid_week: { status: 400, text: 'That isn’t the start of a week.' },
		not_found: { status: 404, text: 'Topic not found. It may have been archived.' },
		week_skipped: { status: 409, text: 'That week is skipped. Undo the skip first.' },
		week_has_session: {
			status: 409,
			text: 'That week already has a session. Edit the session instead.'
		}
	};

/** The response for a refused plan, clear, skip or unskip. */
export function weekFailure(form: Form, reason: Failure<WeekResult>['reason']) {
	const { status, text } = WEEK_TEXT[reason];
	return message(form, { type: 'error', text, reason }, { status });
}

/**
 * The response for a refused log or edit. `week_skipped` and `next_week_conflict` carry their
 * `reason` so the dialog can ask its follow-up question and resubmit; `week_has_session` carries
 * the existing session's id so the dialog can point at it.
 */
export function sessionFailure(
	form: Form,
	result: Failure<LogSessionResult> | Failure<UpdateSessionResult>
) {
	switch (result.reason) {
		case 'week_has_session':
			return message(
				form,
				{
					type: 'error',
					text: 'That week already has a session. Edit it instead.',
					reason: result.reason,
					id: result.sessionId
				},
				{ status: 409 }
			);
		case 'week_skipped':
			return message(
				form,
				{
					type: 'error',
					text: 'That week is marked as skipped. Logging a session will remove the skip.',
					reason: result.reason
				},
				{ status: 409 }
			);
		case 'next_week_conflict':
			return message(
				form,
				{
					type: 'error',
					text: `Next week already has “${result.topicTitle}” planned.`,
					reason: result.reason
				},
				{ status: 409 }
			);
		case 'next_week_skipped':
			return message(
				form,
				{ type: 'error', text: 'Next week is skipped, so the topic can’t continue into it.' },
				{ status: 409 }
			);
		case 'next_week_has_session':
			return message(
				form,
				{ type: 'error', text: 'Next week already has a session.' },
				{ status: 409 }
			);
		case 'future_date':
			return message(
				form,
				{ type: 'error', text: 'A session can’t be dated in the future.' },
				{ status: 400 }
			);
		case 'not_found':
			return message(form, { type: 'error', text: 'Session or topic not found.' }, { status: 404 });
	}
}
