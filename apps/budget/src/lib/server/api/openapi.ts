// OpenAPI 3.1 description of `/api/v1`, written to `docs/openapi.yaml` by `pnpm openapi`
// (#328). Request bodies and query parameters come from the same Zod schemas the routes
// validate with, and row shapes from the Drizzle tables, so the spec can't drift from what
// the API accepts and returns. `openapi.test.ts` fails when a route or method is missing
// here, or when the committed file is out of date.
import { type Column, getTableColumns, type Table } from 'drizzle-orm';
import { z } from 'zod';

import { API_SCOPES, type ApiScope } from '#lib/api-scopes.js';
import { apiBudgetsQuerySchema } from '#lib/server/api/schemas/budgets.js';
import { apiCreateContributionSchema } from '#lib/server/api/schemas/contributions.js';
import { apiDashboardQuerySchema } from '#lib/server/api/schemas/dashboard.js';
import {
	apiCreateExpenseSchema,
	apiExpenseListQuerySchema
} from '#lib/server/api/schemas/expenses.js';
import { apiCreateIncomeSchema, apiIncomeListQuerySchema } from '#lib/server/api/schemas/income.js';
import { apiMarkRecurringBillPaidSchema } from '#lib/server/api/schemas/recurring-bills.js';
import {
	apiCreateWindowCleaningCustomerSchema,
	apiUpdateWindowCleaningCustomerSchema
} from '#lib/server/api/schemas/window-cleaning-customers.js';
import {
	apiCreateWindowCleaningJobSchema,
	apiWindowCleaningJobListQuerySchema
} from '#lib/server/api/schemas/window-cleaning-jobs.js';
import {
	budget,
	category,
	contribution,
	expense,
	income,
	recurringBill,
	savingsGoal,
	windowCleaningCustomer,
	windowCleaningJob
} from '#lib/server/db/schema/index.js';

type JsonSchema = Record<string, unknown>;
type HttpMethod = 'get' | 'post' | 'patch';

const ref = (name: string): JsonSchema => ({ $ref: `#/components/schemas/${name}` });

/** JSON Schema for one Drizzle column as it serializes to JSON (timestamps become ISO strings). */
function columnSchema(column: Column): JsonSchema {
	const type =
		column.dataType === 'date'
			? 'string'
			: column.dataType === 'number'
				? column.columnType === 'SQLiteInteger'
					? 'integer'
					: 'number'
				: column.dataType;
	const schema: JsonSchema = { type: column.notNull ? type : [type, 'null'] };
	if (column.dataType === 'date') schema.format = 'date-time';
	if (column.enumValues?.length) schema.enum = column.enumValues;
	return schema;
}

/** A row of `table`, plus the relations the API's queries load with it. */
function rowSchema(table: Table, relations: Record<string, JsonSchema> = {}): JsonSchema {
	const columns = Object.entries(getTableColumns(table));
	return {
		type: 'object',
		properties: {
			...Object.fromEntries(columns.map(([name, column]) => [name, columnSchema(column)])),
			...relations
		},
		required: [...columns.map(([name]) => name), ...Object.keys(relations)]
	};
}

function jsonSchema(schema: z.ZodType): JsonSchema {
	const { $schema: _, ...rest } = z.toJSONSchema(schema, {
		io: 'input',
		unrepresentable: 'any'
	});
	return rest;
}

/**
 * Query parameters from a route's query schema, each with its value from `example` if it has
 * one. `required` covers rules a `.refine` enforces.
 */
function queryParameters(
	schema: z.ZodType,
	example: Record<string, string | number> = {},
	required: string[] = []
): JsonSchema[] {
	const object = jsonSchema(schema) as {
		properties?: Record<string, JsonSchema>;
		required?: string[];
	};
	return Object.entries(object.properties ?? {}).map(([name, property]) => ({
		name,
		in: 'query',
		required: required.includes(name) || (object.required ?? []).includes(name),
		schema: property,
		example: example[name]
	}));
}

const idParameter = (description: string, example: string): JsonSchema => ({
	name: 'id',
	in: 'path',
	required: true,
	description,
	schema: { type: 'string' },
	example
});

// The statuses come from `requireApiKey` (401, 429), `parseQuery`/`parseJsonBody` (400), the
// routes' own not-found checks (404) and their catch blocks (500). No route returns 403: a key
// without the scope gets 401.
const ERROR_RESPONSES: Record<number, string> = {
	400: 'Invalid JSON, or a query or body that failed validation (`invalid_json`, `validation_failed`).',
	401: 'Missing, malformed or invalid API key, or a key without the required scope (`missing_header`, `malformed_header`, `invalid_api_key`).',
	404: 'No record with that id (`not_found`).',
	429: 'Rate limit exceeded for this API key (`rate_limited`).',
	500: 'Server error (`internal_error`).'
};

