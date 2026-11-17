// Turns a week of planned recipes into a shopping list: ingredient names and units are
// normalized, quantities summed, pantry stock subtracted and items grouped by aisle (#194).
// Pure functions only — the DB side lives in src/lib/server/services/shoppingList.ts.

import type { Ingredient } from '#lib/types.js';

// ─── Names ───────────────────────────────────────────────────────────────────

/** Singular for the common English plurals; leaves "-ss" ("swiss", "glass") alone. */
function singular(word: string): string {
	if (word.length <= 3 || word.endsWith('ss')) return word;
	if (word.endsWith('ies')) return `${word.slice(0, -3)}y`;
	if (/(?:o|ch|sh|x)es$/.test(word)) return word.slice(0, -2);
	if (word.endsWith('s')) return word.slice(0, -1);
	return word;
}

/**
 * The matching key for an ingredient name: lowercase, without prep notes ("garlic, minced",
 * "onion (diced)"), single-spaced, last word singular. Returns `''` for a blank name.
 */
export function normalizeIngredientName(name: string): string {
	const base = name
		.toLowerCase()
		.replace(/\([^)]*\)/g, ' ')
		.split(',')[0]
		.replace(/\s+/g, ' ')
		.trim();
	if (!base) return '';
	const words = base.split(' ');
	words[words.length - 1] = singular(words[words.length - 1]);
	return words.join(' ');
}

// ─── Quantities and units ────────────────────────────────────────────────────

const UNICODE_FRACTIONS: Record<string, string> = {
	'½': ' 1/2',
	'⅓': ' 1/3',
	'⅔': ' 2/3',
	'¼': ' 1/4',
	'¾': ' 3/4',
	'⅛': ' 1/8'
};

function parseSimple(token: string): number | null {
	if (/^\d+(?:\.\d+)?$/.test(token)) return Number(token);
	const fraction = /^(\d+)\/(\d+)$/.exec(token);
	if (fraction && Number(fraction[2]) !== 0) return Number(fraction[1]) / Number(fraction[2]);
	return null;
}

function parseMixed(text: string): number | null {
	const parts = text.trim().split(/\s+/);
	if (parts.length === 1) return parseSimple(parts[0]);
	if (parts.length === 2 && /^\d+$/.test(parts[0]) && parts[1].includes('/')) {
		const fraction = parseSimple(parts[1]);
		return fraction === null ? null : Number(parts[0]) + fraction;
	}
	return null;
}

/**
 * A recipe quantity as a number: "2", "1.5", "1/2", "1 1/2", "1½" and ranges like "2-3" (upper
 * bound, so the list errs on buying enough). `null` for anything else ("", "a pinch").
 */
export function parseQuantity(raw: string): number | null {
	let text = raw.trim();
	for (const [glyph, ascii] of Object.entries(UNICODE_FRACTIONS)) {
		text = text.replaceAll(glyph, ascii);
	}
	text = text.trim();
	if (!text) return null;
	const range = /^(.+?)\s*(?:-|–|to)\s*(.+)$/.exec(text);
	const value = range ? parseMixed(range[2]) : parseMixed(text);
	return value !== null && value > 0 ? value : null;
}

type Dimension = 'mass' | 'volume';

// Factor to the dimension's base unit (grams, millilitres).
const UNITS: Record<string, { dimension: Dimension; canonical: string; factor: number }> = {};

function defineUnit(dimension: Dimension, canonical: string, factor: number, aliases: string[]) {
	for (const alias of [canonical, ...aliases]) UNITS[alias] = { dimension, canonical, factor };
}

