// The handler itself is tested in @sheppakai/shared. This guards the app-side contract:
// both payload shapes must render in this app's AuthFormMessage banner.
import AuthFormMessage from '$lib/components/AuthFormMessage.svelte';
import { render } from 'svelte/server';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { handleAuthFormAction, invalidAuthForm } from './auth-form-handler';

type MessagePayload = { data: { form: { message: App.Superforms.Message } } };

const testSchema = z.object({
	email: z.string().email()
});

function renderBanner(result: unknown) {
	const { message } = (result as MessagePayload).data.form;
	return render(AuthFormMessage, { props: { message } }).body;
}

describe('auth form payloads', () => {
	it('invalidAuthForm produces a banner AuthFormMessage can render', async () => {
		const form = await superValidate(zod4(testSchema));

		const html = renderBanner(invalidAuthForm(form));

		expect(html).toContain('Please correct the errors in the form.');
		expect(html).toContain('role="alert"');
	});

	it('handleAuthFormAction produces a banner AuthFormMessage can render', async () => {
		// Regression guard: register and reset-password sent an object while
		// the pages called `.includes()` on it, throwing "includes is not a function".
		const form = await superValidate(zod4(testSchema));
		const result = await handleAuthFormAction(
			form,
			async () => {
				throw new Error('boom');
			},
			{ loggerContext: 'test', fallbackMessage: 'Registration failed. Please try again.' }
		);

		const html = renderBanner(result);

		expect(html).toContain('Registration failed. Please try again.');
		expect(html).toContain('role="alert"');
	});
});
