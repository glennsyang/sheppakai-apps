import { and, desc, eq, like } from 'drizzle-orm';

import { journalFilterSchema, storedWeatherSchema } from '#lib/schemas/journal.js';
import { getUser } from '#lib/server/actions/auth-guard.js';
import { getDb } from '#lib/server/db/index.js';
import { journalEntries } from '#lib/server/db/schema/index.js';
import { safeParse } from '#lib/server/json.js';
import { logger } from '#lib/server/logger.js';

import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const filters = journalFilterSchema.safeParse({
		content: url.searchParams.get('content') ?? undefined,
		date: url.searchParams.get('date') ?? undefined,
		limit: url.searchParams.get('limit') ?? undefined
	});

	if (!filters.success) {
		logger.error('Invalid filter parameters', filters.error);
		return {
			entries: [],
			filters: { content: '', date: '' }
		};
	}

	const { content, date, limit } = filters.data;

	try {
		const db = getDb();
		const conditions = [eq(journalEntries.userId, getUser(locals).id)];

		if (date) {
			conditions.push(eq(journalEntries.date, date));
		}
		if (content?.trim()) {
			conditions.push(like(journalEntries.content, `%${content.trim()}%`));
		}

		const entries = await db.query.journalEntries.findMany({
			where: and(...conditions),
			orderBy: [desc(journalEntries.date)],
			limit
		});

		const parsedEntries = entries.map((entry: typeof journalEntries.$inferSelect) => ({
			...entry,
			weather: safeParse(entry.weather, storedWeatherSchema, null, 'journal.weather')
		}));

		return {
			entries: parsedEntries,
			filters: {
				content: content ?? '',
				date: date ?? ''
			}
		};
	} catch (error) {
		logger.error('Failed to load journal entries', error);
		return {
			entries: [],
			loadError: 'Failed to load journal entries. Please try refreshing the page.',
			filters: {
				content: content ?? '',
				date: date ?? ''
			}
		};
	}
};
