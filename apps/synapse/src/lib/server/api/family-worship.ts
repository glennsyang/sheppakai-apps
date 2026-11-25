import { ApiWriteError } from '@sheppakai/shared/api-write';

/**
 * Maps a Family Worship module failure to the API error a v1 route returns. `error.code` is the
 * broad class (`not_found`, `validation_failed`, `conflict`); `error.reason` is the module's own
 * reason, so a client can tell the rule violations apart and resolve them.
 */
type Failure =
	| { reason: 'not_found' | 'invalid_week' | 'future_date' | 'week_skipped' }
	| { reason: 'week_has_session'; sessionId?: string }
	| { reason: 'next_week_conflict'; topicTitle: string }
	| { reason: 'next_week_skipped' | 'next_week_has_session' };

type Operation = 'plan' | 'skip' | 'session';

function weekSkippedMessage(operation: Operation): string {
	return operation === 'session'
		? 'That week is a Skipped Week. Send confirmUnskip: true to log into it; this removes the skip.'
		: "That week is a Skipped Week, so it can't be planned.";
}

export function familyWorshipApiError(failure: Failure, operation: Operation): ApiWriteError {
	switch (failure.reason) {
		case 'not_found':
			return new ApiWriteError(
				'not_found',
				operation === 'session' ? 'Session or topic not found.' : 'Topic not found.',
				404,
				failure.reason
			);
		case 'invalid_week':
			return new ApiWriteError(
				'validation_failed',
				'weekStart must be the Monday of a week (YYYY-MM-DD).',
				400,
				failure.reason
			);
		case 'future_date':
			return new ApiWriteError(
				'validation_failed',
				'date cannot be in the future.',
				400,
				failure.reason
			);
		case 'week_skipped':
			return new ApiWriteError('conflict', weekSkippedMessage(operation), 409, failure.reason);
		case 'week_has_session':
			return new ApiWriteError(
				'conflict',
				failure.sessionId
					? `That week already has a session (${failure.sessionId}). Edit it instead.`
					: 'That week already has a session.',
				409,
				failure.reason
			);
		case 'next_week_conflict':
			return new ApiWriteError(
				'conflict',
				`Next week already has "${failure.topicTitle}" planned. Send nextWeekConflict: "replace" to replace it, or "shift" to push the later plans back a week.`,
				409,
				failure.reason
			);
		case 'next_week_skipped':
			return new ApiWriteError(
				'conflict',
				"Next week is a Skipped Week, so the topic can't continue into it.",
				409,
				failure.reason
			);
		case 'next_week_has_session':
			return new ApiWriteError(
				'conflict',
				"Next week already has a session, so the topic can't continue into it.",
				409,
				failure.reason
			);
	}
}
