import { supabase } from "@/integrations/supabase/client";
import { emitLocalEvent } from "./local-events";

/**
 * Cloud cache for coach-authored app state and payment settings.
 *
 * The cloud stores coach content in ONE `app_state` row ('global') with
 * jsonb columns (programs, exercises, workouts, weight_units). The existing
 * local libs expose synchronous readers (loadPrograms(), ...) that components
 * call directly — so we keep a module-level cache those readers return, and
 * write-through to Supabase whenever the local libs save.
 */

export type CloudAppState = {
  programs: unknown[];
  exercises: unknown[];
  workouts: unknown[];
  weightUnits: unknown[];
};

export const CLOUD_STATE_HYDRATED_EVENT = "no-more-copium:cloud-state-hydrated";

const EMPTY_STATE: CloudAppState = { programs: [], exercises: [], workouts: [], weightUnits: [] };

let cache: CloudAppState = { ...EMPTY_STATE };
let hydrated = false;
let hydratePromise: Promise<boolean> | null = null;

export function getCloudCache(): CloudAppState {
  return cache;
}

export function isCloudCacheHydrated(): boolean {
  return hydrated;
}

export function setCloudCacheField<K extends keyof CloudAppState>(
  field: K,
  value: CloudAppState[K],
): void {
  cache = { ...cache, [field]: value };
}

export async function hydrateCloudCache(): Promise<boolean> {
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    try {
      const { data, error } = await supabase
        .from("app_state")
        .select("programs, exercises, workouts, weight_units")
        .eq("id", "global")
        .maybeSingle();
      if (error) {
        console.error("Cloud state could not be loaded", error);
        return false;
      }
      if (data) {
        cache = {
          programs: Array.isArray(data.programs) ? data.programs : [],
          exercises: Array.isArray(data.exercises) ? data.exercises : [],
          workouts: Array.isArray(data.workouts) ? data.workouts : [],
          weightUnits: Array.isArray(data.weight_units) ? data.weight_units : [],
        };
      }
      hydrated = true;
      emitLocalEvent(CLOUD_STATE_HYDRATED_EVENT);
      return true;
    } catch (error) {
      console.error("Cloud state hydrate failed", error);
      return false;
    }
  })();
  return hydratePromise;
}

/** Write-through persist for a single app_state column. */
export async function persistCloudAppStateField(
  field: "programs" | "exercises" | "workouts" | "weight_units",
): Promise<void> {
  try {
    const value = field === "weight_units" ? cache.weightUnits : cache[field];
    const payload = { [field]: value } as never;
    const { error } = await supabase.from("app_state").update(payload).eq("id", "global");
    if (error) console.error("Cloud app state persist failed", error);
  } catch (error) {
    console.error("Cloud app state persist threw", error);
  }
}

/** Re-hydrate after writes so other devices see the latest. */
export function invalidateCloudCache(): void {
  hydrated = false;
  hydratePromise = null;
}
