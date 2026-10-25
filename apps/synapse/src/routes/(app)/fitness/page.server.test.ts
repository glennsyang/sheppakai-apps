import { readFileSync } from 'node:fs';

import { MAX_AI_IMAGE_BYTES } from '@sheppakai/shared/ai-vision';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { estimateMealMock, isEnabledMock, loggerMock } = vi.hoisted(() => ({
	estimateMealMock: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
	isEnabledMock: vi.fn<() => boolean>(),
	loggerMock: {
		debug: vi.fn<() => void>(),
		info: vi.fn<() => void>(),
		warn: vi.fn<() => void>(),
		error: vi.fn<() => void>()
	}
}));

const { mockInsertValues, mockOnConflictDoUpdate } = vi.hoisted(() => {
	const onConflictDoUpdate = vi.fn<(config: unknown) => Promise<void>>(async () => undefined);
	return {
		mockOnConflictDoUpdate: onConflictDoUpdate,
		mockInsertValues: vi.fn<(values: unknown) => unknown>(() => ({ onConflictDoUpdate }))
	};
});

vi.mock('#lib/server/db/index.js', () => ({
	getDb: () => ({
		insert: () => ({ values: mockInsertValues })
	})
}));
vi.mock('#lib/server/logger.js', () => ({ logger: loggerMock }));
vi.mock('$app/env/private', () => ({ ADMIN_USER_IDS: '' }));

// The prompt and provider call are tested in src/lib/server/meal-estimate; this covers the action.
vi.mock('#lib/server/meal-estimate/index.js', async (importOriginal) => {
	const actual = await importOriginal<typeof import('#lib/server/meal-estimate/index.js')>();
	return { ...actual, isMealEstimateEnabled: isEnabledMock, estimateMeal: estimateMealMock };
});

const { UnreadableMealError } = await import('#lib/server/meal-estimate/index.js');
const { actions } = await import('./+page.server');

const USER = { id: 'user-1', name: 'Alice', email: 'alice@example.com', role: 'user' };

function post(fields: Record<string, string>) {
	return new Request('https://synapse.example.com/fitness?/setCalorieTarget', {
		method: 'POST',
		body: new URLSearchParams(fields)
	});
}

describe('fitness setCalorieTarget action', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('upserts the target in a single statement and answers with a success message', async () => {
		const result = await actions.setCalorieTarget({
			request: post({ targetCalories: '2200' }),
			locals: { user: USER }
		} as never);

		expect(mockInsertValues).toHaveBeenCalledWith(
			expect.objectContaining({ userId: USER.id, targetCalories: 2200 })
		);
		expect(mockOnConflictDoUpdate).toHaveBeenCalledWith(
			expect.objectContaining({ set: expect.objectContaining({ targetCalories: 2200 }) })
		);
		expect(result).toMatchObject({
			form: {
				valid: true,
				data: { targetCalories: 2200 },
				message: { type: 'success', text: 'Calorie target set.' }
			}
		});
	});

	it('returns a 500 message when the upsert fails', async () => {
		mockOnConflictDoUpdate.mockRejectedValueOnce(new Error('db down'));

		const result = await actions.setCalorieTarget({
			request: post({ targetCalories: '1800' }),
			locals: { user: USER }
		} as never);

		expect(result).toMatchObject({ status: 500, data: { form: { message: { type: 'error' } } } });
	});
});

const estimate = {
	description: 'Chicken burrito with rice and beans',
	caloriesEstimate: 900,
	caloriesLow: 750,
	caloriesHigh: 1100
};

let userCounter = 0;

function estimateEvent(
	{ photo, note }: { photo?: File; note?: string },
	userId = `user-${++userCounter}`
) {
	const body = new FormData();
	if (photo) body.set('photo', photo);
	if (note !== undefined) body.set('note', note);
	return {
		request: new Request('https://synapse.example.com/fitness?/estimateMeal', {
			method: 'POST',
			body
		}),
		locals: { user: { ...USER, id: userId } },
		getClientAddress: () => '127.0.0.1',
		url: new URL('https://synapse.example.com/fitness?/estimateMeal'),
		cookies: { get: () => undefined, set: () => undefined }
	} as never;
}

const jpeg = () => new File(['image'], 'meal.jpg', { type: 'image/jpeg' });

type ActionOutcome = {
	status?: number;
	data?: { form: { data: unknown; message: App.Superforms.Message } };
	form?: { data: unknown; message: App.Superforms.Message };
};

async function runEstimate(event: never): Promise<ActionOutcome> {
	return (await actions.estimateMeal(event)) as ActionOutcome;
}