defineUnit('mass', 'g', 1, ['gram', 'grams', 'gr']);
defineUnit('mass', 'kg', 1000, ['kilogram', 'kilograms', 'kgs']);
defineUnit('mass', 'oz', 28.3495, ['ounce', 'ounces']);
defineUnit('mass', 'lb', 453.592, ['lbs', 'pound', 'pounds']);
defineUnit('volume', 'ml', 1, ['milliliter', 'milliliters', 'millilitre', 'millilitres', 'mls']);
defineUnit('volume', 'l', 1000, ['liter', 'liters', 'litre', 'litres']);
defineUnit('volume', 'tsp', 4.92892, ['teaspoon', 'teaspoons', 'tsps']);
defineUnit('volume', 'tbsp', 14.7868, ['tablespoon', 'tablespoons', 'tbsps', 'tbs', 'tbl']);
defineUnit('volume', 'cup', 236.588, ['cups', 'c']);

/** How a unit sums: by mass, by volume, or as a plain count keyed by its (singular) word. */
function unitInfo(unit: string | null | undefined) {
	const key = (unit ?? '').toLowerCase().replace(/\./g, '').trim();
	const known = UNITS[key];
	if (known) return { group: known.dimension, canonical: known.canonical, factor: known.factor };
	const word = singular(key);
	return { group: `count:${word}`, canonical: word, factor: 1 };
}

/** Converts `quantity` of `from` into `to`, or `null` when the units don't share a dimension. */
export function convertQuantity(quantity: number, from: string | null, to: string | null) {
	const a = unitInfo(from);
	const b = unitInfo(to);
	if (a.group !== b.group) return null;
	return (quantity * a.factor) / b.factor;
}

// ─── Aisles ──────────────────────────────────────────────────────────────────

export const AISLES = [
	'Produce',
	'Meat & seafood',
	'Dairy & eggs',
	'Bakery',
	'Frozen',
	'Pantry',
	'Other'
] as const;
export type Aisle = (typeof AISLES)[number];

// First match wins, so more specific aisles come before broad ones ("frozen peas" → Frozen,
// "coconut milk" → Pantry before "milk" → Dairy).
const AISLE_KEYWORDS: [Aisle, string[]][] = [
	['Frozen', ['frozen', 'ice cream']],
	[
		'Pantry',
		[
			'coconut milk',
			'canned',
			'stock',
			'broth',
			'rice',
			'pasta',
			'noodle',
			'spaghetti',
			'flour',
			'sugar',
			'oil',
			'vinegar',
			'sauce',
			'bean',
			'lentil',
			'chickpea',
			'oat',
			'honey',
			'syrup',
			'spice',
			'cumin',
			'paprika',
			'cinnamon',
			'paste',
			'nut',
			'peanut',
			'almond',
			'cornstarch',
			'breadcrumb',
			'seed',
			'cereal',
			'cracker',
			'mustard',
			'ketchup',
			'mayonnaise'
		]
	],
	[
		'Meat & seafood',
		[
			'chicken',
			'beef',
			'pork',
			'lamb',
			'turkey',
			'bacon',
			'sausage',
			'ham',
			'steak',
			'mince',
			'fish',
			'salmon',
			'tuna',
			'cod',
			'shrimp',
			'prawn',
			'scallop',
			'crab'
		]
	],
	[
		'Dairy & eggs',
		['milk', 'cheese', 'butter', 'cream', 'yogurt', 'yoghurt', 'egg', 'parmesan', 'mozzarella']
	],
	['Bakery', ['bread', 'bun', 'roll', 'tortilla', 'pita', 'naan', 'bagel', 'baguette', 'wrap']],
	[
		'Produce',
		[
			'onion',
			'garlic',
			'ginger',
			'potato',
			'tomato',
			'carrot',
			'celery',
			'pepper',
			'lettuce',
			'spinach',
			'kale',
			'cabbage',
			'broccoli',
			'cauliflower',
			'zucchini',
			'cucumber',
			'mushroom',
			'avocado',
			'lemon',
			'lime',
			'apple',
			'banana',
			'berry',
			'strawberry',
			'blueberry',
			'raspberry',
			'eggplant',
			'chile',
			'herb',
			'parsley',
			'cilantro',
			'coriander',
			'basil',
			'mint',
			'scallion',
			'leek',
			'squash',
			'corn',
			'pea',
			'chili',
			'chilli',
			'shallot',
			'bok choy',
			'sprout'
		]
	]
];

