import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';

interface CreateGetDbOptions<TSchema extends Record<string, unknown>> {
	/** `DATABASE_URL`; a leading `file://` is stripped. */
	url: string;
	schema: TSchema;
	logger: { info(message: string): void };
	/**
	 * Drizzle query logging. Keep it off in production so auth values (access_token,
	 * refresh_token, id_token, password) never reach the logs.
	 */
	queryLogging: boolean;
}

/**
 * Returns each app's lazy `getDb()`: one better-sqlite3 connection in WAL mode, opened on
 * first use and closed on SIGTERM/SIGINT (Fly.io's termination signals).
 */
export function createGetDb<TSchema extends Record<string, unknown>>(
	options: CreateGetDbOptions<TSchema>
) {
	const { url, schema, logger, queryLogging } = options;
	let db: ReturnType<typeof drizzle<TSchema>> | null = null;

	function getDb() {
		if (!db) {
			const dbPath = url.replace(/^file:\/\//, '');
			mkdirSync(dirname(dbPath), { recursive: true });

			const connection = new Database(dbPath);
			// WAL lets reads run alongside a write. Backups use `sqlite3 .dump`, which reads
			// through the WAL; restores must move the -wal/-shm files aside (docs/BACKUP_RESTORE.md).
			connection.pragma('journal_mode = WAL');
			db = drizzle(connection, { schema, logger: queryLogging });
		}

		return db;
	}

	const shutdown = () => {
		if (db) {
			logger.info('Closing SQLite connection');
			db.$client.close();
		}
		process.exit(0);
	};

	process.on('SIGTERM', shutdown);
	process.on('SIGINT', shutdown);

	return getDb;
}
