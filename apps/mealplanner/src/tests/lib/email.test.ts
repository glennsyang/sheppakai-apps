import { describe, it, expect, beforeEach, vi } from 'vitest';

const { sendMock, loggerMock } = vi.hoisted(() => ({
	sendMock: vi.fn<() => Promise<unknown>>(),
	loggerMock: {
		debug: vi.fn<() => void>(),
		info: vi.fn<() => void>(),
		warn: vi.fn<() => void>(),
		error: vi.fn<() => void>()
	}
}));

vi.mock('$app/env/private', () => ({
	BREVO_API_KEY: 'xkeysib_test_key',
	BREVO_FROM_ADDRESS: 'test@example.com'
}));

vi.mock('@getbrevo/brevo', () => ({
	BrevoClient: class {
		transactionalEmails = { sendTransacEmail: sendMock };
	}
}));

vi.mock('../../lib/server/logger', () => ({ logger: loggerMock }));

import { sendWelcomeEmail } from '../../lib/server/email';

describe('sendWelcomeEmail', () => {
	const payload = {
		to: 'new@example.com',
		name: 'New',
		setPasswordUrl:
			'https://app.example.com/api/auth/reset-password/tok?callbackURL=%2Freset-password',
		signInUrl: 'https://app.example.com/sign-in'
	};
	beforeEach(() => {
		vi.clearAllMocks();
	});
	it('sends a set-password link and the sign-in URL, not a password', async () => {
		sendMock.mockResolvedValueOnce({ messageId: '<created-1@brevo>' });

		await expect(sendWelcomeEmail(payload)).resolves.toBeUndefined();

		const sent = (sendMock.mock.calls[0] as unknown[])[0] as {
			htmlContent: string;
		};
		expect(sent.htmlContent).toContain(
			'href="https://app.example.com/api/auth/reset-password/tok?callbackURL=%2Freset-password"'
		);
		expect(sent.htmlContent).toContain('href="https://app.example.com/sign-in"');
		expect(sent.htmlContent).toContain('72 hours');
		expect(sent.htmlContent).toContain('12 characters');
		expect(sent.htmlContent).toContain('verification email');
		expect(loggerMock.info).toHaveBeenCalledWith('Welcome email sent', {
			to: 'new@example.com',
			brevoMessageId: '<created-1@brevo>'
		});
	});
	it('escapes HTML in a malicious display name', async () => {
		sendMock.mockResolvedValueOnce({ messageId: '<created-1@brevo>' });

		await sendWelcomeEmail({ ...payload, name: '<img src=x onerror=1>' });

		const sent = (sendMock.mock.calls[0] as unknown[])[0] as {
			htmlContent: string;
		};
		expect(sent.htmlContent).not.toContain('<img src=x');
		expect(sent.htmlContent).toContain('&lt;img src=x onerror=1&gt;');
	});
	it('throws and logs when the Brevo SDK rejects', async () => {
		sendMock.mockRejectedValueOnce(new Error('network down'));
		await expect(sendWelcomeEmail(payload)).rejects.toThrow('network down');
		expect(loggerMock.error).toHaveBeenCalledWith(
			'Failed to send welcome email',
			expect.any(Error),
			{ to: 'new@example.com' }
		);
	});
});
