// `/api/v1/visits` adapter over the Visit module: maps a miss onto an `ApiWriteError`. The API
// keeps the `followUpDate` field name for the group member's Next Visit.
import { ApiWriteError } from '@sheppakai/shared/api-write';

import type { ApiCreateVisitInput, ApiUpdateVisitInput } from '#lib/server/api/schemas/visits.js';
import { getDb } from '#lib/server/db/index.js';
import * as visit from '#lib/server/visits/visit.js';

/** Logs a visit; leaving out `followUpDate` clears the Next Visit, exactly like the UI. */
export async function createVisitFromApi(userId: string, input: ApiCreateVisitInput) {
	const logged = visit.logVisit(getDb(), userId, input.personId, {
		date: input.date,
		time: input.time ?? null,
		companions: input.companions ?? null,
		notes: input.notes ?? null,
		nextVisitDate: input.followUpDate ?? null
	});
	if (!logged) throw new ApiWriteError('not_found', 'Person not found.', 404);
	return logged;
}

/** `followUpDate` sets the Next Visit; `null` clears it, and leaving it out keeps it. */
export async function updateVisitFromApi(
	userId: string,
	visitId: string,
	input: ApiUpdateVisitInput
) {
	const { followUpDate, ...patch } = input;
	const updated = visit.updateVisit(getDb(), userId, visitId, {
		...patch,
		nextVisitDate: followUpDate
	});
	if (!updated) throw new ApiWriteError('not_found', 'Visit not found.', 404);
	return updated;
}
