import "server-only";
import { ChatAnthropic } from "@langchain/anthropic";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { createDeepAgent } from "deepagents";
import { todoListMiddleware } from "langchain";

import { HISTORY_ANALYST_PROMPT, SYSTEM_PROMPT } from "./knowledge";
import { allTools, historyTools } from "./tools";

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
 *  - seven custom property-management tools (request lookup, unit history,
 *    deterministic urgency rules with a safety net, vendor ranking + estimates,
 *    message lint, validated work-order creation, portfolio view),
 *  - an isolated-context "history-analyst" subagent.
 */
export function buildAgent(opts: { model?: BaseChatModel; subagentModel?: BaseChatModel } = {}) {
  const model = opts.model ?? anthropic(MAIN_MODEL, "medium");
  const subagentModel = opts.subagentModel ?? opts.model ?? anthropic(SUBAGENT_MODEL, "low");

  return createDeepAgent({
    name: "fixdesk",
    model,
    tools: allTools,
    systemPrompt: SYSTEM_PROMPT,
    skills: ["/skills/"],
    // Planning is opt-in in deepagents ≥1.14; the triage workflow relies on it.
    middleware: [todoListMiddleware()],
    subagents: [
      {
        name: "history-analyst",
        description:
          "Reviews a unit's past work orders and equipment ages in an isolated context and reports repeat failures and end-of-life equipment. Use for every new triage. Input must include unit_id and the issue.",
        systemPrompt: HISTORY_ANALYST_PROMPT,
        tools: historyTools,
        model: subagentModel,
      },
    ],
  });
}
