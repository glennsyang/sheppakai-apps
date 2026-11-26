import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as schema from '../../lib/server/db/schema';

vi.mock('../../lib/server/logger', () => ({
	logger: {
		debug: vi.fn<() => void>(),
		info: vi.fn<() => void>(),
		warn: vi.fn<() => void>(),
		error: vi.fn<() => void>()
	}
}));

let currentDb: ReturnType<typeof drizzle<typeof schema>>;
vi.mock('../../lib/server/db', () => ({ getDb: () => currentDb }));

const { actions } = await import('../../routes/(app)/planner/+page.server');

const MIGRATIONS = resolve(__dirname, '../../lib/server/db/migrations');
const TAGS: string[] = JSON.parse(
	readFileSync(resolve(MIGRATIONS, 'meta/_journal.json'), 'utf8')
).entries.map((e: { tag: string }) => e.tag);

function migrate(sqlite: Database.Database) {
	for (const tag of TAGS) {
		const sql = readFileSync(resolve(MIGRATIONS, `${tag}.sql`), 'utf8');
		for (const stmt of sql.split('--> statement-breakpoint')) {
			if (stmt.trim()) sqlite.exec(stmt);
		}
	}
}

const USER = { id: 'u1', name: 'Alice', email: 'alice@example.com', role: 'user' };
const WEEK = '2026-11-30';

const ctx = (fields: Record<string, string>) =>
	({
		request: new Request('https://example.com/', {
			method: 'POST',
			body: new URLSearchParams(fields)
		}),
		locals: { user: USER }
	}) as never;

describe('planner saveAndAdd with a Variation (#401)', () => {
	let sqlite: Database.Database;

	beforeEach(() => {
		sqlite = new Database(':memory:');
		migrate(sqlite);
		currentDb = drizzle(sqlite, { schema });
		sqlite
			.prepare(
				`INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES ('u1', 'u1', 'u1@test.com', 0, 0, 0)`
			)
			.run();
		const insertRecipe = sqlite.prepare(
			`INSERT INTO recipes (id, user_id, name, description, ingredients_json, instructions_json, prep_time_minutes, servings, created_at, updated_at)
			 VALUES (?, 'u1', ?, '', '[]', '[]', 10, 2, 0, 0)`
		);
		insertRecipe.run('r-planned', 'Chicken curry');
		insertRecipe.run('r-variation', 'Thai green curry');
		sqlite
			.prepare(
				`INSERT INTO meal_plans (id, user_id, week_start_date, created_at, updated_at) VALUES ('p1', 'u1', ?, 0, 0)`
			)
			.run(WEEK);
		sqlite
			.prepare(
				`INSERT INTO meal_plan_entries (id, meal_plan_id, day_of_week, recipe_id, created_at, updated_at) VALUES ('e1', 'p1', 2, 'r-planned', 0, 0)`
			)
			.run();
	});

	it('plans it on a day that already has a dinner, reusing the Recipe of the same name', async () => {
		const result = await actions.saveAndAdd(
			ctx({
				weekStartDate: WEEK,
				dayOfWeek: '2',
				name: 'Thai green curry',
				description: 'Coconut, basil, green chilli',
				ingredientsJson: JSON.stringify([{ name: 'coconut milk', quantity: '1', unit: 'can' }]),
				instructionsJson: JSON.stringify(['Simmer']),
				prepTimeMinutes: '30',
				servings: '4'
			})
		);

		expect(result).toMatchObject({ form: { valid: true, message: { type: 'success' } } });
		const entries = sqlite.prepare(`SELECT day_of_week, recipe_id FROM meal_plan_entries`).all();
		expect(entries).toEqual([{ day_of_week: 2, recipe_id: 'r-variation' }]);
		expect(sqlite.prepare(`SELECT COUNT(*) FROM recipes`).pluck().get()).toBe(2);
	});
});
