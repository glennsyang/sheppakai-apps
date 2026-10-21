import { describe, expect, it } from 'vitest';

import {
	scrubSensitivePathsFromEvent,
	scrubSensitivePathsFromSpan
} from './sentry-data-collection';

type ErrorEvent = Parameters<typeof scrubSensitivePathsFromEvent>[0];
type Span = Parameters<typeof scrubSensitivePathsFromSpan>[0];

const TOKEN_PATH = '/api/auth/reset-password/s3cr3tT0ken';
const REDACTED_PATH = '/api/auth/reset-password/[redacted]';

describe('scrubSensitivePathsFromEvent', () => {
	it('masks the token in the transaction name and request url', () => {
		const event: ErrorEvent = {
			type: undefined,
			transaction: `GET ${TOKEN_PATH}`,
			request: { url: `https://app.example.com${TOKEN_PATH}?callbackURL=%2F` }
		};

		const result = scrubSensitivePathsFromEvent(event, {});

		expect(result).toMatchObject({
			transaction: `GET ${REDACTED_PATH}`,
			request: { url: `https://app.example.com${REDACTED_PATH}?callbackURL=%2F` }
		});
	});

	it('passes events without a url through', () => {
		const event: ErrorEvent = { type: undefined, message: 'boom' };

		expect(scrubSensitivePathsFromEvent(event, {})).toEqual({ type: undefined, message: 'boom' });
	});
});

describe('scrubSensitivePathsFromSpan', () => {
	it('masks the token in the span name and string attributes', () => {
		const span: Span = {
			trace_id: 't',
			span_id: 's',
			name: `GET ${TOKEN_PATH}`,
			start_timestamp: 0,
			status: 'ok',
			is_segment: true,
			attributes: {
				'url.full': `https://app.example.com${TOKEN_PATH}`,
				'url.path': TOKEN_PATH,
				'http.response.status_code': 302
			}
		};

		const result = scrubSensitivePathsFromSpan(span);

		expect(result.name).toBe(`GET ${REDACTED_PATH}`);
		expect(result.attributes).toEqual({
			'url.full': `https://app.example.com${REDACTED_PATH}`,
			'url.path': REDACTED_PATH,
			'http.response.status_code': 302
		});
	});
});
