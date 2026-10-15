import { BREVO_API_KEY, BREVO_FROM_ADDRESS } from '$app/env/private';
import {
	createAuthEmails,
	createMailer,
	EMAIL_BUTTON_STYLE,
	escapeHtml,
	renderEmailLayout
} from '@sheppakai/shared/email';
import type { WelcomeEmailPayload } from '@sheppakai/shared/welcome';

import { logger } from '../logger';

const APP_NAME = 'Meal Planner';

const mailer = createMailer({
	apiKey: BREVO_API_KEY,
	from: BREVO_FROM_ADDRESS,
	appName: APP_NAME,
	logger
});

export const {
	sendVerificationEmail,
	sendPasswordResetEmail,
	sendPasswordChangedEmail,
	sendNewUserEmail
} = createAuthEmails({ mailer, appName: APP_NAME });

function layout(title: string, heading: string, body: string): string {
	return renderEmailLayout({ title, heading, body, footer: APP_NAME });
}

/**
 * Welcome email for an account an admin created from /admin (#138). The account's password
 * is a random one nobody knows, so the email carries a 72-hour set-password link. Unlike the
 * other auth emails this one throws on failure: the admin action awaits it and tells the
 * admin to resend, since the new user has no other way to learn the account exists.
 */
export async function sendWelcomeEmail(payload: WelcomeEmailPayload) {
	const setPasswordUrl = escapeHtml(payload.setPasswordUrl);
	const signInUrl = escapeHtml(payload.signInUrl);

	await mailer.send({
		to: payload.to,
		name: payload.name,
		subject: '[Meal Planner] Your account is ready',
		label: 'welcome email',
		html: layout(
			'Your Meal Planner account',
			'Welcome to Meal Planner',
			`
		<p style="font-size: 16px; margin-bottom: 20px;">Hi ${escapeHtml(payload.name || payload.to)},</p>
		<p style="font-size: 16px; margin-bottom: 20px;">
			An account has been created for you on Meal Planner with the email
			<strong>${escapeHtml(payload.to)}</strong>. To get started, choose your own password
			(at least 12 characters):
		</p>
		<div style="text-align: center; margin: 30px 0;">
			<a href="${setPasswordUrl}" style="${EMAIL_BUTTON_STYLE}">Set your password</a>
		</div>
		<p style="font-size: 16px; margin-bottom: 8px;"><strong>Then sign in:</strong></p>
		<ol style="font-size: 16px; margin-bottom: 20px; padding-left: 20px;">
			<li>Go to <a href="${signInUrl}">${signInUrl}</a> and sign in with your email and new password.</li>
			<li>The first time, you'll get a verification email. Click the link in it to finish signing in.</li>
			<li>You can change your password any time from your profile page.</li>
		</ol>
		<p style="font-size: 14px; color: #6b7280; margin-top: 30px;">
			The set-password link expires in 72 hours. If it has expired, go to the sign-in page and
			choose <strong>Forgot password</strong> to get a new one. No password has been shared
			with anyone.
		</p>
		<p style="font-size: 14px; color: #6b7280; margin-top: 10px;">
			If you weren't expecting this, you can safely ignore this email.
		</p>`
		)
	});
}
