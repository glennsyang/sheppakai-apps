// schema.org `Recipe` JSON-LD → import result. Most recipe sites publish it for search
// engines, so it's tried before spending an AI call on the page.
import { isRecord } from '@sheppakai/shared/guards';

import { type RecipeImportResult, recipeImportResultSchema } from '#lib/schemas/recipes.js';

import { stripTags } from './html-text';

const JSON_LD_SCRIPT =
	/<script\b[^>]*\btype\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script\s*>/gi;

const MAX_DEPTH = 6;

function isRecipeType(type: unknown): boolean {
	const types = Array.isArray(type) ? type : [type];
	return types.some((t) => typeof t === 'string' && /(^|[/:])Recipe$/.test(t));
}

/** Depth-first search for the first Recipe node: top level, arrays, `@graph`, `mainEntity`. */
function findRecipeNode(node: unknown, depth = 0): Record<string, unknown> | null {
	if (depth > MAX_DEPTH) return null;
	if (Array.isArray(node)) {
		for (const item of node) {
			const found = findRecipeNode(item, depth + 1);
			if (found) return found;
		}
		return null;
	}
	if (!isRecord(node)) return null;
	if (isRecipeType(node['@type'])) return node;
	for (const key of ['@graph', 'mainEntity', 'mainEntityOfPage']) {
		const found = findRecipeNode(node[key], depth + 1);
		if (found) return found;
	}
	return null;
}

function parseJsonLdBlock(raw: string): unknown {
	const cleaned = raw
		.trim()
		.replace(/^<!--|-->$/g, '')
		.replace(/^\s*\/\/\s*<!\[CDATA\[|\/\/\s*\]\]>\s*$/g, '');
	try {
		return JSON.parse(cleaned);
	} catch {
		return null;
	}
}

function text(value: unknown): string {
	if (typeof value === 'string') return stripTags(value);
	if (typeof value === 'number') return String(value);
	if (Array.isArray(value)) return text(value[0]);
	return '';
}

// ─── Ingredients ──────────────────────────────────────────────────────────────

const FRACTIONS = '½¼¾⅓⅔⅛⅜⅝⅞';
const QUANTITY = new RegExp(
	`^(\\d*\\s*[${FRACTIONS}]|(?:\\d+\\s+)?\\d+(?:[.,/]\\d+)?(?:\\s*[-–]\\s*\\d+(?:[./]\\d+)?)?)\\s*`
);

const UNITS = [
	'cups?',
	'tablespoons?',
	'tbsps?',
	'tbs',
	'teaspoons?',
	'tsps?',
	'grams?',
	'g',
	'kilograms?',
	'kg',
	'millilit(?:re|er)s?',
	'ml',
	'lit(?:re|er)s?',
	'l',
	'ounces?',
	'oz',
	'pounds?',
	'lbs?',
	'pinch(?:es)?',
	'dash(?:es)?',
	'cloves?',
	'cans?',
	'tins?',
	'packages?',
	'packets?',
	'sticks?',
	'slices?',
	'bunch(?:es)?',
	'sprigs?',
	'handfuls?'
];
const UNIT = new RegExp(`^(${UNITS.join('|')})\\.?(?=\\s|$)\\s*`, 'i');

/** "2 1/2 cups plain flour" → { quantity: '2 1/2', unit: 'cups', name: 'plain flour' }. */
export function parseIngredientLine(line: string): {
	quantity: string;
	unit: string;
	name: string;
} {
	let rest = stripTags(line);
	const quantity = QUANTITY.exec(rest);
	if (!quantity) return { quantity: '', unit: '', name: rest };
	rest = rest.slice(quantity[0].length);
	const unit = UNIT.exec(rest);
	if (unit) rest = rest.slice(unit[0].length);
	// A line that is only a number ("2") keeps it as the name rather than losing it.
	if (!rest) return { quantity: '', unit: '', name: stripTags(line) };
	return { quantity: quantity[1].trim(), unit: unit?.[1] ?? '', name: rest.replace(/^of\s+/i, '') };
}

// ─── Instructions ─────────────────────────────────────────────────────────────

/** Flatten string | HowToStep | HowToSection | ItemList (and arrays of them) into steps. */
function instructionSteps(value: unknown, depth = 0): string[] {
	if (depth > MAX_DEPTH) return [];
	if (typeof value === 'string') {
		// One string holding every step: split on line breaks or list markup.
		return value
			.split(/\n+|<\/?(?:li|p|br)\b[^>]*>/i)
			.map(stripTags)
			.filter(Boolean);
	}
	if (Array.isArray(value)) return value.flatMap((item) => instructionSteps(item, depth + 1));
	if (!isRecord(value)) return [];
	if (value.itemListElement !== undefined) {
		return instructionSteps(value.itemListElement, depth + 1);
	}
	const step = text(value.text) || text(value.name);
	return step ? [step] : [];
}

// ─── Times and yield ──────────────────────────────────────────────────────────

/** ISO 8601 duration ("PT1H30M", "P0DT45M") → whole minutes, or null. */
export function isoDurationMinutes(value: unknown): number | null {
	if (typeof value !== 'string') return null;
	const match =
		/^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i.exec(
			value.trim()
		);
	if (!match) return null;
	const [days, hours, minutes, seconds] = match.slice(1).map((part) => Number(part ?? 0));
	const total = days * 1440 + hours * 60 + minutes + seconds / 60;
	return total > 0 ? Math.round(total) : null;
}

function totalMinutes(node: Record<string, unknown>): number | null {
	const total = isoDurationMinutes(node.totalTime);
	if (total !== null) return total;
	const prep = isoDurationMinutes(node.prepTime);
	const cook = isoDurationMinutes(node.cookTime);
	return prep === null && cook === null ? null : (prep ?? 0) + (cook ?? 0);
}

/** recipeYield ("4", "Serves 4-6", 4, ["4", "4 servings"]) → the first whole number, or null. */
function servingsFrom(value: unknown): number | null {
	if (typeof value === 'number') return value;
	if (Array.isArray(value)) {
		for (const item of value) {
			const servings = servingsFrom(item);
			if (servings !== null) return servings;
		}
		return null;
	}
	if (typeof value !== 'string') return null;
	const match = /\d+/.exec(value);
	return match ? Number(match[0]) : null;
}

// ─── Entry point ──────────────────────────────────────────────────────────────

/** The page's first schema.org Recipe as an import result, or null if it has none usable. */
export function findJsonLdRecipe(html: string): RecipeImportResult | null {
	for (const [, raw] of html.matchAll(JSON_LD_SCRIPT)) {
		const node = findRecipeNode(parseJsonLdBlock(raw));
		if (!node) continue;

		const ingredients = Array.isArray(node.recipeIngredient)
			? node.recipeIngredient
			: Array.isArray(node.ingredients)
				? node.ingredients
				: [];

		const parsed = recipeImportResultSchema.safeParse({
			name: text(node.name),
			description: text(node.description),
			ingredients: ingredients
				.filter((line): line is string => typeof line === 'string')
				.map(parseIngredientLine),
			steps: instructionSteps(node.recipeInstructions),
			prepTimeMinutes: totalMinutes(node),
			servings: servingsFrom(node.recipeYield)
		});
		if (parsed.success) return parsed.data;
	}
	return null;
}
