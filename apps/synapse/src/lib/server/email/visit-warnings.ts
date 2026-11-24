import { loadGroupStatuses, type GroupMemberStatus } from '#lib/server/group-status.js';

import type { Db, NotificationJob } from '../notification-jobs/run-job';
import { buildVisitWarningEmail } from './templates';
import {
	buildVisitWarningEntityId,
	buildVisitWarningSubject,
	formatVisitWarningDate,
	toVisitWarningStatus,
	type VisitWarningStatus
} from './visit-warning-utils';

type VisitWarningCandidate = {
	person: GroupMemberStatus['person'];
	user: GroupMemberStatus['owner'];
	lastVisitDate: string;
	warningStatus: VisitWarningStatus;
};

/**
 * Every owner's Overdue or Critical group members. Shared by the warnings job and the morning
 * digest.
 */
export async function loadVisitWarningCandidates(
	db: Db,
	today: string
): Promise<VisitWarningCandidate[]> {
	const members = await loadGroupStatuses(db, { today });
	return members.flatMap(({ person, owner, status, lastVisit }) => {
		const warningStatus = toVisitWarningStatus(status);
		return warningStatus && lastVisit
			? [{ person, user: owner, lastVisitDate: lastVisit.date, warningStatus }]
			: [];
	});
}

/** Email + push when a group member turns Overdue or Critical; repeats at most weekly. */
export const visitWarningJob: NotificationJob<VisitWarningCandidate> = {
	type: 'visit_warning',
	label: 'visit warnings',
	dedupe: { days: 7 },
	candidates: ({ db, clock }) => loadVisitWarningCandidates(db, clock.today),
	recipient: (candidate) => candidate.user,
	entityId: ({ person, warningStatus }) => buildVisitWarningEntityId(person.id, warningStatus),
	message: ({ person, user: owner, lastVisitDate, warningStatus }) => ({
		logSubject: buildVisitWarningSubject(person.name, warningStatus),
		email: buildVisitWarningEmail(
			owner.name,
			person.name,
			formatVisitWarningDate(lastVisitDate),
			warningStatus
		),
		push: {
			message:
				warningStatus === 'critical'
					? `Critical visit warning: ${person.name} needs a visit.`
					: `Visit warning: ${person.name} is due for a visit.`,
			title: 'Synapse - Visit Warning',
			tags: 'busts_in_silhouette',
			priority: warningStatus === 'critical' ? 4 : 3
		}
	})
};
