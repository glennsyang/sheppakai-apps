import { BREVO_API_KEY, BREVO_FROM_ADDRESS } from '$app/env/private';
import {
	createAuthEmails,
	createMailer,
	EMAIL_BUTTON_STYLE,
	escapeHtml,
	renderEmailLayout,
	type EmailLayoutOptions
} from '@sheppakai/shared/email';
import type { WelcomeEmailPayload } from '@sheppakai/shared/welcome';

import {
	buildTasksDueTodayDigestTitle,
	buildTasksDueTodayEmailHtml,
	type TasksDueTodayTaskSummary
} from '#lib/server/email/tasks-due-today-digest.js';
import { logger } from '#lib/server/logger.js';
import { getWorkoutEmoji } from '#lib/utils/workout.js';

const mailer = createMailer({
	apiKey: BREVO_API_KEY,
	from: BREVO_FROM_ADDRESS,
	appName: 'Synapse',
	logger
});

const SYNAPSE_EMAIL_FOOTER = 'Synapse - Your Personal Second Brain';

export const {
	sendVerificationEmail,
	sendPasswordResetEmail,
	sendPasswordChangedEmail,
	sendNewUserEmail
} = createAuthEmails({ mailer, appName: 'Synapse', footer: SYNAPSE_EMAIL_FOOTER });

const FLOCK_QUOTE = `
		<div style="background: #e5e7eb; padding: 20px; border-radius: 8px; margin: 20px 0;">
			<p style="margin: 0; font-size: 14px; color: #6b7280;">
				💡 <em>"You should know well the appearance of your flock. Take good care of your sheep."</em>
			</p>
		</div>`;

function layout(
	title: string,
	heading: string,
	body: string,
	options: Pick<EmailLayoutOptions, 'accent' | 'headingColor'> = {}
): string {
	return renderEmailLayout({ title, heading, body, footer: SYNAPSE_EMAIL_FOOTER, ...options });
}

/**
 * Sent when an admin creates an account, with a 24-hour set-password link. Unlike the other
 * auth emails this one throws on failure: the admin action awaits it and tells the admin to
 * resend, since the new user has no other way to learn the account exists.
 */
export async function sendWelcomeEmail(payload: WelcomeEmailPayload) {
	const setPasswordUrl = escapeHtml(payload.setPasswordUrl);
	const signInUrl = escapeHtml(payload.signInUrl);

	await mailer.send({
		to: payload.to,
		name: payload.name,
		subject: '[Synapse] Your account is ready',
		label: 'welcome email',
		html: layout(
			'Your Synapse account',
			'Welcome to Synapse',
			`
		<p style="font-size: 16px; margin-bottom: 20px;">Hi ${escapeHtml(payload.name)},</p>
		<p style="font-size: 16px; margin-bottom: 20px;">
			An account has been created for you on Synapse with the email
			<strong>${escapeHtml(payload.to)}</strong>. To get started, choose your own password
			(at least 12 characters):
		</p>
		<div style="text-align: center; margin: 30px 0;">
			<a href="${setPasswordUrl}" style="${EMAIL_BUTTON_STYLE}">Set your password</a>
		</div>
		<p style="font-size: 16px; margin-bottom: 10px;"><strong>Then sign in:</strong></p>
		<ol style="font-size: 16px; margin: 0 0 20px; padding-left: 20px;">
			<li>Go to <a href="${signInUrl}" style="color: #667eea;">${signInUrl}</a> and sign in with your email and new password.</li>
			<li>The first time, we'll send you a verification email &mdash; click the link in it to finish setting up your account.</li>
			<li>You can change your password any time from your profile page.</li>
		</ol>
		<p style="font-size: 14px; color: #6b7280; margin-top: 30px;">
			The set-password link expires in 24 hours. If it has expired, go to the sign-in page and
			choose <strong>Forgot password</strong> to get a new one. No password has been shared
			with anyone.
		</p>
		<p style="font-size: 14px; color: #6b7280; margin-top: 10px;">
			If you weren't expecting this, you can safely ignore this email.
		</p>`
		)
	});
}

