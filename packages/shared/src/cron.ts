import { createHash, timingSafeEqual } from 'node:crypto';

import * as Sentry from '@sentry/sveltekit';

import { parseBearerToken, type BearerTokenFailureReason } from './bearer-token';
import { MIN_CRON_SECRET_LENGTH } from './env';

type CronAuthFailureReason =
	| 'missing_secret'
	| 'blank_secret'
	| 'weak_secret'
	| BearerTokenFailureReason
	| 'token_mismatch';

type CronAuthResult = { authorized: true } | { authorized: false; reason: CronAuthFailureReason };

function validateCronSecret(
	secret: string | undefined
): { authorized: true; secret: string } | { authorized: false; reason: CronAuthFailureReason } {
	if (secret === undefined) {
		return { authorized: false, reason: 'missing_secret' };
	}

	if (secret.trim().length === 0) {
		return { authorized: false, reason: 'blank_secret' };
	}

	if (secret.length < MIN_CRON_SECRET_LENGTH) {
		return { authorized: false, reason: 'weak_secret' };
	}

	return { authorized: true, secret };
}

function constantTimeTokenMatch(providedToken: string, expectedToken: string): boolean {
	const providedHash = createHash('sha256').update(providedToken).digest();
	const expectedHash = createHash('sha256').update(expectedToken).digest();
	return timingSafeEqual(providedHash, expectedHash);
}

export function verifyCronAuthorization(
	header: string | null,
	configuredSecret: string | undefined
): CronAuthResult {
	const secretValidation = validateCronSecret(configuredSecret);
	if (!secretValidation.authorized) {
		return secretValidation;
	}

	const parsedHeader = parseBearerToken(header);
	if (!parsedHeader.token) {
		return { authorized: false, reason: parsedHeader.reason ?? 'malformed_header' };
	}

	if (!constantTimeTokenMatch(parsedHeader.token, secretValidation.secret)) {
		return { authorized: false, reason: 'token_mismatch' };
	}

	return { authorized: true };
}

/** Sentry Cron Monitoring config; see `docs/SENTRY.md` ("Cron monitors"). */
export type CronMonitor = {
	/** Sentry monitor slug, e.g. `synapse-email-notifications`. */
	slug: string;
	/** Crontab in UTC. Must match the `cron:` line in the app's `.github/workflows/*-cron.yml`. */
	schedule: string;
	/** Minutes a check-in may be late before Sentry reports a miss. */
	checkinMargin?: number;
	/** Minutes a run may stay in progress before Sentry marks it failed. */
	maxRuntime?: number;
};

/**
 * Builds a cron `POST` handler: rejects anything not carrying `Bearer <secret>`, then runs
 * the job and answers `{ success, timestamp, result? }`, or a logged 500 if it throws.
 * With `monitor` set, authorized production runs report check-ins to Sentry Cron Monitoring;
 * a 401 sends none, so an unauthorized call surfaces as a missed run.
 */
export function createCronHandler(options: {
	/** The app's `CRON_SECRET`; a missing, blank or short secret fails closed. */
	secret: string | undefined;
	/** Human-readable job name for the start/finish/failure log lines. */
	name: string;
	run: () => Promise<unknown>;
	monitor?: CronMonitor;
	logger: {
		info(message: string, meta?: unknown): void;
		warn(message: string, meta?: unknown): void;
		error(message: string, meta?: unknown): void;
	};
}): (event: { request: Request }) => Promise<Response> {
	const { secret, name, run, monitor, logger } = options;

	const runJob = (): Promise<unknown> => {
		// Same dev rule as @sheppakai/logger's IS_DEV: local runs must not pollute the monitors.
		if (!monitor || process.env.NODE_ENV !== 'production') return run();
		return Sentry.withMonitor(monitor.slug, run, {
			schedule: { type: 'crontab', value: monitor.schedule },
			checkinMargin: monitor.checkinMargin,
			maxRuntime: monitor.maxRuntime,
			timezone: 'Etc/UTC'
		});
	};

	return async ({ request }) => {
		const authResult = verifyCronAuthorization(request.headers.get('authorization'), secret);

		if (!authResult.authorized) {
			logger.warn('⚠️ Unauthorized cron job attempt', { reason: authResult.reason });
			return Response.json({ error: 'Unauthorized' }, { status: 401 });
		}

		try {
			logger.info(`⏰ Starting cron job: ${name}`);
			const result = await runJob();
			logger.info(`✅ Cron job completed: ${name}`);
			return Response.json({
				success: true,
				timestamp: new Date().toISOString(),
				...(result === undefined ? {} : { result })
			});
		} catch (error) {
			logger.error(`❌ Cron job failed: ${name}`, { error });
			return Response.json({ error: 'Job failed' }, { status: 500 });
		}
	};
}
