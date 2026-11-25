import {
	EMAIL_BUTTON_STYLE,
	escapeHtml,
	renderEmailLayout,
	type EmailLayoutOptions
} from '@sheppakai/shared/email';

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

const FAMILY_WORSHIP_ACCENT = '#f6d365 0%, #fda085 100%';

function familyWorshipButton(url: string, label: string): string {
	return `
		<div style="text-align: center; margin: 30px 0;">
			<a href="${escapeHtml(url)}" style="${EMAIL_BUTTON_STYLE}">${escapeHtml(label)}</a>
		</div>`;
}

/** Monday evening, when this week has no Planned Week yet. */
export function buildPlanningReminderEmail(
	name: string,
	suggestedTopic: string | null,
	familyWorshipUrl: string
): EmailContent {
	const suggestion = suggestedTopic
		? `The next topic in your Topic Queue is <strong>${escapeHtml(suggestedTopic)}</strong>. You can plan it with one tap, or choose another.`
		: 'Your Topic Queue is empty, so add a topic and plan it for this week.';
	return {
		subject: "[Synapse] 📖 Plan this week's family worship",
		label: 'family worship planning reminder email',
		html: layout(
			'Planning Reminder',
			'📖 Plan Family Worship',
			`
		<p style="font-size: 16px; margin-bottom: 20px;">Hi ${escapeHtml(name)},</p>
		<p style="font-size: 16px; margin-bottom: 20px;">
			This week doesn't have a Planned Week yet. ${suggestion}
		</p>
		<p style="font-size: 16px; margin-bottom: 20px;">
			Not studying this week? Mark it as a Skipped Week and this reminder won't come back.
		</p>${familyWorshipButton(familyWorshipUrl, 'Plan this week')}`,
			{ accent: FAMILY_WORSHIP_ACCENT }
		)
	};
}

/** The morning after the Usual Weekday, when that week has no session logged. */
export function buildLoggingReminderEmail(
	name: string,
	plannedTopic: string | null,
	familyWorshipUrl: string
): EmailContent {
	const topic = plannedTopic
		? `The Planned Week's topic was <strong>${escapeHtml(plannedTopic)}</strong>.`
		: 'This week had no Planned Week.';
	return {
		subject: "[Synapse] 📖 Log this week's family worship",
		label: 'family worship logging reminder email',
		html: layout(
			'Logging Reminder',
			'📖 Log Family Worship',
			`
		<p style="font-size: 16px; margin-bottom: 20px;">Hi ${escapeHtml(name)},</p>
		<p style="font-size: 16px; margin-bottom: 20px;">
			No family worship session is logged for this week yet. ${topic} Log it while you still remember.
		</p>
		<p style="font-size: 16px; margin-bottom: 20px;">
			Didn't study this week? Mark it as a Skipped Week instead.
		</p>${familyWorshipButton(familyWorshipUrl, 'Log the session')}`,
			{ accent: FAMILY_WORSHIP_ACCENT }
		)
	};
}
