import {
  type AppAccount,
  fetchAccount,
  fetchAccounts,
  fetchPublicCoachAccount,
} from "./cloud-accounts";
import { decodeFinalSequenceMessage } from "./final-sequence";
import { emitLocalEvent, LOCAL_CHAT_CHANGED_EVENT } from "./local-events";
import { deleteLocalBlob, getLocalBlob, putLocalBlob } from "./local-media";
import { recordJoinRequestImage } from "./local-join-requests";
import type { ProcessedProgressPicture } from "./progress-picture-processing";

export const MAX_CHAT_MESSAGE_LENGTH = 2000;
const THREADS_KEY = "no-more-copium:chat-threads:v2";
const MESSAGES_KEY = "no-more-copium:chat-messages:v2";
const READS_KEY = "no-more-copium:chat-reads:v2";

export type ChatImageAttachment = {
  id: string;
  storageKey: string;
  width: number;
  height: number;
  byteSize: number;
  createdAt: string;
  imageUrl?: string;
};

export type ChatMessage = {
  id: string;
  threadId: string;
  senderAccountId: string;
  body: string;
  attachments?: ChatImageAttachment[];
  createdAt: string;
};

type LocalThread = {
  id: string;
  clientId: string;
  coachId: string;
  createdAt: string;
};

type LocalRead = { threadId: string; accountId: string; lastReadAt: string };

export type CoachChatConversation = {
  client: AppAccount;
  threadId?: string;
  lastMessageBody?: string;
  lastMessageSenderId?: string;
  lastMessageAt?: string;
  unreadMessages: number;
};

export type ChatUnreadSummary = {
  unreadMessages: number;
  unreadClientCount: number;
  byClientId: Record<string, number>;
};

export async function fetchChatUnreadSummary(accountId: string): Promise<ChatUnreadSummary> {
  const threads = read<LocalThread[]>(THREADS_KEY, []);
  const messages = read<ChatMessage[]>(MESSAGES_KEY, []);
  const reads = read<LocalRead[]>(READS_KEY, []);
  const byClientId: Record<string, number> = {};
  for (const thread of threads) {
    if (accountId !== thread.clientId && accountId !== thread.coachId) continue;
    const lastReadAt = reads.find(
      (entry) => entry.threadId === thread.id && entry.accountId === accountId,
    )?.lastReadAt;
    const count = messages.filter(
      (message) =>
        message.threadId === thread.id &&
        message.senderAccountId !== accountId &&
        (!lastReadAt || message.createdAt > lastReadAt),
    ).length;
    if (count > 0) byClientId[thread.clientId] = count;
  }
  return {
    unreadMessages: Object.values(byClientId).reduce((sum, count) => sum + count, 0),
    unreadClientCount: Object.keys(byClientId).length,
    byClientId,
  };
}

export async function fetchCoachChatInbox(coachId: string): Promise<CoachChatConversation[]> {
  const accounts = await fetchAccounts();
  const threads = read<LocalThread[]>(THREADS_KEY, []);
  const messages = read<ChatMessage[]>(MESSAGES_KEY, []);
  const unread = await fetchChatUnreadSummary(coachId);
  return accounts
    .filter((account) => account.role === "client")
    .map((client) => {
      const thread = threads.find((candidate) => candidate.clientId === client.id);
      const latest = thread
        ? messages
            .filter((message) => message.threadId === thread.id)
            .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0]
        : undefined;
      return {
        client,
        threadId: thread?.id,
        lastMessageBody: latest ? summarizeMessage(latest) : undefined,
        lastMessageSenderId: latest?.senderAccountId,
        lastMessageAt: latest?.createdAt,
        unreadMessages: unread.byClientId[client.id] ?? 0,
      };
    })
    .sort(
      (left, right) =>
        right.lastMessageAt?.localeCompare(left.lastMessageAt ?? "") ||
        left.client.name.localeCompare(right.client.name),
    );
}

export async function fetchCoachAccount(): Promise<AppAccount | null> {
  return fetchPublicCoachAccount();
}

export async function ensureChatThread(clientId: string): Promise<string> {
  const client = await fetchAccount(clientId);
  const coach = await fetchPublicCoachAccount();
  if (!client || client.role !== "client") throw new Error("Client account was not found.");
  if (!coach) throw new Error("Create a local Coach account first.");
  const threads = read<LocalThread[]>(THREADS_KEY, []);
  const existing = threads.find((thread) => thread.clientId === clientId);
  if (existing) return existing.id;
  const thread: LocalThread = {
    id: createChatMessageId(),
    clientId,
    coachId: coach.id,
    createdAt: new Date().toISOString(),
  };
  write(THREADS_KEY, [...threads, thread]);
  emitLocalEvent(LOCAL_CHAT_CHANGED_EVENT);
  return thread.id;
}

