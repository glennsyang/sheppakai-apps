import { windowCleaningJobSchema } from '#lib/formSchemas/index.js';
import { windowCleaningJob } from '#lib/server/db/schema/index.js';
import { toWindowCleaningJobRow } from '#lib/server/db/writes/window-cleaning-jobs.js';

import { deleteAction, updateAction } from './crud-helpers';

export const updateJob = updateAction({
	schema: windowCleaningJobSchema,
	table: windowCleaningJob,
	entityName: 'Job',
	transformUpdate: (data) => toWindowCleaningJobRow(data)
});

export const deleteJob = deleteAction({
	table: windowCleaningJob,
	entityName: 'Job'
});
