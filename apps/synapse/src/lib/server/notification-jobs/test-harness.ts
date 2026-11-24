// Test-only helpers for notification jobs: an in-memory SQLite with the real migrations, a fake
// Notifier that records what it was asked to send, and a reader for the notification log.
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { asc } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

import * as schema from '../db/schema';
import { createJobClock } from './clock';
import type { EmailMessage, Notifier, PushMessage } from './notifier';
import type { Db, JobContext } from './run-job';

const migrationsFolder = fileURLToPath(new URL('../db/migrations', import.meta.url));

export const TEST_USER = { id: 'user-1', name: 'Owner', email: 'owner@example.com' };

export function buildTestDb(): Db {
	const db = drizzle(new Database(':memory:'), { schema });
	migrate(db, { migrationsFolder });
	const now = new Date('2026-01-01T00:00:00Z');
	db.insert(schema.user)
		.values({ ...TEST_USER, createdAt: now, updatedAt: now })
		.run();
	return db;
}

export function contextAt(db: Db, iso: string): JobContext {
	return { db, clock: createJobClock(new Date(iso)) };
}

export type FakeNotifier = Notifier & {
	emails: EmailMessage[];
	pushes: PushMessage[];
	reset(): void;
};

export function createFakeNotifier({ failEmailTo }: { failEmailTo?: string } = {}): FakeNotifier {
	const emails: EmailMessage[] = [];
	const pushes: PushMessage[] = [];
	return {
		emails,
		pushes,
		async email(message) {
			if (message.to === failEmailTo) throw new Error(`Brevo rejected ${message.to}`);
			emails.push(message);
		},
		async push(message) {
			pushes.push(message);
			return true;
		},
		reset() {
			emails.length = 0;
			pushes.length = 0;
		}
	};
}

export function readNotificationLog(db: Db) {
	return db
		.select({
			userId: schema.emailNotifications.userId,
			type: schema.emailNotifications.notificationType,
			entityId: schema.emailNotifications.entityId,
			subject: schema.emailNotifications.emailSubject,
			sentAt: schema.emailNotifications.sentAt
		})
		.from(schema.emailNotifications)
		.orderBy(asc(schema.emailNotifications.sentAt))
		.all();
}
