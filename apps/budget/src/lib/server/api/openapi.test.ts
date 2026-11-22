// Keeps `docs/openapi.yaml` honest (#328): every `/api/v1` route and method is in the spec
// with the scope the route actually checks, and the committed file matches the generator.
// Regenerate the file with `pnpm openapi`.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { API_OPERATIONS, buildOpenApiSpec, toYaml } from './openapi';

const API_ROOT = join(import.meta.dirname, '../../../routes/api/v1');

// Deprecated aliases (#320, #321) that re-export another route. They stay out of the spec and
// go away with the alias removal in #328.
const DEPRECATED_ALIASES = new Set([
	'/api/v1/transactions',
	'/api/v1/recurring',
	'/api/v1/recurring/{id}'
]);

type RouteOperation = { path: string; method: string; scope: string | undefined };

function routeFiles(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) return routeFiles(path);
		return entry.name === '+server.ts' ? [path] : [];
	});
}

/** The methods each `+server.ts` exports and the scope each one passes to `requireApiKey`. */
function routeOperations(): RouteOperation[] {
	return routeFiles(API_ROOT).flatMap((file) => {
		const path = `/api/v1/${relative(API_ROOT, file)}`
			.replace(/\/\+server\.ts$/, '')
			.replace(/\[(\w+)\]/g, '{$1}');
		const source = readFileSync(file, 'utf8');
		const handlers = source.split(/^export const (?=GET|POST|PATCH|PUT|DELETE)/m).slice(1);
		const reexported = [...source.matchAll(/^export \{([^}]+)\} from/gm)].flatMap((match) =>
			match[1].split(',').map((name) => name.trim())
		);
		return [
			...handlers.map((handler) => ({
				path,
				method: handler.slice(0, handler.indexOf(':')).toLowerCase(),
				scope: handler.match(/requireApiKey\(request, '([^']+)'\)/)?.[1]
			})),
			...reexported.map((name) => ({ path, method: name.toLowerCase(), scope: undefined }))
		];
	});
}

describe('OpenAPI spec', () => {
	const routes = routeOperations();
	const current = routes.filter((route) => !DEPRECATED_ALIASES.has(route.path));
	const key = (op: { path: string; method: string }) => `${op.method.toUpperCase()} ${op.path}`;

	it('finds the API routes on disk', () => {
		expect(current.length).toBeGreaterThan(10);
	});

	it('describes every current route and method, and nothing else', () => {
		expect(API_OPERATIONS.map(key).toSorted()).toEqual(current.map(key).toSorted());
	});

	it('names the scope each route checks', () => {
		const routeScopes = Object.fromEntries(current.map((route) => [key(route), route.scope]));
		const specScopes = Object.fromEntries(API_OPERATIONS.map((op) => [key(op), op.scope]));
		expect(Object.values(routeScopes)).not.toContain(undefined);
		expect(specScopes).toEqual(routeScopes);
	});

	it('leaves the deprecated aliases out', () => {
		const paths = Object.keys(buildOpenApiSpec().paths as object);
		expect(paths.filter((path) => DEPRECATED_ALIASES.has(path))).toEqual([]);
		// Every listed alias still exists on disk; drop it from the list when the route goes.
		const onDisk = new Set(routes.map((route) => route.path));
		expect([...DEPRECATED_ALIASES].filter((alias) => !onDisk.has(alias))).toEqual([]);
	});

	it('matches the committed docs/openapi.yaml (run `pnpm openapi` to update)', async () => {
		await expect(toYaml(buildOpenApiSpec())).toMatchFileSnapshot('../../../../docs/openapi.yaml');
	});
});

describe('toYaml', () => {
	it('quotes strings and keys that YAML would otherwise misread', () => {
		expect(
			toYaml({ a: 'yes', 200: { b: 'x: y # z' }, on: [1, { c: null }], empty: [], d: {} })
		).toBe(
			[
				'"200":',
				'  b: "x: y # z"',
				'a: "yes"',
				'"on":',
				'  - 1',
				'  - c: null',
				'empty: []',
				'd: {}',
				''
			].join('\n')
		);
	});
});
