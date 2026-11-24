/**
 * The seam between notification jobs and the outside world. Production sends email through
 * Brevo and pushes through ntfy (`production-notifier.ts`); tests pass a fake that records.
 */

export type EmailContent = { subject: string; html: string; label: string };

export type EmailMessage = EmailContent & { to: string; name: string };

export type PushMessage = { message: string; title: string; tags: string; priority?: number };

export type Notifier = {
	/** Throws when the email could not be sent. */
	email(message: EmailMessage): Promise<void>;
	/** Resolves false when the push could not be delivered. */
	push(message: PushMessage): Promise<boolean>;
};