export async function sendWorkoutReminderEmail(
	to: string,
	name: string,
	workoutType: string,
	time: string
) {
	const emoji = getWorkoutEmoji(workoutType);

	await mailer.send({
		to,
		name,
		subject: `[Synapse] ${emoji} Time for your ${workoutType} workout!`,
		label: 'workout reminder email',
		html: layout(
			'Workout Reminder',
			`${emoji} Workout Reminder`,
			`
		<p style="font-size: 16px; margin-bottom: 20px;">Hi ${escapeHtml(name)},</p>
		<p style="font-size: 16px; margin-bottom: 20px;">
			This is your friendly reminder that you scheduled a <strong>${escapeHtml(workoutType)}</strong> workout for <strong>${escapeHtml(time)}</strong> today.
		</p>
		<p style="font-size: 16px; margin-bottom: 20px;">
			Remember: consistency is key! Even a short workout is better than none.
		</p>
		<div style="background: #e5e7eb; padding: 20px; border-radius: 8px; margin: 20px 0;">
			<p style="margin: 0; font-size: 14px; color: #6b7280;">
				💡 <em>"The only bad workout is the one that didn't happen."</em>
			</p>
		</div>
		<p style="font-size: 16px; margin-top: 20px;">
			Ready to crush it? Let's go! 💪
		</p>`,
			{ accent: '#f093fb 0%, #f5576c 100%' }
		)
	});
}

export async function sendMeditationReminderEmail(
	to: string,
	name: string,
	routineTitle: string,
	time: string
) {
	await mailer.send({
		to,
		name,
		subject: '[Synapse] 🧘 Time for your meditation practice',
		label: 'meditation reminder email',
		html: layout(
			'Meditation Reminder',
			'🧘 Meditation Reminder',
			`
		<p style="font-size: 16px; margin-bottom: 20px;">Hi ${escapeHtml(name)},</p>
		<p style="font-size: 16px; margin-bottom: 20px;">
			It's time to take a mindful moment for yourself. You scheduled <strong>${escapeHtml(routineTitle)}</strong> for <strong>${escapeHtml(time)}</strong> today.
		</p>
		<p style="font-size: 16px; margin-bottom: 20px;">
			Take a few minutes to breathe, relax, and center yourself.
		</p>
		<div style="background: #e5e7eb; padding: 20px; border-radius: 8px; margin: 20px 0;">
			<p style="margin: 0; font-size: 14px; color: #6b7280;">
				🌸 <em>"Peace comes from within. Do not seek it without."</em> - Buddha
			</p>
		</div>
		<p style="font-size: 16px; margin-top: 20px;">
			Find your calm. You deserve this time. 🌟
		</p>`,
			{ accent: '#a8edea 0%, #fed6e3 100%', headingColor: '#333' }
		)
	});
}

export async function sendVisitWarningEmail(
	to: string,
	name: string,
	personName: string,
	lastVisitDate: string,
	warningStatus: 'yellow' | 'critical'
) {
	const statusColor = warningStatus === 'critical' ? '#ef4444' : '#f59e0b';
	const statusText = warningStatus === 'critical' ? 'Critical Warning' : 'Yellow Warning';
	const reminderText =
		warningStatus === 'critical'
			? "It's been over a year! Consider scheduling a visit soon."
			: 'Consider scheduling a visit to encourage and commend.';

	await mailer.send({
		to,
		name,
		subject: `[Synapse] 👥 It's been a while since you saw ${personName}`,
		label: 'visit warning email',
		html: layout(
			'Visit Reminder',
			'👥 Visit Reminder',
			`
		<p style="font-size: 16px; margin-bottom: 20px;">Hi ${escapeHtml(name)},</p>
		<p style="font-size: 16px; margin-bottom: 20px;">
			It's been a while since you last saw <strong>${escapeHtml(personName)}</strong> (last visit: ${escapeHtml(lastVisitDate)}).
		</p>
		<div style="background: ${statusColor}; color: white; padding: 15px; border-radius: 8px; margin: 20px 0; text-align: center;">
			<p style="margin: 0; font-size: 16px; font-weight: 600;">
				Status: ${statusText}
			</p>
		</div>
		<p style="font-size: 16px; margin-bottom: 20px;">
			${reminderText}
		</p>${FLOCK_QUOTE}
		<p style="font-size: 16px; margin-top: 20px;">
			Relationships need nurturing. Maybe it's time for a visit! 💙
		</p>`,
			{ accent: '#4facfe 0%, #00f2fe 100%' }
		)
	});
}

