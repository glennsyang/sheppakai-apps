import { BREVO_API_KEY, BREVO_FROM_ADDRESS } from '$app/env/private';
import { formatCurrency } from '$lib/utils';
import { createMailer, escapeHtml, renderEmailLayout } from '@sheppakai/shared/email';

import { logger } from '../logger';

const mailer = createMailer({
	apiKey: BREVO_API_KEY,
	from: BREVO_FROM_ADDRESS,
	appName: 'Sheppakai Budget',
	logger
});

const FOOTER = 'Sheppakai Budget - Your Personal Finance Companion';

const BUTTON_STYLE =
	'background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block; font-size: 16px;';

function layout(title: string, heading: string, body: string): string {
	return renderEmailLayout({ title, heading, body, footer: FOOTER });
}

export type WeeklySummaryCategory = {
	categoryName: string;
	budgetAmount: number;
	spentAmount: number;
	overByAmount?: number;
	remainingAmount?: number;
};

type WeeklySummaryEmailPayload = {
	to: string;
	name: string;
	monthLabel: string;
	overBudgetCategories: WeeklySummaryCategory[];
	nearLimitCategories: WeeklySummaryCategory[];
};

type PasswordChangedEmailPayload = {
	to: string;
	name: string;
	changedAt: Date;
	ipAddress?: string;
	userAgent?: string;
	source?: string;
};

function renderWeeklyRows(
	rows: WeeklySummaryCategory[],
	type: 'over-budget' | 'near-limit'
): string {
	if (rows.length === 0) {
		return type === 'over-budget'
			? '<p style="margin: 0; color: #4b5563;">No categories are over budget this month 🎉</p>'
			: '<p style="margin: 0; color: #4b5563;">No categories are within 10% of their budget limit right now.</p>';
	}

	return `
		<table style="width: 100%; border-collapse: collapse; font-size: 14px;">
			<thead>
				<tr>
					<th style="text-align: left; padding: 10px 8px; border-bottom: 1px solid #e5e7eb;">Category</th>
					<th style="text-align: right; padding: 10px 8px; border-bottom: 1px solid #e5e7eb;">Budget</th>
					<th style="text-align: right; padding: 10px 8px; border-bottom: 1px solid #e5e7eb;">Spent</th>
					<th style="text-align: right; padding: 10px 8px; border-bottom: 1px solid #e5e7eb;">${type === 'over-budget' ? 'Over By' : 'Left To Spend'}</th>
				</tr>
			</thead>
			<tbody>
				${rows
					.map(
						(row) => `
							<tr>
								<td style="padding: 10px 8px; border-bottom: 1px solid #f3f4f6;">${escapeHtml(row.categoryName)}</td>
								<td style="padding: 10px 8px; text-align: right; border-bottom: 1px solid #f3f4f6;">${formatCurrency(row.budgetAmount)}</td>
								<td style="padding: 10px 8px; text-align: right; border-bottom: 1px solid #f3f4f6;">${formatCurrency(row.spentAmount)}</td>
								<td style="padding: 10px 8px; text-align: right; border-bottom: 1px solid #f3f4f6; font-weight: 600; color: ${type === 'over-budget' ? '#dc2626' : '#065f46'};">${formatCurrency(type === 'over-budget' ? (row.overByAmount ?? 0) : (row.remainingAmount ?? 0))}</td>
							</tr>
						`
					)
					.join('')}
			</tbody>
		</table>
	`;
}

export async function sendWeeklySummaryEmail(payload: WeeklySummaryEmailPayload) {
	await mailer.send({
		to: payload.to,
		name: payload.name,
		subject: `[Sheppakai Budget] Weekly Budget Summary - ${payload.monthLabel}`,
		label: 'weekly summary email',
		html: renderEmailLayout({
			title: 'Weekly Budget Summary',
			heading: 'Weekly Budget Summary',
			subheading: `${payload.monthLabel} (month-to-date)`,
			footer: 'Sheppakai Budget',
			maxWidth: '720px',
			body: `
		<p style="font-size: 16px; margin: 0 0 18px;">Hi ${escapeHtml(payload.name)},</p>
		<p style="font-size: 15px; margin: 0 0 24px; color: #374151;">Here’s your shared budget summary for this month so far.</p>

		<section style="margin-bottom: 28px; background: #ffffff; border: 1px solid #fee2e2; border-radius: 8px; padding: 16px;">
			<h2 style="margin: 0 0 12px; color: #b91c1c; font-size: 18px;">Over Budget</h2>
			${renderWeeklyRows(payload.overBudgetCategories, 'over-budget')}
		</section>

		<section style="margin-bottom: 10px; background: #ffffff; border: 1px solid #d1fae5; border-radius: 8px; padding: 16px;">
			<h2 style="margin: 0 0 12px; color: #065f46; font-size: 18px;">Within 10% Of Budget Limit</h2>
			${renderWeeklyRows(payload.nearLimitCategories, 'near-limit')}
		</section>`
		})
	});
}

