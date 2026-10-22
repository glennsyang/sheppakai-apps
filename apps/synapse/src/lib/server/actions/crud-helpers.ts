import { isRecord } from '@sheppakai/shared/guards';
import type { RequestEvent } from '@sveltejs/kit';
import { and, eq, getTableColumns } from 'drizzle-orm';
import type { SQLiteTableWithColumns } from 'drizzle-orm/sqlite-core';
import { type Infer, message, type SuperValidated, superValidate } from 'sveltekit-superforms';
import { zod4, type ZodValidationSchema } from 'sveltekit-superforms/adapters';

import { getDb } from '#lib/server/db/index.js';
import {
	generateId,
	withTimestampsForCreate,
	withTimestampsForUpdate
} from '#lib/server/db/utils.js';
import { logger } from '#lib/server/logger.js';

import { requireAuth } from './auth-guard';
import { invalidForm } from './form-responses';

/**
 * Ported from budget's `createCrudActions`, adapted for synapse: every row belongs to a user, so
 * update and delete are scoped to `id` AND `userId`, and a miss is a 404 rather than a silent
 * no-op. Success defaults to `message(form, { type: 'success', text })` per
 * docs/ERROR_HANDLING_POLICY.md; pass `onSuccess` for a redirect or a different text.
 */

// SQLiteTableWithColumns requires `any` in its constraint due to Drizzle's type system.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UserOwnedTable = SQLiteTableWithColumns<any>;
type Data<S extends ZodValidationSchema> = Infer<S, 'zod4'>;
type Row<T extends UserOwnedTable> = T['$inferInsert'];

interface BaseConfig<S extends ZodValidationSchema, T extends UserOwnedTable, R> {
	schema: S;
	table: T;
	/** Sentence-case entity name for messages and logs, e.g. "Weight entry". */
	entityName: string;
	/** Banner text for an invalid form; defaults to `invalidForm`'s generic text. */
	invalidMessage?: string;
	/**
	 * The response once the write succeeds. It runs outside the try/catch, so it may
	 * `throw redirect(...)`.
	 */
	onSuccess?: (form: SuperValidated<Data<S>>, id: string) => R;
}

interface WriteConfig<
	S extends ZodValidationSchema,
	T extends UserOwnedTable,
	R
> extends BaseConfig<S, T, R> {
	/** The columns to write from the validated form. Ids, userId and timestamps are added here. */
	toRow: (data: Data<S>) => Partial<Row<T>>;
}

interface DeleteConfig<
	S extends ZodValidationSchema,
	T extends UserOwnedTable,
	R
> extends BaseConfig<S, T, R> {
	/** Where the id comes from; defaults to `form.data.id`. */
	getId?: (form: SuperValidated<Data<S>>, event: RequestEvent) => string;
}

const lower = (entityName: string) => entityName.toLowerCase();

function serverError<S extends Record<string, unknown>>(form: SuperValidated<S>, text: string) {
	return message(form, { type: 'error', text }, { status: 500 });
}

function success<S extends Record<string, unknown>>(form: SuperValidated<S>, text: string) {
	return message(form, { type: 'success', text });
}

function notFound<S extends Record<string, unknown>>(form: SuperValidated<S>, entityName: string) {
	return message(form, { type: 'error', text: `${entityName} not found.` }, { status: 404 });
}

/** The `id` field of a schema that has one (update and default delete schemas do). */
function idOf(data: unknown): string {
	if (isRecord(data) && typeof data.id === 'string') return data.id;
	throw new TypeError('Expected the validated form to carry a string `id`');
}

function ownedBy(table: UserOwnedTable, id: string, userId: string) {
	const columns = getTableColumns(table);
	return and(eq(columns.id, id), eq(columns.userId, userId));
}

type SuccessResponse<S extends ZodValidationSchema> = ReturnType<typeof success<Data<S>>>;

/** Insert a row owned by the signed-in user. Success defaults to "<Entity> created." */
export function createAction<
	S extends ZodValidationSchema,
	T extends UserOwnedTable,
	R = SuccessResponse<S>
>(config: WriteConfig<S, T, R>) {
	return requireAuth(async ({ request }, user) => {
		const form = await superValidate(request, zod4(config.schema));
		if (!form.valid) return invalidForm(form, config.invalidMessage);

		const id = generateId();
		try {
			await getDb()
				.insert(config.table)
				.values({
					...config.toRow(form.data),
					id,
					userId: user.id,
					...withTimestampsForCreate()
				} as Row<T>);

			logger.info(`${config.entityName} created`, { id, userId: user.id });
		} catch (error) {
			logger.error(`Failed to create ${lower(config.entityName)}`, error);
			return serverError(form, `Failed to save ${lower(config.entityName)}. Please try again.`);
		}

		return config.onSuccess
			? config.onSuccess(form, id)
			: success(form, `${config.entityName} created.`);
	});
}

/** Update the user's own row by `form.data.id`. Success defaults to "<Entity> updated." */
export function updateAction<
	S extends ZodValidationSchema,
	T extends UserOwnedTable,
	R = SuccessResponse<S>
>(config: WriteConfig<S, T, R>) {
	return requireAuth(async ({ request }, user) => {
		const form = await superValidate(request, zod4(config.schema));
		if (!form.valid) return invalidForm(form, config.invalidMessage);

		const id = idOf(form.data);
		try {
			const updated = await getDb()
				.update(config.table)
				.set({ ...config.toRow(form.data), ...withTimestampsForUpdate() })
				.where(ownedBy(config.table, id, user.id))
				.returning({ id: getTableColumns(config.table).id });

			if (updated.length === 0) return notFound(form, config.entityName);

			logger.info(`${config.entityName} updated`, { id, userId: user.id });
		} catch (error) {
			logger.error(`Failed to update ${lower(config.entityName)}`, error, { id });
			return serverError(form, `Failed to update ${lower(config.entityName)}. Please try again.`);
		}

		return config.onSuccess
			? config.onSuccess(form, id)
			: success(form, `${config.entityName} updated.`);
	});
}

/** Delete the user's own row. Success defaults to "<Entity> deleted." */
export function deleteAction<
	S extends ZodValidationSchema,
	T extends UserOwnedTable,
	R = SuccessResponse<S>
>(config: DeleteConfig<S, T, R>) {
	return requireAuth(async (event, user) => {
		const form = await superValidate(event.request, zod4(config.schema));
		if (!form.valid) return invalidForm(form, config.invalidMessage);

		const id = config.getId ? config.getId(form, event) : idOf(form.data);
		try {
			const deleted = await getDb()
				.delete(config.table)
				.where(ownedBy(config.table, id, user.id))
				.returning({ id: getTableColumns(config.table).id });

			if (deleted.length === 0) return notFound(form, config.entityName);

			logger.info(`${config.entityName} deleted`, { id, userId: user.id });
		} catch (error) {
			logger.error(`Failed to delete ${lower(config.entityName)}`, error, { id });
			return serverError(form, `Failed to delete ${lower(config.entityName)}. Please try again.`);
		}

		return config.onSuccess
			? config.onSuccess(form, id)
			: success(form, `${config.entityName} deleted.`);
	});
}
