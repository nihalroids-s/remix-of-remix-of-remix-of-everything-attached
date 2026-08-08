import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAccount } from "./AccountProvider";
import { GoogleSignInButton } from "./GoogleSignInButton";
import {
  type AppAccount,
  bootstrapAccount,
  normalizeUsername,
  validateUsername,
} from "@/lib/cloud-accounts";

function validateName(name: string): string | null {
  if (!name.trim()) return "Your name is required. Enter your full name to continue.";
  if (name.trim().length < 2) return "Your name must be at least 2 characters.";
  if (name.trim().length > 80) return "Your name must be 80 characters or less.";
  return null;
}

function enterRouteFor(account: AppAccount): string {
  if (account.role === "coach") return "/coach/dashboard";
  if (account.onboardingCompletedAt) return "/client/dashboard";
  return "/onboarding";
}

export function AccountAccess() {
  const navigate = useNavigate();
  const { login, configured } = useAccount();
  const [phase, setPhase] = useState<"loading" | "signin" | "details" | "error">("loading");
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [usernameTouched, setUsernameTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!configured) {
      setPhase("error");
      setError(
        "Cloud is not connected. What happened: Supabase environment variables are missing. Why: Lovable Cloud is not enabled for this project. What to do: enable Lovable Cloud and rebuild.",
      );
      return;
    }
    void (async () => {
      const session = await supabase.auth.getSession();
      if (!session.data.session) {
        setPhase("signin");
        return;
      }
      try {
        const account = await bootstrapAccount();
        login(account);
        void navigate({ to: enterRouteFor(account) as never });
      } catch (nextError) {
        const message = nextError instanceof Error ? nextError.message : "";
        if (/name|username/i.test(message)) {
          // New client — needs to pick a name + username.
          setPhase("details");
        } else {
          setPhase("error");
          setError(message);
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configured]);

  const nameError = nameTouched ? validateName(name) : null;
  const usernameError = usernameTouched ? validateUsername(username) : null;
  const detailsValid = !validateName(name) && !validateUsername(username);

  const submitDetails = async (event: React.FormEvent) => {
    event.preventDefault();
    setNameTouched(true);
    setUsernameTouched(true);
    const nErr = validateName(name);
    const uErr = validateUsername(username);
    if (nErr || uErr) {
      setError(nErr || uErr);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const account = await bootstrapAccount({
        name: name.trim(),
        username: normalizeUsername(username),
      });
      login(account);
      void navigate({ to: enterRouteFor(account) as never });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Your account could not be created.");
      setSubmitting(false);
    }
  };


  if (phase === "loading") {
    return (
      <div className="space-y-3" aria-label="Loading your account">
        <div className="h-12 w-full rounded-xl bg-muted/60 skeleton-shimmer" />
        <div className="h-14 w-full rounded-xl bg-muted/60 skeleton-shimmer" />
        <div className="h-10 w-full rounded-xl bg-muted/60 skeleton-shimmer" />
      </div>
    );
  }

  if (phase === "signin") {
    return (
      <div className="space-y-4">
        <GoogleSignInButton />
        <p className="text-center text-[0.875rem] leading-5 text-muted-foreground">
          Your coach&apos;s Google account gets Coach mode automatically. Everyone else joins as a
          client.
        </p>
        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-[1rem] leading-5 text-destructive" role="alert">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <p className="min-w-0 flex-1 break-words">{error}</p>
          </div>
        )}
      </div>
    );
  }

  if (phase === "details") {
    return (
      <form onSubmit={submitDetails} className="space-y-5" noValidate>
        <div className="space-y-1.5 text-left">
          <Label htmlFor="cloud-account-name">Your name</Label>
          <Input
            id="cloud-account-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onBlur={() => setNameTouched(true)}
            maxLength={80}
            placeholder="Your name"
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
            ) : null}
            <span id="name-count" className="ml-auto shrink-0 text-[0.8125rem] tabular-nums text-muted-foreground" aria-live="polite">
              {name.length}/80
            </span>
          </div>
        </div>
        <div className="space-y-1.5 text-left">
          <Label htmlFor="cloud-account-username">Username</Label>
          <Input
            id="cloud-account-username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            onBlur={() => setUsernameTouched(true)}
            placeholder="Your username"
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
                  3–30 letters (A–Z, a–z), numbers, and underscores. Unique.
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
        >
          {submitting ? "Creating account…" : "Create account"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="min-h-11 w-full rounded-xl text-[1rem]"
          disabled={submitting}
          onClick={() => void supabase.auth.signOut()}
        >
          Use a different Google account
        </Button>
      </form>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-[1rem] leading-5 text-destructive" role="alert">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <p className="min-w-0 flex-1 break-words">{error}</p>
      </div>
      <Button
        type="button"
        variant="outline"
        className="min-h-12 w-full rounded-xl text-[1rem]"
        onClick={() => {
          setError(null);
          setPhase("signin");
        }}
      >
        Try again
      </Button>
    </div>
  );
}

