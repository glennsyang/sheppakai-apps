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

const { planDinner, getMealPlanWithEntries, RecipeNotFoundError } =
	await import('../../lib/server/services/mealPlan');

const MIGRATIONS = resolve(__dirname, '../../lib/server/db/migrations');
const TAGS: string[] = JSON.parse(
	readFileSync(resolve(MIGRATIONS, 'meta/_journal.json'), 'utf8')
).entries.map((e: { tag: string }) => e.tag);

/** Apply migrations the way drizzle-orm's migrator does: one BEGIN/COMMIT, FKs on. */
function applyMigrations(sqlite: Database.Database, tags: string[]) {
	sqlite.exec('BEGIN');
	for (const tag of tags) {
		const sql = readFileSync(resolve(MIGRATIONS, `${tag}.sql`), 'utf8');
		for (const stmt of sql.split('--> statement-breakpoint')) {
			if (stmt.trim()) sqlite.exec(stmt);
		}
	}
	sqlite.exec('COMMIT');
}

const ts = (n: number) => n * 1000;

function seedUser(sqlite: Database.Database, id: string) {
	sqlite
		.prepare(
			`INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES (?, ?, ?, 0, 0, 0)`
		)
		.run(id, id, `${id}@test.com`);
}

function seedRecipe(sqlite: Database.Database, id: string, userId: string) {
	sqlite
		.prepare(
			`INSERT INTO recipes (id, user_id, name, description, ingredients_json, instructions_json, prep_time_minutes, servings, created_at, updated_at)
			 VALUES (?, ?, ?, '', '[]', '[]', 10, 2, 0, 0)`
		)
		.run(id, userId, id);
}

describe('0005 migration', () => {
	it('keeps meal plan entries, collapses duplicate plans/days, and adds unique indexes', () => {
		const sqlite = new Database(':memory:');
		const lastTag = TAGS.findIndex((t) => t.startsWith('0005_'));
		applyMigrations(sqlite, TAGS.slice(0, lastTag));

		seedUser(sqlite, 'u1');
		seedRecipe(sqlite, 'r1', 'u1');
		seedRecipe(sqlite, 'r2', 'u1');
		const plan = sqlite.prepare(
			`INSERT INTO meal_plans (id, user_id, week_start_date, created_at, updated_at) VALUES (?, 'u1', ?, ?, ?)`
		);
		plan.run('p-old', '2026-09-28', ts(1), ts(1));
		plan.run('p-dup', '2026-09-28', ts(2), ts(2));
		plan.run('p-other', '2026-10-05', ts(1), ts(1));
		const entry = sqlite.prepare(
			`INSERT INTO meal_plan_entries (id, meal_plan_id, day_of_week, recipe_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`
		);
		entry.run('e1', 'p-old', 0, 'r1', ts(1), ts(1));
		entry.run('e2', 'p-dup', 0, 'r2', ts(5), ts(5)); // newer Monday on the duplicate plan
		entry.run('e3', 'p-dup', 1, 'r1', ts(2), ts(2));
		entry.run('e4', 'p-other', 3, 'r2', ts(1), ts(1));

		applyMigrations(sqlite, TAGS.slice(lastTag, lastTag + 1));

		expect(sqlite.prepare(`SELECT id FROM meal_plans ORDER BY id`).pluck().all()).toEqual([
			'p-old',
			'p-other'
		]);
		expect(
			sqlite
				.prepare(
					`SELECT id, meal_plan_id, day_of_week, recipe_id FROM meal_plan_entries ORDER BY id`
				)
				.all()
		).toEqual([
			{ id: 'e2', meal_plan_id: 'p-old', day_of_week: 0, recipe_id: 'r2' },
			{ id: 'e3', meal_plan_id: 'p-old', day_of_week: 1, recipe_id: 'r1' },
			{ id: 'e4', meal_plan_id: 'p-other', day_of_week: 3, recipe_id: 'r2' }
		]);
		expect(() => plan.run('p-dup2', '2026-09-28', ts(9), ts(9))).toThrow(/UNIQUE/);
		expect(
			sqlite
				.prepare(`SELECT name FROM sqlite_master WHERE name = '__backup_meal_plan_entries'`)
				.get()
		).toBeUndefined();
	});
});

