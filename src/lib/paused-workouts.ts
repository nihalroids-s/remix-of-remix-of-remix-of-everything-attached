import type { ProgramWorkout } from "./coach-workouts";
import { loadWorkouts } from "./coach-workouts";
import { loadExercises } from "./coach-exercises";
import { getAllWeightUnits, loadCustomWeightUnits } from "./coach-weight-units";
import { resultKey, type SessionResultsMap } from "./coach-workout-preview";
import { emitLocalEvent } from "./local-events";
import { saveWorkoutSession } from "./workout-history";

export type PausedWorkoutSession = {
  id: string;
  clientId: string;
  programId?: string;
  workoutId: string;
  workoutName: string;
  pausedAt: string;
  elapsedSeconds: number;
  results: SessionResultsMap;
  hasWorkingProgress: boolean;
};

export const LOCAL_PAUSED_WORKOUTS_CHANGED_EVENT =
  "no-more-copium:local-paused-workouts-changed";
const STORAGE_KEY = "no-more-copium:paused-workouts:v1";

/** A paused session is "expired" (auto-finalizes) once the pause happened on a previous calendar day. */
export function isPreviousDayPaused(session: PausedWorkoutSession, now: Date): boolean {
  const paused = new Date(session.pausedAt);
  if (Number.isNaN(paused.getTime())) return true;
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return paused < todayStart;
}

/**
 * True if the client completed at least one non-warm-up set with actual
 * weight/reps/time logged. Warm-up-only progress never creates a history entry.
 */
export function hasWorkingProgressInResults(
  workout: ProgramWorkout,
  results: SessionResultsMap,
): boolean {
  for (const exercise of workout.exercises) {
    for (const set of exercise.sets) {
      if (set.setType === "warmup") continue;
      const result = results[resultKey(exercise.id, set.id)];
      if (!result?.completed) continue;
      if (result.actualWeight > 0 || result.actualReps > 0 || result.actualSeconds > 0) {
        return true;
      }
    }
  }
  return false;
}

export async function savePausedWorkout(session: PausedWorkoutSession): Promise<void> {
  const sessions = readPausedWorkouts();
  const next = [
    ...sessions.filter(
      (candidate) =>
        !(candidate.clientId === session.clientId && candidate.workoutId === session.workoutId),
    ),
    session,
  ];
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  emitLocalEvent(LOCAL_PAUSED_WORKOUTS_CHANGED_EVENT);
}

export async function fetchPausedWorkouts(clientId: string): Promise<PausedWorkoutSession[]> {
  return readPausedWorkouts()
    .filter((session) => session.clientId === clientId)
    .sort((left, right) => right.pausedAt.localeCompare(left.pausedAt));
}

export async function fetchPausedWorkout(
  clientId: string,
  workoutId: string,
): Promise<PausedWorkoutSession | null> {
  return (
    readPausedWorkouts().find(
      (session) => session.clientId === clientId && session.workoutId === workoutId,
    ) ?? null
  );
}

export async function clearPausedWorkout(clientId: string, workoutId: string): Promise<void> {
  const next = readPausedWorkouts().filter(
    (session) => !(session.clientId === clientId && session.workoutId === workoutId),
  );
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  emitLocalEvent(LOCAL_PAUSED_WORKOUTS_CHANGED_EVENT);
}

export function clearAllPausedWorkouts(clientId: string): void {
  const next = readPausedWorkouts().filter((session) => session.clientId !== clientId);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  emitLocalEvent(LOCAL_PAUSED_WORKOUTS_CHANGED_EVENT);
}

/**
 * Finalize expired paused sessions (paused on a previous day):
 * - If working progress exists → save a history entry containing only the completed sets.
 * - Otherwise → discard silently.
 * Returns the number of sessions finalized (logged to history).
 */
export async function finalizeExpiredPausedWorkouts(clientId: string): Promise<number> {
  const sessions = readPausedWorkouts().filter((session) => session.clientId === clientId);
  const expired = sessions.filter((session) => isPreviousDayPaused(session, new Date()));
  if (expired.length === 0) return 0;

  let logged = 0;
  for (const session of expired) {
    try {
      if (session.hasWorkingProgress) {
        const workout = loadWorkouts().find((candidate) => candidate.id === session.workoutId);
        if (workout) {
          // Keep only the sets the client actually completed.
          const completedOnly: ProgramWorkout = {
            ...workout,
            exercises: workout.exercises
              .map((exercise) => ({
                ...exercise,
                sets: exercise.sets.filter(
                  (set) => session.results[resultKey(exercise.id, set.id)]?.completed,
                ),
              }))
              .filter((exercise) => exercise.sets.length > 0),
          };
          if (completedOnly.exercises.length > 0) {
            await saveWorkoutSession({
              clientId,
              programId: session.programId,
              workout: completedOnly,
              exercises: loadExercises(),
              weightUnits: getAllWeightUnits(loadCustomWeightUnits()),
              results: session.results,
              durationSeconds: session.elapsedSeconds,
              completedAt: new Date(session.pausedAt),
            });
            logged += 1;
          }
        }
      }
    } catch (error) {
      console.error("Failed to finalize paused workout", error);
    }
  }

  const remaining = readPausedWorkouts().filter(
    (session) =>
      !(session.clientId === clientId && expired.some((expiredSession) => expiredSession.id === session.id)),
  );
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(remaining));
  emitLocalEvent(LOCAL_PAUSED_WORKOUTS_CHANGED_EVENT);
  return logged;
}

function readPausedWorkouts(): PausedWorkoutSession[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? (parsed as PausedWorkoutSession[]) : [];
  } catch {
    return [];
  }
}
