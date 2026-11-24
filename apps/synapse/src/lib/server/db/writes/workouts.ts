// `/api/v1/workouts` adapter over the Workout module: maps a miss onto an `ApiWriteError`.
import { ApiWriteError } from '@sheppakai/shared/api-write';

import type {
	ApiCreateWorkoutInput,
	ApiUpdateWorkoutInput
} from '#lib/server/api/schemas/workouts.js';
import { getDb } from '#lib/server/db/index.js';
import * as workout from '#lib/server/fitness/workout.js';

function found(result: workout.Workout | null): workout.Workout {
	if (!result) throw new ApiWriteError('not_found', 'Workout not found.', 404);
	return result;
}

export async function createWorkoutFromApi(userId: string, input: ApiCreateWorkoutInput) {
	return workout.createWorkout(getDb(), userId, {
		date: input.date,
		time: input.time ?? null,
		type: input.type,
		durationMinutes: input.durationMinutes ?? null,
		steps: input.steps ?? null,
		notes: input.notes ?? null,
		exercises: input.exercises ?? []
	});
}

export async function updateWorkoutFromApi(
	userId: string,
	workoutId: string,
	input: ApiUpdateWorkoutInput
) {
	return found(workout.updateWorkout(getDb(), userId, workoutId, input));
}

export async function getWorkoutFromApi(userId: string, workoutId: string) {
	return found(workout.getWorkout(getDb(), userId, workoutId));
}