describe('shared rows survive user removal', () => {
	it('sets creator user_id to NULL instead of cascade-deleting', () => {
		const sqlite = new Database(':memory:');
		applyMigrations(sqlite, TAGS);
		seedUser(sqlite, 'u1');
		seedRecipe(sqlite, 'r1', 'u1');
		sqlite
			.prepare(
				`INSERT INTO pantry_items (id, user_id, name, created_at, updated_at) VALUES ('pi1', 'u1', 'rice', 0, 0)`
			)
			.run();

		sqlite.prepare(`DELETE FROM user WHERE id = 'u1'`).run();

		expect(sqlite.prepare(`SELECT user_id FROM recipes WHERE id = 'r1'`).get()).toEqual({
			user_id: null
		});
		expect(sqlite.prepare(`SELECT user_id FROM pantry_items WHERE id = 'pi1'`).get()).toEqual({
			user_id: null
		});
	});
});

describe('planDinner: plan and day upsert', () => {
	let sqlite: Database.Database;

	beforeEach(() => {
		sqlite = new Database(':memory:');
		applyMigrations(sqlite, TAGS);
		currentDb = drizzle(sqlite, { schema });
		seedUser(sqlite, 'u1');
		seedUser(sqlite, 'u2');
		seedRecipe(sqlite, 'r1', 'u1');
		seedRecipe(sqlite, 'r2', 'u2');
	});

	it('reuses one shared plan per week across users', async () => {
		await planDinner({ userId: 'u1', week: '2026-09-28', day: 0, dinner: { recipeId: 'r1' } });
		await planDinner({ userId: 'u2', week: '2026-09-28', day: 1, dinner: { recipeId: 'r2' } });

		expect(sqlite.prepare(`SELECT COUNT(*) FROM meal_plans`).pluck().get()).toBe(1);
		const entries = await getMealPlanWithEntries('2026-09-28');
		expect(entries.map((e) => e.recipe.id).sort()).toEqual(['r1', 'r2']);
	});

	it('replaces the recipe for a day instead of adding a second entry', async () => {
		const first = await planDinner({
			userId: 'u1',
			week: '2026-09-28',
			day: 2,
			dinner: { recipeId: 'r1' }
		});
		const second = await planDinner({
			userId: 'u2',
			week: '2026-09-28',
			day: 2,
			dinner: { recipeId: 'r2' }
		});

		expect(second).toHaveLength(1);
		expect(second[0].recipe.id).toBe('r2');
		expect(second[0].entry.id).toBe(first[0].entry.id);
		expect(sqlite.prepare(`SELECT COUNT(*) FROM meal_plan_entries`).pluck().get()).toBe(1);
	});

	it('gives a new plan and its first entry the same timestamp', async () => {
		// Columns store whole seconds, so make every clock read a second later than the last
		const RealDate = Date;
		let reads = 0;
		vi.stubGlobal(
			'Date',
			class extends RealDate {
				constructor(...args: ConstructorParameters<typeof Date>) {
					if (args.length > 0) super(...args);
					else super(RealDate.UTC(2026, 8, 28) + reads++ * 1000);
				}
			}
		);

		try {
			await planDinner({ userId: 'u1', week: '2026-09-28', day: 0, dinner: { recipeId: 'r1' } });
		} finally {
			vi.unstubAllGlobals();
		}

		const plan = sqlite.prepare(`SELECT created_at, updated_at FROM meal_plans`).get();
		const entry = sqlite.prepare(`SELECT created_at, updated_at FROM meal_plan_entries`).get();
		expect(entry).toEqual(plan);
	});

	it('handles concurrent calls for the same day without duplicates', async () => {
		await Promise.all([
			planDinner({ userId: 'u1', week: '2026-10-05', day: 4, dinner: { recipeId: 'r1' } }),
			planDinner({ userId: 'u2', week: '2026-10-05', day: 4, dinner: { recipeId: 'r2' } })
		]);

		expect(sqlite.prepare(`SELECT COUNT(*) FROM meal_plans`).pluck().get()).toBe(1);
		expect(sqlite.prepare(`SELECT COUNT(*) FROM meal_plan_entries`).pluck().get()).toBe(1);
	});
});

