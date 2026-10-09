import { redirect } from '@sveltejs/kit';
import { zod4 } from 'sveltekit-superforms/adapters';
import { superValidate } from 'sveltekit-superforms/server';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { createAuthFormHandler, invalidAuthForm } from './auth-form-handler';

const logger = { error: vi.fn() };
const getErrorMessage = vi.fn((_error: unknown, fallback: string) => fallback);
const handleAuthFormAction = createAuthFormHandler({ logger, getErrorMessage });

const testSchema = z.object({
	email: z.string().email()
});

describe('invalidAuthForm', () => {
	it('returns a 400 form failure carrying a renderable error banner', async () => {
		const form = await superValidate(zod4(testSchema));

		expect(invalidAuthForm(form)).toMatchObject({
			status: 400,
			data: {
				form: expect.objectContaining({
					valid: false,
					message: { type: 'error', text: 'Please correct the errors in the form.' }
				})
			}
		});
	});

	it('honours a custom message text', async () => {
		const form = await superValidate(zod4(testSchema));

		expect(invalidAuthForm(form, 'That reset link is no longer valid.')).toMatchObject({
			data: {
				form: expect.objectContaining({
					message: { type: 'error', text: 'That reset link is no longer valid.' }
				})
			}
		});
	});
});

describe('handleAuthFormAction', () => {
	it('rethrows redirect errors without converting them to form failures', async () => {
		const form = await superValidate(zod4(testSchema));

		await expect(
			handleAuthFormAction(
				form,
				async () => {
					throw redirect(302, '/dashboard');
				},
				{
					loggerContext: 'test',
					fallbackMessage: 'fallback'
				}
			)
		).rejects.toMatchObject({
			status: 302,
			location: '/dashboard'
		});
	});

	it('returns a form failure payload for auth errors', async () => {
		const form = await superValidate(zod4(testSchema));
		const result = await handleAuthFormAction(
			form,
			async () => {
				throw new Error('boom');
			},
			{
				loggerContext: 'test',
				fallbackMessage: 'fallback'
			}
		);

		expect(result).toMatchObject({
			status: 400,
			data: {
				form: expect.objectContaining({
					valid: false,
					message: { type: 'error', text: 'fallback' }
				})
			}
		});
	});

	it('honours errorType so a route can keep failures indistinguishable from successes', async () => {
		const form = await superValidate(zod4(testSchema));
		const result = await handleAuthFormAction(
			form,
			async () => {
				throw new Error('boom');
			},
			{
				loggerContext: 'test',
				fallbackMessage: 'If an account exists with that email, you will receive a link.',
				errorType: 'success'
			}
		);

		expect(result).toMatchObject({
			data: {
				form: expect.objectContaining({
					message: {
						type: 'success',
						text: 'If an account exists with that email, you will receive a link.'
					}
				})
			}
		});
	});

	it('logs the error and uses the mapped Better Auth message', async () => {
		const form = await superValidate(zod4(testSchema));
		const failure = new Error('INVALID_EMAIL_OR_PASSWORD');
		getErrorMessage.mockReturnValueOnce('Invalid email or password.');

		const result = await handleAuthFormAction(
			form,
			async () => {
				throw failure;
			},
			{ loggerContext: 'Sign-in failed', fallbackMessage: 'fallback', status: 401 }
		);

		expect(logger.error).toHaveBeenCalledWith('Sign-in failed', failure);
		expect(getErrorMessage).toHaveBeenCalledWith(failure, 'fallback');
		expect(result).toMatchObject({
			status: 401,
			data: {
				form: expect.objectContaining({
					message: { type: 'error', text: 'Invalid email or password.' }
				})
			}
		});
	});
});
