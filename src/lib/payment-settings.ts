import { emitLocalEvent } from "./local-events";

export type PaymentSettings = {
  cardUrl: string;
  paypalUrl: string;
};

export const LOCAL_PAYMENT_SETTINGS_CHANGED_EVENT =
  "no-more-copium:local-payment-settings-changed";
const STORAGE_KEY = "no-more-copium:payment-settings:v1";

export function loadPaymentSettings(): PaymentSettings {
  if (typeof window === "undefined") return { cardUrl: "", paypalUrl: "" };
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}");
    if (!parsed || typeof parsed !== "object") return { cardUrl: "", paypalUrl: "" };
    const raw = parsed as Record<string, unknown>;
    return {
      cardUrl: typeof raw.cardUrl === "string" ? raw.cardUrl : "",
      paypalUrl: typeof raw.paypalUrl === "string" ? raw.paypalUrl : "",
    };
  } catch {
    return { cardUrl: "", paypalUrl: "" };
  }
}

export function savePaymentSettings(settings: PaymentSettings): PaymentSettings {
  const normalized = {
    cardUrl: settings.cardUrl.trim(),
    paypalUrl: settings.paypalUrl.trim(),
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  emitLocalEvent(LOCAL_PAYMENT_SETTINGS_CHANGED_EVENT);
  return normalized;
}

export function isValidPaymentUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}
