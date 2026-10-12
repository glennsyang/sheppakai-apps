import { describe, expect, it } from 'vitest';

import { parsePermissions, permissionsForScope, scopesToPermissions } from './api-scopes';

describe('scopesToPermissions', () => {
	it('groups scopes by resource', () => {
		expect(
			scopesToPermissions(['transactions:read', 'transactions:write', 'budgets:read'])
		).toEqual({
			transactions: ['read', 'write'],
			budgets: ['read']
		});
	});

	it('returns an empty object for no scopes', () => {
		expect(scopesToPermissions([])).toEqual({});
	});
});

describe('permissionsForScope', () => {
	it('builds a single-resource permissions record', () => {
		expect(permissionsForScope('dashboard:read')).toEqual({ dashboard: ['read'] });
	});
});

describe('parsePermissions', () => {
	it('parses the JSON the api-key plugin stores', () => {
		expect(parsePermissions('{"transactions":["read","write"]}')).toEqual({
			transactions: ['read', 'write']
		});
	});

	it('returns null for an empty value', () => {
		expect(parsePermissions(null)).toBeNull();
		expect(parsePermissions('')).toBeNull();
	});

	it('returns null for malformed or non-object JSON', () => {
		expect(parsePermissions('{not json')).toBeNull();
		expect(parsePermissions('"a string"')).toBeNull();
		expect(parsePermissions('null')).toBeNull();
	});
});
