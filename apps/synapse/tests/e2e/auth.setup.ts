import { expect, test as setup } from '@playwright/test';

import { e2eAuthFile } from './auth-state';

const testUserEmail = process.env.E2E_USER_EMAIL;
const testUserPassword = process.env.E2E_USER_PASSWORD;

setup('sign in once and save the session', async ({ page }) => {
	setup.skip(
		!testUserEmail || !testUserPassword,
		'Set E2E_USER_EMAIL and E2E_USER_PASSWORD in .env.test to run the e2e specs.'
	);

	// Wait for hydration so the click goes through use:enhance, not a pre-hydration native submit.
	await page.goto('/sign-in', { waitUntil: 'networkidle' });
	await page.getByLabel('Email').fill(testUserEmail ?? '');
	await page.getByLabel('Password').fill(testUserPassword ?? '');
	await page.getByRole('button', { name: 'Sign in' }).click();

	await page.waitForURL('**/dashboard');
	await expect(page.getByRole('navigation', { name: 'Sections' })).toBeVisible();

	await page.context().storageState({ path: e2eAuthFile });
});
