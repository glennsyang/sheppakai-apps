import { BREVO_API_KEY, BREVO_FROM_ADDRESS } from '$app/env/private';
import { createMailer, escapeHtml, renderEmailLayout } from '@sheppakai/shared/email';

import { logger } from '../logger';

const APP_NAME = 'Meal Planner';

const mailer = createMailer({
	apiKey: BREVO_API_KEY,
	from: BREVO_FROM_ADDRESS,
	appName: APP_NAME,
	logger
});

const BUTTON_STYLE =
	'background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block; font-size: 16px;';

function layout(title: string, heading: string, body: string): string {
	return renderEmailLayout({ title, heading, body, footer: APP_NAME });
}

export async function sendVerificationEmail(to: string, name: string, verificationUrl: string) {
	await mailer.send({
		to,
		name,
		subject: '[Meal Planner] Verify your email address',
		label: 'verification email',
		html: layout(
			'Verify your email',
			'Welcome to Meal Planner',
			`
		<p style="font-size: 16px; margin-bottom: 20px;">Hi ${escapeHtml(name)},</p>
		<p style="font-size: 16px; margin-bottom: 20px;">
			Thanks for signing up! Please verify your email address to get started with Meal Planner.
		</p>
		<div style="text-align: center; margin: 30px 0;">
			<a href="${escapeHtml(verificationUrl)}" style="${BUTTON_STYLE}">Verify Email Address</a>
		</div>
		<p style="font-size: 14px; color: #6b7280; margin-top: 30px;">
			If you didn't create an account, you can safely ignore this email.
		</p>
		<p style="font-size: 14px; color: #6b7280; margin-top: 10px;">
			This link will expire in 10 minutes.
		</p>`
		)
	});
}

export async function sendPasswordResetEmail(to: string, name: string, resetUrl: string) {
	await mailer.send({
		to,
		name,
		subject: '[Meal Planner] Reset your password',
		label: 'password reset email',
		html: layout(
			'Reset your password',
			'Reset your password',
			`
		<p style="font-size: 16px; margin-bottom: 20px;">Hi ${escapeHtml(name)},</p>
		<p style="font-size: 16px; margin-bottom: 20px;">
			We received a request to reset your Meal Planner password. Click the button below to choose a new one.
		</p>
		<div style="text-align: center; margin: 30px 0;">
			<a href="${escapeHtml(resetUrl)}" style="${BUTTON_STYLE}">Reset Password</a>
		</div>
		<p style="font-size: 14px; color: #6b7280; margin-top: 30px;">
			If you didn't request a password reset, you can safely ignore this email — your password won't change.
		</p>
		<p style="font-size: 14px; color: #6b7280; margin-top: 10px;">
			This link will expire in 10 minutes.
		</p>`
		)
	});
}

type PasswordChangedEmailPayload = {
	to: string;
	name: string;
	changedAt: Date;
	ipAddress?: string;
	userAgent?: string;
	source?: string;
};

/**
 * Security-notice email sent after a password change (currently only the
 * completed-reset flow — see `onPasswordReset` in src/lib/server/auth/index.ts).
 * All interpolated values are HTML-escaped since `name` / `userAgent` are
 * user-controlled.
 */
export async function sendPasswordChangedEmail(payload: PasswordChangedEmailPayload) {
	const changedAtText = escapeHtml(payload.changedAt.toLocaleString());
	const ipAddress = escapeHtml(payload.ipAddress || 'Unavailable');
	const userAgent = escapeHtml(payload.userAgent || 'Unavailable');
	const source = escapeHtml(payload.source || 'Account settings');

	await mailer.send({
		to: payload.to,
		name: payload.name,
		subject: '[Meal Planner] Your password was changed',
		label: 'password changed email',
		html: layout(
			'Password changed',
			'Password Updated',
			`
		<p style="font-size: 16px; margin-bottom: 20px;">Hi ${escapeHtml(payload.name)},</p>
		<p style="font-size: 16px; margin-bottom: 20px;">
			Your Meal Planner password was successfully changed.
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

export async function sendNewUserEmail(to: string, name: string) {
	await mailer.send({
		to,
		name,
		subject: '[Meal Planner] Welcome to Meal Planner!',
		label: 'new user welcome email',
		html: layout(
			'Welcome to Meal Planner',
			'Welcome to Meal Planner',
			`
		<p style="font-size: 16px; margin-bottom: 20px;">Hi ${escapeHtml(name || to)},</p>
		<p style="font-size: 16px; margin-bottom: 20px;">
			Thanks for signing up! We're excited to have you on board.
		</p>`
		)
	});
}

type AccountCreatedEmailLinks = {
	appUrl: string;
	forgotPasswordUrl: string;
	profileUrl: string;
};

/**
 * Welcome email for an account an admin created from /admin (#138). The account's
 * password is a random one nobody knows, so the email walks the user through setting
 * their own via Forgot password. It links to the forgot-password page rather than
 * embedding a reset token: tokens expire after 10 minutes, which a welcome email
 * would routinely outlive.
 */
export async function sendAccountCreatedEmail(
	to: string,
	name: string,
	links: AccountCreatedEmailLinks
) {
	const appUrl = escapeHtml(links.appUrl);
	const forgotPasswordUrl = escapeHtml(links.forgotPasswordUrl);
	const profileUrl = escapeHtml(links.profileUrl);

	await mailer.send({
		to,
		name,
		subject: '[Meal Planner] Your account is ready',
		label: 'account created email',
		html: layout(
			'Your Meal Planner account',
			'Welcome to Meal Planner',
			`
		<p style="font-size: 16px; margin-bottom: 20px;">Hi ${escapeHtml(name || to)},</p>
		<p style="font-size: 16px; margin-bottom: 20px;">
			An account has been created for you on Meal Planner (<a href="${appUrl}">${appUrl}</a>)
			with the email <strong>${escapeHtml(to)}</strong>.
		</p>
		<p style="font-size: 16px; margin-bottom: 8px;"><strong>To sign in for the first time:</strong></p>
		<ol style="font-size: 16px; margin-bottom: 20px; padding-left: 20px;">
			<li>Open the <a href="${forgotPasswordUrl}">Forgot password</a> page and enter your email.</li>
			<li>Click the link in the reset email and choose your own password (at least 12 characters). No password has been shared with anyone.</li>
			<li>Sign in. The first time, you'll get a verification email — click the link in it to finish signing in.</li>
		</ol>
		<div style="text-align: center; margin: 30px 0;">
			<a href="${forgotPasswordUrl}" style="${BUTTON_STYLE}">Set your password</a>
		</div>
		<p style="font-size: 14px; color: #6b7280; margin-top: 30px;">
			You can change your password any time from your <a href="${profileUrl}">profile page</a>.
		</p>
		<p style="font-size: 14px; color: #6b7280; margin-top: 10px;">
			If you weren't expecting this, you can safely ignore this email.
		</p>`
		)
	});
}