type Operation = {
	path: string;
	method: HttpMethod;
	scope: ApiScope;
	summary: string;
	description?: string;
	parameters?: JsonSchema[];
	body?: z.ZodType;
	/** Example request body, matching the one in `docs/API.md`. */
	example?: Record<string, unknown>;
	/** Schema of `data` in the success envelope. */
	data: JsonSchema;
	status?: 200 | 201;
	/** Error statuses beyond the 401/429/500 every route can return. */
	errors?: (400 | 404)[];
};

/** Every `/api/v1` operation. */
export const API_OPERATIONS: Operation[] = [
	{
		path: '/api/v1/expenses',
		method: 'get',
		scope: 'transactions:read',
		summary: 'List expenses',
		description:
			'Newest first. `startDate` and `endDate` must be given together. `limit` only applies when no date range is given.',
		parameters: queryParameters(apiExpenseListQuerySchema, {
			startDate: '2026-08-01',
			endDate: '2026-08-31'
		}),
		data: { type: 'array', items: ref('Expense') },
		errors: [400]
	},
	{
		path: '/api/v1/expenses',
		method: 'post',
		scope: 'transactions:write',
		summary: 'Create an expense',
		description:
			'Returns the created expense with its category and owner. Every write, successful or not, is recorded in the audit log.',
		body: apiCreateExpenseSchema,
		example: {
			amount: 42.5,
			payee: 'Grocery Store',
			notes: 'Weekly shop',
			date: '2026-08-12',
			categoryId: 'cat_123',
			excludedFromBudget: false
		},
		data: ref('Expense'),
		status: 201,
		errors: [400]
	},
	{
		path: '/api/v1/budgets',
		method: 'get',
		scope: 'budgets:read',
		summary: 'List category budgets for a year, or one month of it',
		parameters: queryParameters(apiBudgetsQuerySchema, { year: 2026, month: 8 }, ['year']),
		data: { type: 'array', items: ref('Budget') },
		errors: [400]
	},
	{
		path: '/api/v1/categories',
		method: 'get',
		scope: 'categories:read',
		summary: 'List categories',
		data: { type: 'array', items: ref('Category') }
	},
	{
		path: '/api/v1/dashboard',
		method: 'get',
		scope: 'dashboard:read',
		summary: 'Dashboard summary',
		description:
			'The same figures the dashboard page shows. `mode=monthly` (default) uses `month` and `year`; `mode=yearly` uses `year` and `view`. Defaults to the current month or year.',
		parameters: queryParameters(apiDashboardQuerySchema, {
			mode: 'monthly',
			month: 8,
			year: 2026
		}),
		data: ref('DashboardSummary'),
		errors: [400]
	},
	{
		path: '/api/v1/income',
		method: 'get',
		scope: 'income:read',
		summary: 'List income',
		description:
			'`startDate` and `endDate` must be given together; `month` needs `year`. `limit` only applies when no range is given.',
		parameters: queryParameters(apiIncomeListQuerySchema, { month: 8, year: 2026 }),
		data: { type: 'array', items: ref('Income') },
		errors: [400]
	},
	{
		path: '/api/v1/income',
		method: 'post',
		scope: 'income:write',
		summary: 'Record income',
		body: apiCreateIncomeSchema,
		example: {
			name: 'Freelance payment',
			description: 'Invoice #42',
			date: '2026-08-12',
			amount: 500
		},
		data: ref('Income'),
		status: 201,
		errors: [400]
	},
	{
		path: '/api/v1/recurring-bills',
		method: 'get',
		scope: 'recurring:read',
		summary: 'List active recurring bills',
		description:
			"`paid` is this period's paid state: the current month, or the current year for Yearly bills.",
		data: { type: 'array', items: ref('RecurringBill') }
	},
	{
		path: '/api/v1/recurring-bills/{id}',
		method: 'patch',
		scope: 'recurring:markPaid',
		summary: 'Mark a recurring bill paid or unpaid for the current period',
		parameters: [idParameter('Recurring bill id.', 'rec_123')],
		body: apiMarkRecurringBillPaidSchema,
		example: { paid: true },
		data: ref('RecurringBill'),
		errors: [400, 404]
	},
	{
		path: '/api/v1/window-cleaning/customers',
		method: 'get',
		scope: 'windowCleaningCustomers:read',
		summary: 'List window-cleaning customers',
		description: 'Every active (non-deleted) customer.',
		data: { type: 'array', items: ref('WindowCleaningCustomer') }
	},
	{
		path: '/api/v1/window-cleaning/customers',
		method: 'post',
		scope: 'windowCleaningCustomers:write',
		summary: 'Create a window-cleaning customer',
		body: apiCreateWindowCleaningCustomerSchema,
		example: { name: 'Jane Doe', address: '123 Main St', city: 'Vancouver' },
		data: ref('WindowCleaningCustomer'),
		status: 201,
		errors: [400]
	},
	{
		path: '/api/v1/window-cleaning/customers/{id}',
		method: 'patch',
		scope: 'windowCleaningCustomers:write',
		summary: 'Replace a window-cleaning customer',
		description: 'A full replace of the editable fields, not a partial patch.',
		parameters: [idParameter('Customer id.', 'cust_123')],
		body: apiUpdateWindowCleaningCustomerSchema,
		example: { name: 'Jane Doe', address: '456 Elm St', city: 'Vancouver' },
		data: ref('WindowCleaningCustomer'),
		errors: [400, 404]
	},
	{
		path: '/api/v1/window-cleaning/jobs',
		method: 'get',
		scope: 'windowCleaningJobs:read',
		summary: 'List window-cleaning jobs',
		description:
			'Filters apply in this order: `customerId`, then `month` with `year`, then `year` alone. With none, returns every job.',
		parameters: queryParameters(apiWindowCleaningJobListQuerySchema, { customerId: 'cust_123' }),
		data: { type: 'array', items: ref('WindowCleaningJob') },
		errors: [400]
	},
	{
		path: '/api/v1/window-cleaning/jobs',
		method: 'post',
		scope: 'windowCleaningJobs:write',
		summary: 'Record a window-cleaning job',
		body: apiCreateWindowCleaningJobSchema,
		example: { customerId: 'cust_123', jobDate: '2026-08-12', amountCharged: 120, tip: 20 },
		data: ref('WindowCleaningJob'),
		status: 201,
		errors: [400]
	},
	{
		path: '/api/v1/savings/goals/{id}/contributions',
		method: 'post',
		scope: 'contributions:write',
		summary: 'Add a contribution to a savings goal',
		parameters: [idParameter('Savings goal id.', 'goal_123')],
		body: apiCreateContributionSchema,
		example: { amount: 100, date: '2026-08-12', description: 'Monthly deposit' },
		data: ref('Contribution'),
		status: 201,
		errors: [400, 404]
	}
];

