import { defineConfig } from 'oxlint';

import { oxlintBase } from '../../config/oxlint.base.ts';

export default defineConfig({
	...oxlintBase,
	overrides: [
		...(oxlintBase.overrides ?? []),
		{
			// Test-only helpers cast event and result shapes the same way test files do.
			files: ['src/lib/test-utils/**'],
			rules: {
				'typescript/no-unsafe-type-assertion': 'off'
			}
		},
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
