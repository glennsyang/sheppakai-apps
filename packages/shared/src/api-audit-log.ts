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
