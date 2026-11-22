import { expect, test } from '@playwright/test';

const testUserEmail = process.env.E2E_USER_EMAIL;
const testUserPassword = process.env.E2E_USER_PASSWORD;

test.describe('daily agenda standing items dialog', () => {
	test.skip(
		!testUserEmail || !testUserPassword,
		'Set E2E_USER_EMAIL and E2E_USER_PASSWORD in .env.test to run this spec.'
	);

	// Regression: the weekday pickers once used the shadcn Input, whose bind:value made
	// Svelte throw bind_invalid_checkbox_value and the dialog crashed the page with a 500.
	test('opens and toggles a weekday without crashing', async ({ page }) => {
		const pageErrors: Error[] = [];
		page.on('pageerror', (error) => pageErrors.push(error));

		await page.goto('/tasks?tab=agenda', { waitUntil: 'networkidle' });

		// The button label changes with the glossary rename (#307); accept either.
		const openButton = page.getByRole('button', { name: /Set Defaults|Standing Items/ });
		const dialog = page.getByRole('dialog');
		// Retry the click in case it lands before hydration and does nothing.
		await expect(async () => {
			if (!(await dialog.isVisible())) await openButton.click();
			await expect(dialog).toBeVisible({ timeout: 1000 });
		}).toPass();

		const sunday = dialog.getByRole('checkbox', { name: 'Sun' }).first();
		const wasChecked = await sunday.isChecked();
		await sunday.click();
		await expect(sunday).toBeChecked({ checked: !wasChecked });
		await sunday.click();
		await expect(sunday).toBeChecked({ checked: wasChecked });

		expect(pageErrors).toEqual([]);
	});
});