describe('planDinner (#347)', () => {
	let sqlite: Database.Database;
	const WEEK = '2026-11-23';
	const SUGGESTION = {
		name: 'Fried rice',
		description: 'Leftover rice, eggs, peas',
		ingredients: [{ name: 'rice', quantity: '2', unit: 'cup' }],
		steps: ['Fry it'],
		prepTimeMinutes: 20,
		servings: 2
	};
	const countRecipes = () => sqlite.prepare(`SELECT COUNT(*) FROM recipes`).pluck().get();

	beforeEach(() => {
		sqlite = new Database(':memory:');
		applyMigrations(sqlite, TAGS);
		currentDb = drizzle(sqlite, { schema });
		seedUser(sqlite, 'u1');
		seedRecipe(sqlite, 'r1', 'u1');
	});

	it('plans a Library Recipe and returns the week', async () => {
		const week = await planDinner({ userId: 'u1', week: WEEK, day: 3, dinner: { recipeId: 'r1' } });

		expect(week.map((e) => [e.entry.dayOfWeek, e.recipe.id])).toEqual([[3, 'r1']]);
		expect(countRecipes()).toBe(1);
	});

	it('saves a Suggestion as a suggested Recipe and plans it', async () => {
		const week = await planDinner({
			userId: 'u1',
			week: WEEK,
			day: 0,
			dinner: { suggestion: SUGGESTION }
		});

		expect(week).toHaveLength(1);
		expect(week[0].recipe).toMatchObject({
			name: 'Fried rice',
			description: 'Leftover rice, eggs, peas',
			ingredientsJson: SUGGESTION.ingredients,
			instructionsJson: ['Fry it'],
			prepTimeMinutes: 20,
			servings: 2,
			source: 'suggested',
			userId: 'u1'
		});
		expect(countRecipes()).toBe(2);
	});

	it('saves a written-in dinner as a custom Recipe and plans it', async () => {
		const week = await planDinner({
			userId: 'u1',
			week: WEEK,
			day: 5,
			dinner: { custom: { name: 'Takeout', notes: 'Thai place' } }
		});

		expect(week[0].recipe).toMatchObject({
			name: 'Takeout',
			description: 'Thai place',
			ingredientsJson: [],
			instructionsJson: [],
			prepTimeMinutes: 0,
			servings: 1,
			source: 'custom'
		});
	});

	it('plans the same Suggestion on two days and two weeks as one Recipe (#345)', async () => {
		await planDinner({ userId: 'u1', week: WEEK, day: 0, dinner: { suggestion: SUGGESTION } });
		await planDinner({ userId: 'u1', week: WEEK, day: 1, dinner: { suggestion: SUGGESTION } });
		const next = await planDinner({
			userId: 'u1',
			week: '2026-11-30',
			day: 4,
			dinner: { suggestion: SUGGESTION }
		});

		const ids = sqlite.prepare(`SELECT id FROM recipes WHERE name = 'Fried rice'`).pluck().all();
		expect(ids).toHaveLength(1);
		const planned = sqlite
			.prepare(`SELECT DISTINCT recipe_id FROM meal_plan_entries`)
			.pluck()
			.all();
		expect(planned).toEqual(ids);
		expect(next[0].recipe.id).toBe(ids[0]);
	});

	describe('a Suggestion named like a Library Recipe plans that Recipe (#345)', () => {
		function seedNamed(
			id: string,
			name: string,
			{ source = 'suggested', createdAt = 0, rating = null as number | null } = {}
		) {
			sqlite
				.prepare(
					`INSERT INTO recipes (id, user_id, name, description, ingredients_json, instructions_json, prep_time_minutes, servings, source, rating, created_at, updated_at)
					 VALUES (?, 'u1', ?, 'Original', '[{"name":"chicken","quantity":"1","unit":"lb"}]', '["Stir"]', 15, 4, ?, ?, ?, ?)`
				)
				.run(id, name, source, rating, createdAt, createdAt);
		}
		const plan = (name: string) =>
			planDinner({
				userId: 'u2',
				week: WEEK,
				day: 2,
				dinner: { suggestion: { ...SUGGESTION, name } }
			});

		beforeEach(() => seedUser(sqlite, 'u2'));

		it('matches after lowercasing, collapsing whitespace and trimming, and changes nothing', async () => {
			seedNamed('stir', 'Chicken Stir Fry', { rating: 2 });
			sqlite
				.prepare(
					`INSERT INTO recipe_cooks (id, recipe_id, user_id, cooked_on, created_at, updated_at) VALUES ('c1', 'stir', 'u1', '2026-11-01', 0, 0)`
				)
				.run();
			const before = sqlite.prepare(`SELECT * FROM recipes WHERE id = 'stir'`).get();

			const week = await plan(' chicken  STIR fry ');

			expect(week[0].recipe.id).toBe('stir');
			expect(countRecipes()).toBe(2); // r1 + stir, nothing inserted
			expect(sqlite.prepare(`SELECT * FROM recipes WHERE id = 'stir'`).get()).toEqual(before);
			expect(sqlite.prepare(`SELECT COUNT(*) FROM recipe_cooks`).pluck().get()).toBe(1);
		});

		it.each(['custom', 'imported'])('matches a %s Recipe', async (source) => {
			seedNamed('mine', 'Fried rice', { source });

			const week = await plan('Fried Rice');

			expect(week[0].recipe).toMatchObject({ id: 'mine', source });
			expect(countRecipes()).toBe(2);
		});

		it('uses the oldest of several same-named Recipes', async () => {
			seedNamed('newer', 'Fried rice', { createdAt: ts(9) });
			seedNamed('older', 'fried rice', { createdAt: ts(1) });

			expect((await plan('Fried rice'))[0].recipe.id).toBe('older');
			expect(countRecipes()).toBe(3);
		});

		it('still saves a Suggestion whose name only resembles a Recipe', async () => {
			seedNamed('stir', 'Chicken Stir Fry');

			const week = await plan('Chicken Stir Fry with Rice');

			expect(week[0].recipe.id).not.toBe('stir');
			expect(countRecipes()).toBe(3);
		});
	});

	it('stamps the new Recipe, plan and Planned Dinner with one timestamp', async () => {
		const RealDate = Date;
		let reads = 0;
		vi.stubGlobal(
			'Date',
			class extends RealDate {
				constructor(...args: ConstructorParameters<typeof Date>) {
					if (args.length > 0) super(...args);
					else super(RealDate.UTC(2026, 10, 23) + reads++ * 1000);
				}
			}
		);
		try {
			await planDinner({ userId: 'u1', week: WEEK, day: 0, dinner: { suggestion: SUGGESTION } });
		} finally {
			vi.unstubAllGlobals();
		}

		const stamps = (table: string, where = '') =>
			sqlite.prepare(`SELECT created_at, updated_at FROM ${table} ${where}`).get();
		const plan = stamps('meal_plans');
		expect(stamps('meal_plan_entries')).toEqual(plan);
		expect(stamps('recipes', `WHERE name = 'Fried rice'`)).toEqual(plan);
	});

	it('throws RecipeNotFoundError for an unknown recipeId and writes nothing', async () => {
		await expect(
			planDinner({ userId: 'u1', week: WEEK, day: 0, dinner: { recipeId: 'gone' } })
		).rejects.toBeInstanceOf(RecipeNotFoundError);
		expect(sqlite.prepare(`SELECT COUNT(*) FROM meal_plans`).pluck().get()).toBe(0);
	});

	it.each([
		['Suggestion', { suggestion: SUGGESTION }],
		['custom dinner', { custom: { name: 'Takeout' } }]
	] as const)('leaves no orphan Recipe when planning a %s fails', async (_, dinner) => {
		sqlite.exec(
			`CREATE TRIGGER fail_entry BEFORE INSERT ON meal_plan_entries BEGIN SELECT RAISE(ABORT, 'boom'); END`
		);

		await expect(planDinner({ userId: 'u1', week: WEEK, day: 0, dinner })).rejects.toThrow(/boom/);
		expect(countRecipes()).toBe(1); // only the seeded r1
		expect(sqlite.prepare(`SELECT COUNT(*) FROM meal_plans`).pluck().get()).toBe(0);
	});
});

