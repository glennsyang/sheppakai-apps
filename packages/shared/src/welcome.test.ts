import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createWelcomeSender, WELCOME_LINK_TTL_MS, type WelcomeEmailPayload } from './welcome';

const NOW = new Date('2026-01-01T00:00:00Z');

function setup(sendImpl: () => Promise<void> = async () => {}) {
	const createVerificationValue = vi.fn<
		(data: { identifier: string; value: string; expiresAt: Date }) => Promise<unknown>
	>(async () => ({}));
	const sendWelcomeEmail = vi.fn<(payload: WelcomeEmailPayload) => Promise<void>>(sendImpl);
	const sendWelcome = createWelcomeSender({
		auth: { $context: Promise.resolve({ internalAdapter: { createVerificationValue } }) },
		baseUrl: 'https://app.example.com',
		sendWelcomeEmail
	});
	return { sendWelcome, createVerificationValue, sendWelcomeEmail };
}

const user = { id: 'user-1', email: 'new@example.com', name: 'New User' };

describe('createWelcomeSender', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(NOW);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('writes a reset-password verification row that expires in 24 hours', async () => {
		const { sendWelcome, createVerificationValue } = setup();

		await sendWelcome(user);

		expect(createVerificationValue).toHaveBeenCalledOnce();
		const row = createVerificationValue.mock.calls[0]![0];
		expect(row.identifier).toMatch(/^reset-password:[\w-]{32}$/);
		expect(row.value).toBe('user-1');
		expect(row.expiresAt.getTime()).toBe(NOW.getTime() + WELCOME_LINK_TTL_MS);
	});

	it('emails a set-password link carrying the same token, plus the sign-in URL', async () => {
		const { sendWelcome, createVerificationValue, sendWelcomeEmail } = setup();

		await sendWelcome(user);

		const token = createVerificationValue.mock.calls[0]![0].identifier.slice(
			'reset-password:'.length
		);
		expect(sendWelcomeEmail).toHaveBeenCalledWith({
			to: 'new@example.com',
			name: 'New User',
			setPasswordUrl: `https://app.example.com/api/auth/reset-password/${token}?callbackURL=%2Freset-password`,
			signInUrl: 'https://app.example.com/sign-in'
		});
	});

	it('mints a fresh token on every send', async () => {
		const { sendWelcome, createVerificationValue } = setup();

		await sendWelcome(user);
		await sendWelcome(user);

		const [first, second] = createVerificationValue.mock.calls.map(([row]) => row.identifier);
		expect(first).not.toBe(second);
	});

	it('throws when the email send fails', async () => {
		const { sendWelcome } = setup(async () => {
			throw new Error('brevo down');
		});

		await expect(sendWelcome(user)).rejects.toThrow('brevo down');
	});
});
