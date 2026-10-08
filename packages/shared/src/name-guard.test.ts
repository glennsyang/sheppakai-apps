import { describe, expect, it } from 'vitest';

import { assertNameLength, MAX_NAME_LENGTH } from './name-guard';

describe('assertNameLength', () => {
	it('accepts a name at the limit, a missing name and a null name', async () => {
		await expect(assertNameLength({ name: 'a'.repeat(MAX_NAME_LENGTH) })).resolves.toBeUndefined();
		await expect(assertNameLength({})).resolves.toBeUndefined();
		await expect(assertNameLength({ name: null })).resolves.toBeUndefined();
	});

	it('rejects a name over the limit with a 400', async () => {
		await expect(assertNameLength({ name: 'a'.repeat(MAX_NAME_LENGTH + 1) })).rejects.toMatchObject(
			{
				statusCode: 400
			}
		);
	});
});
