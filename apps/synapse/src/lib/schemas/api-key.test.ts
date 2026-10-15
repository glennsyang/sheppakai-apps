import { describe, expect, it } from 'vitest';

import { createApiKeySchema } from './api-key';

describe('createApiKeySchema', () => {
	it('accepts a valid key request', () => {
		const result = createApiKeySchema.safeParse({ name: 'Assistant', scopes: ['tasks:read'] });
		expect(result.success).toBe(true);
	});

	it('requires a name', () => {
		expect(createApiKeySchema.safeParse({ name: '', scopes: ['tasks:read'] }).success).toBe(false);
	});

	it('requires at least one scope', () => {
		expect(createApiKeySchema.safeParse({ name: 'Assistant', scopes: [] }).success).toBe(false);
	});

	it('rejects a scope outside API_SCOPES', () => {
		expect(
			createApiKeySchema.safeParse({ name: 'Assistant', scopes: ['transactions:read'] }).success
		).toBe(false);
	});

	it('defaults expiresInDays to 90 so no key is created without an expiry', () => {
		const result = createApiKeySchema.parse({ name: 'Assistant', scopes: ['tasks:read'] });
		expect(result.expiresInDays).toBe(90);
	});

	it('rejects expiresInDays outside 1-365', () => {
		expect(
			createApiKeySchema.safeParse({
				name: 'Assistant',
				scopes: ['tasks:read'],
				expiresInDays: 400
			}).success
		).toBe(false);
	});
});
