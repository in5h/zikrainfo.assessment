import type { StoredFile, Todo } from "@/lib/data/types";

/** Events streamed from /api/chat to the browser as NDJSON. */
export type AgentEvent =
  | { type: "token"; text: string }
  | { type: "tool_call"; id: string; name: string; args: unknown; subagent: boolean }
  | { type: "tool_result"; id: string; name: string; content: string; subagent: boolean }
  | { type: "todos"; todos: Todo[] }
  | { type: "files"; files: Record<string, StoredFile> }
  | { type: "scorecard_saved" }
  | { type: "done" }
  | { type: "error"; message: string };

export type TranscriptEntry = {
  role: "user" | "assistant" | "tool";
  text: string;
  name?: string;
  toolCalls?: { name: string; args: unknown }[];
};
