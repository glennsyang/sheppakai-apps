import { describe, expect, it } from 'vitest';

import { redactSensitivePath } from './sensitive-path';

describe('redactSensitivePath', () => {
	it('masks the token segment of a reset-password path', () => {
		expect(redactSensitivePath('/api/auth/reset-password/abc_DEF-123')).toBe(
			'/api/auth/reset-password/[redacted]'
		);
	});

	it('keeps the query string and origin of a full URL', () => {
		expect(
			redactSensitivePath(
				'https://app.example.com/api/auth/reset-password/abc123?callbackURL=%2Freset-password'
			)
		).toBe(
			'https://app.example.com/api/auth/reset-password/[redacted]?callbackURL=%2Freset-password'
		);
	});

	it('masks every occurrence, e.g. in a span name', () => {
		expect(
			redactSensitivePath('GET /api/auth/reset-password/a -> /api/auth/reset-password/b')
		).toBe('GET /api/auth/reset-password/[redacted] -> /api/auth/reset-password/[redacted]');
	});

	it('leaves other paths untouched', () => {
		for (const path of [
			'/dashboard',
			'/reset-password',
			'/api/auth/reset-password',
			'/api/auth/verify-email'
		]) {
			expect(redactSensitivePath(path)).toBe(path);
		}
	});
});
