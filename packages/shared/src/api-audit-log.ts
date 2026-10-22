export type ApiAuditEntry = {
	apiKeyId: string;
	userId: string;
	method: string;
	path: string;
	action: string;
	statusCode: number;
};

/**
 * Returns `recordApiWrite(entry)`, which records which API key performed a write and what
 * happened, for traceability of external/programmatic activity. A logging failure never
 * breaks the actual API response: an audit-log write failure is logged and swallowed
 * rather than surfaced to the caller.
 */
export function createRecordApiWrite(deps: {
	/** Inserts one row into the app's `api_audit_log` table. */
	insert: (entry: ApiAuditEntry) => Promise<unknown>;
	logger: { error(message: string, error?: unknown): void };
}) {
	const { insert, logger } = deps;

	return async function recordApiWrite(entry: ApiAuditEntry): Promise<void> {
		try {
			await insert(entry);
		} catch (error) {
			logger.error('Failed to write API audit log entry', error);
		}
	};
}

/** One audit-log row as the admin API-logs table renders it. */
export type AdminApiLogEntry = {
	id: string;
	apiKeyId: string;
	apiKeyName: string | null;
	apiKeyExists: boolean;
	userId: string;
	user: { name: string | null; email: string };
	method: string;
	path: string;
	action: string;
	statusCode: number;
	createdAt: Date;
};

type ApiAuditLogRow = Omit<AdminApiLogEntry, 'apiKeyName' | 'apiKeyExists'>;

/**
 * Returns `listApiAuditEntries()`, which reads the app's audit log and resolves each entry's
 * API key name. Errors propagate so each load keeps its own error handling.
 */
export function createListApiAuditEntries<Row extends ApiAuditLogRow>(deps: {
	/** Every audit-log row, newest first, with its `user`. */
	findEntries: () => Promise<Row[]>;
	/** The `apiKey` rows (id and name) matching the given ids. */
	findKeyNames: (ids: string[]) => Promise<{ id: string; name: string | null }[]>;
}) {
	const { findEntries, findKeyNames } = deps;

	return async function listApiAuditEntries(): Promise<
		(Row & Pick<AdminApiLogEntry, 'apiKeyName' | 'apiKeyExists'>)[]
	> {
		const entries = await findEntries();

		// apiKeyId has no FK to apiKey.id (by design, so the trail survives key revocation), so
		// resolve names via a separate lookup rather than a join, and tolerate ids with no match.
		const apiKeyIds = [...new Set(entries.map((entry) => entry.apiKeyId))];
		const apiKeys = apiKeyIds.length > 0 ? await findKeyNames(apiKeyIds) : [];
		const apiKeyNamesById = new Map(apiKeys.map((key) => [key.id, key.name]));

		return entries.map((entry) => ({
			...entry,
			apiKeyName: apiKeyNamesById.get(entry.apiKeyId) ?? null,
			apiKeyExists: apiKeyNamesById.has(entry.apiKeyId)
		}));
	};
}
