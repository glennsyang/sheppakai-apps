// Test-only helpers for calling a route's form actions directly in Vitest.

const ORIGIN = 'https://budget.example.com';

type FieldValue = string | File;

type ActionEventOptions = {
	/** Shortcut for `locals: { user }`. Ignored when `locals` is given. */
	user?: Partial<NonNullable<App.Locals['user']>> | null;
	locals?: Partial<App.Locals>;
	getClientAddress?: () => string;
	cookies?: { get: (name: string) => string | undefined; set: (...args: unknown[]) => void };
};

/** The `RequestEvent` fields our actions read. Mutable so a test can swap one out. */
export type ActionEvent = {
	request: Request;
	url: URL;
	locals: Partial<App.Locals>;
	getClientAddress: () => string;
	cookies: NonNullable<ActionEventOptions['cookies']>;
};

/** A superforms form as an action returns it (`form` on success, `data.form` on failure). */
type ActionForm<T> = {
	data: T;
	valid: boolean;
	errors: Record<string, string[] | undefined>;
	message?: App.Superforms.Message;
};

export type ActionOutcome<T = unknown> = {
	status?: number;
	data?: { form: ActionForm<T> };
	form?: ActionForm<T>;
};

/**
 * Build the event for a POST of `fields` to `path?/action`. Fields go in a `FormData`
 * body, so a `File` value is uploaded as a file.
 */
export function actionEvent(
	path: string,
	action: string,
	fields: Record<string, FieldValue | null | undefined> = {},
	options: ActionEventOptions = {}
): ActionEvent {
	const body = new FormData();
	for (const [key, value] of Object.entries(fields)) {
		if (value != null) body.set(key, value);
	}
	const url = new URL(`${path}?/${action}`, ORIGIN);
	return {
		request: new Request(url, { method: 'POST', body }),
		url,
		locals: options.locals ?? { user: (options.user ?? null) as App.Locals['user'] },
		getClientAddress: options.getClientAddress ?? (() => '127.0.0.1'),
		cookies: options.cookies ?? { get: () => undefined, set: () => undefined }
	};
}

/** Run a SvelteKit action with an `actionEvent` and read its result as a superforms outcome. */
export async function runAction<T = unknown>(
	action: (event: never) => unknown,
	event: ActionEvent
): Promise<ActionOutcome<T>> {
	const call = action as (event: ActionEvent) => unknown;
	return (await call(event)) as ActionOutcome<T>;
}
