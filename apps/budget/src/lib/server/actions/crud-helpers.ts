import type { RequestEvent } from '@sveltejs/kit';
import { eq, getTableColumns } from 'drizzle-orm';
import type { SQLiteTableWithColumns } from 'drizzle-orm/sqlite-core';
import { message, type SuperValidated, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import type { z, ZodType } from 'zod';

import { idSchema } from '#lib/formSchemas/index.js';
import { getDb } from '#lib/server/db/index.js';
import { withUpdatedAt } from '#lib/server/db/utils.js';
import { logger } from '#lib/server/logger.js';

import { requireAuth } from './auth-guard';
import { invalidForm } from './form-responses';
import { type CrudMessages, getCrudMessage } from './messages';

/**
 * Type aliases - using Drizzle ORM's type inference to minimize 'any' usage
 * Note: SQLiteTableWithColumns requires 'any' in its constraint due to Drizzle's type system
 */
type AnyZodSchema = ZodType<Record<string, unknown>>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySQLiteTable = SQLiteTableWithColumns<any>;
type InferSchemaType<TSchema extends AnyZodSchema> = z.infer<TSchema>;
type InferInsertType<TTable extends AnySQLiteTable> = TTable['$inferInsert'];

/**
 * What a `before*` hook or a write returns to reject the request on a business rule. The text
 * is shown to the user as a 400 banner; a thrown error is still treated as an unexpected 500.
 */
type HookError = { error: string };

function isHookError(value: unknown): value is HookError {
	return (
		typeof value === 'object' &&
		value !== null &&
		typeof (value as { error?: unknown }).error === 'string'
	);
}

/** What every form action needs to know about its entity: the form and the user-facing text. */
interface FormConfig<TSchema extends AnyZodSchema> {
	/** Zod schema for form validation */
	schema: TSchema;

	/** Entity name for logging and messages (e.g., "Expense", "Category") */
	entityName: string;

	/** Custom messages to override defaults */
	messages?: CrudMessages;
}

/**
 * A write returns (or resolves to) anything: a `HookError` rejects the request with a 400 banner;
 * any other value is success and is ignored.
 */
type CreateWrite<TSchema extends AnyZodSchema> = (
	data: InferSchemaType<TSchema>,
	userId: string
) => unknown;

type UpdateWrite<TSchema extends AnyZodSchema> = (
	id: string,
	data: InferSchemaType<TSchema>,
	userId: string
) => unknown;

type DeleteWrite = (id: string, userId: string) => unknown;

type Operation = 'create' | 'update' | 'delete';

/**
 * Runs one write inside the form envelope: a `HookError` result becomes a 400 banner, a thrown
 * error is logged and becomes a 500 banner, and anything else is the success message.
 */
async function runWrite<TForm extends Record<string, unknown>>(
	form: SuperValidated<TForm>,
	operation: Operation,
	config: Pick<FormConfig<AnyZodSchema>, 'entityName' | 'messages'>,
	write: () => unknown,
	logFields?: Record<string, unknown>
) {
	try {
		const result = await write();
		if (isHookError(result)) {
			return message(form, { type: 'error', text: result.error }, { status: 400 });
		}
		logger.info(`${config.entityName} ${operation}d successfully`, logFields);
	} catch (error) {
		logger.error(`Failed to ${operation} ${config.entityName.toLowerCase()}`, error);
		return message(
			form,
			{
				type: 'error',
				text: getCrudMessage(`${operation}Error`, config.entityName, config.messages)
			},
			{ status: 500 }
		);
	}

	return message(form, {
		type: 'success',
		text: getCrudMessage(`${operation}Success`, config.entityName, config.messages)
	});
}

/**
 * The form envelope for a create: validate, call the entity's write, answer with a message.
 * The write owns the row mapping and any side effects (see `lib/server/db/writes/`).
 */
export function writeCreateAction<TSchema extends AnyZodSchema>(
	config: FormConfig<TSchema>,
	write: CreateWrite<TSchema>
) {
	return requireAuth(async (event: RequestEvent, user) => {
		const form = await superValidate(event.request, zod4(config.schema));
		if (!form.valid) return invalidForm(form);

		// superforms types `form.data` as its own Infer<TSchema>, which TypeScript can't relate
		// to z.infer<TSchema> while TSchema is generic. Both name the same parsed output.
		// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- generic Infer<TSchema>, see above
		const data = form.data as InferSchemaType<TSchema>;
		return runWrite(form, 'create', config, () => write(data, user.id));
	});
}

/** The form envelope for an update. The form's `id` names the record; it is required. */
export function writeUpdateAction<TSchema extends AnyZodSchema>(
	config: FormConfig<TSchema>,
	write: UpdateWrite<TSchema>
) {
	return requireAuth(async (event: RequestEvent, user) => {
		const form = await superValidate(event.request, zod4(config.schema));
		if (!form.valid) return invalidForm(form);

		const recordId = (form.data as Record<string, unknown> & { id?: string }).id;
		if (!recordId) return invalidForm(form, 'ID is required for update');

		// See writeCreateAction: superforms' Infer<TSchema> vs z.infer<TSchema>.
		// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- generic Infer<TSchema>, see writeCreateAction
		const data = form.data as InferSchemaType<TSchema>;
		return runWrite(form, 'update', config, () => write(recordId, data, user.id), {
			id: recordId
		});
	});
}

/**
 * The form envelope for a delete.
 *
 * Every delete in the app takes an id and nothing else, so this validates against `idSchema`
 * rather than a per-caller schema. That keeps it on one code path, and so on the response
 * contract in `docs/ERROR_HANDLING_POLICY.md`.
 */
export function writeDeleteAction(
	config: Pick<FormConfig<AnyZodSchema>, 'entityName' | 'messages'>,
	write: DeleteWrite
) {
	return requireAuth(async (event: RequestEvent, user) => {
		const form = await superValidate(event.request, zod4(idSchema));
		if (!form.valid) return invalidForm(form);

		return runWrite(form, 'delete', config, () => write(form.data.id, user.id), {
			id: form.data.id,
			userId: user.id
		});
	});
}

/** Create, update and delete actions for an entity whose writes live in a write module. */
export function createWriteActions<TSchema extends AnyZodSchema>(
	config: FormConfig<TSchema> & {
		create: CreateWrite<TSchema>;
		update: UpdateWrite<TSchema>;
		delete: DeleteWrite;
	}
) {
	return {
		create: writeCreateAction(config, config.create),
		update: writeUpdateAction(config, config.update),
		delete: writeDeleteAction(config, config.delete)
	};
}

/**
 * Configuration for table-backed CRUD actions: entities with no write module, whose form maps
 * straight onto one table.
 */
interface CrudConfig<
	TSchema extends AnyZodSchema,
	TTable extends AnySQLiteTable
> extends FormConfig<TSchema> {
	/** Drizzle table reference */
	table: TTable;

	/** Transform data before creating (e.g., format dates, convert types) */
	transformCreate?: (
		data: InferSchemaType<TSchema>,
		userId: string
	) => Partial<InferInsertType<TTable>>;

	/** Transform data before updating (e.g., format dates, convert types) */
	transformUpdate?: (
		data: InferSchemaType<TSchema>,
		userId: string
	) => Partial<InferInsertType<TTable>>;

	/** Hook to run before creating a record; return `{ error }` to reject with a 400 message */
	beforeCreate?: (data: InferSchemaType<TSchema>, userId: string) => Promise<void | HookError>;

	/** Hook to run before updating a record; return `{ error }` to reject with a 400 message */
	beforeUpdate?: (
		id: string,
		data: InferSchemaType<TSchema>,
		userId: string
	) => Promise<void | HookError>;

	/** Hook to run before deleting a record; return `{ error }` to reject with a 400 message */
	beforeDelete?: (id: string, userId: string) => Promise<void | HookError>;
}

/** The `CrudConfig` fields a delete uses; none depend on the schema. */
type DeleteConfig<TTable extends AnySQLiteTable> = Pick<
	CrudConfig<AnyZodSchema, TTable>,
	'table' | 'entityName' | 'messages' | 'beforeDelete'
>;

function tableInsert<TSchema extends AnyZodSchema, TTable extends AnySQLiteTable>(
	config: CrudConfig<TSchema, TTable>
): CreateWrite<TSchema> {
	return async (data, userId) => {
		if (config.beforeCreate) {
			const rejected = await config.beforeCreate(data, userId);
			if (isHookError(rejected)) return rejected;
		}

		const row = (
			config.transformCreate ? config.transformCreate(data, userId) : { ...data }
		) as Record<string, unknown>;
		// The id is generated by the column default
		delete row.id;
		if (!row.userId) row.userId = userId;

		await getDb()
			.insert(config.table)
			.values(row as InferInsertType<TTable>);
	};
}

function tableUpdate<TSchema extends AnyZodSchema, TTable extends AnySQLiteTable>(
	config: CrudConfig<TSchema, TTable>
): UpdateWrite<TSchema> {
	return async (id, data, userId) => {
		if (config.beforeUpdate) {
			const rejected = await config.beforeUpdate(id, data, userId);
			if (isHookError(rejected)) return rejected;
		}

		const row = (
			config.transformUpdate ? config.transformUpdate(data, userId) : { ...data }
		) as Record<string, unknown>;
		delete row.id;

		const columns = getTableColumns(config.table);
		await getDb()
			.update(config.table)
			.set(withUpdatedAt(row as Partial<InferInsertType<TTable>>))
			.where(eq(columns.id, id));
	};
}

function tableDelete<TTable extends AnySQLiteTable>(config: DeleteConfig<TTable>): DeleteWrite {
	return async (id, userId) => {
		if (config.beforeDelete) {
			const rejected = await config.beforeDelete(id, userId);
			if (isHookError(rejected)) return rejected;
		}

		const columns = getTableColumns(config.table);
		await getDb().delete(config.table).where(eq(columns.id, id));
	};
}

/**
 * Create, update and delete actions for an entity whose form maps straight onto one table.
 * Entities with a write module in `lib/server/db/writes/` use `createWriteActions` instead.
 */
export function createCrudActions<TSchema extends AnyZodSchema, TTable extends AnySQLiteTable>(
	config: CrudConfig<TSchema, TTable>
) {
	return {
		create: createAction(config),
		update: updateAction(config),
		delete: deleteAction(config)
	};
}

export function createAction<TSchema extends AnyZodSchema, TTable extends AnySQLiteTable>(
	config: CrudConfig<TSchema, TTable>
) {
	return writeCreateAction(config, tableInsert(config));
}

export function updateAction<TSchema extends AnyZodSchema, TTable extends AnySQLiteTable>(
	config: CrudConfig<TSchema, TTable>
) {
	return writeUpdateAction(config, tableUpdate(config));
}

export function deleteAction<TTable extends AnySQLiteTable>(config: DeleteConfig<TTable>) {
	return writeDeleteAction(config, tableDelete(config));
}
