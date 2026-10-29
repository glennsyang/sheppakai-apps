import {
	BUDGET_API_KEY,
	BUDGET_API_URL,
	MEALPLANNER_API_KEY,
	MEALPLANNER_API_URL
} from '$app/env/private';
import { z } from 'zod';

import { logger } from '#lib/server/logger.js';

import { selectBillsDueThisWeek, type DigestBill } from './morning-digest';

const REMOTE_TIMEOUT_MS = 5000;

/** `ok: false` means the section is skipped: the app is unconfigured, unreachable or answered badly. */
type RemoteSection<T> = { ok: true; value: T } | { ok: false };

const planWeekSchema = z.object({
	data: z.object({
		days: z.array(
			z.object({
				date: z.string(),
				recipe: z.object({ name: z.string() }).nullable()
			})
		)
	})
});

const recurringListSchema = z.object({
	data: z.array(
		z.object({
			merchant: z.string(),
			description: z.string(),
			cadence: z.enum(['Monthly', 'Yearly']),
			amount: z.number(),
			paid: z.boolean(),
			dueDay: z.number().int().nullable(),
			dueMonth: z.number().int().nullable()
		})
	)
});

/** GETs another app's /api/v1 endpoint with its API key and parses the JSON envelope. */
async function fetchFromApp<T>(
	app: string,
	baseUrl: string | undefined,
	apiKey: string | undefined,
	path: string,
	schema: z.ZodType<T>
): Promise<RemoteSection<T>> {
	if (!baseUrl || !apiKey) {
		logger.debug(`Morning digest: ${app} API not configured; skipping section`);
		return { ok: false };
	}

	try {
		const response = await fetch(new URL(path, baseUrl), {
			headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
			signal: AbortSignal.timeout(REMOTE_TIMEOUT_MS)
		});
		if (!response.ok) {
			logger.warn(`Morning digest: ${app} API answered ${response.status}; skipping section`);
			return { ok: false };
		}

		const parsed = schema.safeParse(await response.json());
		if (!parsed.success) {
			logger.warn(`Morning digest: unexpected ${app} API response; skipping section`, {
				issues: parsed.error.issues.length
			});
			return { ok: false };
		}

		return { ok: true, value: parsed.data };
	} catch (error) {
		logger.warn(`Morning digest: ${app} API unreachable; skipping section`, { error });
		return { ok: false };
	}
}

/** Tonight's planned recipe name from mealplanner, or null when nothing is planned. */
export async function fetchTonightsDinner(today: string): Promise<RemoteSection<string | null>> {
	const result = await fetchFromApp(
		'mealplanner',
		MEALPLANNER_API_URL,
		MEALPLANNER_API_KEY,
		`/api/v1/plans?week=${today}`,
		planWeekSchema
	);
	if (!result.ok) return result;

	const tonight = result.value.data.days.find((day) => day.date === today);
	return { ok: true, value: tonight?.recipe?.name ?? null };
}

/** Unpaid budget bills due from today through the next six days. */
export async function fetchBillsDueThisWeek(today: string): Promise<RemoteSection<DigestBill[]>> {
	const result = await fetchFromApp(
		'budget',
		BUDGET_API_URL,
		BUDGET_API_KEY,
		'/api/v1/recurring',
		recurringListSchema
	);
	if (!result.ok) return result;

	return { ok: true, value: selectBillsDueThisWeek(result.value.data, today) };
}
