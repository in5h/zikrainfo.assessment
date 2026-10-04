import "server-only";
import { ChatAnthropic } from "@langchain/anthropic";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { createDeepAgent } from "deepagents";
import { todoListMiddleware } from "langchain";

import { LOCAL_EXPERT_PROMPT, SYSTEM_PROMPT } from "./knowledge";
import { OfflinePlannerModel } from "./offline-model";
import { allTools, expertTools } from "./tools";

import { MAIN_MODEL, SUBAGENT_MODEL, resolveApiKey } from "@/lib/config";

export { MAIN_MODEL, SUBAGENT_MODEL, resolveApiKey };

export function anthropic(model: string, effort: "low" | "medium" | "high", apiKey: string) {
  // Current Claude models reject sampling params (temperature/top_p) and run
  // adaptive thinking by default; effort is the quality/cost dial.
  return new ChatAnthropic({ model, apiKey, maxTokens: 16000, outputConfig: { effort } });
}


/**
 * The harness: a LangGraph Deep Agent with
 *  - planning (write_todos) and a virtual filesystem,
 *  - domain skills loaded from /skills/ (itinerary design + per-city guides),
 *  - five custom travel tools (trip request, place search, deterministic
 *    itinerary checker, validated save, saved trips),
 *  - an isolated-context "local-expert" subagent.
 */
export function buildAgent(opts: { model?: BaseChatModel; subagentModel?: BaseChatModel; apiKey?: string | null } = {}) {
  // No key → demo mode: the same harness driven by a deterministic offline model.
  const offline = !opts.model && !opts.apiKey ? new OfflinePlannerModel({}) : null;
  const model = opts.model ?? offline ?? anthropic(MAIN_MODEL, "medium", opts.apiKey!);
  const subagentModel = opts.subagentModel ?? opts.model ?? offline ?? anthropic(SUBAGENT_MODEL, "low", opts.apiKey!);

  return createDeepAgent({
    name: "wayfarer",
    model,
    tools: allTools,
    systemPrompt: SYSTEM_PROMPT,
    skills: ["/skills/"],
    // Planning is opt-in in deepagents ≥1.14; the planning workflow relies on it.
    middleware: [todoListMiddleware()],
    subagents: [
      {
        name: "local-expert",
        description:
          "Knows one city's catalog. In an isolated context it searches places for the traveller's interests and returns a shortlist grouped by neighbourhood, with meal spots and closed-day warnings. Input must include city_id, interests, dates and pace.",
        systemPrompt: LOCAL_EXPERT_PROMPT,
        tools: expertTools,
        model: subagentModel,
      },
    ],
  });
}
