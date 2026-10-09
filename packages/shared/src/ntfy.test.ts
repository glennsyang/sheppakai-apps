import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { sendNtfy } from './ntfy';

describe('sendNtfy', () => {
	const fetchMock = vi.fn<(input: string, init?: RequestInit) => Promise<{ ok: boolean }>>();
	const logger = { info: vi.fn(), error: vi.fn() };

	beforeEach(() => {
		vi.stubGlobal('fetch', fetchMock);
		fetchMock.mockReset();
		logger.info.mockReset();
		logger.error.mockReset();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('POSTs the message with title, priority and tags headers', async () => {
		fetchMock.mockResolvedValue({ ok: true });

		const result = await sendNtfy('https://ntfy.example.com/topic', 'hello', {
			title: 'Alert',
			priority: 5,
			tags: 'date,point_right',
			logger
		});

		expect(result).toBe(true);
		expect(fetchMock).toHaveBeenCalledWith('https://ntfy.example.com/topic', {
			method: 'POST',
			body: 'hello',
			headers: { Title: 'Alert', Priority: '5', Tags: 'date,point_right' }
		});
	});

	it('defaults priority to 3 and tags to rotating_light', async () => {
		fetchMock.mockResolvedValue({ ok: true });

		await sendNtfy('https://ntfy.example.com/topic', 'hello', { title: 'Alert', logger });

		const [, init] = fetchMock.mock.calls[0];
		expect(init?.headers).toEqual({ Title: 'Alert', Priority: '3', Tags: 'rotating_light' });
	});

	it.each(['https://invalid/topic', 'https://alerts.invalid/topic'])(
		'skips an unset (.invalid) URL without fetching: %s',
		async (url) => {
			const result = await sendNtfy(url, 'user@example.com signed in', { title: 'Alert', logger });

			expect(result).toBe(false);
			expect(fetchMock).not.toHaveBeenCalled();
			expect(logger.info).toHaveBeenCalledWith('Alerts disabled (alerts URL unset); skipping', {
				title: 'Alert'
			});
		}
	);

	it('skips and logs an unparseable URL', async () => {
		const result = await sendNtfy('not a url', 'msg', { title: 'Alert', logger });

		expect(result).toBe(false);
		expect(fetchMock).not.toHaveBeenCalled();
		expect(logger.error).toHaveBeenCalledWith('Alerts URL is not a valid URL; skipping alert');
	});

	it('returns false when the server responds non-ok', async () => {
		fetchMock.mockResolvedValue({ ok: false });

		expect(await sendNtfy('https://ntfy.example.com/t', 'msg', { title: 'A', logger })).toBe(false);
		expect(logger.error).not.toHaveBeenCalled();
	});

	it('swallows and logs a network failure', async () => {
		const failure = new Error('ECONNREFUSED');
		fetchMock.mockRejectedValue(failure);

		expect(await sendNtfy('https://ntfy.example.com/t', 'msg', { title: 'A', logger })).toBe(false);
		expect(logger.error).toHaveBeenCalledWith('Notification failed', failure);
	});
});
