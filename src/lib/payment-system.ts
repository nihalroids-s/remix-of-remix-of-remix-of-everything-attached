import {
  fetchAccounts,
  normalizeUsername,
  updateLocalAccount,
} from "./cloud-accounts";
import { fetchJoinRequest, removeLocalJoinRequest } from "./local-join-requests";
import { emitLocalEvent } from "./local-events";

export type PaymentTag = "new_user" | "membership";

export type PaymentStartedRecord = {
  id: string;
  clientId: string;
  clientUsername: string;
  clientName: string;
  method: "card" | "paypal";
  startedAt: string;
};

export type PaymentRecord = {
  id: string;
  clientName: string;
  clientUsername: string;
  amountUsd: number;
  tag: PaymentTag;
  note?: string;
  recordedBy: string;
  recordedAt: string;
};

export type PayoutStatus = "pending" | "approved" | "rejected";

export type PayoutRecord = {
  id: string;
  amountUsd: number;
  screenshotId?: string;
  note?: string;
  status: PayoutStatus;
  submittedBy: string;
  submittedAt: string;
  decidedAt?: string;
  decidedByCoachId?: string;
  rejectionReason?: string;
};

/** A single month of access for one client. */
export const PAYMENT_AMOUNT_USD = 29;
/** Fixed split: partner keeps this, developer receives this per payment. */
export const PARTNER_SHARE_PER_PAYMENT_USD = 5;
export const DEV_SHARE_PER_PAYMENT_USD = 20;

export const LOCAL_PAYMENTS_CHANGED_EVENT = "no-more-copium:local-payments-changed";
export const LOCAL_PAYOUTS_CHANGED_EVENT = "no-more-copium:local-payouts-changed";

const PAYMENTS_STORAGE_KEY = "no-more-copium:payments:v1";
const PAYOUTS_STORAGE_KEY = "no-more-copium:payouts:v1";
const PAYMENT_STARTED_STORAGE_KEY = "no-more-copium:payment-started:v1";

export function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

export async function fetchPayments(): Promise<PaymentRecord[]> {
  return readPayments().sort((left, right) => right.recordedAt.localeCompare(left.recordedAt));
}

export async function recordPaymentStarted({
  clientId,
  method,
}: {
  clientId: string;
  method: "card" | "paypal";
}): Promise<PaymentStartedRecord> {
  const accounts = await fetchAccounts();
  const client = accounts.find(
    (account) => account.role === "client" && account.id === clientId,
  );
  if (!client) {
    throw new Error("No client account was found for this payment.");
  }
  const record: PaymentStartedRecord = {
    id: createPaymentId(),
    clientId: client.id,
    clientUsername: client.username,
    clientName: client.name,
    method,
    startedAt: new Date().toISOString(),
  };
  const records = readPaymentStarted();
  writePaymentStarted([...records.filter((candidate) => candidate.clientId !== client.id), record]);
  return record;
}

export async function fetchPaymentStartedRecords(): Promise<PaymentStartedRecord[]> {
  return readPaymentStarted().sort((left, right) =>
    right.startedAt.localeCompare(left.startedAt),
  );
}

export function clearPaymentStartedForClient(clientId: string): void {
  const next = readPaymentStarted().filter((record) => record.clientId !== clientId);
  writePaymentStarted(next);
}

export async function fetchPayouts(): Promise<PayoutRecord[]> {
  return readPayouts().sort((left, right) => right.submittedAt.localeCompare(left.submittedAt));
}

export async function recordPayment({
  clientUsername,
  amountUsd,
  note,
  recordedBy,
}: {
  clientUsername: string;
  amountUsd: number;
  note?: string;
  recordedBy: string;
}): Promise<PaymentRecord> {
  const username = normalizeUsername(clientUsername);
  const accounts = await fetchAccounts();
  const client = accounts.find(
    (account) => account.role === "client" && account.username === username,
  );
  if (!client) {
    throw new Error(
      "No client account found with that username on this device. What happened: the username did not match any local Client. Why: usernames are case-insensitive but must match exactly. What to do: check the username against the Client's profile or create the Client account first.",
    );
  }
  const amount = Number.isFinite(amountUsd) && amountUsd > 0 ? amountUsd : PAYMENT_AMOUNT_USD;
  const payments = readPayments();
  const tag: PaymentTag = payments.some(
    (payment) => payment.clientUsername === client.username,
  )
    ? "membership"
    : "new_user";
  const record: PaymentRecord = {
    id: createPaymentId(),
    clientName: client.name,
    clientUsername: client.username,
    amountUsd: amount,
    tag,
    note: note?.trim() ? note.trim() : undefined,
    recordedBy,
    recordedAt: new Date().toISOString(),
  };
  writePayments([...payments, record]);
  // A confirmed payment unlocks the client automatically.
  await unlockClientAccount(client.id);
  clearPaymentStartedForClient(client.id);
  return record;
}

