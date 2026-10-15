import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => ({
	send: vi.fn<(payload: Record<string, unknown>) => Promise<{ messageId?: string }>>()
}));

vi.mock('@getbrevo/brevo', () => ({
	BrevoClient: class {
		transactionalEmails = { sendTransacEmail: mockState.send };
	}
}));

import {
	createAuthEmails,
	createMailer,
	escapeHtml,
	renderEmailLayout,
	type SendEmailOptions
} from './email';

describe('escapeHtml', () => {
	it('escapes all five HTML-significant characters', () => {
		expect(escapeHtml(`<a href="x" title='y'>&</a>`)).toBe(
			'&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;'
		);
	});

	it('leaves plain text unchanged', () => {
		expect(escapeHtml('Jane Doe')).toBe('Jane Doe');
	});
});

describe('renderEmailLayout', () => {
	const base = {
		title: 'Verify your email',
		heading: 'Welcome',
		body: '<p>Hi <strong>there</strong></p>',
		footer: 'Test App'
	};

	it('renders the shell with the default accent, heading color and width', () => {
		const html = renderEmailLayout(base);

		expect(html).toContain('<!DOCTYPE html>');
		expect(html).toContain('<title>Verify your email</title>');
		expect(html).toContain('linear-gradient(135deg, #667eea 0%, #764ba2 100%)');
		expect(html).toContain('<h1 style="color: white; margin: 0; font-size: 28px;">Welcome</h1>');
		expect(html).toContain('max-width: 600px');
		expect(html).toContain('<p>Test App</p>');
	});

	it('keeps the body as raw HTML', () => {
		expect(renderEmailLayout(base)).toContain('<p>Hi <strong>there</strong></p>');
	});

	it('escapes the title, heading, subheading and footer', () => {
		const html = renderEmailLayout({
			...base,
			title: '<t>',
			heading: '<script>alert(1)</script>',
			subheading: '<b>sub</b>',
			footer: '<i>foot</i>'
		});

		expect(html).not.toContain('<script>');
		expect(html).toContain('<title>&lt;t&gt;</title>');
		expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
		expect(html).toContain('&lt;b&gt;sub&lt;/b&gt;');
		expect(html).toContain('<p>&lt;i&gt;foot&lt;/i&gt;</p>');
	});

	it('omits the subheading line when none is given', () => {
		expect(renderEmailLayout(base)).not.toContain('color: #e5e7eb');
	});

	it('applies a custom accent, heading color and width', () => {
		const html = renderEmailLayout({
			...base,
			accent: '#f093fb 0%, #f5576c 100%',
			headingColor: '#333',
			maxWidth: '720px'
		});

		expect(html).toContain('linear-gradient(135deg, #f093fb 0%, #f5576c 100%)');
		expect(html).toContain('<h1 style="color: #333;');
		expect(html).toContain('max-width: 720px');
	});
});

describe('createMailer', () => {
	const logger = { info: vi.fn<() => void>(), error: vi.fn<() => void>() };
	const mailer = createMailer({
		apiKey: 'key',
		from: 'from@example.com',
		appName: 'Test App',
		logger
	});
	const email = {
		to: 'user@example.com',
		name: 'User',
		subject: 'Subject',
		html: '<p>hi</p>',
		label: 'verification email'
	};

	beforeEach(() => {
		mockState.send.mockReset();
		logger.info.mockReset();
		logger.error.mockReset();
	});

	it('sends from the app and logs the Brevo message ID', async () => {
		mockState.send.mockResolvedValue({ messageId: 'msg-1' });

		await mailer.send(email);

		expect(mockState.send).toHaveBeenCalledWith({
			sender: { name: 'Test App', email: 'from@example.com' },
			to: [{ email: 'user@example.com', name: 'User' }],
			subject: 'Subject',
			htmlContent: '<p>hi</p>'
		});
		expect(logger.info).toHaveBeenCalledWith('Sending verification email', {
			to: 'user@example.com'
		});
		expect(logger.info).toHaveBeenCalledWith('Verification email sent', {
			to: 'user@example.com',
			brevoMessageId: 'msg-1'
		});
	});

	it('logs and rethrows a Brevo error', async () => {
		const failure = new Error('Brevo down');
		mockState.send.mockRejectedValue(failure);

		await expect(mailer.send(email)).rejects.toBe(failure);
		expect(logger.error).toHaveBeenCalledWith('Failed to send verification email', failure, {
			to: 'user@example.com'
		});
	});

	it('wraps a non-Error rejection in an Error with the cause', async () => {
		mockState.send.mockRejectedValue('boom');

		const error = await mailer.send(email).catch((err: unknown) => err);

		expect(error).toBeInstanceOf(Error);
		expect((error as Error).message).toBe('Brevo request failed');
		expect((error as Error).cause).toBe('boom');
	});
});