describe('fitness estimateMeal action', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		isEnabledMock.mockReturnValue(true);
		estimateMealMock.mockResolvedValue(estimate);
	});

	it('returns the estimate from a photo and note as the form data, saving nothing', async () => {
		const result = await runEstimate(estimateEvent({ photo: jpeg(), note: ' extra cheese ' }));

		expect(result.form?.data).toEqual(estimate);
		expect(result.form?.message.type).toBe('success');
		expect(estimateMealMock).toHaveBeenCalledWith({
			image: { mimeType: 'image/jpeg', base64: 'aW1hZ2U=' },
			note: 'extra cheese'
		});
		expect(mockInsertValues).not.toHaveBeenCalled();
	});

	it('estimates from a note alone, without an image', async () => {
		const result = await runEstimate(estimateEvent({ note: 'chicken burrito' }));

		expect(result.form?.message.type).toBe('success');
		expect(estimateMealMock).toHaveBeenCalledWith({ image: null, note: 'chicken burrito' });
	});

	it('refuses with 503 when estimating is not configured', async () => {
		isEnabledMock.mockReturnValue(false);
		const result = await runEstimate(estimateEvent({ note: 'toast' }));
		expect(result.status).toBe(503);
		expect(estimateMealMock).not.toHaveBeenCalled();
	});

	it('rejects an empty request, a non-image upload and an over-long note with 400', async () => {
		expect((await runEstimate(estimateEvent({ note: '   ' }))).status).toBe(400);
		const pdf = new File(['x'], 'meal.pdf', { type: 'application/pdf' });
		expect((await runEstimate(estimateEvent({ photo: pdf }))).status).toBe(400);
		expect((await runEstimate(estimateEvent({ note: 'x'.repeat(501) }))).status).toBe(400);
		expect(estimateMealMock).not.toHaveBeenCalled();
	});

	it('answers 422 with a retry hint when the meal is unreadable', async () => {
		estimateMealMock.mockRejectedValue(new UnreadableMealError('bad'));
		const result = await runEstimate(estimateEvent({ photo: jpeg() }));
		expect(result.status).toBe(422);
		expect(result.data?.form.message.text).toMatch(/clearer photo/);
	});

	it('answers 502 and logs when the provider fails', async () => {
		estimateMealMock.mockRejectedValue(new Error('status 500'));
		const result = await runEstimate(estimateEvent({ note: 'toast' }));
		expect(result.status).toBe(502);
		expect(loggerMock.error).toHaveBeenCalled();
	});

	it('rate-limits a user after 30 estimates in an hour', async () => {
		for (let i = 0; i < 30; i++) {
			expect(
				(await runEstimate(estimateEvent({ note: 'toast' }, 'busy-user'))).status
			).toBeUndefined();
		}
		expect((await runEstimate(estimateEvent({ note: 'toast' }, 'busy-user'))).status).toBe(429);
	});

	it('answers 413 when the upload body cannot be read (over BODY_SIZE_LIMIT)', async () => {
		const event = estimateEvent({ photo: jpeg() }) as { request: Request };
		event.request = {
			formData: () => Promise.reject(new Error('Content-length of 7000000 exceeds limit'))
		} as unknown as Request;
		const result = await runEstimate(event as never);
		expect(result.status).toBe(413);
		expect(estimateMealMock).not.toHaveBeenCalled();
	});

	it('returns 401 without a signed-in user', async () => {
		const event = estimateEvent({ note: 'toast' });
		(event as { locals: App.Locals }).locals = { user: null, session: null };
		expect((await runEstimate(event)).status).toBe(401);
	});
});

// adapter-node rejects bodies over BODY_SIZE_LIMIT (default 512K) before the action reads them,
// and `vite dev` doesn't enforce it, so a drift here only shows up in production.
describe('fly.toml BODY_SIZE_LIMIT', () => {
	it('leaves room for a MAX_AI_IMAGE_BYTES photo plus multipart overhead', () => {
		const flyToml = readFileSync(new URL('../../../../fly.toml', import.meta.url), 'utf8');
		const match = flyToml.match(/^\s*BODY_SIZE_LIMIT\s*=\s*'(\d+)([KMG]?)'/m);
		expect(match, 'BODY_SIZE_LIMIT must be set in fly.toml [env]').not.toBeNull();
		const [, amount, unit] = match as RegExpMatchArray;
		const multiplier = { '': 1, K: 1024, M: 1024 ** 2, G: 1024 ** 3 }[unit] ?? 1;
		expect(Number(amount) * multiplier).toBeGreaterThan(MAX_AI_IMAGE_BYTES + 64 * 1024);
	});
});
