import { type APIResponse, expect, type Page, test } from '@playwright/test';

const testUserEmail = process.env.E2E_USER_EMAIL;
const testUserPassword = process.env.E2E_USER_PASSWORD;

const primaryLane = 'In Progress tasks';
const secondaryLane = 'New tasks';
const laneLabels = [primaryLane, secondaryLane, 'On Hold tasks', 'Blocked tasks', 'Done tasks'];
const moveResponseTimeoutMs = 5000;
const dragRetryDelayMs = 150;

type DragPosition = {
	x: number;
	y: number;
};

type DragAttempt = {
	mode: 'locator' | 'mouse';
	sourcePosition: DragPosition;
	targetPosition: DragPosition;
};

type SeededTask = {
	id: string;
	title: string;
};

test.describe('tasks kanban drag and drop', () => {
	test.skip(
		!testUserEmail || !testUserPassword,
		'Set E2E_USER_EMAIL and E2E_USER_PASSWORD in .env.test to run this spec.'
	);

	let seededTask: SeededTask | null = null;

	test.beforeEach(async ({ page }) => {
		seededTask = await createTask(page, `E2E drag ${Date.now()}`, 'in_progress');
	});

	test.afterEach(async ({ page }) => {
		if (seededTask) {
			await deleteTask(page, seededTask.id);
			seededTask = null;
		}
	});

	test('moves a task across lanes without client-side errors and restores the board', async ({
		page
	}) => {
		test.slow();

		const boardTaskTitle = seededTask?.title ?? '';
		const pageErrors: string[] = [];
		const consoleErrors: string[] = [];

		page.on('pageerror', (error) => {
			pageErrors.push(String(error));
		});

		page.on('console', (message) => {
			if (message.type() === 'error') {
				consoleErrors.push(message.text());
			}
		});

		await page.goto('/tasks', { waitUntil: 'networkidle' });
		await expect(page.getByRole('heading', { name: 'Tasks' }).first()).toBeVisible();
		await expect(page.locator(`[aria-label="${primaryLane}"]`)).toBeVisible();

		const startingLane = await findLaneForTask(page, boardTaskTitle);
		expect(startingLane).toBe(primaryLane);

		const sourceLane = startingLane ?? primaryLane;
		const destinationLane = sourceLane === secondaryLane ? primaryLane : secondaryLane;

		try {
			await moveTaskAndAssert(page, boardTaskTitle, destinationLane);
			await expect(taskInLane(page, destinationLane, boardTaskTitle)).toBeVisible();
			await expect(taskInLane(page, sourceLane, boardTaskTitle)).toHaveCount(0);
		} finally {
			await restoreTaskIfNeeded(page, boardTaskTitle, sourceLane);
		}

		await expect(taskInLane(page, sourceLane, boardTaskTitle)).toBeVisible();
		expect(pageErrors).toEqual([]);
		expect(consoleErrors).toEqual([]);
	});
});

/** Posts to a SvelteKit form action the way `use:enhance` does, so the result comes back as JSON. */
function postFormAction(page: Page, path: string, form: Record<string, string>) {
	const baseURL = test.info().project.use.baseURL ?? '';
	return page.request.post(path, {
		form,
		headers: { origin: new URL(baseURL).origin, 'x-sveltekit-action': 'true' },
		maxRedirects: 0
	});
}

async function expectActionRedirect(response: APIResponse) {
	expect(response.ok()).toBe(true);
	const result = (await response.json()) as { type?: string };
	expect(result.type).toBe('redirect');
}

async function createTask(page: Page, title: string, state: string): Promise<SeededTask> {
	await expectActionRedirect(
		await postFormAction(page, '/tasks/new', { title, priority: '2', state })
	);

	await page.goto('/tasks');
	const href = await page.getByRole('link', { name: title, exact: true }).getAttribute('href');
	const id = href?.match(/^\/tasks\/([^/]+)\/edit$/)?.[1];
	if (!id) {
		throw new Error(`Could not find the id of the seeded task "${title}"`);
	}

	return { id, title };
}

async function deleteTask(page: Page, id: string) {
	await expectActionRedirect(await postFormAction(page, '/tasks?/delete', { id }));
}

function laneLocator(page: Page, laneLabel: string) {
	return page.locator(`[aria-label="${laneLabel}"]`).first();
}

function taskInLane(page: Page, laneLabel: string, taskTitle: string) {
	return laneLocator(page, laneLabel).locator(`[aria-label="${taskTitle}"]`).first();
}

async function findLaneForTask(page: Page, taskTitle: string) {
	if (page.isClosed()) {
		return null;
	}

	for (const laneLabel of laneLabels) {
		if (await taskInLane(page, laneLabel, taskTitle).count()) {
			return laneLabel;
		}
	}

	return null;
}

function isPageClosedError(error: unknown) {
	return (
		error instanceof Error && /Target page, context or browser has been closed/i.test(error.message)
	);
}

