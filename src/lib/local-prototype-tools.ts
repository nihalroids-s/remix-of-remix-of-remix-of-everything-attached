import { resetLocalClientChat } from "./chat";
import { fetchAccount, updateLocalAccount } from "./cloud-accounts";
import { removeLocalJoinRequest } from "./local-join-requests";

export async function resetClientOnboarding(clientId: string): Promise<void> {
  const client = await fetchAccount(clientId);
  if (!client || client.role !== "client") throw new Error("Local Client account was not found.");
  await resetLocalClientChat(clientId);
  removeLocalJoinRequest(clientId);
  await updateLocalAccount(clientId, {
    onboardingStep: 0,
    onboardingCompletedAt: undefined,
  });
}
