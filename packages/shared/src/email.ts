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

export const EMAIL_BUTTON_STYLE =
	'background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block; font-size: 16px;';

export interface PasswordChangedEmailPayload {
	to: string;
	name: string;
	changedAt: Date;
	ipAddress?: string;
	userAgent?: string;
	source?: string;
}

export interface AuthEmailsOptions {
	mailer: Mailer;
	/** Used in subjects and copy, e.g. `'Sheppakai Budget'`. */
	appName: string;
	/** Footer line. Defaults to `appName`. */
	footer?: string;
}

/**
 * The four Better Auth emails every app sends (verification, password reset, password
 * changed, new user), with one copy deck and `appName` filled in. Each send rethrows a
 * Brevo failure (see `createMailer`); callers that must not fail, such as the
 * fire-and-forget audit hooks, catch it themselves.
 *
 * The expiry lines must match `createAppAuth` in `./auth-config`: verification links
 * last 1 hour and reset links 10 minutes.
 */
export function createAuthEmails({ mailer, appName, footer = appName }: AuthEmailsOptions) {
	const app = escapeHtml(appName);
	const subject = (text: string) => `[${appName}] ${text}`;
	const layout = (title: string, heading: string, body: string) =>
		renderEmailLayout({ title, heading, body, footer });

	async function sendVerificationEmail(to: string, name: string, verificationUrl: string) {
		await mailer.send({
			to,
			name,
			subject: subject('Verify your email address'),
			label: 'verification email',
			html: layout(
				'Verify your email',
				`Welcome to ${appName}`,
				`
		<p style="font-size: 16px; margin-bottom: 20px;">Hi ${escapeHtml(name)},</p>
		<p style="font-size: 16px; margin-bottom: 20px;">
			Please verify your email address to get started with ${app}.
		</p>
		<div style="text-align: center; margin: 30px 0;">
			<a href="${escapeHtml(verificationUrl)}" style="${EMAIL_BUTTON_STYLE}">Verify Email Address</a>
		</div>
		<p style="font-size: 14px; color: #6b7280; margin-top: 30px;">
			If you weren't expecting this, you can safely ignore this email.
		</p>
		<p style="font-size: 14px; color: #6b7280; margin-top: 10px;">
			This link will expire in 1 hour.
		</p>`
			)
		});
	}

	async function sendPasswordResetEmail(to: string, name: string, resetUrl: string) {
		await mailer.send({
			to,
			name,
			subject: subject('Reset your password'),
			label: 'password reset email',
			html: layout(
				'Reset your password',
				'Password Reset',
				`
		<p style="font-size: 16px; margin-bottom: 20px;">Hi ${escapeHtml(name)},</p>
		<p style="font-size: 16px; margin-bottom: 20px;">
			We received a request to reset your ${app} password. Click the button below to choose a new one.
		</p>
		<div style="text-align: center; margin: 30px 0;">
			<a href="${escapeHtml(resetUrl)}" style="${EMAIL_BUTTON_STYLE}">Reset Password</a>
		</div>
		<p style="font-size: 14px; color: #6b7280; margin-top: 30px;">
			If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.
		</p>
		<p style="font-size: 14px; color: #6b7280; margin-top: 10px;">
			This link will expire in 10 minutes for security reasons.
		</p>`
			)
		});
	}

	/** Security notice after a password change or reset, so an unexpected change gets noticed. */
	async function sendPasswordChangedEmail(payload: PasswordChangedEmailPayload) {
		const changedAtText = escapeHtml(payload.changedAt.toLocaleString());
		const ipAddress = escapeHtml(payload.ipAddress || 'Unavailable');
		const userAgent = escapeHtml(payload.userAgent || 'Unavailable');
		const source = escapeHtml(payload.source || 'Account settings');

		await mailer.send({
			to: payload.to,
			name: payload.name,
			subject: subject('Your password was changed'),
			label: 'password changed email',
			html: layout(
				'Password changed',
				'Password Updated',
				`
		<p style="font-size: 16px; margin-bottom: 20px;">Hi ${escapeHtml(payload.name)},</p>
		<p style="font-size: 16px; margin-bottom: 20px;">
			Your ${app} password was successfully changed.
		</p>
		<p style="font-size: 14px; margin-bottom: 8px;"><strong>When:</strong> ${changedAtText}</p>
		<p style="font-size: 14px; margin-bottom: 8px;"><strong>Source:</strong> ${source}</p>
		<p style="font-size: 14px; margin-bottom: 8px;"><strong>IP:</strong> ${ipAddress}</p>
		<p style="font-size: 14px; margin-bottom: 20px;"><strong>Device:</strong> ${userAgent}</p>
		<p style="font-size: 14px; color: #6b7280; margin-top: 20px;">
			If this wasn't you, reset your password immediately and contact support.
		</p>`
			)
		});
	}

	async function sendNewUserEmail(to: string, name: string) {
		await mailer.send({
			to,
			name,
			subject: subject(`Welcome to ${appName}!`),
			label: 'new user email',
			html: layout(
				`Welcome to ${appName}`,
				`Welcome to ${appName}`,
				`
		<p style="font-size: 16px; margin-bottom: 20px;">Hi ${escapeHtml(name || to)},</p>
		<p style="font-size: 16px; margin-bottom: 20px;">
			We're excited to have you on board.
		</p>`
			)
		});
	}

	return {
		sendVerificationEmail,
		sendPasswordResetEmail,
		sendPasswordChangedEmail,
		sendNewUserEmail
	};
}
