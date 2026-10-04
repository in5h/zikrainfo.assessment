import "server-only";
import {
  AIMessage,
  AIMessageChunk,
  HumanMessage,
  ToolMessage,
  type BaseMessage,
  mapChatMessagesToStoredMessages,
  mapStoredMessagesToChatMessages,
  type StoredMessage,
} from "@langchain/core/messages";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

import { getRepo } from "@/lib/data/repo";
import type { StoredFile, Todo } from "@/lib/data/types";
import type { FileData } from "deepagents";

import { buildAgent } from "./agent";
import type { AgentEvent } from "./events";
import { CONTEXT_PREFIX, textOf, transcript, truncate } from "./transcript";
import { skillFiles } from "./knowledge";

export type { AgentEvent };
export { CONTEXT_PREFIX, textOf, transcript };


export function contextLine(tripId: string | null) {
  return `${CONTEXT_PREFIX} ${tripId ? `trip_id=${tripId}` : "no trip selected"}`;
}



type RunArgs = {
  threadId: string;
  tripId: string | null;
  message: string;
  /** Test seams: inject models (defaults to Claude via ChatAnthropic). */
  model?: BaseChatModel;
  subagentModel?: BaseChatModel;
  /** Anthropic key for this turn; null runs demo mode. */
  apiKey?: string | null;
};

export async function* runTurn({ threadId, tripId, message, model, subagentModel, apiKey }: RunArgs): AsyncGenerator<AgentEvent> {
  const repo = getRepo();
  const existing = await repo.getThread(threadId);
  const history = existing ? mapStoredMessagesToChatMessages(existing.messages as StoredMessage[]) : [];
  const workspace = existing?.files ?? {};

  const human = new HumanMessage(`${contextLine(tripId)}\n${message}`);
  const agent = buildAgent({ model, subagentModel, apiKey });

  let finalMessages: BaseMessage[] = [...history, human];
  let finalFiles: Record<string, StoredFile> = workspace;
  let finalTodos: Todo[] = existing?.todos ?? [];
  const toolNames = new Map<string, string>();
  const seenResults = new Set<string>();

  try {
    const stream = await agent.stream(
      { messages: finalMessages, files: { ...skillFiles(), ...workspace } as Record<string, FileData> },
      { streamMode: ["updates", "messages", "values"], subgraphs: true, recursionLimit: 120 }
    );

    for await (const item of stream as AsyncIterable<[string[], string, unknown]>) {
      const [namespace, mode, chunk] = item;
      // Top-level model calls stream from a "model_request:<id>" namespace;
      // subagents run inside the task tool, i.e. under a "tools:<id>" namespace.
      const subagent = namespace.some((n) => n.startsWith("tools:"));
      const root = namespace.length === 0;

      if (mode === "messages") {
        // Token stream from the top-level agent only (subagent text stays internal).
        const [msg] = chunk as [BaseMessage, unknown];
        if (!subagent && (AIMessageChunk.isInstance(msg) || AIMessage.isInstance(msg))) {
          const text = textOf(msg.content);
          if (text) yield { type: "token", text };
        }
        continue;
      }

      if (mode === "values") {
        if (!root) continue;
        const v = chunk as { messages?: BaseMessage[]; files?: Record<string, StoredFile>; todos?: Todo[] };
        if (v.messages) finalMessages = v.messages;
        if (v.files) finalFiles = v.files;
        if (v.todos) finalTodos = v.todos;
        continue;
      }

      // mode === "updates": { [nodeName]: partialState }
      for (const update of Object.values((chunk ?? {}) as Record<string, unknown>)) {
        if (!update || typeof update !== "object") continue;
        const u = update as { messages?: unknown; todos?: Todo[]; files?: Record<string, StoredFile | null> };
        const msgs = Array.isArray(u.messages) ? (u.messages as BaseMessage[]) : [];
        for (const m of msgs) {
          if (AIMessage.isInstance(m) && m.tool_calls?.length) {
            for (const tc of m.tool_calls) {
              const id = tc.id ?? crypto.randomUUID();
              if (toolNames.has(id)) continue;
              toolNames.set(id, tc.name);
              yield { type: "tool_call", id, name: tc.name, args: tc.args, subagent };
            }
          } else if (ToolMessage.isInstance(m)) {
            if (seenResults.has(m.tool_call_id)) continue;
            seenResults.add(m.tool_call_id);
            const name = m.name ?? toolNames.get(m.tool_call_id) ?? "tool";
            const content = textOf(m.content);
            yield { type: "tool_result", id: m.tool_call_id, name, content: truncate(content), subagent };
            if (name === "save_itinerary" && content.includes('"saved": true')) yield { type: "trip_saved" };
          }
        }
        if (root && u.todos) yield { type: "todos", todos: u.todos };
        if (root && u.files) {
          const visible = Object.fromEntries(
            Object.entries(u.files).filter(([p, f]) => f && !p.startsWith("/skills/"))
          ) as Record<string, StoredFile>;
          if (Object.keys(visible).length) yield { type: "files", files: visible };
        }
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[agent]", err);
    yield { type: "error", message };
  } finally {
    // Persist whatever state we reached, so a failed turn is still inspectable
    // and the conversation can continue.
    const files = Object.fromEntries(
      Object.entries(finalFiles).filter(([p, f]) => f && !p.startsWith("/skills/"))
    );
    await repo
      .saveThread({
        id: threadId,
        trip_id: tripId,
        messages: mapChatMessagesToStoredMessages(finalMessages),
        files,
        todos: finalTodos,
      })
      .catch((e) => console.error("[agent] saveThread failed", e));
  }
  yield { type: "done" };
}

