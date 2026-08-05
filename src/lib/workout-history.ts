import type { Exercise } from "./coach-exercises";
import type { WeightUnit } from "./coach-weight-units";
import { getWeightUnit } from "./coach-weight-units";
import type { ProgramWorkout } from "./coach-workouts";
import type { SessionResultsMap } from "./coach-workout-preview";
import { computeSummary, resultKey } from "./coach-workout-preview";
import { emitLocalEvent, LOCAL_WORKOUT_HISTORY_CHANGED_EVENT } from "./local-events";

export type WorkoutSessionUnitSnapshot = {
  id: string;
  longForm: string;
  shortForm: string;
};

export type WorkoutSessionSetSnapshot = {
  setId: string;
  setNumber: number;
  setType: string;
  intensity?: string;
  suggestedWeightMin?: number;
  suggestedWeightMax?: number;
  suggestedWeightUnit: WorkoutSessionUnitSnapshot;
  targetReps?: number;
  repRangeMin?: number;
  repRangeMax?: number;
  restSeconds?: number;
  coachNotes?: string;
  completed: boolean;
  weightDone: number;
  weightDoneUnit: WorkoutSessionUnitSnapshot;
  repsDone: number;
  notesToCoach?: string;
};

export type WorkoutSessionExerciseSnapshot = {
  exerciseInstanceId: string;
  exerciseId: string;
  exerciseName: string;
  coachNotes?: string;
  sets: WorkoutSessionSetSnapshot[];
};

export type WorkoutSessionData = {
  version: 1;
  exercises: WorkoutSessionExerciseSnapshot[];
};

export type WorkoutHistorySession = {
  id: string;
  clientId: string;
  programId?: string;
  workoutId: string;
  workoutName: string;
  startedAt: string;
  completedAt: string;
  durationSeconds: number;
  completedSets: number;
  totalSets: number;
  totalReps: number;
  volumeByUnitId: Record<string, number>;
  data: WorkoutSessionData;
};

export function createWorkoutSessionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const hex = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16));
  hex[12] = "4";
  hex[16] = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8).join("")}-${hex.slice(8, 12).join("")}-${hex
    .slice(12, 16)
    .join("")}-${hex.slice(16, 20).join("")}-${hex.slice(20).join("")}`;
}

function unitSnapshot(unit: WeightUnit): WorkoutSessionUnitSnapshot {
  return { id: unit.id, longForm: unit.longForm, shortForm: unit.shortForm };
}

function nonNegativeInteger(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

export function buildWorkoutSessionData({
  workout,
  exercises,
  weightUnits,
  results,
}: {
  workout: ProgramWorkout;
  exercises: Exercise[];
  weightUnits: WeightUnit[];
  results: SessionResultsMap;
}): WorkoutSessionData {
  const exercisesById = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  return {
    version: 1,
    exercises: workout.exercises.map((exercise) => {
      const definition = exercisesById.get(exercise.exerciseId);
      return {
        exerciseInstanceId: exercise.id,
        exerciseId: exercise.exerciseId,
        exerciseName: definition?.name ?? "Unknown exercise",
        coachNotes: exercise.notes,
        sets: exercise.sets.map((set, setIndex) => {
          const result = results[resultKey(exercise.id, set.id)];
          const suggestedUnit = getWeightUnit(weightUnits, set.weightUnitId);
          const doneUnit = getWeightUnit(
            weightUnits,
            result?.actualWeightUnitId ?? set.weightUnitId,
          );
          return {
            setId: set.id,
            setNumber: setIndex + 1,
            setType: set.setType,
            intensity: set.intensity,
            suggestedWeightMin: set.suggestedWeightMin,
            suggestedWeightMax: set.suggestedWeightMax,
            suggestedWeightUnit: unitSnapshot(suggestedUnit),
            targetReps: set.targetReps,
            repRangeMin: set.repRangeMin,
            repRangeMax: set.repRangeMax,
            restSeconds: set.restSeconds,
            coachNotes: set.coachNotes,
            completed: result?.completed ?? false,
            weightDone: result?.actualWeight ?? 0,
            weightDoneUnit: unitSnapshot(doneUnit),
            repsDone: result?.actualReps ?? 0,
            notesToCoach: result?.notesToCoach,
          };
        }),
      };
    }),
  };
}

export async function saveWorkoutSession({
  sessionId = createWorkoutSessionId(),
  clientId,
  programId,
  workout,
  exercises,
  weightUnits,
  results,
  durationSeconds,
  completedAt = new Date(),
}: {
  sessionId?: string;
  clientId: string;
  programId?: string;
  workout: ProgramWorkout;
  exercises: Exercise[];
  weightUnits: WeightUnit[];
  results: SessionResultsMap;
  durationSeconds: number;
  completedAt?: Date;
}): Promise<WorkoutHistorySession> {
  const normalizedDuration = nonNegativeInteger(durationSeconds);
  const summary = computeSummary(workout, results);
  const totalSets = workout.exercises.reduce((total, exercise) => total + exercise.sets.length, 0);
  const completedAtIso = completedAt.toISOString();
  const startedAtIso = new Date(completedAt.getTime() - normalizedDuration * 1000).toISOString();
  const data = buildWorkoutSessionData({ workout, exercises, weightUnits, results });

  const session: WorkoutHistorySession = {
    id: sessionId,
    clientId,
    programId,
    workoutId: workout.id,
    workoutName: workout.name,
    startedAt: startedAtIso,
    completedAt: completedAtIso,
    durationSeconds: normalizedDuration,
    completedSets: summary.completedSets,
    totalSets,
    totalReps: summary.totalReps,
    volumeByUnitId: summary.volumeByUnitId,
    data,
  };
  const sessions = readSessions();
  const existing = sessions.find((candidate) => candidate.id === sessionId);
  if (existing) return existing;
  window.localStorage.setItem(WORKOUT_HISTORY_STORAGE_KEY, JSON.stringify([...sessions, session]));
  emitLocalEvent(LOCAL_WORKOUT_HISTORY_CHANGED_EVENT);
  return session;
}

export async function fetchWorkoutSessions(clientId: string): Promise<WorkoutHistorySession[]> {
  return readSessions()
    .filter((session) => session.clientId === clientId)
    .sort((left, right) => right.completedAt.localeCompare(left.completedAt));
}

const WORKOUT_HISTORY_STORAGE_KEY = "no-more-copium:workout-history:v2";

function readSessions(): WorkoutHistorySession[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed: unknown = JSON.parse(
      window.localStorage.getItem(WORKOUT_HISTORY_STORAGE_KEY) ?? "[]",
    );
    return Array.isArray(parsed) ? (parsed as WorkoutHistorySession[]) : [];
  } catch {
    return [];
  }
}
