import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

describe("error state final audit", () => {
  test("error page tells what happened why what to do next and has large touch targets", () => {
    const page = read("./error-page.ts");
    expect(page).toMatch(/What happened:/);
    expect(page).toMatch(/Why:/);
    expect(page).toMatch(/What to do next:/);
    expect(page).toMatch(/min-height: 48px/);
    expect(page).toMatch(/rounded.*12px/);
    expect(page).toMatch(/role="alert"/);
    expect(page).not.toMatch(/Something went wrong on our end\. You can try refreshing/); // old vague
    expect(page).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  test("AccountAccess has inline validation, character counts, and informative errors", () => {
    const file = read("../components/account/AccountAccess.tsx");
    expect(file).toMatch(/validateName/);
    expect(file).toMatch(/validateUsername/);
    expect(file).toMatch(/name.length\/80/);
    expect(file).toMatch(/username.length\/30/);
    expect(file).toMatch(/What happened:/);
    expect(file).toMatch(/Why:/);
    expect(file).toMatch(/What to do:/);
    expect(file).toMatch(/aria-invalid/);
    expect(file).toMatch(/aria-describedby/);
    expect(file).toMatch(/rounded-xl/);
  });

  test("LocalPrototypeTools and BroadcastComposer use informative errors with what/why/next", () => {
    const local = read("../components/account/LocalPrototypeTools.tsx");
    const broadcast = read("../components/chat/BroadcastComposer.tsx");
    const finalSeq = read("../components/chat/FinalSequenceEditor.tsx");
    [local, broadcast, finalSeq].forEach(content=>{
      expect(content).toMatch(/What happened:/);
      expect(content).toMatch(/Why:/);
      expect(content).toMatch(/What to do:/);
    });
    expect(local).toMatch(/rounded-md/); // badge reduced
    expect(broadcast).toMatch(/min-h-11/);
  });

  test("no raw backend errors exposed in UI - no stack traces", () => {
    const files = [
      "../components/account/AccountAccess.tsx",
      "../components/account/LocalPrototypeTools.tsx",
      "../components/chat/BroadcastComposer.tsx",
      "../components/chat/FinalSequenceEditor.tsx",
      "../components/chat/ChatConversation.tsx",
      "../components/chat/CoachChatInbox.tsx",
    ].map(read).join("\n");
    // Should not contain direct raw error.message without wrapping? We allow wrapping but should not have bare technical stack
    expect(files).not.toMatch(/supabase|postgres.*error|stack/iu);
  });
});
