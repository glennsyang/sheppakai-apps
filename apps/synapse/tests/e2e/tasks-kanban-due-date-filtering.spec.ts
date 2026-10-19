import { expect, type Page, test } from '@playwright/test';

const testUserEmail = process.env.E2E_USER_EMAIL;
const testUserPassword = process.env.E2E_USER_PASSWORD;

test.describe('tasks kanban due date filtering', () => {
	test.skip(
		!testUserEmail || !testUserPassword,
		'Set E2E_USER_EMAIL and E2E_USER_PASSWORD in .env.test to run this spec.'
	);

	async function navigateToKanbanBoard(page: Page): Promise<void> {
		await page.goto('/tasks?tab=kanban', { waitUntil: 'networkidle' });
		await expect(page.getByRole('heading', { name: 'Tasks' }).first()).toBeVisible();
		await expect(page.getByRole('tab', { name: 'Kanban' })).toHaveAttribute(
			'aria-selected',
			'true'
		);
	}

	async function openFilters(page: Page): Promise<void> {
		const filterButton = page.getByLabel('Toggle task filters');
		// Retry the click in case it lands before hydration and does nothing.
		await expect(async () => {
			if ((await filterButton.getAttribute('aria-expanded')) !== 'true') {
				await filterButton.click();
			}
			await expect(filterButton).toHaveAttribute('aria-expanded', 'true', { timeout: 1000 });
		}).toPass();
		await expect(page.locator('#tasks-filter-bar')).toBeVisible();
	}

	async function openDueDateFilter(page: Page): Promise<void> {
		const dueDateFilterButton = page.getByRole('combobox').filter({ hasText: 'Due date' });
		await dueDateFilterButton.click();
		await expect(page.getByPlaceholder('Search due date filters...')).toBeVisible();
	}

	// Each toggle navigates from the current URL, so wait for it to land before the next click.
	async function toggleDueDateOption(page: Page, name: string, value: string): Promise<void> {
		const before = new URL(page.url()).searchParams.get('dueDate')?.split(',') ?? [];
		await page.getByRole('option', { name }).click();
		await expect(async () => {
			const after = new URL(page.url()).searchParams.get('dueDate')?.split(',') ?? [];
			expect(after.includes(value)).toBe(!before.includes(value));
		}).toPass();
	}

	test('displays due date filter in filter bar when filters are opened', async ({ page }) => {
		await navigateToKanbanBoard(page);
		await openFilters(page);

		// Check that the due date filter is present
		const dueDateFilter = page.getByRole('combobox').filter({ hasText: 'Due date' });
		await expect(dueDateFilter).toBeVisible();
	});

	test('shows due date filter options when opened', async ({ page }) => {
		await navigateToKanbanBoard(page);
		await openFilters(page);
		await openDueDateFilter(page);

		// Check that all due date filter options are available
		await expect(page.getByRole('option', { name: 'Overdue' })).toBeVisible();
		await expect(page.getByRole('option', { name: 'Due Today' })).toBeVisible();
		await expect(page.getByRole('option', { name: 'Upcoming' })).toBeVisible();
	});

	test('can select and deselect due date filters', async ({ page }) => {
		await navigateToKanbanBoard(page);
		await openFilters(page);
		await openDueDateFilter(page);

		// Select "Due Today" filter
		await toggleDueDateOption(page, 'Due Today', 'today');

		// Close the dropdown by clicking the button again
		const dueDateFilterButton = page.getByRole('combobox').filter({ hasText: 'Due date' });
		await dueDateFilterButton.click();

		// Check that the filter appears as a badge
		await expect(
			page.getByRole('button', { name: 'Remove due date filter Due Today' })
		).toBeVisible();

		// Check that the URL contains the due date filter
		await expect(page).toHaveURL(/dueDate=today/);

		// Reopen filter to deselect
		await openDueDateFilter(page);
		await toggleDueDateOption(page, 'Due Today', 'today');
		await dueDateFilterButton.click();

		// Check that the filter badge is removed
		await expect(
			page.getByRole('button', { name: 'Remove due date filter Due Today' })
		).not.toBeVisible();

		// Check that the URL parameter is removed
		await expect(page).not.toHaveURL(/dueDate=today/);
	});

	test('can select multiple due date filters', async ({ page }) => {
		await navigateToKanbanBoard(page);
		await openFilters(page);
		await openDueDateFilter(page);

		// Select multiple filters
		await toggleDueDateOption(page, 'Overdue', 'overdue');
		await toggleDueDateOption(page, 'Due Today', 'today');

		// Close the dropdown
		const dueDateFilterButton = page.getByRole('combobox').filter({ hasText: 'Due date' });
		await dueDateFilterButton.click();

		// Check that multiple filter badges appear
		await expect(
			page.getByRole('button', { name: 'Remove due date filter Overdue' })
		).toBeVisible();
		await expect(
			page.getByRole('button', { name: 'Remove due date filter Due Today' })
		).toBeVisible();

		// Check that the URL contains both filters
		await expect(page).toHaveURL(/dueDate=overdue%2Ctoday|dueDate=today%2Coverdue/);

		// Check that the dropdown button shows count
		await expect(dueDateFilterButton).toContainText('2 due date filters selected');
	});

	test('can clear all due date filters at once', async ({ page }) => {
		await navigateToKanbanBoard(page);
		await openFilters(page);
		await openDueDateFilter(page);

		// Select multiple filters
		await toggleDueDateOption(page, 'Overdue', 'overdue');
		await toggleDueDateOption(page, 'Upcoming', 'upcoming');

		// Clear all filters using the clear button
		await page.getByRole('option', { name: 'Clear due date filters' }).click();

		// Close the dropdown
		const dueDateFilterButton = page.getByRole('combobox').filter({ hasText: 'Due date' });
		await dueDateFilterButton.click();

		// Check that no filter badges appear
		await expect(
			page.getByRole('button', { name: 'Remove due date filter Overdue' })
		).not.toBeVisible();
		await expect(
			page.getByRole('button', { name: 'Remove due date filter Upcoming' })
		).not.toBeVisible();

		// Check that the URL parameter is removed
		await expect(page).not.toHaveURL(/dueDate=/);

		// Check that the dropdown button shows default text
		await expect(dueDateFilterButton).toContainText('Due date');
	});

	test('can remove individual due date filter badges', async ({ page }) => {
		await navigateToKanbanBoard(page);
		await openFilters(page);
		await openDueDateFilter(page);

		// Select multiple filters
		await toggleDueDateOption(page, 'Overdue', 'overdue');
		await toggleDueDateOption(page, 'Due Today', 'today');

		// Close the dropdown
		const dueDateFilterButton = page.getByRole('combobox').filter({ hasText: 'Due date' });
		await dueDateFilterButton.click();

		// Remove the "Overdue" filter by clicking the x button on its badge
		await page.getByRole('button', { name: 'Remove due date filter Overdue' }).click();

		// Check that only "Due Today" filter remains
		await expect(
			page.getByRole('button', { name: 'Remove due date filter Overdue' })
		).not.toBeVisible();
		await expect(
			page.getByRole('button', { name: 'Remove due date filter Due Today' })
		).toBeVisible();

		// Check that the URL only contains the remaining filter
		await expect(page).toHaveURL(/dueDate=today/);
		await expect(page).not.toHaveURL(/overdue/);
	});

	test('due date filter integrates with other filters', async ({ page }) => {
		await navigateToKanbanBoard(page);
		await openFilters(page);

		// Set a keyword filter
		await page.getByPlaceholder('Search title or description').fill('test task');
		await expect(page).toHaveURL(/keyword=test\+task/);

		// Add a due date filter
		await openDueDateFilter(page);
		await toggleDueDateOption(page, 'Due Today', 'today');

		const dueDateFilterButton = page.getByRole('combobox').filter({ hasText: 'Due date' });
		await dueDateFilterButton.click();

		// Check that both filters are applied
		await expect(page).toHaveURL(/keyword=test\+task/);
		await expect(page).toHaveURL(/dueDate=today/);

		// Check that filter badges show
		await expect(
			page.getByRole('button', { name: 'Remove due date filter Due Today' })
		).toBeVisible();
	});

	test('filter state persists on page refresh', async ({ page }) => {
		await navigateToKanbanBoard(page);
		await openFilters(page);
		await openDueDateFilter(page);

		// Select a filter
		await toggleDueDateOption(page, 'Upcoming', 'upcoming');

		const dueDateFilterButton = page.getByRole('combobox').filter({ hasText: 'Due date' });
		await dueDateFilterButton.click();

		// Refresh the page
		await page.reload();
		await expect(page.getByRole('heading', { name: 'Tasks' }).first()).toBeVisible();

		// Check that the filter is still applied
		await expect(page).toHaveURL(/dueDate=upcoming/);

		// Open filters to check the UI state
		await openFilters(page);
		await expect(
			page.getByRole('button', { name: 'Remove due date filter Upcoming' })
		).toBeVisible();
	});

	test('filter button highlights when due date filters are active', async ({ page }) => {
		await navigateToKanbanBoard(page);

		// Check initial state - filter button should not be highlighted
		const filterButton = page.getByLabel('Toggle task filters');

		await openFilters(page);
		await openDueDateFilter(page);

		// Select a filter
		await toggleDueDateOption(page, 'Due Today', 'today');

		const dueDateFilterButton = page.getByRole('combobox').filter({ hasText: 'Due date' });
		await dueDateFilterButton.click();

		// Close filters
		await filterButton.click();

		// Check that the filter button is highlighted (has active styling)
		await expect(filterButton).toHaveClass(/border-pen-tasks/);
	});
});
