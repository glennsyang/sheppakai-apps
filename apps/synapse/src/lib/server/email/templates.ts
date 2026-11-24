import { escapeHtml, renderEmailLayout, type EmailLayoutOptions } from '@sheppakai/shared/email';

import type { EmailContent } from '#lib/server/notification-jobs/notifier.js';
import { getWorkoutEmoji } from '#lib/utils/workout.js';

import {
	buildScheduledVisitReminderSubject,
	buildVisitTodayReminderSubject
} from './scheduled-visit-reminder-utils';
import {
	buildTasksDueTodayDigestTitle,
	buildTasksDueTodayEmailHtml,
	type TasksDueTodayTaskSummary
} from './tasks-due-today-digest';

/**
 * Reminder and digest email content. Pure builders: notification jobs hand the result to a
 * Notifier, which sends it (Brevo in production, a fake in tests).
 */

export const SYNAPSE_EMAIL_FOOTER = 'Synapse - Your Personal Second Brain';

const FLOCK_QUOTE = `
		<div style="background: #e5e7eb; padding: 20px; border-radius: 8px; margin: 20px 0;">
			<p style="margin: 0; font-size: 14px; color: #6b7280;">
				💡 <em>"You should know well the appearance of your flock. Take good care of your sheep."</em>
			</p>
		</div>`;

export function layout(
	title: string,
	heading: string,
	body: string,
	options: Pick<EmailLayoutOptions, 'accent' | 'headingColor'> = {}
): string {
	return renderEmailLayout({ title, heading, body, footer: SYNAPSE_EMAIL_FOOTER, ...options });
}

export function buildWorkoutReminderEmail(
	name: string,
	workoutType: string,
	time: string
): EmailContent {
	const emoji = getWorkoutEmoji(workoutType);

	return {
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
	};
}

export function buildMeditationReminderEmail(
	name: string,
	routineTitle: string,
	time: string
): EmailContent {
	return {
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
	};
}

export function buildVisitWarningEmail(
	name: string,
	personName: string,
	lastVisitDate: string,
	warningStatus: 'yellow' | 'critical'
): EmailContent {
	const statusColor = warningStatus === 'critical' ? '#ef4444' : '#f59e0b';
	const statusText = warningStatus === 'critical' ? 'Critical Warning' : 'Yellow Warning';
	const reminderText =
		warningStatus === 'critical'
			? "It's been over a year! Consider scheduling a visit soon."
			: 'Consider scheduling a visit to encourage and commend.';

	return {
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
	};
}

export function buildTasksDueTodayEmail(
	name: string,
	tasks: TasksDueTodayTaskSummary[],
	dateString: string
): EmailContent {
	return {
		subject: buildTasksDueTodayDigestTitle(dateString),
		label: 'tasks due today email',
		html: buildTasksDueTodayEmailHtml(name, tasks, dateString)
	};
}

export function buildScheduledVisitReminderEmail(
	name: string,
	personName: string,
	nextVisitDate: string
): EmailContent {
	return {
		subject: buildScheduledVisitReminderSubject(personName),
		label: 'scheduled visit reminder email',
		html: layout(
			'Upcoming Visit Reminder',
			'📅 Upcoming Visit',
			`
		<p style="font-size: 16px; margin-bottom: 20px;">Hi ${escapeHtml(name)},</p>
		<p style="font-size: 16px; margin-bottom: 20px;">
			Just a reminder that you have a scheduled visit with <strong>${escapeHtml(personName)}</strong> coming up on <strong>${escapeHtml(nextVisitDate)}</strong> — that's one week from today!
		</p>
		<div style="background: #dbeafe; border-left: 4px solid #3b82f6; padding: 15px 20px; border-radius: 0 8px 8px 0; margin: 20px 0;">
			<p style="margin: 0; font-size: 16px; font-weight: 600; color: #1e40af;">
				📅 Visit scheduled for ${escapeHtml(nextVisitDate)}
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
	};
}

export function buildVisitTodayReminderEmail(
	name: string,
	personName: string,
	formattedDate: string
): EmailContent {
	return {
		subject: buildVisitTodayReminderSubject(personName),
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
	};
}
