import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Link2,
  MessageSquarePlus,
  Plus,
  Save,
  Trash2,
  Type,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ChatMessage } from "@/lib/chat";
import {
  FINAL_SEQUENCE_CHANGED_EVENT,
  MAX_FINAL_SEQUENCE_LINES,
  MAX_FINAL_SEQUENCE_MESSAGES,
  type FinalSequenceLine,
  type FinalSequenceLineType,
  type FinalSequenceMessage,
  createFinalSequenceLine,
  createFinalSequenceMessage,
  encodeFinalSequenceMessage,
  loadFinalSequence,
  saveFinalSequence,
  validateFinalSequence,
} from "@/lib/final-sequence";
import { ChatMessageBubble } from "./ChatMessageBubble";

export function FinalSequenceEditor() {
  const [initialConfig] = useState(() => loadFinalSequence());
  const [messages, setMessages] = useState<FinalSequenceMessage[]>(() =>
    clone(initialConfig.messages),
  );
  const [savedSnapshot, setSavedSnapshot] = useState(() => JSON.stringify(initialConfig.messages));
  const [version, setVersion] = useState(initialConfig.version);
  const [error, setError] = useState<string | null>(null);
  const dirty = JSON.stringify(messages) !== savedSnapshot;
  const validationError = useMemo(() => validateFinalSequence(messages), [messages]);

  useEffect(() => {
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [dirty]);

  useEffect(() => {
    const refresh = () => {
      if (dirty) return;
      const next = loadFinalSequence();
      setMessages(clone(next.messages));
      setSavedSnapshot(JSON.stringify(next.messages));
      setVersion(next.version);
    };
    window.addEventListener(FINAL_SEQUENCE_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(FINAL_SEQUENCE_CHANGED_EVENT, refresh);
  }, [dirty]);

  const save = () => {
    if (validationError) {
      setError(validationError);
      return;
    }
    if (!window.confirm("Save these changes as the active Final Sequence?")) return;
    try {
      const saved = saveFinalSequence(messages);
      setMessages(clone(saved.messages));
      setSavedSnapshot(JSON.stringify(saved.messages));
      setVersion(saved.version);
      setError(null);
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : "The Final Sequence could not be saved because local storage is unavailable or full. What happened: save failed. Why: browser storage may be blocked or full. What to do: check device storage and try again.",
      );
    }
  };

  const updateMessage = (
    messageId: string,
    updater: (message: FinalSequenceMessage) => FinalSequenceMessage,
  ) => {
    setMessages((current) =>
      current.map((message) => (message.id === messageId ? updater(message) : message)),
    );
    setError(null);
  };

  const moveMessage = (index: number, direction: -1 | 1) => {
    setMessages((current) => moveItem(current, index, index + direction));
  };

  const deleteMessage = (messageId: string) => {
    if (messages.length === 1) {
      setError("Cannot delete: The Final Sequence needs at least one message. What happened: delete blocked. Why: sequence must have at least one message. What to do: edit the existing message instead of deleting the last one.");
      return;
    }
    if (!window.confirm("Delete this Final Sequence message?")) return;
    setMessages((current) => current.filter((message) => message.id !== messageId));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-foreground">Final Sequence</h2>
            <Badge variant="secondary">Version {version}</Badge>
          </div>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Build the ordered Coach messages Clients receive after selecting Hell yeah.
          </p>
        </div>
        <Button type="button" disabled={!dirty || Boolean(validationError)} onClick={save}>
          <Save className="h-4 w-4" aria-hidden="true" />
          Save changes
        </Button>
      </div>

      {(error || validationError) && (
        <p
          role="alert"
          className="rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-[1rem] leading-5 text-destructive"
        >
          {error ?? validationError}
        </p>
      )}

      <ol className="space-y-5">
        {messages.map((message, messageIndex) => (
          <li key={message.id} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-card-foreground">
                Message {messageIndex + 1}
              </h3>
              <div className="flex items-center gap-1">
                <MoveButtons
                  index={messageIndex}
                  length={messages.length}
                  label="message"
                  onMove={(direction) => moveMessage(messageIndex, direction)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete message ${messageIndex + 1}`}
                  onClick={() => deleteMessage(message.id)}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            </div>

            <ol className="mt-4 space-y-3">
              {message.lines.map((line, lineIndex) => (
                <li key={line.id} className="rounded-lg border border-border bg-background p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <Badge variant="outline">{lineLabel(line.type)}</Badge>
                    <div className="flex items-center gap-1">
                      <MoveButtons
                        index={lineIndex}
                        length={message.lines.length}
                        label="line"
                        onMove={(direction) =>
                          updateMessage(message.id, (current) => ({
                            ...current,
                            lines: moveItem(current.lines, lineIndex, lineIndex + direction),
                          }))
                        }
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Delete line ${lineIndex + 1}`}
                        disabled={message.lines.length === 1}
                        onClick={() =>
                          updateMessage(message.id, (current) => ({
                            ...current,
                            lines: current.lines.filter((candidate) => candidate.id !== line.id),
                          }))
                        }
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                  <LineFields
                    line={line}
                    onChange={(updates) =>
                      updateMessage(message.id, (current) => ({
                        ...current,
                        lines: current.lines.map((candidate) =>
                          candidate.id === line.id ? { ...candidate, ...updates } : candidate,
                        ),
                      }))
                    }
                  />
                </li>
              ))}
            </ol>

            <div className="mt-3 flex flex-wrap gap-2">
              <AddLineButton
                type="text"
                label="Text"
                icon={Type}
                message={message}
                onUpdate={updateMessage}
              />
              <AddLineButton
                type="external_link"
                label="External link"
                icon={ExternalLink}
                message={message}
                onUpdate={updateMessage}
              />
              <AddLineButton
                type="popup_link"
                label="Popup link"
                icon={Link2}
                message={message}
                onUpdate={updateMessage}
              />
            </div>

            <div className="mt-5 border-t border-border pt-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Client preview
              </p>
              <ChatMessageBubble message={previewMessage(message, messageIndex)} own={false} />
            </div>
          </li>
        ))}
      </ol>

      <Button
        type="button"
        variant="outline"
        disabled={messages.length >= MAX_FINAL_SEQUENCE_MESSAGES}
        onClick={() => setMessages((current) => [...current, createFinalSequenceMessage()])}
      >
        <MessageSquarePlus className="h-4 w-4" aria-hidden="true" />
        Add message
      </Button>
    </div>
  );
}