export async function fetchChatMessages(threadId: string): Promise<ChatMessage[]> {
  const messages = read<ChatMessage[]>(MESSAGES_KEY, [])
    .filter((message) => message.threadId === threadId)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  return Promise.all(
    messages.map(async (message) => ({
      ...message,
      attachments: message.attachments
        ? await Promise.all(
            message.attachments.map(async (attachment) => {
              const blob = await getLocalBlob(attachment.storageKey);
              return { ...attachment, imageUrl: blob ? URL.createObjectURL(blob) : undefined };
            }),
          )
        : undefined,
    })),
  );
}

export async function sendChatMessage({
  senderAccountId,
  clientId,
  body,
  messageId = createChatMessageId(),
}: {
  senderAccountId: string;
  clientId: string;
  body: string;
  messageId?: string;
}): Promise<string> {
  const normalized = body.trim();
  if (!normalized || normalized.length > MAX_CHAT_MESSAGE_LENGTH) {
    throw new Error(`Messages must be 1–${MAX_CHAT_MESSAGE_LENGTH} characters.`);
  }
  const sender = await fetchAccount(senderAccountId);
  if (!sender) throw new Error("Sender account was not found.");
  if (sender.role === "client" && !sender.onboardingCompletedAt) {
    throw new Error("Complete onboarding before sending free-form messages.");
  }
  const threadId = await ensureChatThread(clientId);
  appendMessages([
    {
      id: messageId,
      threadId,
      senderAccountId,
      body: normalized,
      createdAt: new Date().toISOString(),
    },
  ]);
  return messageId;
}

export async function sendChatImages({
  senderAccountId,
  clientId,
  pictures,
  onProgress,
}: {
  senderAccountId: string;
  clientId: string;
  pictures: ProcessedProgressPicture[];
  onProgress?: (completed: number, total: number) => void;
}): Promise<string> {
  if (pictures.length < 1 || pictures.length > 6) throw new Error("Select between 1 and 6 images.");
  const sender = await fetchAccount(senderAccountId);
  if (!sender || sender.role !== "client" || sender.id !== clientId) {
    throw new Error("Only the active local Client can send images in this prototype.");
  }
  if (sender.onboardingStep < 6)
    throw new Error("Finish the Final Sequence before sending images.");

  const threadId = await ensureChatThread(clientId);
  const messageId = createChatMessageId();
  const storedKeys: string[] = [];
  try {
    const attachments: ChatImageAttachment[] = [];
    for (let index = 0; index < pictures.length; index += 1) {
      const picture = pictures[index];
      const storageKey = `chat-image:${clientId}:${messageId}:${picture.id}`;
      await putLocalBlob(storageKey, picture.blob);
      storedKeys.push(storageKey);
      attachments.push({
        id: picture.id,
        storageKey,
        width: picture.width,
        height: picture.height,
        byteSize: picture.byteSize,
        createdAt: new Date().toISOString(),
      });
      onProgress?.(index + 1, pictures.length);
    }
    appendMessages([
      {
        id: messageId,
        threadId,
        senderAccountId,
        body: "",
        attachments,
        createdAt: new Date().toISOString(),
      },
    ]);
    await recordJoinRequestImage({ clientId, threadId, imageCount: attachments.length });
    return messageId;
  } catch (error) {
    await Promise.all(storedKeys.map((key) => deleteLocalBlob(key).catch(() => undefined)));
    throw error;
  }
}

export async function appendLocalChatMessages(messages: ChatMessage[]): Promise<void> {
  appendMessages(messages);
}

export async function markChatRead(accountId: string, clientId: string): Promise<void> {
  const threadId = await ensureChatThread(clientId);
  const reads = read<LocalRead[]>(READS_KEY, []);
  const next = reads.filter(
    (entry) => !(entry.threadId === threadId && entry.accountId === accountId),
  );
  next.push({ threadId, accountId, lastReadAt: new Date().toISOString() });
  write(READS_KEY, next);
  emitLocalEvent(LOCAL_CHAT_CHANGED_EVENT);
}

export function createChatMessageId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `message_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function appendMessages(additions: ChatMessage[]): void {
  const messages = read<ChatMessage[]>(MESSAGES_KEY, []);
  const existing = new Set(messages.map((message) => message.id));
  const next = [...messages, ...additions.filter((message) => !existing.has(message.id))];
  write(MESSAGES_KEY, next);
  for (const message of additions) emitLocalEvent(LOCAL_CHAT_CHANGED_EVENT, message);
}

function summarizeMessage(message: ChatMessage): string {
  const structured = decodeFinalSequenceMessage(message.body);
  const structuredText = structured?.lines.map((line) => line.text).join(" · ");
  if (structuredText) return structuredText;
  if (message.body) return message.body;
  const count = message.attachments?.length ?? 0;
  return count ? `Sent ${count} image${count === 1 ? "" : "s"}` : "Message";
}

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    return JSON.parse(window.localStorage.getItem(key) ?? "null") ?? fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}
