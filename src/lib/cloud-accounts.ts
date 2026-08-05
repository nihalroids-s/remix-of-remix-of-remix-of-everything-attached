import { emitLocalEvent, LOCAL_ACCOUNTS_CHANGED_EVENT } from "./local-events";

export type AccountRole = "coach" | "client";

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
export const USERNAME_PATTERN = /^[a-z0-9]+(?: [a-z0-9]+)*$/;
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 30;

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function validateUsername(value: string): string | null {
  const username = normalizeUsername(value);
  if (username.length < USERNAME_MIN_LENGTH || username.length > USERNAME_MAX_LENGTH) {
    return `Username must be ${USERNAME_MIN_LENGTH}–${USERNAME_MAX_LENGTH} characters.`;
  }
  if (!USERNAME_PATTERN.test(username)) {
    return "Use only lowercase letters, numbers, and single spaces between words.";
  }
  return null;
}

export async function fetchAccounts(): Promise<AppAccount[]> {
  return readAccounts();
}

export async function fetchAccount(accountId: string): Promise<AppAccount | null> {
  return readAccounts().find((account) => account.id === accountId) ?? null;
}

export async function fetchPublicCoachAccount(): Promise<AppAccount | null> {
  return readAccounts().find((account) => account.role === "coach") ?? null;
}

export async function createAccount(input: {
  name: string;
  username: string;
  role: AccountRole;
}): Promise<AppAccount> {
  const name = input.name.trim().replace(/\s+/g, " ");
  const username = normalizeUsername(input.username);
  if (!name || name.length > 80) throw new Error("Enter your name using 80 characters or fewer.");
  const usernameError = validateUsername(username);
  if (usernameError) throw new Error(usernameError);

  const accounts = readAccounts();
  if (accounts.some((account) => account.username === username)) {
    throw new Error("That username is already taken on this device.");
  }
  if (input.role === "coach" && accounts.some((account) => account.role === "coach")) {
    throw new Error("A Coach account already exists on this device.");
  }

  const account: AppAccount = {
    id: createId(),
    name,
    username,
    role: input.role,
    isPreview: false,
    onboardingStep: input.role === "coach" ? 6 : 0,
    onboardingCompletedAt: input.role === "coach" ? new Date().toISOString() : undefined,
    createdAt: new Date().toISOString(),
  };
  writeAccounts([...accounts, account]);
  return account;
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
    Pick<AppAccount, "onboardingStep" | "onboardingCompletedAt" | "assignedProgramId">
  >,
): Promise<AppAccount> {
  const accounts = readAccounts();
  const index = accounts.findIndex((account) => account.id === accountId);
  if (index < 0) throw new Error("Account was not found on this device.");
  const updated = { ...accounts[index], ...updates };
  accounts[index] = updated;
  writeAccounts(accounts);
  return updated;
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

function readAccounts(): AppAccount[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed: unknown = JSON.parse(
      window.localStorage.getItem(LOCAL_ACCOUNTS_STORAGE_KEY) ?? "[]",
    );
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isAccount)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  } catch {
    return [];
  }
}

function writeAccounts(accounts: AppAccount[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LOCAL_ACCOUNTS_STORAGE_KEY, JSON.stringify(accounts));
  emitLocalEvent(LOCAL_ACCOUNTS_CHANGED_EVENT);
}

function isAccount(value: unknown): value is AppAccount {
  if (!value || typeof value !== "object") return false;
  const account = value as Partial<AppAccount>;
  return (
    typeof account.id === "string" &&
    typeof account.name === "string" &&
    typeof account.username === "string" &&
    (account.role === "coach" || account.role === "client") &&
    typeof account.createdAt === "string"
  );
}

function createId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `account_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
