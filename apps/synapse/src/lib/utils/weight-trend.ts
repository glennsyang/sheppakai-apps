export interface WeightEntryLike {
	date: string;
	time: string | null;
	weightLbs: number;
}

export interface WeightPoint {
	date: Date;
	weight: number;
	trend: number;
}

/** How close (lbs) the goal must be to the data range to be pulled into the y-axis. */
const GOAL_PROXIMITY_LBS = 10;

function roundTenth(value: number): number {
	return Math.round(value * 10) / 10;
}

/**
 * Converts weight entries (any order) into chronological chart points, each with a
 * trailing moving average (`trend`) over up to `window` entries.
 */
export function toWeightTrendSeries(entries: WeightEntryLike[], window = 7): WeightPoint[] {
	const sorted = entries
		.map((entry) => ({
			date: new Date(`${entry.date}T${entry.time || '00:00:00'}`),
			weight: entry.weightLbs
		}))
		.sort((a, b) => a.date.getTime() - b.date.getTime());

	return sorted.map((point, i) => {
		const slice = sorted.slice(Math.max(0, i - window + 1), i + 1);
		const avg = slice.reduce((sum, p) => sum + p.weight, 0) / slice.length;
		return { ...point, trend: roundTenth(avg) };
	});
}

/**
 * Y-axis domain fitted to the data with padding, so small day-to-day changes stay visible.
 * The goal weight is included only when it sits near the data.
 */
export function weightYDomain(weights: number[], goal: number | null): [number, number] {
	if (weights.length === 0) return [0, 1];

	let min = Math.min(...weights);
	let max = Math.max(...weights);

	if (goal != null && goal >= min - GOAL_PROXIMITY_LBS && goal <= max + GOAL_PROXIMITY_LBS) {
		min = Math.min(min, goal);
		max = Math.max(max, goal);
	}

	const pad = Math.max(1, (max - min) * 0.15);
	return [Math.floor(min - pad), Math.ceil(max + pad)];
}