export async function sendTasksDueTodayEmail(
	to: string,
	name: string,
	tasks: TasksDueTodayTaskSummary[],
	dateString: string
) {
	await mailer.send({
		to,
		name,
		subject: buildTasksDueTodayDigestTitle(dateString),
		label: 'tasks due today email',
		html: buildTasksDueTodayEmailHtml(name, tasks, dateString)
	});
}

export async function sendScheduledVisitReminderEmail(
	to: string,
	name: string,
	personName: string,
	followUpDate: string
) {
	await mailer.send({
		to,
		name,
		subject: `[Synapse] 📅 Upcoming visit with ${personName} in one week`,
		label: 'scheduled visit reminder email',
		html: layout(
			'Upcoming Visit Reminder',
			'📅 Upcoming Visit',
			`
		<p style="font-size: 16px; margin-bottom: 20px;">Hi ${escapeHtml(name)},</p>
		<p style="font-size: 16px; margin-bottom: 20px;">
			Just a reminder that you have a scheduled visit with <strong>${escapeHtml(personName)}</strong> coming up on <strong>${escapeHtml(followUpDate)}</strong> — that's one week from today!
		</p>
		<div style="background: #dbeafe; border-left: 4px solid #3b82f6; padding: 15px 20px; border-radius: 0 8px 8px 0; margin: 20px 0;">
			<p style="margin: 0; font-size: 16px; font-weight: 600; color: #1e40af;">
				📅 Visit scheduled for ${escapeHtml(followUpDate)}
			</p>
		</div>
		<p style="font-size: 16px; margin-bottom: 20px;">
			Now is a great time to plan and prepare for a meaningful visit.
		</p>${FLOCK_QUOTE}
		<p style="font-size: 16px; margin-top: 20px;">
			Looking forward to a great visit! 💙
		</p>`,
			{ accent: '#4facfe 0%, #00f2fe 100%' }
		)
	});
}

export async function sendVisitTodayReminderEmail(
	to: string,
	name: string,
	personName: string,
	formattedDate: string
) {
	await mailer.send({
		to,
		name,
		subject: `[Synapse] 🗓️ You have a visit with ${personName} today`,
		label: 'visit today reminder email',
		html: layout(
			'Visit Today Reminder',
			'🗓️ Visit Today',
			`
		<p style="font-size: 16px; margin-bottom: 20px;">Hi ${escapeHtml(name)},</p>
		<p style="font-size: 16px; margin-bottom: 20px;">
			This is a reminder that you have a scheduled visit with <strong>${escapeHtml(personName)}</strong> today, <strong>${escapeHtml(formattedDate)}</strong>.
		</p>
		<div style="background: #dcfce7; border-left: 4px solid #22c55e; padding: 15px 20px; border-radius: 0 8px 8px 0; margin: 20px 0;">
			<p style="margin: 0; font-size: 16px; font-weight: 600; color: #15803d;">
				🗓️ Visit with ${escapeHtml(personName)} — Today, ${escapeHtml(formattedDate)}
			</p>
		</div>
		<p style="font-size: 16px; margin-bottom: 20px;">
			Make it a great visit!
		</p>${FLOCK_QUOTE}`,
			{ accent: '#43e97b 0%, #38f9d7 100%' }
		)
	});
}
