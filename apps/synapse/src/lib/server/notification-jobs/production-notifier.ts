import { mailer } from '../email/index';
import { sendReminderAlerts } from '../notifications';
import type { Notifier } from './notifier';

export const productionNotifier: Notifier = {
	email: (message) => mailer.send(message),
	push: ({ message, title, tags, priority = 3, click }) =>
		sendReminderAlerts(message, title, priority, tags, click)
};
