import { describe, expect, it } from 'vitest';

import { toWeightTrendSeries, weightYDomain } from './weight-trend';

describe('toWeightTrendSeries', () => {
	it('sorts newest-first entries into chronological order', () => {
		const series = toWeightTrendSeries([
			{ date: '2026-01-03', time: null, weightLbs: 180 },
			{ date: '2026-01-01', time: null, weightLbs: 182 },
			{ date: '2026-01-02', time: '08:00:00', weightLbs: 181 }
		]);

		expect(series.map((p) => p.weight)).toEqual([182, 181, 180]);
	});

	it('orders same-day entries by time', () => {
		const series = toWeightTrendSeries([
			{ date: '2026-01-01', time: '20:00:00', weightLbs: 183 },
			{ date: '2026-01-01', time: '07:00:00', weightLbs: 181 }
		]);

		expect(series.map((p) => p.weight)).toEqual([181, 183]);
	});

	it('computes a trailing moving average over the window', () => {
		const series = toWeightTrendSeries(
			[
				{ date: '2026-01-01', time: null, weightLbs: 180 },
				{ date: '2026-01-02', time: null, weightLbs: 181 },
				{ date: '2026-01-03', time: null, weightLbs: 185 },
				{ date: '2026-01-04', time: null, weightLbs: 178 }
			],
			3
		);

		expect(series.map((p) => p.trend)).toEqual([180, 180.5, 182, 181.3]);
	});

	it('returns an empty series for no entries', () => {
		expect(toWeightTrendSeries([])).toEqual([]);
	});
});

describe('weightYDomain', () => {
	it('pads around the data range instead of starting at zero', () => {
		expect(weightYDomain([180, 190], null)).toEqual([178, 192]);
	});

	it('uses at least 1 lb of padding for a flat series', () => {
		expect(weightYDomain([180, 180], null)).toEqual([179, 181]);
	});

	it('includes a nearby goal weight', () => {
		const [min] = weightYDomain([180, 184], 175);
		expect(min).toBeLessThanOrEqual(175);
	});

	it('ignores a distant goal weight so the data is not flattened', () => {
		expect(weightYDomain([180, 184], 150)).toEqual([179, 185]);
	});

	it('handles no data', () => {
		expect(weightYDomain([], 170)).toEqual([0, 1]);
	});
});
