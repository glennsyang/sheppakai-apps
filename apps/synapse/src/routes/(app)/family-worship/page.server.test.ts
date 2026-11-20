import { ApiWriteError } from '@sheppakai/shared/api-write';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const writes = vi.hoisted(() => ({
	createTopic: vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({})),
	updateTopic: vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({})),
	setTopicArchived: vi.fn<(...args: unknown[]) => Promise<void>>(async () => {}),
	deleteTopic: vi.fn<(...args: unknown[]) => Promise<void>>(async () => {}),
	setWeekTopic: vi.fn<(...args: unknown[]) => Promise<void>>(async () => {}),
	logSession: vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({})),
	updateSession: vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({})),
	deleteSession: vi.fn<(...args: unknown[]) => Promise<void>>(async () => {})
}));
const mockLoad = vi.hoisted(() =>
	vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({
		topics: [],
		sessions: [],
		upcoming: []
	}))
);

vi.mock('#lib/server/db/writes/family-worship.js', () => writes);
vi.mock('#lib/server/family-worship.js', () => ({ loadFamilyWorship: mockLoad }));
vi.mock('#lib/server/db/index.js', () => ({ getDb: () => ({}) }));
vi.mock('#lib/server/logger.js', () => ({
	logger: {
		debug: vi.fn<(...args: unknown[]) => void>(),
		info: vi.fn<(...args: unknown[]) => void>(),
		warn: vi.fn<(...args: unknown[]) => void>(),
		error: vi.fn<(...args: unknown[]) => void>()
	}
}));

const { actions, load } = await import('./+page.server');

const userId = 'user-a';
const locals = { user: { id: userId } } as App.Locals;

function formRequest(fields: Record<string, string>): Request {
	const formData = new FormData();
	for (const [key, value] of Object.entries(fields)) formData.append(key, value);
	return new Request('http://localhost/family-worship', { method: 'POST', body: formData });
}

type ActionName = keyof typeof actions;

function run(action: ActionName, fields: Record<string, string>) {
	return actions[action]({ request: formRequest(fields), locals } as never) as Promise<{
		status?: number;
		data?: { form?: { message?: { type: string; text: string } } };
		form?: { message?: { type: string; text: string } };
	}>;
}

const messageOf = (result: Awaited<ReturnType<typeof run>>) =>
	result.form?.message ?? result.data?.form?.message;

describe('family worship load', () => {
	it('returns a loadError instead of throwing when the DB read fails', async () => {
		mockLoad.mockRejectedValueOnce(new Error('db down'));
		const url = new URL('http://localhost/family-worship');
		const result = (await load({ locals, url, request: new Request(url) } as never)) as {
			loadError?: string;
			topics: unknown[];
		};
		expect(result.loadError).toMatch(/Failed to load/);
		expect(result.topics).toEqual([]);
	});
});

describe('family worship actions', () => {
	beforeEach(() => {
		for (const fn of Object.values(writes)) fn.mockClear();
	});

	it('createTopic splits links into an array for the caller', async () => {
		const result = await run('createTopic', {
			title: 'Jonah',
			links: 'https://wol.jw.org/a\nhttps://wol.jw.org/b'
		});
		expect(messageOf(result)?.type).toBe('success');
		expect(writes.createTopic).toHaveBeenCalledWith(
			userId,
			expect.objectContaining({
				title: 'Jonah',
				links: ['https://wol.jw.org/a', 'https://wol.jw.org/b']
			})
		);
	});

	it('createTopic rejects a non-http link without writing', async () => {
		const result = await run('createTopic', { title: 'Jonah', links: 'javascript:alert(1)' });
		expect(result.status).toBe(400);
		expect(writes.createTopic).not.toHaveBeenCalled();
	});

	it('updateTopic requires an id', async () => {
		const result = await run('updateTopic', { title: 'Jonah' });
		expect(result.status).toBe(400);
		expect(writes.updateTopic).not.toHaveBeenCalled();
	});

	it('logSession passes continueNextWeek through', async () => {
		await run('logSession', {
			status: 'done',
			date: '2026-11-18',
			topicId: 't1',
			continueNextWeek: 'on'
		});
		expect(writes.logSession).toHaveBeenCalledWith(
			userId,
			expect.objectContaining({ topicId: 't1', continueNextWeek: true, status: 'done' })
		);
	});

	it('logSession needs a topic for a done week', async () => {
		const result = await run('logSession', { status: 'done', date: '2026-11-18' });
		expect(result.status).toBe(400);
		expect(writes.logSession).not.toHaveBeenCalled();
	});

	it('maps a not-found write error to a 404 message', async () => {
		writes.setTopicArchived.mockRejectedValueOnce(
			new ApiWriteError('not_found', 'Topic not found.', 404)
		);
		const result = await run('archiveTopic', { id: 'missing' });
		expect(result.status).toBe(404);
		expect(messageOf(result)?.text).toBe('Topic not found.');
	});

	it('setWeekTopic with an empty topic clears the week', async () => {
		await run('setWeekTopic', { weekOf: '2026-11-25', topicId: '' });
		expect(writes.setWeekTopic).toHaveBeenCalledWith(userId, '2026-11-25', null);
	});
});
