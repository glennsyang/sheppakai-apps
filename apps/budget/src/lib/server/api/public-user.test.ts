import { describe, expect, it } from 'vitest';

import { withPublicUsers } from './public-user';

const fullUser = {
	id: 'u1',
	name: 'Glenn',
	email: 'someone@example.com',
	role: 'admin',
	banned: false,
	banReason: null,
	emailVerified: true
};

describe('withPublicUsers', () => {
	it('cuts a record’s user down to id and name', () => {
		expect(withPublicUsers({ id: 'e1', amount: 5, user: fullUser })).toEqual({
			id: 'e1',
			amount: 5,
			user: { id: 'u1', name: 'Glenn' }
		});
	});

	it('reaches users inside arrays and nested relations', () => {
		const job = { id: 'j1', user: fullUser, customer: { id: 'c1', user: fullUser } };
		expect(withPublicUsers([job])).toEqual([
			{
				id: 'j1',
				user: { id: 'u1', name: 'Glenn' },
				customer: { id: 'c1', user: { id: 'u1', name: 'Glenn' } }
			}
		]);
	});

	it('leaves dates, nulls and records without a user unchanged', () => {
		const createdAt = new Date('2026-11-22T00:00:00Z');
		const row = { id: 'c1', createdAt, gstAmount: null, user: null };
		const result = withPublicUsers(row) as typeof row;
		expect(result).toEqual(row);
		expect(result.createdAt).toBe(createdAt);
		expect(withPublicUsers('text')).toBe('text');
	});
});