describe('createAuthEmails', () => {
	const mailer = { send: vi.fn<(options: SendEmailOptions) => Promise<void>>() };
	const emails = createAuthEmails({ mailer, appName: 'Test App', footer: 'Test App - Footer' });
	const sent = () => mailer.send.mock.calls[0][0];

	beforeEach(() => {
		mailer.send.mockReset();
		mailer.send.mockResolvedValue(undefined);
	});

	it('sends the verification email with the link and the 1-hour expiry', async () => {
		await emails.sendVerificationEmail(
			'user@example.com',
			'User',
			'https://app/verify?token=a&b=1'
		);

		expect(sent().subject).toBe('[Test App] Verify your email address');
		expect(sent().label).toBe('verification email');
		expect(sent().html).toContain('href="https://app/verify?token=a&amp;b=1"');
		expect(sent().html).toContain('expire in 1 hour');
		expect(sent().html).toContain('Test App - Footer');
	});

	it('sends the reset email with the link and the 10-minute expiry', async () => {
		await emails.sendPasswordResetEmail('user@example.com', 'User', 'https://app/reset?token=xyz');

		expect(sent().subject).toBe('[Test App] Reset your password');
		expect(sent().html).toContain('href="https://app/reset?token=xyz"');
		expect(sent().html).toContain('expire in 10 minutes');
	});

	it('escapes user-controlled values in the password-changed email', async () => {
		await emails.sendPasswordChangedEmail({
			to: 'user@example.com',
			name: '<script>x</script>',
			changedAt: new Date('2026-01-01T00:00:00Z'),
			userAgent: '<img src=x onerror=alert(1)>',
			ipAddress: '"1.2.3.4"'
		});

		expect(sent().html).not.toContain('<script>');
		expect(sent().html).not.toContain('<img');
		expect(sent().html).toContain('&lt;script&gt;');
		expect(sent().html).toContain('&quot;1.2.3.4&quot;');
	});

	it('falls back to "Unavailable" and "Account settings" for omitted details', async () => {
		await emails.sendPasswordChangedEmail({
			to: 'user@example.com',
			name: 'User',
			changedAt: new Date()
		});

		expect(sent().html).toContain('<strong>IP:</strong> Unavailable');
		expect(sent().html).toContain('<strong>Source:</strong> Account settings');
	});

	it('greets the new user by email when they have no name, escaped', async () => {
		await emails.sendNewUserEmail('<b>@example.com', '');

		expect(sent().subject).toBe('[Test App] Welcome to Test App!');
		expect(sent().html).toContain('Hi &lt;b&gt;@example.com,');
	});

	it('defaults the footer to the app name', async () => {
		await createAuthEmails({ mailer, appName: 'Solo' }).sendNewUserEmail('a@b.c', 'A');

		expect(sent().html).toContain('<p>Solo</p>');
	});

	it('rethrows a mailer failure', async () => {
		mailer.send.mockRejectedValueOnce(new Error('network down'));

		await expect(
			emails.sendPasswordResetEmail('user@example.com', 'User', 'https://app/reset')
		).rejects.toThrow('network down');
	});
});