function LineFields({
  line,
  onChange,
}: {
  line: FinalSequenceLine;
  onChange: (updates: Partial<FinalSequenceLine>) => void;
}) {
  if (line.type === "text") {
    return (
      <Textarea
        value={line.text}
        rows={3}
        maxLength={2000}
        placeholder="Message text"
        onChange={(event) => onChange({ text: event.target.value })}
      />
    );
  }
  return (
    <div className="space-y-2">
      <Input
        value={line.text}
        maxLength={2000}
        placeholder={
          line.type === "external_link" ? "Visible link text" : "Visible popup-link text"
        }
        onChange={(event) => onChange({ text: event.target.value })}
      />
      {line.type === "external_link" && (
        <Input
          value={line.url ?? ""}
          maxLength={2048}
          inputMode="url"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="https://example.com"
          onChange={(event) => onChange({ url: event.target.value })}
        />
      )}
    </div>
  );
}

function AddLineButton({
  type,
  label,
  icon: Icon,
  message,
  onUpdate,
}: {
  type: FinalSequenceLineType;
  label: string;
  icon: typeof Plus;
  message: FinalSequenceMessage;
  onUpdate: (
    messageId: string,
    updater: (message: FinalSequenceMessage) => FinalSequenceMessage,
  ) => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={message.lines.length >= MAX_FINAL_SEQUENCE_LINES}
      onClick={() =>
        onUpdate(message.id, (current) => ({
          ...current,
          lines: [...current.lines, createFinalSequenceLine(type)],
        }))
      }
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      Add {label}
    </Button>
  );
}

function MoveButtons({
  index,
  length,
  label,
  onMove,
}: {
  index: number;
  length: number;
  label: string;
  onMove: (direction: -1 | 1) => void;
}) {
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        disabled={index === 0}
        aria-label={`Move ${label} up`}
        onClick={() => onMove(-1)}
      >
        <ChevronUp className="h-4 w-4" aria-hidden="true" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        disabled={index === length - 1}
        aria-label={`Move ${label} down`}
        onClick={() => onMove(1)}
      >
        <ChevronDown className="h-4 w-4" aria-hidden="true" />
      </Button>
    </>
  );
}

function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length || from === to) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function lineLabel(type: FinalSequenceLineType): string {
  if (type === "external_link") return "External link";
  if (type === "popup_link") return "Popup link";
  return "Text";
}

function previewMessage(message: FinalSequenceMessage, index: number): ChatMessage {
  return {
    id: `preview-${message.id}`,
    threadId: "preview",
    senderAccountId: "coach",
    body: encodeFinalSequenceMessage(message),
    createdAt: new Date(Date.now() + index).toISOString(),
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
