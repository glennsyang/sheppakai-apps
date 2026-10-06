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
		},
		{
			// The auth-guard re-export and its tests may touch requireAdmin even though the app
			// itself must not (see the rule below).
			files: ['src/lib/server/actions/auth-guard.ts', 'src/lib/server/actions/auth-guard.test.ts'],
			rules: {
				'eslint/no-restricted-imports': 'off'
			}
		}
	],
	rules: {
		...oxlintBase.rules,
		// requireAdmin in auth-guard.ts checks the DB role only, so it would 403 an admin granted
		// via ADMIN_USER_IDS. The guard against using it here lives in config rather than in the file.
		'eslint/no-restricted-imports': [
			'error',
			{
				paths: [
					{
						name: '$lib/server/actions/auth-guard',
						importNames: ['requireAdmin'],
						message:
							'requireAdmin checks the role only and ignores ADMIN_USER_IDS. Use adminFormAction (actions) or assertAdmin (loads).'
					},
					{
						name: '@sheppakai/shared/auth-guard',
						importNames: ['requireAdmin'],
						message:
							'requireAdmin checks the role only and ignores ADMIN_USER_IDS. Use adminFormAction (actions) or assertAdmin (loads).'
					}
				]
			}
		],
		'typescript/no-non-null-assertion': 'error'
	}
});
