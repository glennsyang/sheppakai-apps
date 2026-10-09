import { describe, expect, it } from 'vitest';

import { abbreviateCategoryName, cn, formatCurrency } from './utils';

describe('cn', () => {
	it('merges class strings', () => {
		expect(cn('foo', 'bar')).toBe('foo bar');
	});

	it('deduplicates conflicting tailwind classes', () => {
		// tailwind-merge should keep the last conflicting value
		expect(cn('p-2', 'p-4')).toBe('p-4');
	});

	it('handles conditional falsy values', () => {
		expect(cn('base', false, undefined, null, 'end')).toBe('base end');
	});

	it('returns empty string when no classes passed', () => {
		expect(cn()).toBe('');
	});
});

describe('formatCurrency', () => {
	it('formats a positive integer', () => {
		expect(formatCurrency(1000)).toBe('$1,000.00');
	});

	it('formats zero', () => {
		expect(formatCurrency(0)).toBe('$0.00');
	});

	it('formats a negative amount', () => {
		expect(formatCurrency(-250.5)).toBe('-$250.50');
	});

	it('formats a decimal amount', () => {
		expect(formatCurrency(9.99)).toBe('$9.99');
	});

	it('formats a large amount with commas', () => {
		expect(formatCurrency(1_234_567.89)).toBe('$1,234,567.89');
	});
});

describe('abbreviateCategoryName', () => {
	it('returns the name unchanged when it is within maxLength', () => {
		expect(abbreviateCategoryName('Food', 6)).toBe('Food');
	});

	it('returns the name unchanged when it equals maxLength exactly', () => {
		expect(abbreviateCategoryName('Grocry', 6)).toBe('Grocry');
	});

	it('truncates at a space separator when base fits within maxLength', () => {
		expect(abbreviateCategoryName('Gas & Electric', 6)).toBe('Gas');
	});

	it('truncates at a slash separator when base fits within maxLength', () => {
		expect(abbreviateCategoryName('Rent/Mortgage', 6)).toBe('Rent');
	});

	it('truncates the base with ellipsis when base exceeds maxLength', () => {
		// "Entertainment" has no separator; base = full name > 6 → slice(0, 5) + '.'
		expect(abbreviateCategoryName('Entertainment', 6)).toBe('Enter.');
	});

	it('truncates the base with ellipsis when the separator-derived base still exceeds maxLength', () => {
		// "Subscriptions/Streaming" → base = "Subscriptions" (13 chars > 6) → "Subsc."
		expect(abbreviateCategoryName('Subscriptions/Streaming', 6)).toBe('Subsc.');
	});

	it('uses the default maxLength of 6 when none is supplied', () => {
		// base = "Personal" (8 > 6) → slice(0, 5) + "." = "Perso."
		expect(abbreviateCategoryName('Personal Care')).toBe('Perso.');
	});

	it('respects a custom maxLength', () => {
		// base = "Healthcare" (10 > 5) → slice(0, 4) + "." = "Heal."
		expect(abbreviateCategoryName('Healthcare', 5)).toBe('Heal.');
	});

	it('returns a short name as-is with a custom maxLength', () => {
		expect(abbreviateCategoryName('Tax', 10)).toBe('Tax');
	});
});
