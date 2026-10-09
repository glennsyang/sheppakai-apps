import { BREVO_API_KEY, BREVO_FROM_ADDRESS } from '$app/env/private';
import { FORGOT_PASSWORD_ROUTE } from '$lib/auth-routes';
import {
	buildTasksDueTodayDigestTitle,
	buildTasksDueTodayEmailHtml,
	type TasksDueTodayTaskSummary
} from '$lib/server/email/tasks-due-today-digest';
import { logger } from '$lib/server/logger';
import { getWorkoutEmoji } from '$lib/utils/workout';
import {
	createMailer,
	escapeHtml,
	renderEmailLayout,
	type EmailLayoutOptions
} from '@sheppakai/shared/email';

const mailer = createMailer({
	apiKey: BREVO_API_KEY,
	from: BREVO_FROM_ADDRESS,
	appName: 'Synapse',
	logger
});

const SYNAPSE_EMAIL_FOOTER = 'Synapse - Your Personal Second Brain';

const BUTTON_STYLE =
	'background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block; font-size: 16px;';

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

export async function sendVerificationEmail(to: string, name: string, verificationUrl: string) {
	await mailer.send({
		to,
		name,
		subject: '[Synapse] Verify your email address',
		label: 'verification email',
		html: layout(
			'Verify your email',
			'Welcome to Synapse',
			`
		<p style="font-size: 16px; margin-bottom: 20px;">Hi ${escapeHtml(name)},</p>
		<p style="font-size: 16px; margin-bottom: 20px;">
			Thanks for signing up! Please verify your email address to get started with your second brain.
		</p>
		<div style="text-align: center; margin: 30px 0;">
			<a href="${escapeHtml(verificationUrl)}" style="${BUTTON_STYLE}">Verify Email Address</a>
		</div>
		<p style="font-size: 14px; color: #6b7280; margin-top: 30px;">
			If you didn't create an account, you can safely ignore this email.
		</p>
		<p style="font-size: 14px; color: #6b7280; margin-top: 10px;">
			This link will expire in 24 hours.
		</p>`
		)
	});
}

export async function sendPasswordResetEmail(to: string, name: string, resetUrl: string) {
	await mailer.send({
		to,
		name,
		subject: '[Synapse] Reset your password',
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
			This link will expire in 1 hour for security reasons.
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

/** Security notice sent after a password change or reset, so an unexpected change gets noticed. */
export async function sendPasswordChangedEmail(payload: PasswordChangedEmailPayload) {
	const changedAtText = escapeHtml(payload.changedAt.toLocaleString());
	const ipAddress = escapeHtml(payload.ipAddress || 'Unavailable');
	const userAgent = escapeHtml(payload.userAgent || 'Unavailable');
	const source = escapeHtml(payload.source || 'Account settings');

	await mailer.send({
		to: payload.to,
		name: payload.name,
		subject: '[Synapse] Your password was changed',
		label: 'password changed email',
		html: layout(
			'Password changed',
			'Password Updated',
			`
		<p style="font-size: 16px; margin-bottom: 20px;">Hi ${escapeHtml(payload.name)},</p>
		<p style="font-size: 16px; margin-bottom: 20px;">
			Your Synapse password was successfully changed.
		</p>
		<p style="font-size: 14px; margin-bottom: 8px;"><strong>When:</strong> ${changedAtText}</p>
		<p style="font-size: 14px; margin-bottom: 8px;"><strong>Source:</strong> ${source}</p>
		<p style="font-size: 14px; margin-bottom: 8px;"><strong>IP:</strong> ${ipAddress}</p>
		<p style="font-size: 14px; margin-bottom: 20px;"><strong>Device:</strong> ${userAgent}</p>
		<p style="font-size: 14px; color: #6b7280; margin-top: 20px;">
			If this wasn't you, reset your password immediately.
		</p>`
		)
	});
}

/**
 * Sent when an admin creates an account. Links to the forgot-password page rather than
 * embedding a reset token, since reset tokens expire in 10 minutes and this email may sit
 * unread for much longer.
 */
export async function sendWelcomeEmail(to: string, name: string, appUrl: string) {
	const baseUrl = escapeHtml(new URL(appUrl).origin);
	const forgotPasswordUrl = `${baseUrl}${FORGOT_PASSWORD_ROUTE}`;
	const profileUrl = `${baseUrl}/profile`;

	await mailer.send({
		to,
		name,
		subject: '[Synapse] Your account is ready',
		label: 'welcome email',
		html: layout(
			'Your Synapse account',
			'Welcome to Synapse',
			`
		<p style="font-size: 16px; margin-bottom: 20px;">Hi ${escapeHtml(name)},</p>
		<p style="font-size: 16px; margin-bottom: 20px;">
			An account has been created for you on Synapse at
			<a href="${baseUrl}" style="color: #667eea;">${baseUrl}</a>.
		</p>
		<p style="font-size: 16px; margin-bottom: 10px;"><strong>To sign in for the first time:</strong></p>
		<ol style="font-size: 16px; margin: 0 0 20px; padding-left: 20px;">
			<li>Open the <strong>Forgot password</strong> page using the button below.</li>
			<li>Enter this email address (${escapeHtml(to)}) and follow the link we send you to set your own password (at least 12 characters). No password has been shared with anyone.</li>
			<li>Sign in. The first time, we'll send you a verification email &mdash; click the link in it to finish setting up your account.</li>
		</ol>
		<div style="text-align: center; margin: 30px 0;">
			<a href="${forgotPasswordUrl}" style="${BUTTON_STYLE}">Set your password</a>
		</div>
		<p style="font-size: 14px; color: #6b7280; margin-top: 30px;">
			You can change your password any time from your <a href="${profileUrl}" style="color: #667eea;">profile page</a>.
		</p>
		<p style="font-size: 14px; color: #6b7280; margin-top: 10px;">
			If you weren't expecting this, you can safely ignore this email.
		</p>`
		)
	});
}

export async function sendNewUserEmail(to: string, name: string) {
	await mailer.send({
		to,
		name,
		subject: '[Synapse] New User was registered!',
		label: 'new user email',
		html: `Hi ${escapeHtml(name || to)}!<br><br>Welcome to Synapse! We're excited to have you on board.<br><br>Thank you,<br>Synapse Team`
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
