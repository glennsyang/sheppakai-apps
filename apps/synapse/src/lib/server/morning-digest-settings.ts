import { eq, inArray } from 'drizzle-orm';

import { getDb } from '#lib/server/db/index.js';
import { morningDigestSettings } from '#lib/server/db/schema/index.js';

import { DEFAULT_MORNING_DIGEST_TIME } from './digest/morning-digest';

export type MorningDigestSettings = {
	enabled: boolean;
	sendTime: string;
};

export const DEFAULT_MORNING_DIGEST_SETTINGS: MorningDigestSettings = {
	enabled: true,
	sendTime: DEFAULT_MORNING_DIGEST_TIME
};

function toSettings(row: MorningDigestSettings | undefined): MorningDigestSettings {
	if (!row) {
		return { ...DEFAULT_MORNING_DIGEST_SETTINGS };
	}

	return { enabled: row.enabled, sendTime: row.sendTime };
}

export async function getMorningDigestSettingsForUser(
	userId: string,
	db = getDb()
): Promise<MorningDigestSettings> {
	const settings = await db.query.morningDigestSettings.findFirst({
		where: eq(morningDigestSettings.userId, userId)
	});

	return toSettings(settings);
}

/** Settings for each user id; users without a saved row get the defaults (on, 06:00). */
export async function getMorningDigestSettingsByUserIds(
	userIds: string[],
	db = getDb()
): Promise<Map<string, MorningDigestSettings>> {
	const uniqueUserIds = Array.from(new Set(userIds));
	const settingsByUserId = new Map<string, MorningDigestSettings>(
		uniqueUserIds.map((userId) => [userId, { ...DEFAULT_MORNING_DIGEST_SETTINGS }])
	);

	if (uniqueUserIds.length === 0) {
		return settingsByUserId;
	}

	const rows = await db.query.morningDigestSettings.findMany({
		where: inArray(morningDigestSettings.userId, uniqueUserIds)
	});

	for (const row of rows) {
		settingsByUserId.set(row.userId, toSettings(row));
	}

	return settingsByUserId;
}
