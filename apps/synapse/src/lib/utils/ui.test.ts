import { describe, expect, it } from 'vitest';

import { cn } from './ui';

describe('cn', () => {
	it('joins class names and drops falsy values', () => {
		expect(cn('a', false, null, undefined, 'b', { c: true, d: false })).toBe('a b c');
	});

	it('resolves conflicting tailwind classes in favour of the last one', () => {
		expect(cn('p-2 text-sm', 'p-4')).toBe('text-sm p-4');
	});
});
