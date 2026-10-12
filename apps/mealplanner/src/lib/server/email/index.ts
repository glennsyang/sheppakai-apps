import { BREVO_API_KEY, BREVO_FROM_ADDRESS } from '$app/env/private';
import {
	createAuthEmails,
	createMailer,
	EMAIL_BUTTON_STYLE,
	escapeHtml,
	renderEmailLayout
} from '@sheppakai/shared/email';

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
			<a href="${forgotPasswordUrl}" style="${EMAIL_BUTTON_STYLE}">Set your password</a>
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
