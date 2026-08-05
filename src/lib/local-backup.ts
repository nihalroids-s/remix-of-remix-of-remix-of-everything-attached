import { clearLocalBlobs, listLocalBlobs, putLocalBlob } from "./local-media";

const KEY_PREFIX = "no-more-copium:";
const BACKUP_VERSION = 1;

export type LocalPrototypeBackup = {
  version: 1;
  exportedAt: string;
  localStorage: Record<string, string>;
  blobs: Array<{ key: string; type: string; base64: string }>;
};

export async function createLocalPrototypeBackup(): Promise<Blob> {
  const localValues: Record<string, string> = {};
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key?.startsWith(KEY_PREFIX)) continue;
    const value = window.localStorage.getItem(key);
    if (value !== null) localValues[key] = value;
  }
  const blobs = await Promise.all(
    (await listLocalBlobs()).map(async ({ key, blob }) => ({
      key,
      type: blob.type || "application/octet-stream",
      base64: await blobToBase64(blob),
    })),
  );
  const backup: LocalPrototypeBackup = {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    localStorage: localValues,
    blobs,
  };
  return new Blob([JSON.stringify(backup)], { type: "application/json" });
}

export async function importLocalPrototypeBackup(file: File): Promise<void> {
  if (file.size > 150 * 1024 * 1024) throw new Error("The backup file is larger than 150 MB.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error("This is not a valid No More Copium backup file.");
  }
  if (!isBackup(parsed)) throw new Error("This backup format is not supported.");
  let decodedBlobs: Array<{ key: string; blob: Blob }>;
  try {
    decodedBlobs = parsed.blobs.map((entry) => ({
      key: entry.key,
      blob: base64ToBlob(entry.base64, entry.type),
    }));
  } catch {
    throw new Error("This backup contains invalid local image data.");
  }

  await clearLocalPrototypeData();
  for (const [key, value] of Object.entries(parsed.localStorage)) {
    if (key.startsWith(KEY_PREFIX)) window.localStorage.setItem(key, value);
  }
  for (const entry of decodedBlobs) {
    await putLocalBlob(entry.key, entry.blob);
  }
}

export async function clearLocalPrototypeData(): Promise<void> {
  const keys: string[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key?.startsWith(KEY_PREFIX)) keys.push(key);
  }
  keys.forEach((key) => window.localStorage.removeItem(key));
  await clearLocalBlobs();
}

function isBackup(value: unknown): value is LocalPrototypeBackup {
  if (!value || typeof value !== "object") return false;
  const backup = value as Partial<LocalPrototypeBackup>;
  return (
    backup.version === BACKUP_VERSION &&
    typeof backup.exportedAt === "string" &&
    Boolean(backup.localStorage) &&
    typeof backup.localStorage === "object" &&
    Object.entries(backup.localStorage).every(
      ([key, storedValue]) => key.startsWith(KEY_PREFIX) && typeof storedValue === "string",
    ) &&
    Array.isArray(backup.blobs) &&
    backup.blobs.every(
      (entry) =>
        Boolean(entry) &&
        typeof entry.key === "string" &&
        typeof entry.type === "string" &&
        typeof entry.base64 === "string",
    )
  );
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      resolve(result.includes(",") ? result.slice(result.indexOf(",") + 1) : result);
    };
    reader.onerror = () =>
      reject(reader.error ?? new Error("A local image could not be exported."));
    reader.readAsDataURL(blob);
  });
}

function base64ToBlob(base64: string, type: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type });
}
