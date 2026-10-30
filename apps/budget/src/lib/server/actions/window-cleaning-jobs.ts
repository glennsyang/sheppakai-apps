import { message, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';

import { idSchema, windowCleaningJobSchema } from '#lib/formSchemas/index.js';
import { windowCleaningJobQueries } from '#lib/server/db/queries/index.js';
import { windowCleaningJob } from '#lib/server/db/schema/index.js';
import {
	markWindowCleaningJobInvoiced,
	toWindowCleaningJobRow
} from '#lib/server/db/writes/window-cleaning-jobs.js';
import { sendWindowCleaningInvoiceEmail } from '#lib/server/email/index.js';
import { logger } from '#lib/server/logger.js';

import { requireAuth } from './auth-guard';
import { deleteAction, updateAction } from './crud-helpers';
import { invalidForm } from './form-responses';

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

/** Emails the customer an invoice for one job and stamps `invoiceSentAt`. */
export const sendInvoice = requireAuth(async (event, user) => {
	const form = await superValidate(event.request, zod4(idSchema));
	if (!form.valid) {
		return invalidForm(form, 'Job ID is required');
	}

	let job;
	try {
		job = await windowCleaningJobQueries.findById(form.data.id);
	} catch (error) {
		logger.error('Failed to load job for invoice', error, { jobId: form.data.id });
		return message(
			form,
			{ type: 'error', text: 'Failed to send invoice. A database error occurred.' },
			{ status: 500 }
		);
	}
	if (!job) {
		return message(form, { type: 'error', text: 'Job not found' }, { status: 404 });
	}

	const { customer } = job;
	if (!customer.email) {
		return message(
			form,
			{ type: 'error', text: `Add an email address for ${customer.name} first` },
			{ status: 400 }
		);
	}

	try {
		await sendWindowCleaningInvoiceEmail({
			to: customer.email,
			name: customer.name,
			address: [
				customer.unitNumber && `Unit ${customer.unitNumber}`,
				customer.address,
				customer.city
			]
				.filter(Boolean)
				.join(', '),
			jobDate: job.jobDate,
			amountCharged: job.amountCharged,
			notes: job.notes
		});
	} catch (error) {
		// The mailer already logged the Brevo failure with the recipient
		logger.error('Failed to send window cleaning invoice', error, { jobId: job.id });
		return message(
			form,
			{ type: 'error', text: 'Failed to send the invoice email. Please try again.' },
			{ status: 502 }
		);
	}

	try {
		await markWindowCleaningJobInvoiced(job.id, new Date());
	} catch (error) {
		// The email is out; only the "Invoiced" stamp is missing
		logger.error('Invoice sent but failed to record invoiceSentAt', error, { jobId: job.id });
		return message(form, {
			type: 'success',
			text: `Invoice sent to ${customer.email}, but it could not be marked as sent`
		});
	}

	logger.info('Window cleaning invoice sent', { jobId: job.id, by: user.id });
	return message(form, { type: 'success', text: `Invoice sent to ${customer.email}` });
});
