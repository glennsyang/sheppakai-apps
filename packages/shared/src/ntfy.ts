export interface NtfyOptions {
	title: string;
	/** 1-5 (5 is max/urgent). */
	priority?: number;
	/** Comma-separated ntfy emoji tags. */
	tags?: string;
	/** ntfy access token, sent as `Authorization: Bearer`. Required for a protected topic. */
	token?: string;
	logger: {
		info(message: string, meta?: Record<string, unknown>): void;
		error(message: string, error?: unknown): void;
	};
}

/**
 * POSTs an ntfy.sh push notification. Best-effort: a delivery failure is logged and
 * swallowed (returns `false`) so it never breaks the flow that triggered it.
 *
 * Fails closed: an unset alerts URL defaults to a non-resolving `.invalid` host (see
 * ./env). That is detected here and the request skipped entirely, since alert bodies
 * are operator-only and must never be POSTed to a placeholder domain.
 */
export async function sendNtfy(
	url: string,
	message: string,
	{ title, priority = 3, tags = 'rotating_light', token, logger }: NtfyOptions
): Promise<boolean> {
	let target: URL;
	try {
		target = new URL(url);
	} catch {
		logger.error('Alerts URL is not a valid URL; skipping alert');
		return false;
	}
	if (target.hostname === 'invalid' || target.hostname.endsWith('.invalid')) {
		logger.info('Alerts disabled (alerts URL unset); skipping', { title });
		return false;
	}

	try {
		const response = await fetch(target.href, {
			method: 'POST',
			body: message,
			headers: {
				Title: title,
				Priority: priority.toString(),
				Tags: tags,
				...(token ? { Authorization: `Bearer ${token}` } : {})
			}
		});

		return response.ok;
	} catch (err) {
		logger.error('Notification failed', err);
		return false;
	}
}
