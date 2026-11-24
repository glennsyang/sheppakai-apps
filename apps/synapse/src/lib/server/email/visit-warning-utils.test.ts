import { describe, expect, it } from 'vitest';

import {
	buildVisitWarningEntityId,
	buildVisitWarningSubject,
	formatVisitWarningDate,
	toVisitWarningStatus
} from './visit-warning-utils';

describe('visit warning utilities', () => {
	it('warns only for Overdue and Critical', () => {
		expect(toVisitWarningStatus('yellow')).toBe('yellow');
		expect(toVisitWarningStatus('red')).toBe('critical');
		for (const status of ['green', 'scheduled', 'none', 'exempt'] as const) {
			expect(toVisitWarningStatus(status)).toBeNull();
		}
	});

	it('formats visit date as Month D, YYYY', () => {
		expect(formatVisitWarningDate('2025-08-06T16:00:00.000Z')).toBe('August 6, 2025');
	});

	it('builds status-aware warning entity ids', () => {
		expect(buildVisitWarningEntityId('person_123', 'yellow')).toBe('person_123:yellow');
		expect(buildVisitWarningEntityId('person_123', 'critical')).toBe('person_123:critical');
	});

	it('builds warning subjects with exact status wording', () => {
		expect(buildVisitWarningSubject('Alice', 'yellow')).toBe('Status: Yellow Warning for Alice');
		expect(buildVisitWarningSubject('Alice', 'critical')).toBe(
			'Status: Critical Warning for Alice'
		);
	});
});
