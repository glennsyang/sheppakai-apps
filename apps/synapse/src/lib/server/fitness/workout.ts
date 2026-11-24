// The Workout write module: the Log Workout form actions and `/api/v1/workouts` are thin adapters
// over `createWorkout`, `updateWorkout` and `getWorkout`. A Workout's exercises are only kept for
// Strength workouts, and an update that sends exercises replaces all of them.
//
// The better-sqlite3 driver runs transaction callbacks synchronously, so every query inside a
// transaction uses its sync execution method (`.get()` / `.run()`) rather than `await`.
import { and, eq } from 'drizzle-orm';

import type { getDb } from '#lib/server/db/index.js';
import { workoutExercises, workoutLogs } from '#lib/server/db/schema/index.js';
import {
	generateId,
	withTimestampsForCreate,
	withTimestampsForUpdate
} from '#lib/server/db/utils.js';

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type DbClient = Db | Tx;

type WorkoutLog = typeof workoutLogs.$inferSelect;
type WorkoutExercise = typeof workoutExercises.$inferSelect;
export type Workout = WorkoutLog & { exercises: WorkoutExercise[] };

export type ExerciseFields = {
	exerciseName: string;
	sets?: number | null;
	reps?: number | null;
	weightLbs?: number | null;
};

export type WorkoutFields = {
	date: string;
	time: string | null;
	type: WorkoutLog['type'];
	durationMinutes: number | null;
	steps: number | null;
	notes: string | null;
	exercises: ExerciseFields[];
};

/**
 * Fields left `undefined` keep their stored value; `null` clears a nullable one. `exercises`, when
 * given, replaces every exercise.
 */
export type WorkoutPatch = Partial<WorkoutFields>;

function insertExercises(
	db: DbClient,
	workoutId: string,
	exercises: ExerciseFields[],
	now: Date
): void {
	const rows = exercises
		.filter((exercise) => exercise.exerciseName.trim().length > 0)
		.map((exercise) => ({
			id: generateId(),
			workoutLogId: workoutId,
			exerciseName: exercise.exerciseName,
			sets: exercise.sets ?? null,
			reps: exercise.reps ?? null,
			weightLbs: exercise.weightLbs ?? null,
			...withTimestampsForCreate(now)
		}));

	if (rows.length > 0) db.insert(workoutExercises).values(rows).run();
}

/** The user's own Workout with its exercises, or `null`. */
export function getWorkout(db: DbClient, userId: string, workoutId: string): Workout | null {
	const workout = db
		.select()
		.from(workoutLogs)
		.where(and(eq(workoutLogs.id, workoutId), eq(workoutLogs.userId, userId)))
		.get();

	if (!workout) return null;

	const exercises = db
		.select()
		.from(workoutExercises)
		.where(eq(workoutExercises.workoutLogId, workoutId))
		.all();

	return { ...workout, exercises };
}

export function createWorkout(
	db: Db,
	userId: string,
	{ exercises, ...fields }: WorkoutFields,
	now = new Date()
): Workout {
	const workoutId = generateId();

	return db.transaction((tx) => {
		tx.insert(workoutLogs)
			.values({ id: workoutId, userId, ...fields, ...withTimestampsForCreate(now) })
			.run();

		if (fields.type === 'strength') insertExercises(tx, workoutId, exercises, now);

		// oxlint-disable-next-line typescript/no-non-null-assertion -- inserted just above in this transaction
		return getWorkout(tx, userId, workoutId)!;
	});
}

/** Updates the user's own Workout; `null` when they have no Workout with that id. */
export function updateWorkout(
	db: Db,
	userId: string,
	workoutId: string,
	{ exercises, ...patch }: WorkoutPatch,
	now = new Date()
): Workout | null {
	return db.transaction((tx) => {
		// Drizzle leaves out `undefined` values in `.set()`, so a patch only touches the fields it
		// names.
		const updated = tx
			.update(workoutLogs)
			.set({ ...patch, ...withTimestampsForUpdate(now) })
			.where(and(eq(workoutLogs.id, workoutId), eq(workoutLogs.userId, userId)))
			.returning({ type: workoutLogs.type })
			.get();

		if (!updated) return null;

		if (exercises !== undefined) {
			tx.delete(workoutExercises).where(eq(workoutExercises.workoutLogId, workoutId)).run();
			if (updated.type === 'strength') insertExercises(tx, workoutId, exercises, now);
		}

		return getWorkout(tx, userId, workoutId);
	});
}
