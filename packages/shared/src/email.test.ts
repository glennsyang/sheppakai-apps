import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => ({
	send: vi.fn<(payload: Record<string, unknown>) => Promise<{ messageId?: string }>>()
}));

vi.mock('@getbrevo/brevo', () => ({
	BrevoClient: class {
		transactionalEmails = { sendTransacEmail: mockState.send };
	}
}));

import { createMailer, escapeHtml, renderEmailLayout } from './email';

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
	const logger = { info: vi.fn(), error: vi.fn() };
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