const userRef = ref('User');

const COMPONENT_SCHEMAS: Record<string, JsonSchema> = {
	Category: rowSchema(category),
	// Matches `withPublicUsers` in `public-user.ts`: a record's owner carries only these fields.
	User: {
		type: 'object',
		description: "A record's owner. Email, role and ban details are never returned.",
		properties: { id: { type: 'string' }, name: { type: 'string' } },
		required: ['id', 'name']
	},
	Expense: rowSchema(expense, { category: ref('Category'), user: userRef }),
	Budget: rowSchema(budget, { category: ref('Category'), user: userRef }),
	Income: rowSchema(income),
	RecurringBill: rowSchema(recurringBill, {
		user: userRef,
		paid: {
			type: 'boolean',
			description: 'Paid for this period (month, or year for Yearly bills).'
		}
	}),
	WindowCleaningCustomer: rowSchema(windowCleaningCustomer, { user: userRef }),
	WindowCleaningJob: rowSchema(windowCleaningJob, {
		customer: ref('WindowCleaningCustomer'),
		user: userRef
	}),
	SavingsGoal: rowSchema(savingsGoal),
	Contribution: rowSchema(contribution, { goal: ref('SavingsGoal'), user: userRef }),
	DashboardSummary: {
		type: 'object',
		description:
			'Computed dashboard figures. The fields differ by `mode`; see `docs/API.md` for what each one means.',
		properties: { mode: { type: 'string', enum: ['monthly', 'yearly'] } },
		required: ['mode'],
		additionalProperties: true
	},
	Error: {
		type: 'object',
		properties: {
			error: {
				type: 'object',
				properties: { code: { type: 'string' }, message: { type: 'string' } },
				required: ['code', 'message']
			}
		},
		required: ['error']
	}
};

