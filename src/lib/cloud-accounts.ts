import { supabase } from "@/integrations/supabase/client";

export type AccountRole = "coach" | "client" | "payment_manager";

export type AppAccount = {
  id: string;
  name: string;
  username: string;
  role: AccountRole;
  isPreview: boolean;
  onboardingStep: number;
  onboardingCompletedAt?: string;
  assignedProgramId?: string;
  createdAt: string;
};

export const ACTIVE_ACCOUNT_STORAGE_KEY = "no-more-copium:active-account:v3";
export const LOCAL_ACCOUNTS_STORAGE_KEY = "no-more-copium:accounts:v3";
export const USERNAME_PATTERN = /^[A-Za-z0-9_]+$/;
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 30;

export function normalizeUsername(value: string): string {
  return value.trim();
}

/** Case-insensitive key used for uniqueness and matching. */
export function usernameKey(value: string): string {
  return normalizeUsername(value).toLowerCase();
}

export function validateUsername(value: string): string | null {
  const username = normalizeUsername(value);
  if (username.length < USERNAME_MIN_LENGTH || username.length > USERNAME_MAX_LENGTH) {
    return `Username must be ${USERNAME_MIN_LENGTH}–${USERNAME_MAX_LENGTH} characters.`;
  }
  if (!USERNAME_PATTERN.test(username)) {
    return "Use only A–Z, a–z, 0–9, and underscores.";
  }
  return null;
}

function mapRow(row: Record<string, unknown>): AppAccount {
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    username: String(row.username ?? ""),
    role: (row.role as AccountRole) ?? "client",
    isPreview: Boolean(row.is_preview),
    onboardingStep:
      typeof row.onboarding_step === "number" ? row.onboarding_step : 0,
    onboardingCompletedAt:
      typeof row.onboarding_completed_at === "string"
        ? row.onboarding_completed_at
        : undefined,
    assignedProgramId:
      typeof row.assigned_program_id === "string" ? row.assigned_program_id : undefined,
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

/** Full account row for the current session (after bootstrap). */
export async function fetchAccount(accountId: string): Promise<AppAccount | null> {
  const { data, error } = await supabase
    .from("app_accounts")
    .select(
      "id, name, username, role, is_preview, onboarding_step, onboarding_completed_at, assigned_program_id, created_at",
    )
    .eq("id", accountId)
    .maybeSingle();
  if (error || !data) return null;
  return mapRow(data as Record<string, unknown>);
}

export async function fetchAccounts(): Promise<AppAccount[]> {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return [];
  const { data: rows, error } = await supabase
    .from("app_accounts")
    .select(
      "id, name, username, role, is_preview, onboarding_step, onboarding_completed_at, assigned_program_id, created_at",
    )
    .eq("is_preview", false)
    .order("created_at", { ascending: true });
  if (error || !rows) return [];
  return rows.map((row) => mapRow(row as Record<string, unknown>));
}

export async function fetchPublicCoachAccount(): Promise<AppAccount | null> {
  const { data, error } = await supabase
    .from("app_accounts")
    .select(
      "id, name, username, role, is_preview, onboarding_step, onboarding_completed_at, assigned_program_id, created_at",
    )
    .eq("role", "coach")
    .eq("is_preview", false)
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return mapRow(data as Record<string, unknown>);
}

/**
 * Calls the account-bootstrap edge function with the current Google session.
 * - Existing account → returned as-is.
 * - Coach email (COACH_GOOGLE_EMAIL secret) → Coach account created.
 * - New client → requires name + username.
 */
export async function bootstrapAccount(input?: {
  name?: string;
  username?: string;
}): Promise<AppAccount> {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) {
    throw new Error("Sign in with Google first.");
  }
  const { data, error } = await supabase.functions.invoke("account-bootstrap", {
    body: { name: input?.name, username: input?.username },
  });
  if (error) {
    const message =
      (error.context as { message?: string } | undefined)?.message ?? error.message;
    throw new Error(message || "Account could not be created.");
  }
  if (!data?.ok || !data?.account?.id) {
    const message =
      typeof data?.error === "string"
        ? data.error
        : "Account could not be created. What happened: bootstrap failed. Why: the Google session may be incomplete. What to do: sign out and sign in again.";
    throw new Error(message);
  }
  // Bootstrap returns the row without onboarding fields — fetch the full row.
  const full = await fetchAccount(String(data.account.id));
  if (!full) throw new Error("Account was created but could not be loaded.");
  return full;
}

/** Legacy local creation is gone — cloud accounts come from Google. */
export async function createAccount(_input: {
  name: string;
  username: string;
  role: AccountRole;
}): Promise<AppAccount> {
  throw new Error(
    "Accounts are created with Google sign-in now. Use Continue with Google.",
  );
}

export async function updateCloudClientAssignment(
  clientId: string,
  assignedProgramId: string | undefined,
): Promise<AppAccount> {
  return updateLocalAccount(clientId, { assignedProgramId });
}

export async function updateLocalAccount(
  accountId: string,
  updates: Partial<
    Pick<
      AppAccount,
      "onboardingStep" | "onboardingCompletedAt" | "assignedProgramId"
    >
  >,
): Promise<AppAccount> {
  const payload: {
    onboarding_step?: number;
    onboarding_completed_at?: string | null;
    assigned_program_id?: string | null;
  } = {};
  if (updates.onboardingStep !== undefined) payload.onboarding_step = updates.onboardingStep;
  if (updates.onboardingCompletedAt !== undefined) {
    payload.onboarding_completed_at = updates.onboardingCompletedAt;
  }
  if (updates.assignedProgramId !== undefined) {
    payload.assigned_program_id = updates.assignedProgramId;
  }
  const { data, error } = await supabase
    .from("app_accounts")
    .update(payload)
    .eq("id", accountId)
    .select(
      "id, name, username, role, is_preview, onboarding_step, onboarding_completed_at, assigned_program_id, created_at",
    )
    .maybeSingle();
  if (error || !data) {
    throw new Error("Account could not be updated on the cloud.");
  }
  return mapRow(data as Record<string, unknown>);
}

export function readActiveAccountId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ACTIVE_ACCOUNT_STORAGE_KEY);
}

export function storeActiveAccountId(accountId: string | null): void {
  if (typeof window === "undefined") return;
  if (accountId) window.localStorage.setItem(ACTIVE_ACCOUNT_STORAGE_KEY, accountId);
  else window.localStorage.removeItem(ACTIVE_ACCOUNT_STORAGE_KEY);
}
