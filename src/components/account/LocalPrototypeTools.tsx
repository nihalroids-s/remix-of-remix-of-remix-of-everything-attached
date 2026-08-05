import { useRef, useState } from "react";
import { AlertCircle, Download, HardDrive, RotateCcw, Trash2, Upload } from "lucide-react";
import { useAccount } from "@/components/account/AccountProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  clearLocalPrototypeData,
  createLocalPrototypeBackup,
  importLocalPrototypeBackup,
} from "@/lib/local-backup";
import { resetClientOnboarding } from "@/lib/local-prototype-tools";

export function LocalPrototypeTools() {
  const { account, accounts, refresh } = useAccount();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const clients = accounts.filter((candidate) => candidate.role === "client");

  const exportData = async () => {
    setBusy(true);
    setError(null);
    try {
      const blob = await createLocalPrototypeBackup();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `no-more-copium-local-backup-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (nextError) {
      const raw = nextError instanceof Error ? nextError.message : "";
      if (raw.toLowerCase().includes("storage") || raw.toLowerCase().includes("quota")) {
        setError("Local data could not be exported because browser storage is unavailable or an entry is too large. What happened: export failed. Why: storage may be full. What to do: free device storage, remove large progress pictures, and try again.");
      } else {
        setError("Local data could not be exported. What happened: backup creation failed. Why: browser storage may be blocked. What to do: ensure storage is enabled and try again. Your data stays only in this browser.");
      }
    } finally {
      setBusy(false);
    }
  };

  const importData = async (file: File | undefined) => {
    if (!file) return;
    if (!window.confirm("Replace all local prototype data with this backup? This will delete current local accounts, chats, workouts, and pictures on this browser.")) return;
    setBusy(true);
    setError(null);
    try {
      await importLocalPrototypeBackup(file);
      window.location.assign("/access");
    } catch (nextError) {
      const raw = nextError instanceof Error ? nextError.message : "";
      if (raw.toLowerCase().includes("invalid") || raw.toLowerCase().includes("unsupported") || raw.toLowerCase().includes("oversized")) {
        setError(`Import failed: ${raw}. What happened: backup is invalid or unsupported. Why: file may be corrupted, wrong format, or too large. What to do: use a valid JSON backup exported from No More Copium under 25MB and try again.`);
      } else {
        setError("The backup could not be imported because local storage is unavailable or the file is invalid. What happened: import failed. Why: file may be corrupted or storage blocked. What to do: ensure you selected a valid backup JSON and that device storage is available, then try again.");
      }
      setBusy(false);
    }
  };

  const clearData = async () => {
    if (
      !window.confirm(
        "Delete every local account, chat, workout, picture, cover, and setting on this browser? This cannot be undone. Consider exporting a backup first.",
      )
    )
      return;
    setBusy(true);
    await clearLocalPrototypeData();
    window.location.assign("/access");
  };

  const resetOnboarding = async (clientId: string, name: string) => {
    if (!window.confirm(`Reset onboarding and local chat history for ${name}? Their progress pictures and workout history will be kept, but chat and onboarding will restart.`)) return;
    setBusy(true);
    setError(null);
    try {
      await resetClientOnboarding(clientId);
      await refresh();
    } catch (nextError) {
      setError("Onboarding could not be reset because local storage is unavailable. What happened: reset failed. Why: browser storage may be blocked. What to do: check device storage and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 border-t border-border pt-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-[1rem] font-semibold leading-5 text-foreground">
            <HardDrive className="h-5 w-5" aria-hidden="true" />
            Local prototype data
          </p>
          <p className="mt-1.5 text-[1rem] leading-5 text-muted-foreground">
            Accounts, chats, workouts, and images exist only in this browser. Clearing site data removes them. Export a backup to keep a copy.
          </p>
        </div>
        <Badge variant="secondary" className="rounded-md px-2.5 py-1 text-[0.75rem]">Local prototype</Badge>
      </div>

      <input
        ref={importRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(event) => {
          void importData(event.target.files?.[0]);
          event.target.value = "";
        }}
      />

      <div className="grid grid-cols-2 gap-2.5">
        <Button type="button" variant="outline" disabled={busy} onClick={() => void exportData()} className="min-h-11 rounded-xl text-[1rem]">
          <Download className="h-5 w-5" aria-hidden="true" />
          Export
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => importRef.current?.click()}
          className="min-h-11 rounded-xl text-[1rem]"
        >
          <Upload className="h-5 w-5" aria-hidden="true" />
          Import
        </Button>
      </div>

      {account?.role === "coach" && clients.length > 0 && (
        <div className="space-y-2.5 rounded-xl border border-border bg-card p-4">
          <p className="text-[0.8125rem] font-medium uppercase tracking-wide text-muted-foreground">
            Reset Client onboarding
          </p>
          {clients.map((client) => (
            <div key={client.id} className="flex items-center justify-between gap-3 rounded-lg border border-transparent p-1">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[1rem] font-medium leading-5">{client.name}</p>
                <p className="truncate text-[1rem] leading-5 text-muted-foreground">@{client.username}</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => void resetOnboarding(client.id, client.name)}
                className="min-h-10 rounded-lg"
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                Reset
              </Button>
            </div>
          ))}
        </div>
      )}

      <Button
        type="button"
        variant="destructive"
        className="min-h-12 w-full rounded-xl text-[1rem] font-semibold"
        disabled={busy}
        onClick={() => void clearData()}
      >
        <Trash2 className="h-5 w-5" aria-hidden="true" />
        Clear all local test data
      </Button>

      {error && (
        <div className="flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-[1rem] leading-5 text-destructive" role="alert">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <p className="min-w-0 flex-1 break-words">{error}</p>
        </div>
      )}
    </div>
  );
}