describe('getMealPlanWithEntries', () => {
	let sqlite: Database.Database;
	let queries: string[];

	beforeEach(() => {
		sqlite = new Database(':memory:');
		applyMigrations(sqlite, TAGS);
		queries = [];
		currentDb = drizzle(sqlite, {
			schema,
			logger: { logQuery: (query) => queries.push(query) }
		});
		seedUser(sqlite, 'u1');
		seedRecipe(sqlite, 'r1', 'u1');
		seedRecipe(sqlite, 'r2', 'u1');
		sqlite
			.prepare(`UPDATE recipes SET ingredients_json = ?, instructions_json = ? WHERE id = 'r2'`)
			.run(
				JSON.stringify([{ name: 'rice', quantity: '1', unit: 'cup' }]),
				JSON.stringify(['Cook'])
			);
	});

	it('returns the week’s entries with mapped recipes, ordered by day, in one query', async () => {
		await planDinner({ userId: 'u1', week: '2026-09-28', day: 4, dinner: { recipeId: 'r1' } });
		await planDinner({ userId: 'u1', week: '2026-09-28', day: 1, dinner: { recipeId: 'r2' } });
		await planDinner({ userId: 'u1', week: '2026-10-05', day: 0, dinner: { recipeId: 'r1' } }); // other week
		queries = [];

		const result = await getMealPlanWithEntries('2026-09-28');

		expect(queries).toHaveLength(1);
		expect(result.map((r) => [r.entry.dayOfWeek, r.recipe.id])).toEqual([
			[1, 'r2'],
			[4, 'r1']
		]);
		expect(result[0].recipe).toMatchObject({
			ingredientsJson: [{ name: 'rice', quantity: '1', unit: 'cup' }],
			instructionsJson: ['Cook'],
			source: 'suggested',
			userId: 'u1'
		});
	});

	it('returns [] for a week with no plan', async () => {
		expect(await getMealPlanWithEntries('2030-01-07')).toEqual([]);
	});
});
