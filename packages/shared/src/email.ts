import { BrevoClient } from '@getbrevo/brevo';

const HTML_ESCAPES: Record<string, string> = {
	'&': '&amp;',
	'<': '&lt;',
	'>': '&gt;',
	'"': '&quot;',
	"'": '&#39;'
};

/** Escapes the five HTML-significant characters so user-controlled values (name,
 *  user agent, …) can't inject markup into a transactional email body. */
export function escapeHtml(value: string): string {
	return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

const DEFAULT_ACCENT = '#667eea 0%, #764ba2 100%';

export interface EmailLayoutOptions {
	/** `<title>` text. Plain text, escaped. */
	title: string;
	/** Header `<h1>` text. Plain text, escaped. */
	heading: string;
	/** Optional line under the heading. Plain text, escaped. */
	subheading?: string;
	/** Card contents. Trusted HTML: callers escape any interpolated values. */
	body: string;
	/** Footer line. Plain text, escaped. */
	footer: string;
	/** Header gradient color stops, e.g. `'#f093fb 0%, #f5576c 100%'`. */
	accent?: string;
	/** Heading text color, for light accents. */
	headingColor?: string;
	maxWidth?: string;
}

/** The HTML shell every transactional email shares: head, gradient header, card and footer. */
export function renderEmailLayout({
	title,
	heading,
	subheading,
	body,
	footer,
	accent = DEFAULT_ACCENT,
	headingColor = 'white',
	maxWidth = '600px'
}: EmailLayoutOptions): string {
	const subheadingHtml = subheading
		? `\n\t\t<p style="color: #e5e7eb; margin: 8px 0 0; font-size: 14px;">${escapeHtml(subheading)}</p>`
		: '';

	return `
<!DOCTYPE html>
<html>
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>${escapeHtml(title)}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: ${maxWidth}; margin: 0 auto; padding: 20px;">
	<div style="background: linear-gradient(135deg, ${accent}); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
		<h1 style="color: ${headingColor}; margin: 0; font-size: 28px;">${escapeHtml(heading)}</h1>${subheadingHtml}
	</div>
	<div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px;">
		${body}
	</div>
	<div style="text-align: center; margin-top: 20px; padding: 20px; color: #9ca3af; font-size: 12px;">
		<p>${escapeHtml(footer)}</p>
	</div>
</body>
</html>
`;
}

export interface MailerLogger {
	info(message: string, meta?: Record<string, unknown>): void;
	error(message: string, error?: unknown, meta?: Record<string, unknown>): void;
}

export interface MailerOptions {
	apiKey: string;
	/** Sender address. */
	from: string;
	/** Sender display name. */
	appName: string;
	logger: MailerLogger;
}

export interface SendEmailOptions {
	to: string;
	name?: string;
	subject: string;
	html: string;
	/** Log label, e.g. `'verification email'`. */
	label: string;
}

/**
 * Wraps a Brevo client so every send logs the same way: an info line before and after
 * (with the Brevo message ID), and on failure an error line plus a rethrow so the caller
 * decides whether the failure matters.
 *
 * Info-level on purpose: production suppresses debug logs, and these lines separate an
 * untriggered flow from a provider failure.
 */
export function createMailer({ apiKey, from, appName, logger }: MailerOptions) {
	const brevo = new BrevoClient({ apiKey });

	return {
		async send({ to, name, subject, html, label }: SendEmailOptions): Promise<void> {
			logger.info(`Sending ${label}`, { to });

			let result;
			try {
				result = await brevo.transactionalEmails.sendTransacEmail({
					sender: { name: appName, email: from },
					to: [{ email: to, name }],
					subject,
					htmlContent: html
				});
			} catch (cause) {
				logger.error(`Failed to send ${label}`, cause, { to });
				throw cause instanceof Error ? cause : new Error('Brevo request failed', { cause });
			}

			logger.info(`${label[0].toUpperCase()}${label.slice(1)} sent`, {
				to,
				brevoMessageId: result.messageId
			});
		}
	};
}

export type Mailer = ReturnType<typeof createMailer>;
