import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => ({
	send: vi.fn<(payload: { htmlContent: string }) => Promise<unknown>>(),
	loggerError: vi.fn<() => void>(),
	loggerDebug: vi.fn<() => void>()
}));

vi.mock('$app/env/private', () => ({
	BREVO_API_KEY: 'test-api-key',
	BREVO_FROM_ADDRESS: 'from@example.com'
}));

vi.mock('../logger', () => ({
	logger: {
		error: mockState.loggerError,
		debug: mockState.loggerDebug,
		info: vi.fn<() => void>()
	}
}));

vi.mock('@getbrevo/brevo', () => ({
	BrevoClient: class {
		transactionalEmails = { sendTransacEmail: mockState.send };
	}
}));

import { sendWeeklySummaryEmail, sendWelcomeEmail } from './index';

function sentHtml(): string {
	const [{ htmlContent }] = mockState.send.mock.calls[0];
	return htmlContent;
}

describe('sendWeeklySummaryEmail', () => {
	beforeEach(() => {
		mockState.send.mockReset();
		mockState.send.mockResolvedValue({ messageId: 'email-id' });
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('escapes HTML in a malicious category name', async () => {
		await sendWeeklySummaryEmail({
			to: 'user@example.com',
			name: 'Glenn',
			monthLabel: 'August 2026',
			overBudgetCategories: [
				{
					categoryName: '<img src=x onerror=alert(1)>',
					budgetAmount: 100,
					spentAmount: 150,
					overByAmount: 50
				}
			],
			nearLimitCategories: [],
			excludedTransactions: []
		});

		const html = sentHtml();
		expect(html).not.toContain('<img src=x onerror=alert(1)>');
		expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
	});

	it('escapes HTML in a malicious recipient name', async () => {
		await sendWeeklySummaryEmail({
			to: 'user@example.com',
			name: '<script>alert(1)</script>',
			monthLabel: 'August 2026',
			overBudgetCategories: [],
			nearLimitCategories: [],
			excludedTransactions: []
		});

		const html = sentHtml();
		expect(html).not.toContain('<script>alert(1)</script>');
		expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
	});

	it('lists excluded transactions with escaped payee and category', async () => {
		await sendWeeklySummaryEmail({
			to: 'user@example.com',
			name: 'Glenn',
			monthLabel: 'August 2026',
			overBudgetCategories: [],
			nearLimitCategories: [],
			excludedTransactions: [
				{
					date: '2026-08-03',
					payee: '<b>Airline</b>',
					categoryName: '<i>Travel</i>',
					amount: 400
				}
			]
		});

		const html = sentHtml();
		expect(html).toContain('Excluded From Budget');
		expect(html).toContain('2026-08-03');
		expect(html).not.toContain('<b>Airline</b>');
		expect(html).toContain('&lt;b&gt;Airline&lt;/b&gt;');
		expect(html).toContain('&lt;i&gt;Travel&lt;/i&gt;');
	});

	it('shows an empty state when nothing was excluded', async () => {
		await sendWeeklySummaryEmail({
			to: 'user@example.com',
			name: 'Glenn',
			monthLabel: 'August 2026',
			overBudgetCategories: [],
			nearLimitCategories: [],
			excludedTransactions: []
		});

		expect(sentHtml()).toContain('No transactions were excluded from the budget this month.');
	});
});

describe('sendWelcomeEmail', () => {
	const payload = {
		to: 'new@example.com',
		name: '<script>alert(1)</script>',
		setPasswordUrl:
			'https://budget.example.com/api/auth/reset-password/tok?callbackURL=%2Freset-password',
		signInUrl: 'https://budget.example.com/sign-in'
	};

	beforeEach(() => {
		mockState.send.mockReset();
		mockState.send.mockResolvedValue({ messageId: 'email-id' });
	});

	it('includes the set-password link and sign-in instructions, escaping the name', async () => {
		await sendWelcomeEmail(payload);

		const html = sentHtml();
		expect(html).toContain('href="https://budget.example.com/api/auth/reset-password/tok');
		expect(html).toContain('https://budget.example.com/sign-in');
		expect(html).toContain('Forgot password');
		expect(html).not.toContain('<script>alert(1)</script>');
		expect(html).toContain('&lt;script&gt;');
	});

	it('throws when Brevo fails so the caller can surface it', async () => {
		mockState.send.mockRejectedValue(new Error('brevo down'));

		await expect(sendWelcomeEmail(payload)).rejects.toThrow('brevo down');
	});
});
