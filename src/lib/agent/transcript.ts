import {
  AIMessage,
  HumanMessage,
  ToolMessage,
  type BaseMessage,
  mapStoredMessagesToChatMessages,
  type StoredMessage,
} from "@langchain/core/messages";

import type { TranscriptEntry } from "./events";

/*
 * Message helpers that only need @langchain/core, so routes that just display
 * a trip don't load the whole agent stack.
 */

export const CONTEXT_PREFIX = "[context]";

export function textOf(content: BaseMessage["content"]): string {
  if (typeof content === "string") return content;
  return content
    .map((b) => (typeof b === "string" ? b : b.type === "text" && "text" in b ? String(b.text) : ""))
    .join("");
}

export const truncate = (s: string, n = 4000) => (s.length > n ? `${s.slice(0, n)}\n…[truncated]` : s);

/** Thread → UI-friendly transcript (used when reopening a trip). */
export function transcript(stored: unknown[]) {
  const msgs = mapStoredMessagesToChatMessages(stored as StoredMessage[]);
  const out: TranscriptEntry[] = [];
  for (const m of msgs) {
    if (HumanMessage.isInstance(m)) {
      const text = textOf(m.content);
      out.push({ role: "user", text: text.startsWith(CONTEXT_PREFIX) ? text.slice(text.indexOf("\n") + 1) : text });
    } else if (AIMessage.isInstance(m)) {
      const text = textOf(m.content);
      const toolCalls = (m.tool_calls ?? []).map((t) => ({ name: t.name, args: t.args }));
      if (text || toolCalls.length) out.push({ role: "assistant", text, toolCalls });
    } else if (ToolMessage.isInstance(m)) {
      out.push({ role: "tool", name: m.name, text: truncate(textOf(m.content), 1500) });
    }
  }
  return out;
}
