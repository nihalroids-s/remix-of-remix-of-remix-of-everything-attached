import { useCallback, useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAccount } from "@/components/account/AccountProvider";
import { ClientOnboardingChat } from "@/components/chat/ClientOnboardingChat";

export const Route = createFileRoute("/onboarding")({
  head: () => ({
    meta: [
      { title: "Onboarding — No More Copium" },
      { name: "description", content: "Complete local Coach onboarding." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OnboardingPage,
});

function OnboardingPage() {
  const navigate = useNavigate();
  const { account, loading } = useAccount();

  const enterClientApp = useCallback(async () => {
    await navigate({ to: "/client/dashboard", replace: true });
  }, [navigate]);

  useEffect(() => {
    if (loading) return;
    if (!account) {
      void navigate({ to: "/access", replace: true });
    } else if (account.role === "coach") {
      void navigate({ to: "/coach/dashboard", replace: true });
    } else if (account.role === "payment_manager") {
      void navigate({ to: "/payment/dashboard", replace: true });
    } else if (account.onboardingCompletedAt) {
      void enterClientApp();
    }
  }, [account, enterClientApp, loading, navigate]);

  if (
    loading ||
    !account ||
    account.role === "coach" ||
    account.role === "payment_manager" ||
    account.onboardingCompletedAt
  ) {
    return <main className="min-h-[100dvh] bg-background" aria-label="Opening local account" />;
  }

  return <ClientOnboardingChat account={account} onCompleted={enterClientApp} />;
}