export async function sendVerificationEmail(to: string, name: string, verificationUrl: string) {
	await mailer.send({
		to,
		name,
		subject: '[Sheppakai Budget] Verify your email address',
		label: 'verification email',
		html: layout(
			'Verify your email',
			'Welcome to Sheppakai Budget',
			`
		<p style="font-size: 16px; margin-bottom: 20px;">Hi ${escapeHtml(name)},</p>
		<p style="font-size: 16px; margin-bottom: 20px;">
			Thanks for signing up! Please verify your email address to get started with Sheppakai Budget.
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
		subject: '[Sheppakai Budget] Reset your password',
		label: 'password reset email',
		html: layout(
			'Reset your password',
			'Password Reset',
			`
		<p style="font-size: 16px; margin-bottom: 20px;">Hi ${escapeHtml(name)},</p>
		<p style="font-size: 16px; margin-bottom: 20px;">
			We received a request to reset your password. Click the button below to create a new password.
		</p>
		<div style="text-align: center; margin: 30px 0;">
			<a href="${escapeHtml(resetUrl)}" style="${BUTTON_STYLE}">Reset Password</a>
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

export async function sendPasswordChangedEmail(payload: PasswordChangedEmailPayload) {
	const changedAtText = escapeHtml(payload.changedAt.toLocaleString());
	const ipAddress = escapeHtml(payload.ipAddress || 'Unavailable');
	const userAgent = escapeHtml(payload.userAgent || 'Unavailable');
	const source = escapeHtml(payload.source || 'Account settings');

	await mailer.send({
		to: payload.to,
		name: payload.name,
		subject: '[Sheppakai Budget] Your password was changed',
		label: 'password changed email',
		html: layout(
			'Password changed',
			'Password Updated',
			`
		<p style="font-size: 16px; margin-bottom: 20px;">Hi ${escapeHtml(payload.name)},</p>
		<p style="font-size: 16px; margin-bottom: 20px;">
			Your password was successfully changed.
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

/**
 * Best-effort: the sign-up hook fires this with `void`, so a failure is returned (and
 * already logged by the mailer) instead of thrown.
 */
export async function sendNewUserEmail(to: string, name: string) {
	await mailer.send({
		to,
		name,
		subject: '[Sheppakai Budget] New User was registered!',
		label: 'new user email',
		html: `Hi ${escapeHtml(name || to)}!<br><br>Welcome to Sheppakai Budget! We're excited to have you on board.<br><br>Thank you,<br>Sheppakai Budget Team`
	});
}

type WelcomeEmailPayload = {
	to: string;
	name: string;
	setPasswordUrl: string;
	signInUrl: string;
};

/**
 * Sent when an admin creates an account. Unlike the other auth emails this one throws on
 * failure: the admin action awaits it and tells the admin to resend, since the new user has
 * no other way to learn the account exists.
 */
export async function sendWelcomeEmail(payload: WelcomeEmailPayload) {
	const setPasswordUrl = escapeHtml(payload.setPasswordUrl);
	const signInUrl = escapeHtml(payload.signInUrl);

	await mailer.send({
		to: payload.to,
		name: payload.name,
		subject: '[Sheppakai Budget] Your account is ready',
		label: 'welcome email',
		html: layout(
			'Welcome to Sheppakai Budget',
			'Welcome to Sheppakai Budget',
			`
		<p style="font-size: 16px; margin-bottom: 20px;">Hi ${escapeHtml(payload.name)},</p>
		<p style="font-size: 16px; margin-bottom: 20px;">
			An account has been created for you on Sheppakai Budget. To get started, choose your own password (at least 12 characters):
		</p>
		<div style="text-align: center; margin: 30px 0;">
			<a href="${setPasswordUrl}" style="${BUTTON_STYLE}">Set Your Password</a>
		</div>
		<p style="font-size: 14px; margin-bottom: 8px;"><strong>Then sign in:</strong></p>
		<ol style="font-size: 14px; margin: 0 0 20px; padding-left: 20px;">
			<li>Go to <a href="${signInUrl}">${signInUrl}</a> and sign in with your email and new password.</li>
			<li>On your first sign-in you'll get a verification email. Click the link in it to finish signing in.</li>
			<li>You can change your password any time from your Profile page.</li>
		</ol>
		<p style="font-size: 14px; color: #6b7280; margin-top: 20px;">
			The set-password link expires in 72 hours. If it has expired, go to the sign-in page and choose <strong>Forgot password</strong> to get a new one. No password has been shared with anyone: you are the only one who will know it.
		</p>`
		)
	});
}
