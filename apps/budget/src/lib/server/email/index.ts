import { BREVO_API_KEY, BREVO_FROM_ADDRESS } from '$app/env/private';
import {
	createAuthEmails,
	createMailer,
	EMAIL_BUTTON_STYLE,
	escapeHtml,
	renderEmailLayout
} from '@sheppakai/shared/email';
import type { WelcomeEmailPayload } from '@sheppakai/shared/welcome';

import { formatCurrency } from '#lib/utils.js';

import { logger } from '../logger';

const mailer = createMailer({
	apiKey: BREVO_API_KEY,
	from: BREVO_FROM_ADDRESS,
	appName: 'Sheppakai Budget',
	logger
});

const FOOTER = 'Sheppakai Budget - Your Personal Finance Companion';

export const {
	sendVerificationEmail,
	sendPasswordResetEmail,
	sendPasswordChangedEmail,
	sendNewUserEmail
} = createAuthEmails({ mailer, appName: 'Sheppakai Budget', footer: FOOTER });

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
	excludedTransactions: WeeklySummaryExcludedTransaction[];
};

export type WeeklySummaryExcludedTransaction = {
	date: string;
	payee: string;
	categoryName: string;
	amount: number;
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

function renderExcludedRows(rows: WeeklySummaryExcludedTransaction[]): string {
	if (rows.length === 0) {
		return '<p style="margin: 0; color: #4b5563;">No transactions were excluded from the budget this month.</p>';
	}

	const total = rows.reduce((acc, row) => acc + row.amount, 0);

	return `
		<table style="width: 100%; border-collapse: collapse; font-size: 14px;">
			<thead>
				<tr>
					<th style="text-align: left; padding: 10px 8px; border-bottom: 1px solid #e5e7eb;">Date</th>
					<th style="text-align: left; padding: 10px 8px; border-bottom: 1px solid #e5e7eb;">Payee</th>
					<th style="text-align: left; padding: 10px 8px; border-bottom: 1px solid #e5e7eb;">Category</th>
					<th style="text-align: right; padding: 10px 8px; border-bottom: 1px solid #e5e7eb;">Amount</th>
				</tr>
			</thead>
			<tbody>
				${rows
					.map(
						(row) => `
							<tr>
								<td style="padding: 10px 8px; border-bottom: 1px solid #f3f4f6; white-space: nowrap;">${escapeHtml(row.date)}</td>
								<td style="padding: 10px 8px; border-bottom: 1px solid #f3f4f6;">${escapeHtml(row.payee)}</td>
								<td style="padding: 10px 8px; border-bottom: 1px solid #f3f4f6;">${escapeHtml(row.categoryName)}</td>
								<td style="padding: 10px 8px; text-align: right; border-bottom: 1px solid #f3f4f6;">${formatCurrency(row.amount)}</td>
							</tr>
						`
					)
					.join('')}
				<tr>
					<td colspan="3" style="padding: 10px 8px; font-weight: 600;">Total</td>
					<td style="padding: 10px 8px; text-align: right; font-weight: 600;">${formatCurrency(total)}</td>
				</tr>
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

		<section style="margin-bottom: 28px; background: #ffffff; border: 1px solid #d1fae5; border-radius: 8px; padding: 16px;">
			<h2 style="margin: 0 0 12px; color: #065f46; font-size: 18px;">Within 10% Of Budget Limit</h2>
			${renderWeeklyRows(payload.nearLimitCategories, 'near-limit')}
		</section>

		<section style="margin-bottom: 10px; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px;">
			<h2 style="margin: 0 0 4px; color: #374151; font-size: 18px;">Excluded From Budget</h2>
			<p style="margin: 0 0 12px; font-size: 13px; color: #6b7280;">These transactions don't count toward any category budget above.</p>
			${renderExcludedRows(payload.excludedTransactions)}
		</section>`
		})
	});
}

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
			<a href="${setPasswordUrl}" style="${EMAIL_BUTTON_STYLE}">Set Your Password</a>
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