/** Aisle by whole-word keyword, so "eggplant" isn't dairy and "minced garlic" isn't meat. */
export function aisleFor(name: string): Aisle {
	const words = normalizeIngredientName(name).split(' ').map(singular);
	const key = words.join(' ');
	for (const [aisle, keywords] of AISLE_KEYWORDS) {
		const hit = keywords.some((keyword) =>
			keyword.includes(' ') ? key.includes(keyword) : words.includes(keyword)
		);
		if (hit) return aisle;
	}
	return 'Other';
}

// ─── Building the list ───────────────────────────────────────────────────────

// Always in the kitchen; matches the staples gemini.ts tells the model to assume.
const SKIPPED = new Set(['salt', 'black pepper', 'pepper', 'water', 'salt and pepper']);

export interface PantryStock {
	name: string;
	quantity: number | null;
	unit: string | null;
}

export interface ShoppingNeed {
	/** Stable per week: normalized name + unit group. */
	key: string;
	name: string;
	/** `null` = an amount the recipes didn't give as a number ("as needed"). */
	quantity: number | null;
	unit: string | null;
	aisle: Aisle;
}

/** Rounds away float noise from unit conversion (0.30000000004 → 0.3). */
function tidy(value: number): number {
	return Math.round(value * 100) / 100;
}

/**
 * Sums the recipes' ingredients and subtracts pantry stock. A pantry item with the same name
 * but no quantity, or a unit that can't be compared, counts as having enough.
 */
export function buildNeeds(ingredientLists: Ingredient[][], pantry: PantryStock[]): ShoppingNeed[] {
	const needs = new Map<string, ShoppingNeed & { nameKey: string }>();

	for (const ingredient of ingredientLists.flat()) {
		const nameKey = normalizeIngredientName(ingredient.name);
		if (!nameKey || SKIPPED.has(nameKey)) continue;
		const info = unitInfo(ingredient.unit);
		const key = `${nameKey}|${info.group}`;
		const amount = parseQuantity(ingredient.quantity);
		const existing = needs.get(key);

		if (!existing) {
			needs.set(key, {
				key,
				nameKey,
				name: ingredient.name.split(',')[0].trim(),
				quantity: amount,
				unit: info.canonical || null,
				aisle: aisleFor(ingredient.name)
			});
			continue;
		}
		if (existing.quantity === null || amount === null) {
			existing.quantity = null;
			continue;
		}
		existing.quantity += convertQuantity(amount, ingredient.unit, existing.unit) ?? 0;
	}

	const stock = new Map<string, PantryStock[]>();
	for (const item of pantry) {
		const nameKey = normalizeIngredientName(item.name);
		stock.set(nameKey, [...(stock.get(nameKey) ?? []), item]);
	}

	const result: ShoppingNeed[] = [];
	for (const { nameKey, ...need } of needs.values()) {
		const onHand = stock.get(nameKey);
		if (onHand) {
			if (need.quantity === null) continue;
			let remaining = need.quantity;
			for (const item of onHand) {
				const have =
					item.quantity === null ? null : convertQuantity(item.quantity, item.unit, need.unit);
				// Unknown amount or a unit we can't compare: trust that there's enough.
				remaining = have === null ? 0 : remaining - have;
			}
			if (remaining <= 0.001) continue;
			need.quantity = remaining;
		}
		result.push({ ...need, quantity: need.quantity === null ? null : tidy(need.quantity) });
	}
	return result;
}

/** "1.5 cup", "3", or "" for an unknown amount. */
export function formatAmount(quantity: number | null, unit: string | null): string {
	if (quantity === null) return '';
	return unit ? `${quantity} ${unit}` : String(quantity);
}