async function restoreTaskIfNeeded(page: Page, taskTitle: string, sourceLane: string) {
	if (page.isClosed()) {
		return;
	}

	try {
		const currentLane = await findLaneForTask(page, taskTitle);
		if (currentLane && currentLane !== sourceLane) {
			await moveTaskAndAssert(page, taskTitle, sourceLane);
		}
	} catch (error) {
		if (isPageClosedError(error)) {
			return;
		}

		throw error;
	}
}

async function moveTaskAndAssert(page: Page, taskTitle: string, targetLaneLabel: string) {
	const task = page.locator(`[aria-label="${taskTitle}"]`).first();
	const targetLane = laneLocator(page, targetLaneLabel);

	await expect(task).toBeVisible();
	await expect(targetLane).toBeVisible();
	await task.scrollIntoViewIfNeeded();
	await targetLane.scrollIntoViewIfNeeded();

	const sourceBox = await task.boundingBox();
	const targetBox = await targetLane.boundingBox();

	if (!sourceBox || !targetBox) {
		throw new Error(`Could not resolve drag coordinates for ${taskTitle} -> ${targetLaneLabel}`);
	}

	const dragAttempts: DragAttempt[] = [
		{
			mode: 'locator',
			sourcePosition: {
				x: Math.max(16, Math.min(40, sourceBox.width - 16)),
				y: Math.max(16, Math.min(24, sourceBox.height - 16))
			},
			targetPosition: {
				x: Math.max(24, Math.min(targetBox.width / 2, targetBox.width - 24)),
				y: Math.max(32, Math.min(targetBox.height * 0.35, targetBox.height - 24))
			}
		},
		{
			mode: 'mouse',
			sourcePosition: {
				x: Math.max(24, Math.min(sourceBox.width / 2, sourceBox.width - 24)),
				y: Math.max(20, Math.min(28, sourceBox.height - 16))
			},
			targetPosition: {
				x: Math.max(32, Math.min(72, targetBox.width - 24)),
				y: Math.max(48, Math.min(88, targetBox.height - 24))
			}
		},
		{
			mode: 'locator',
			sourcePosition: {
				x: Math.max(24, Math.min(sourceBox.width / 2, sourceBox.width - 24)),
				y: Math.max(24, Math.min(sourceBox.height / 2, sourceBox.height - 16))
			},
			targetPosition: {
				x: Math.max(24, Math.min(targetBox.width / 2, targetBox.width - 24)),
				y: Math.max(64, Math.min(targetBox.height / 2, targetBox.height - 24))
			}
		}
	];

	let moveTriggered = false;

	for (const [index, attempt] of dragAttempts.entries()) {
		const response = await performDragAttempt(
			page,
			task,
			targetLane,
			sourceBox,
			targetBox,
			attempt
		);
		if (response) {
			const actionResult = JSON.parse(await response.text()) as { type?: string };
			expect(actionResult.type).toBe('success');
			moveTriggered = true;
			break;
		}

		if (index < dragAttempts.length - 1) {
			await page.waitForTimeout(dragRetryDelayMs);
		}
	}

	expect(moveTriggered).toBe(true);

	await expect(taskInLane(page, targetLaneLabel, taskTitle)).toBeVisible();
}

async function performDragAttempt(
	page: Page,
	task: ReturnType<Page['locator']>,
	targetLane: ReturnType<Page['locator']>,
	sourceBox: NonNullable<Awaited<ReturnType<ReturnType<Page['locator']>['boundingBox']>>>,
	targetBox: NonNullable<Awaited<ReturnType<ReturnType<Page['locator']>['boundingBox']>>>,
	attempt: DragAttempt
) {
	const moveResponse = page
		.waitForResponse(
			(response) =>
				response.url().includes('?/moveBoardTask') && response.request().method() === 'POST',
			{ timeout: moveResponseTimeoutMs }
		)
		.catch((error: unknown) => {
			if (error instanceof Error && error.name === 'TimeoutError') {
				return null;
			}

			throw error;
		});

	if (attempt.mode === 'locator') {
		await task.dragTo(targetLane, {
			sourcePosition: attempt.sourcePosition,
			targetPosition: attempt.targetPosition,
			force: true,
			timeout: 10000
		});
	} else {
		await dragWithMouse(page, sourceBox, targetBox, attempt.sourcePosition, attempt.targetPosition);
	}

	return moveResponse;
}

async function dragWithMouse(
	page: Page,
	sourceBox: NonNullable<Awaited<ReturnType<ReturnType<Page['locator']>['boundingBox']>>>,
	targetBox: NonNullable<Awaited<ReturnType<ReturnType<Page['locator']>['boundingBox']>>>,
	sourcePosition: DragPosition,
	targetPosition: DragPosition
) {
	const startX = sourceBox.x + sourcePosition.x;
	const startY = sourceBox.y + sourcePosition.y;
	const targetX = targetBox.x + targetPosition.x;
	const targetY = targetBox.y + targetPosition.y;

	await page.mouse.move(startX, startY);
	await page.mouse.down();

	try {
		await page.mouse.move(startX + 18, startY + 10, { steps: 8 });
		await page.waitForTimeout(80);
		await page.mouse.move(targetX, targetY, { steps: 30 });
		await page.waitForTimeout(120);
	} finally {
		await page.mouse.up();
	}
}
