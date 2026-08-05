import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Plus, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  type AccountRole,
  type AppAccount,
  createAccount,
  fetchAccounts,
} from "@/lib/cloud-accounts";
import { useAccount } from "./AccountProvider";

function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 30);
}

function validateName(name: string): string | null {
  if (!name.trim()) return "Your name is required. Enter your full name to continue.";
  if (name.trim().length < 2) return "Your name must be at least 2 characters.";
  if (name.trim().length > 80) return "Your name must be 80 characters or less.";
  return null;
}

function validateUsername(username: string, existingUsernames: string[]): string | null {
  const trimmed = username.trim().toLowerCase();
  if (!trimmed) return "Username is required. Choose 3–30 lowercase letters, numbers, and spaces, unique on this device.";
  if (trimmed.length < 3) return "Username must be at least 3 characters.";
  if (trimmed.length > 30) return "Username must be 30 characters or less.";
  if (!/^[a-z0-9 ]+$/.test(trimmed)) return "Username can only use lowercase letters, numbers, and spaces.";
  if (existingUsernames.includes(trimmed)) return "This username is already taken on this device. Choose another username.";
  return null;
}

export function AccountAccess() {
  const navigate = useNavigate();
  const { login } = useAccount();
  const [accounts, setAccounts] = useState<AppAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [step, setStep] = useState<"details" | "role">("details");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [usernameTouched, setUsernameTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchAccounts()
      .then((next) => {
        setAccounts(next);
        setCreating(next.length === 0);
      })
      .finally(() => setLoading(false));
  }, []);

  const coachExists = accounts.some((account) => account.role === "coach");
  const existingUsernames = useMemo(() => accounts.map((a) => a.username.toLowerCase()), [accounts]);

  const nameError = nameTouched ? validateName(name) : null;
  const usernameError = usernameTouched ? validateUsername(username, existingUsernames) : null;
  const detailsValid = !validateName(name) && !validateUsername(username, existingUsernames);

  const enterAccount = (account: AppAccount) => {
    login(account);
    void navigate({
      to:
        account.role === "coach"
          ? "/coach/dashboard"
          : account.onboardingCompletedAt
            ? "/client/dashboard"
            : "/onboarding",
    });
  };

  const submitDetails = (event: React.FormEvent) => {
    event.preventDefault();
    setNameTouched(true);
    setUsernameTouched(true);
    const nErr = validateName(name);
    const uErr = validateUsername(username, existingUsernames);
    if (nErr || uErr) {
      setError(nErr || uErr);
      return;
    }
    setUsername(normalizeUsername(username));
    setError(null);
    setStep("role");
  };

  const chooseRole = async (role: AccountRole) => {
    setSubmitting(true);
    setError(null);
    try {
      const account = await createAccount({ name: name.trim(), username: normalizeUsername(username), role });
      setAccounts((previous) => [...previous, account]);
      enterAccount(account);
    } catch (nextError) {
      const raw = nextError instanceof Error ? nextError.message : "";
      if (raw.toLowerCase().includes("username") || raw.toLowerCase().includes("taken") || raw.toLowerCase().includes("unique")) {
        setError("Your account could not be created because this username is already taken on this device. What happened: username conflict. Why: local usernames must be unique. What to do: choose another username with 3–30 lowercase letters, numbers, and spaces.");
      } else if (raw.toLowerCase().includes("storage") || raw.toLowerCase().includes("quota")) {
        setError("Your account could not be created because local storage is unavailable or full. What happened: storage write failed. Why: device storage may be full or blocked. What to do: check device storage, free space, and try again.");
      } else {
        setError("Your account could not be created because local storage is unavailable. What happened: account creation failed. Why: browser storage may be blocked or full. What to do: check device storage, ensure cookies/storage are enabled, and try again. Your data stays only in this browser.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3" aria-label="Loading local accounts">
        <div className="h-10 w-32 rounded-lg bg-muted/60 skeleton-shimmer" />
        <div className="h-14 w-full rounded-xl bg-muted/60 skeleton-shimmer" />
        <div className="h-14 w-full rounded-xl bg-muted/60 skeleton-shimmer" />
        <div className="h-10 w-full rounded-xl bg-muted/60 skeleton-shimmer" />
      </div>
    );
  }

  if (creating) {
    return step === "details" ? (
      <form onSubmit={submitDetails} className="space-y-5" noValidate>
        <div className="space-y-1.5 text-left">
          <Label htmlFor="local-account-name">Your name</Label>
          <Input
            id="local-account-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onBlur={() => setNameTouched(true)}
            maxLength={80}
            autoFocus
            aria-invalid={!!nameError}
            aria-describedby={nameError ? "name-error name-count" : "name-count"}
            aria-required="true"
          />
          <div className="flex items-center justify-between gap-2">
            {nameError ? (
              <p id="name-error" className="flex items-start gap-1.5 text-[1rem] leading-5 text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{nameError}</span>
              </p>
            ) : (
              <p className="text-[1rem] leading-5 text-muted-foreground">Use your real name — it helps your coach recognize you.</p>
            )}
            <span id="name-count" className="shrink-0 text-[0.8125rem] tabular-nums text-muted-foreground" aria-live="polite">
              {name.length}/80
            </span>
          </div>
        </div>
        <div className="space-y-1.5 text-left">
          <Label htmlFor="local-account-username">Username</Label>
          <Input
            id="local-account-username"
            value={username}
            onChange={(event) => setUsername(event.target.value.toLowerCase())}
            onBlur={() => setUsernameTouched(true)}
            placeholder="your username"
            maxLength={30}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            aria-invalid={!!usernameError}
            aria-describedby={usernameError ? "username-error username-hint username-count" : "username-hint username-count"}
            aria-required="true"
          />
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              {usernameError ? (
                <p id="username-error" className="flex items-start gap-1.5 text-[1rem] leading-5 text-destructive">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{usernameError}</span>
                </p>
              ) : (
                <p id="username-hint" className="text-[1rem] leading-5 text-muted-foreground">
                  3–30 lowercase letters, numbers, and spaces. Unique on this device.
                </p>
              )}
            </div>
            <span id="username-count" className="shrink-0 text-[0.8125rem] tabular-nums text-muted-foreground" aria-live="polite">
              {username.length}/30
            </span>
          </div>
        </div>
        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-[1rem] leading-5 text-destructive" role="alert">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <p className="min-w-0 flex-1 break-words">{error}</p>
          </div>
        )}
        <Button
          type="submit"
          className="min-h-12 w-full rounded-xl text-[1rem] font-semibold"
          disabled={submitting || !detailsValid}
          aria-describedby={!detailsValid ? "form-requirements" : undefined}
        >
          Continue
        </Button>
        {!detailsValid && (
          <p id="form-requirements" className="text-[1rem] leading-5 text-muted-foreground">
            Enter a valid name (2–80 characters) and username (3–30 characters, unique) to continue.
          </p>
        )}
        {accounts.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            className="min-h-11 w-full rounded-xl text-[1rem]"
            onClick={() => setCreating(false)}
          >
            Back to accounts
          </Button>
        )}
      </form>
    ) : (
      <div className="space-y-5">
        <div className="text-left">
          <h2 className="text-[1.25rem] font-semibold leading-tight tracking-tight">Choose account type</h2>
          <p className="mt-1.5 text-[1rem] leading-6 text-muted-foreground">
            This local prototype choice is permanent on this device. You can create one Coach and many Clients.
          </p>
        </div>
        <div className="grid gap-2.5">
          <Button
            type="button"
            className="min-h-12 w-full justify-start rounded-xl px-4 py-3 text-[1rem] font-semibold"
            disabled={submitting || coachExists}
            onClick={() => void chooseRole("coach")}
          >
            Coach Mode
            <span className="ml-auto text-[1rem] font-normal text-primary-foreground/80">Build programs</span>
          </Button>
          {coachExists && (
            <p className="px-1 text-[0.875rem] leading-5 text-muted-foreground">A local Coach already exists. You cannot create another.</p>
          )}
          <Button
            type="button"
            variant="outline"
            className="min-h-12 w-full justify-start rounded-xl px-4 py-3 text-[1rem] font-semibold"
            disabled={submitting || !coachExists}
            onClick={() => void chooseRole("client")}
          >
            Client Mode
            <span className="ml-auto text-[1rem] font-normal text-muted-foreground">Follow programs</span>
          </Button>
          {!coachExists && (
            <p className="px-1 text-[0.875rem] leading-5 text-muted-foreground">
              Create the local Coach first so Client onboarding and chat have a Coach.
            </p>
          )}
        </div>
        {!coachExists && !submitting && (
          <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-[1rem] leading-5 text-amber-900 dark:text-amber-100">
            What to do next: Create the Coach account first. The Client flow needs a Coach to assign programs and read your messages.
          </p>
        )}
        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-[1rem] leading-5 text-destructive" role="alert">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <p className="min-w-0 flex-1 break-words">{error}</p>
          </div>
        )}
        <Button type="button" variant="ghost" className="min-h-11 w-full rounded-xl text-[1rem]" onClick={() => setStep("details")}>
          Back
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2.5">
        {accounts.map((account) => (
          <button
            key={account.id}
            type="button"
            onClick={() => enterAccount(account)}
            className="flex min-h-[64px] w-full items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[1rem] font-medium leading-5">{account.name}</span>
              <span className="block truncate text-[1rem] leading-5 text-muted-foreground">@{account.username}</span>
            </span>
            <Badge variant={account.role === "coach" ? "default" : "secondary"} className="rounded-md px-2.5 py-1 text-[0.75rem]">
              {account.role === "coach" ? "Coach" : "Client"}
            </Badge>
          </button>
        ))}
      </div>
      <Button
        type="button"
        variant="outline"
        className="min-h-12 w-full rounded-xl text-[1rem] font-semibold"
        onClick={() => {
          setCreating(true);
          setStep("details");
          setError(null);
          setName("");
          setUsername("");
          setNameTouched(false);
          setUsernameTouched(false);
        }}
      >
        <Plus className="h-5 w-5" aria-hidden="true" />
        Create a new local account
      </Button>
    </div>
  );
}