function operationId(op: Operation): string {
	const words = op.path
		.replace('/api/v1/', '')
		.split(/[/-]/)
		.filter((part) => part && !part.startsWith('{'))
		.map((part) => part[0].toUpperCase() + part.slice(1))
		.join('');
	return `${op.method}${words}${op.path.endsWith('}') ? 'ById' : ''}`;
}

function operationObject(op: Operation): JsonSchema {
	const errorStatuses = [...(op.errors ?? []), 401, 429, 500].toSorted((a, b) => a - b);
	return {
		operationId: operationId(op),
		summary: op.summary,
		description: [op.description, `Requires the \`${op.scope}\` scope.`]
			.filter(Boolean)
			.join('\n\n'),
		'x-required-scope': op.scope,
		parameters: op.parameters,
		requestBody: op.body
			? {
					required: true,
					content: { 'application/json': { schema: jsonSchema(op.body), example: op.example } }
				}
			: undefined,
		responses: {
			[op.status ?? 200]: {
				description: op.status === 201 ? 'Created.' : 'OK.',
				content: {
					'application/json': {
						schema: { type: 'object', properties: { data: op.data }, required: ['data'] }
					}
				}
			},
			...Object.fromEntries(
				errorStatuses.map((status) => [
					status,
					{
						description: ERROR_RESPONSES[status],
						content: { 'application/json': { schema: ref('Error') } }
					}
				])
			)
		}
	};
}

export function buildOpenApiSpec(): JsonSchema {
	const paths: Record<string, Record<string, JsonSchema>> = {};
	for (const op of API_OPERATIONS) {
		paths[op.path] = { ...paths[op.path], [op.method]: operationObject(op) };
	}
	return {
		openapi: '3.1.0',
		info: {
			title: 'Sheppakai Budget API',
			version: '1',
			description: [
				'Read and write access to the budget app for external tools. Every request needs an API key, created by an admin under Admin → API Keys, with the scope each operation names.',
				`Scopes: ${API_SCOPES.map((scope) => `\`${scope}\``).join(', ')}.`,
				'Every response is JSON: `{ "data": ... }` on success, `{ "error": { "code", "message" } }` on failure. Every write is recorded in an audit log with the key that made it.'
			].join('\n\n')
		},
		servers: [
			{ url: 'https://budget.example.com', description: 'Replace with the deployed app URL.' }
		],
		security: [{ apiKey: [] }],
		paths,
		components: {
			securitySchemes: {
				apiKey: {
					type: 'http',
					scheme: 'bearer',
					description: 'An API key: `Authorization: Bearer sk_…`.'
				}
			},
			schemas: COMPONENT_SCHEMAS
		}
	};
}

const PLAIN_KEY = /^[A-Za-z_$][\w$.-]*$/;
// Words YAML 1.1 parsers read as booleans or null when unquoted.
const RESERVED_KEY = /^(?:true|false|yes|no|on|off|null|y|n)$/i;

function isNonEmptyComposite(value: unknown): value is object {
	if (typeof value !== 'object' || value === null) return false;
	return Array.isArray(value) ? value.length > 0 : Object.keys(value).length > 0;
}

function scalar(value: unknown): string {
	if (Array.isArray(value)) return '[]';
	if (typeof value === 'object' && value !== null) return '{}';
	// JSON strings are valid YAML double-quoted scalars, so no YAML-specific escaping is needed.
	if (typeof value === 'string') return JSON.stringify(value);
	if (typeof value === 'number' || typeof value === 'boolean') return `${value}`;
	return 'null';
}

function yamlLines(value: object, indent: number): string[] {
	const pad = '  '.repeat(indent);
	if (Array.isArray(value)) {
		return value.flatMap((item) => {
			if (!isNonEmptyComposite(item)) return [`${pad}- ${scalar(item)}`];
			const [first, ...rest] = yamlLines(item, indent + 1);
			return [`${pad}- ${first.trimStart()}`, ...rest];
		});
	}
	return Object.entries(value)
		.filter(([, item]) => item !== undefined)
		.flatMap(([key, item]) => {
			const name = PLAIN_KEY.test(key) && !RESERVED_KEY.test(key) ? key : JSON.stringify(key);
			return isNonEmptyComposite(item)
				? [`${pad}${name}:`, ...yamlLines(item, indent + 1)]
				: [`${pad}${name}: ${scalar(item)}`];
		});
}

/** Block-style YAML for a JSON-compatible value. Every string is quoted, so the output is unambiguous. */
export function toYaml(value: object): string {
	return `${yamlLines(value, 0).join('\n')}\n`;
}
