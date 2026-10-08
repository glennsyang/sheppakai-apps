import { defineConfig } from 'oxlint';

import { oxlintBase } from '../../config/oxlint.base.ts';

export default defineConfig({
	...oxlintBase,
	overrides: [
		{
			// Non-null assertions are legitimate in test fixtures, where the setup guarantees the value.
			files: ['**/*.test.ts'],
			rules: {
				'typescript/no-non-null-assertion': 'off'
			}
		}
	],
	rules: {
		...oxlintBase.rules,
		'typescript/no-non-null-assertion': 'error'
	}
});
