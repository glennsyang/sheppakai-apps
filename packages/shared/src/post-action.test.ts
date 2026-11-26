import type { ActionResult } from '$app/forms';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { isSessionExpired, postAction } from './post-action';

// `$app/forms` resolves to test/app-forms-stub.ts, so bodies are plain JSON ActionResults.
function stubFetch(body: string) {
	const fetchMock = vi.fn<typeof fetch>(async () => new Response(body));
	vi.stubGlobal('fetch', fetchMock);
	return fetchMock;
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('postAction', () => {
	it('posts the form data to the named action with the x-sveltekit-action header', async () => {
		const fetchMock = stubFetch('{"type":"success","status":204}');
		const formData = new FormData();
		formData.set('id', 'task-1');

		await postAction('moveBoardTask', formData);

		expect(fetchMock).toHaveBeenCalledWith('?/moveBoardTask', {
			method: 'POST',
			headers: { 'x-sveltekit-action': 'true' },
			body: formData
		});
	});

	const results: Array<[string, ActionResult]> = [
		[
			'success',
			{
				type: 'success',
				status: 200,
				location: '/',
				data: { form: { message: { type: 'success', text: 'Saved' } } }
			}
		],
		['failure', { type: 'failure', status: 400, location: '/', data: { error: 'Invalid' } }],
		['redirect', { type: 'redirect', status: 303, location: '/login' }],
		['error', { type: 'error', status: 500, error: { message: 'Internal Error', status: 500 } }]
	];

	it.each(results)('returns a %s result unchanged', async (_type, result) => {
		stubFetch(JSON.stringify(result));

		await expect(postAction('reorderTopicQueue', new FormData())).resolves.toEqual(result);
	});
});

describe('isSessionExpired', () => {
	it('is true for a redirect and for a 401 failure', () => {
		expect(isSessionExpired({ type: 'redirect', status: 303, location: '/login' })).toBe(true);
		expect(
			isSessionExpired({
				type: 'failure',
				status: 401,
				location: '/',
				data: { error: 'Unauthorized' }
			})
		).toBe(true);
	});

	it('is false for success, other failures and errors', () => {
		expect(isSessionExpired({ type: 'success', status: 200, location: '/' })).toBe(false);
		expect(isSessionExpired({ type: 'failure', status: 400, location: '/' })).toBe(false);
		expect(
			isSessionExpired({ type: 'error', status: 500, error: { message: 'x', status: 500 } })
		).toBe(false);
	});
});
