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

import { sendAccountCreatedEmail } from '../../lib/server/email';

describe('sendAccountCreatedEmail', () => {
	const links = {
		appUrl: 'https://app.example.com',
		forgotPasswordUrl: 'https://app.example.com/forgot-password',
		profileUrl: 'https://app.example.com/profile'
	};
	beforeEach(() => {
		vi.clearAllMocks();
	});
	it('sends the sign-in instructions with a forgot-password link, not a password', async () => {
		sendMock.mockResolvedValueOnce({ messageId: '<created-1@brevo>' });

		await expect(sendAccountCreatedEmail('new@example.com', 'New', links)).resolves.toBeUndefined();

		const sent = (sendMock.mock.calls[0] as unknown[])[0] as {
			htmlContent: string;
		};
		expect(sent.htmlContent).toContain('href="https://app.example.com/forgot-password"');
		expect(sent.htmlContent).toContain('https://app.example.com/profile');
		expect(sent.htmlContent).toContain('12 characters');
		expect(sent.htmlContent).toContain('verification email');
		expect(loggerMock.info).toHaveBeenCalledWith('Account created email sent', {
			to: 'new@example.com',
			brevoMessageId: '<created-1@brevo>'
		});
	});
	it('escapes HTML in a malicious display name', async () => {
		sendMock.mockResolvedValueOnce({ messageId: '<created-1@brevo>' });

		await sendAccountCreatedEmail('new@example.com', '<img src=x onerror=1>', links);

		const sent = (sendMock.mock.calls[0] as unknown[])[0] as {
			htmlContent: string;
		};
		expect(sent.htmlContent).not.toContain('<img src=x');
		expect(sent.htmlContent).toContain('&lt;img src=x onerror=1&gt;');
	});
	it('throws and logs when the Brevo SDK rejects', async () => {
		sendMock.mockRejectedValueOnce(new Error('network down'));
		await expect(sendAccountCreatedEmail('new@example.com', 'New', links)).rejects.toThrow(
			'network down'
		);
		expect(loggerMock.error).toHaveBeenCalledWith(
			'Failed to send account created email',
			expect.any(Error),
			{ to: 'new@example.com' }
		);
	});
});
