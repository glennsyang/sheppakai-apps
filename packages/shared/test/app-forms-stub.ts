// Stand-in for SvelteKit's `$app/forms`, which this package's tests can't resolve (the real
// `deserialize` also needs the app's transport hooks initialised). Bodies in these tests are plain
// JSON, so `JSON.parse` is the whole of it.
export function deserialize(result: string): unknown {
	return JSON.parse(result);
}
