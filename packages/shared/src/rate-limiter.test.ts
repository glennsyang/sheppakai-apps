import { zod4 } from 'sveltekit-superforms/adapters';
import { superValidate } from 'sveltekit-superforms/server';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { createAuthRateLimiter, createUserRateLimiter, rateLimitedMessage } from './rate-limiter';

describe('rateLimitedMessage', () => {
	it('returns a 429 form failure naming the retry delay', async () => {
		const form = await superValidate(zod4(z.object({ email: z.string() })));

		expect(rateLimitedMessage(form, 42)).toMatchObject({
			status: 429,
			data: {
				form: expect.objectContaining({
					message: {
						type: 'error',
						text: 'Too many attempts. Please try again in 42 seconds.'
					}
				})
			}
		});
	});
});

describe('limiter factories', () => {
	it('returns a fresh limiter per call so routes never share a bucket', () => {
		expect(createAuthRateLimiter()).not.toBe(createAuthRateLimiter());
		expect(createUserRateLimiter([5, 'm'])).not.toBe(createUserRateLimiter([5, 'm']));
	});
});
