import { formatDateMedium } from '$lib/utils/date';
import { escapeHtml, renderEmailLayout } from '@sheppakai/shared/email';

export const TASKS_DUE_TODAY_NOTIFICATION_TYPE = 'tasks_due_today_digest';
export const TASKS_DUE_TODAY_DIGEST_TAGS = 'round_pushpin';

export type TasksDueTodayTaskSummary = {
	id: string;
	taskNumber: number;
	title: string;
	priority: number;
	dueDate: string | null;
	state: string;
};

export function buildTasksDueTodayDigestTitle(dateString: string): string {
	return `Synapse - Tasks Due Today for ${formatDateMedium(dateString)}`;
}

function getPriorityLabel(priority: number): string {
	const labels: Record<number, string> = {
		1: 'Highest priority',
		2: 'High priority',
		3: 'Medium priority',
		4: 'Low priority'
	};

	return labels[priority] ?? 'Priority task';
}

function toTaskBullet(task: TasksDueTodayTaskSummary): string {
	return `• ${task.title}`;
}

export function buildTasksDueTodayDigestMessage(
	tasks: TasksDueTodayTaskSummary[],
	dateString: string
): string {
	if (tasks.length === 0) {
		return `🗂️ No tasks are due today for ${formatDateMedium(dateString)}. Keep your momentum steady.`;
	}

	const taskList = tasks.map(toTaskBullet).join('\n');

	return `🗂️ These tasks are due today:\n\n${taskList}\n\nStay focused and keep your momentum moving.`;
}

export function buildTasksDueTodayEmailHtml(
	name: string,
	tasks: TasksDueTodayTaskSummary[],
	dateString: string
): string {
	const taskListMarkup = tasks
		.map(
			(task) => `
				<li style="margin-bottom: 16px; padding: 16px; border-radius: 12px; background: #ffffff; border: 1px solid #e5e7eb;">
					<div style="font-size: 14px; color: #6b7280; margin-bottom: 6px;">Task #${task.taskNumber}</div>
					<div style="font-size: 16px; font-weight: 600; color: #111827; margin-bottom: 6px;">${escapeHtml(task.title)}</div>
					<div style="font-size: 14px; color: #4b5563;">${getPriorityLabel(task.priority)}</div>
				</li>
			`
		)
		.join('');

	return renderEmailLayout({
		title: 'Tasks Due Today',
		heading: '🗂️ Tasks Due Today',
		footer: 'Synapse - Your Personal Second Brain',
		accent: '#0f766e 0%, #14b8a6 100%',
		body: `
		<p style="font-size: 16px; margin-bottom: 20px;">Hi ${escapeHtml(name)},</p>
		<p style="font-size: 16px; margin-bottom: 20px;">
			Here is your tasks due-today snapshot for <strong>${escapeHtml(formatDateMedium(dateString))}</strong>.
		</p>
		<ul style="list-style: none; padding: 0; margin: 24px 0;">
			${taskListMarkup}
		</ul>
		<div style="background: #e5e7eb; padding: 20px; border-radius: 8px; margin: 20px 0;">
			<p style="margin: 0; font-size: 14px; color: #4b5563;">
				🎯 Clear the urgent work first, then use the rest of the day to create margin.
			</p>
		</div>`
	});
}
