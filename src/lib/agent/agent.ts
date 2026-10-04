import "server-only";
import { ChatAnthropic } from "@langchain/anthropic";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { createDeepAgent } from "deepagents";
import { todoListMiddleware } from "langchain";

import { EVIDENCE_EXTRACTOR_PROMPT, SYSTEM_PROMPT } from "./knowledge";
import { allTools, evidenceTools } from "./tools";

export const MAIN_MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";
export const SUBAGENT_MODEL = process.env.ANTHROPIC_SUBAGENT_MODEL || "claude-sonnet-5-5";

function anthropic(model: string, effort: "low" | "medium" | "high") {
  // Current Claude models reject sampling params (temperature/top_p) and run
  // adaptive thinking by default; effort is the quality/cost dial.
  return new ChatAnthropic({ model, maxTokens: 16000, outputConfig: { effort } });
}

/**
 * The harness: a LangGraph Deep Agent with
 *  - planning (write_todos) and a virtual filesystem,
 *  - domain skills loaded from /skills/ (progressive disclosure),
 *  - six custom recruiting tools (requisition, resume, pipeline, deterministic
 *    scoring + quote verification, fairness lint, persistence),
 *  - an isolated-context "evidence-extractor" subagent.
 */
export function buildAgent(opts: { model?: BaseChatModel; subagentModel?: BaseChatModel } = {}) {
  const model = opts.model ?? anthropic(MAIN_MODEL, "medium");
  const subagentModel = opts.subagentModel ?? opts.model ?? anthropic(SUBAGENT_MODEL, "low");

  return createDeepAgent({
    name: "screenpilot",
    model,
    tools: allTools,
    systemPrompt: SYSTEM_PROMPT,
    skills: ["/skills/"],
    // Planning is opt-in in deepagents ≥1.14; the screening workflow relies on it.
    middleware: [todoListMiddleware()],
    subagents: [
      {
        name: "evidence-extractor",
        description:
          "Reads one resume against one job rubric in an isolated context and returns verbatim evidence quotes per criterion. Use for every new screen. Input must include job_id and candidate_id.",
        systemPrompt: EVIDENCE_EXTRACTOR_PROMPT,
        tools: evidenceTools,
        model: subagentModel,
      },
    ],
  });
}
