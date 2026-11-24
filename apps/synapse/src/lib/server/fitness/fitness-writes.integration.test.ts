// Runs the Food Entry and Workout write modules against the app's real schema and migrations in
// in-memory SQLite.
import { describe, expect, it } from 'vitest';

import type { Db } from '../notification-jobs/run-job';
import { buildTestDb, TEST_USER } from '../notification-jobs/test-harness';
import { createFoodEntry, updateFoodEntry } from './food-entry';
import { createWorkout, getWorkout, updateWorkout, type WorkoutFields } from './workout';

const T0 = new Date('2026-11-24T10:00:00Z');
const T1 = new Date('2026-11-24T11:00:00Z');

function strength(overrides: Partial<WorkoutFields> = {}): WorkoutFields {
	return {
		date: '2026-11-24',
		time: '07:00',
		type: 'strength',
		durationMinutes: 45,
		steps: null,
		notes: null,
		exercises: [
			{ exerciseName: 'Squat', sets: 3, reps: 5, weightLbs: 185 },
			{ exerciseName: '   ' }
		],
		...overrides
	};
}

describe('Food Entry module', () => {
	const fields = {
		date: '2026-11-24',
		timeOfDay: 'lunch' as const,
		description: 'Soup',
		caloriesEstimate: 400
	};

	it('creates an entry owned by the user', () => {
		const db: Db = buildTestDb();
		const entry = createFoodEntry(db, TEST_USER.id, fields, T0);
		expect(entry).toMatchObject({ ...fields, userId: TEST_USER.id, createdAt: T0 });
	});

	it('patches only the named fields, and null clears calories', () => {
		const db = buildTestDb();
		const { id } = createFoodEntry(db, TEST_USER.id, fields, T0);

		const updated = updateFoodEntry(db, TEST_USER.id, id, { caloriesEstimate: null }, T1);

		expect(updated).toMatchObject({ description: 'Soup', caloriesEstimate: null, updatedAt: T1 });
	});

	it("returns null for another user's entry and leaves it alone", () => {
		const db = buildTestDb();
		const { id } = createFoodEntry(db, TEST_USER.id, fields, T0);

		expect(updateFoodEntry(db, 'someone-else', id, { description: 'Hacked' })).toBeNull();
		expect(updateFoodEntry(db, TEST_USER.id, id, {})?.description).toBe('Soup');
	});
});

describe('Workout module', () => {
	it('creates a strength workout with its named exercises only', () => {
		const db = buildTestDb();
		const workout = createWorkout(db, TEST_USER.id, strength(), T0);

		expect(workout.exercises).toHaveLength(1);
		expect(workout.exercises[0]).toMatchObject({ exerciseName: 'Squat', sets: 3 });
	});

	it('drops exercises for a non-strength workout', () => {
		const db = buildTestDb();
		const workout = createWorkout(db, TEST_USER.id, strength({ type: 'cardio' }), T0);
		expect(workout.exercises).toEqual([]);
	});

	it('keeps exercises when an update leaves them out, and replaces them when given', () => {
		const db = buildTestDb();
		const { id } = createWorkout(db, TEST_USER.id, strength(), T0);

		const kept = updateWorkout(db, TEST_USER.id, id, { notes: 'Felt good' }, T1);
		expect(kept).toMatchObject({ notes: 'Felt good', durationMinutes: 45 });
		expect(kept?.exercises.map((e) => e.exerciseName)).toEqual(['Squat']);

		const replaced = updateWorkout(db, TEST_USER.id, id, {
			exercises: [{ exerciseName: 'Deadlift' }, { exerciseName: 'Row' }]
		});
		expect(replaced?.exercises.map((e) => e.exerciseName).sort()).toEqual(['Deadlift', 'Row']);
	});

	it('clears exercises when the type changes away from strength with exercises given', () => {
		const db = buildTestDb();
		const { id } = createWorkout(db, TEST_USER.id, strength(), T0);

		const updated = updateWorkout(db, TEST_USER.id, id, { type: 'walk', exercises: [] });

		expect(updated).toMatchObject({ type: 'walk', exercises: [] });
	});

	it("returns null for another user's workout and changes nothing", () => {
		const db = buildTestDb();
		const { id } = createWorkout(db, TEST_USER.id, strength(), T0);

		expect(updateWorkout(db, 'someone-else', id, { notes: 'x', exercises: [] })).toBeNull();
		expect(getWorkout(db, 'someone-else', id)).toBeNull();
		expect(getWorkout(db, TEST_USER.id, id)?.exercises).toHaveLength(1);
	});
});
