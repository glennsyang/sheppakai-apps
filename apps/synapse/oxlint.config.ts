import { defineConfig } from 'oxlint';

import { oxlintBase } from '../../config/oxlint.base.ts';

export default defineConfig({
	...oxlintBase,
	ignorePatterns: [...(oxlintBase.ignorePatterns ?? []), 'src/lib/index.ts']
});