export function submitPayout({
  amountUsd,
  screenshotId,
  note,
  submittedBy,
}: {
  amountUsd: number;
  screenshotId?: string;
  note?: string;
  submittedBy: string;
}): PayoutRecord {
  const amount = Number.isFinite(amountUsd) && amountUsd > 0 ? amountUsd : 0;
  if (amount <= 0) {
    throw new Error(
      "Enter a payout amount greater than zero. What happened: the amount was empty or invalid. Why: payouts need a positive USD amount. What to do: enter how much you sent and try again.",
    );
  }
  const record: PayoutRecord = {
    id: createPaymentId(),
    amountUsd: amount,
    screenshotId: screenshotId?.trim() ? screenshotId.trim() : undefined,
    note: note?.trim() ? note.trim() : undefined,
    status: "pending",
    submittedBy,
    submittedAt: new Date().toISOString(),
  };
  const payouts = readPayouts();
  writePayouts([...payouts, record]);
  return record;
}

export function decidePayout(
  payoutId: string,
  decision: "approved" | "rejected",
  coachId: string,
  reason?: string,
): PayoutRecord | undefined {
  const payouts = readPayouts();
  const index = payouts.findIndex((payout) => payout.id === payoutId);
  if (index === -1) return undefined;
  const current = payouts[index];
  if (current.status !== "pending") return current;
  const decided: PayoutRecord = {
    ...current,
    status: decision,
    decidedAt: new Date().toISOString(),
    decidedByCoachId: coachId,
    rejectionReason: decision === "rejected" ? reason?.trim() || undefined : undefined,
  };
  payouts[index] = decided;
  writePayouts(payouts);
  return decided;
}

export function paymentTotals(
  payments: PaymentRecord[],
  payouts: PayoutRecord[],
): {
  count: number;
  owedUsd: number;
  paidOutUsd: number;
  remainingUsd: number;
} {
  const count = payments.length;
  const owedUsd = count * DEV_SHARE_PER_PAYMENT_USD;
  const paidOutUsd = payouts
    .filter((payout) => payout.status === "approved")
    .reduce((sum, payout) => sum + payout.amountUsd, 0);
  const remainingUsd = Math.max(0, owedUsd - paidOutUsd);
  return { count, owedUsd, paidOutUsd, remainingUsd };
}

async function unlockClientAccount(clientId: string): Promise<void> {
  await updateLocalAccount(clientId, {
    onboardingStep: 7,
    onboardingCompletedAt: new Date().toISOString(),
  });
  const request = await fetchJoinRequest(clientId);
  if (request) removeLocalJoinRequest(clientId);
}

function readPaymentStarted(): PaymentStartedRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed: unknown = JSON.parse(
      window.localStorage.getItem(PAYMENT_STARTED_STORAGE_KEY) ?? "[]",
    );
    return Array.isArray(parsed) ? (parsed as PaymentStartedRecord[]) : [];
  } catch {
    return [];
  }
}

function writePaymentStarted(records: PaymentStartedRecord[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PAYMENT_STARTED_STORAGE_KEY, JSON.stringify(records));
  emitLocalEvent(LOCAL_PAYMENTS_CHANGED_EVENT);
}

function createPaymentId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `pm_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function readPayments(): PaymentRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(PAYMENTS_STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? (parsed as PaymentRecord[]) : [];
  } catch {
    return [];
  }
}

function writePayments(payments: PaymentRecord[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PAYMENTS_STORAGE_KEY, JSON.stringify(payments));
  emitLocalEvent(LOCAL_PAYMENTS_CHANGED_EVENT);
}

function readPayouts(): PayoutRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(PAYOUTS_STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? (parsed as PayoutRecord[]) : [];
  } catch {
    return [];
  }
}

function writePayouts(payouts: PayoutRecord[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PAYOUTS_STORAGE_KEY, JSON.stringify(payouts));
  emitLocalEvent(LOCAL_PAYOUTS_CHANGED_EVENT);
}
