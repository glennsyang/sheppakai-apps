import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

import { e2eAuthFile } from './tests/e2e/auth-state';

dotenv.config({ path: '.env.test', quiet: true });
dotenv.config({ quiet: true });

const configuredBaseUrl = process.env.PLAYWRIGHT_BASE_URL ?? process.env.BETTER_AUTH_BASE_URL;
const baseUrl = new URL(configuredBaseUrl ?? 'http://localhost:5173').origin;
const { hostname, port, protocol } = new URL(baseUrl);
const defaultPort = protocol === 'https:' ? '443' : '80';
// Without credentials the setup and specs skip themselves, and there is no saved session to load.
const hasE2eCredentials = Boolean(process.env.E2E_USER_EMAIL && process.env.E2E_USER_PASSWORD);

export default defineConfig({
	testDir: './tests/e2e',
	fullyParallel: false,
	workers: 1,
	retries: process.env.CI ? 2 : 0,
	reporter: 'list',
	use: {
		baseURL: baseUrl,
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure'
	},
	webServer: {
		command: `pnpm run dev -- --host ${hostname} --port ${port || defaultPort}`,
		url: baseUrl,
		reuseExistingServer: !process.env.CI,
		timeout: 120_000
	},
	projects: [
		{
			name: 'setup',
			testMatch: /auth\.setup\.ts/
		},
		{
			name: 'chromium',
			dependencies: ['setup'],
			use: {
				...devices['Desktop Chrome'],
				viewport: { width: 1440, height: 1100 },
				storageState: hasE2eCredentials ? e2eAuthFile : undefined
			}
		}
	]
});
