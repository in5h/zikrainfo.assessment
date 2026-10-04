/**
 * Offline end-to-end harness test: runs a full "screen Priya" turn through the
 * real Deep Agent graph, real tools and repo (in-memory), with a scripted model
 * standing in for Claude. Run: npm run smoke
 */
import { AIMessage } from "@langchain/core/messages";

import { getRepo } from "../src/lib/data/repo";
import { runTurn } from "../src/lib/agent/run";
import { fairnessCheck, verifyQuote } from "../src/lib/agent/scoring";
import { ScriptedChatModel } from "./scripted-model";

const C = "cand-priya";
const J = "job-backend-payments";
const tc = (name: string, args: Record<string, unknown>) => ({ id: `call_${name}_${Math.random().toString(36).slice(2, 8)}`, name, args, type: "tool_call" as const });

const scores = [
  { criterion_id: "backend-depth", score: 4, rationale: "Priya has 8 years in Go and Java owning payment services.", evidence: ["Backend engineer with 8 years building payment infrastructure in Go and Java."] },
  { criterion_id: "payments-domain", score: 4, rationale: "They designed a double-entry ledger and own reconciliation.", evidence: ["Designed and built a double-entry ledger service in Go handling 6M postings/day"] },
  { criterion_id: "distributed-reliability", score: 4, rationale: "Outbox on Kafka and primary on-call with postmortems.", evidence: ["Introduced idempotency keys and an outbox pattern on top of Kafka", "authored 9 blameless postmortems"] },
  { criterion_id: "postgres", score: 3, rationale: "Partitioning and isolation-level work on Postgres.", evidence: ["partitioned the transactions table by month"] },
  { criterion_id: "infra", score: 3, rationale: "Ran services on EKS with Terraform.", evidence: ["Ran services on AWS EKS with Terraform"] },
  { criterion_id: "leadership", score: 3, rationale: "Wrote the RFC process and mentors 3 engineers.", evidence: ["mentor 3 engineers"] },
];

const main = new ScriptedChatModel([
  new AIMessage({ content: "", tool_calls: [tc("write_todos", { todos: [{ content: "Load req + resume", status: "in_progress" }, { content: "Extract evidence", status: "pending" }, { content: "Score + save", status: "pending" }] })] }),
  new AIMessage({ content: "", tool_calls: [tc("get_job_requisition", { job_id: J }), tc("get_candidate_profile", { candidate_id: C }), tc("read_file", { file_path: "/skills/structured-screening/SKILL.md" })] }),
  new AIMessage({ content: "", tool_calls: [tc("task", { description: `Extract evidence for job_id=${J} candidate_id=${C}`, subagent_type: "evidence-extractor" })] }),
  new AIMessage({ content: "", tool_calls: [tc("write_file", { file_path: `/workspace/${C}/evidence.md`, content: "# Evidence\n- ledger" })] }),
  // first attempt includes a fabricated quote → tool must reject it
  new AIMessage({ content: "", tool_calls: [tc("score_candidate", { candidate_id: C, scores: [{ ...scores[0], evidence: ["Led a team of 40 engineers at Google"] }, ...scores.slice(1)] })] }),
  new AIMessage({ content: "", tool_calls: [tc("score_candidate", { candidate_id: C, scores })] }),
  new AIMessage({ content: "", tool_calls: [tc("fairness_check", { text: "She is a young, energetic engineer and a great culture fit." })] }),
  new AIMessage({ content: "", tool_calls: [tc("save_scorecard", {
    candidate_id: C, scores,
    summary: "Priya has owned a double-entry ledger, reconciliation and Kafka-based idempotency at card-issuing scale.",
    strengths: ["Ledger design at 6M postings/day"], concerns: ["Limited evidence of RTP specifically"],
    interview_questions: ["[payments-domain] Walk me through a reconciliation break you debugged.", "[postgres] How did you choose SERIALIZABLE paths?", "[leadership] How did the RFC process change decisions?"],
    outreach_subject: "Ledgerly payments team — your ledger work at PayFlux",
    outreach_body: "Hi Priya, your double-entry ledger work at PayFlux stood out...",
    fairness_notes: [], acknowledged_false_positives: [],
  })] }),
  new AIMessage("Priya scores **92/100 → advance**. Top strength: ledger ownership. Probe RTP depth."),
]);

const sub = new ScriptedChatModel([
  new AIMessage({ content: "", tool_calls: [tc("get_candidate_profile", { candidate_id: C })] }),
  new AIMessage("- backend-depth: \"Backend engineer with 8 years...\"\n- payments-domain: \"double-entry ledger\""),
]);

async function run() {
  const events: { type: string; [k: string]: unknown }[] = [];
  const threadId = `thread-${C}`;
  // runTurn calls buildAgent({ model }); give subagent its own scripted model.
  const it = runTurn({ threadId, jobId: J, candidateId: C, message: "Screen this candidate.", model: main, subagentModel: sub });
  for await (const e of it) {
    events.push(e);
    if (e.type === "token") continue;
    const short = JSON.stringify(e).slice(0, 220);
    console.log(short);
  }
  const card = await getRepo().latestScorecard(C);
  const cand = await getRepo().getCandidate(C);
  const thread = await getRepo().getThread(threadId);
  const assert = (cond: unknown, msg: string) => {
    if (!cond) { console.error("FAIL:", msg); process.exit(1); }
    console.log("PASS:", msg);
  };
  const results = events.filter((e) => e.type === "tool_result") as unknown as { name: string; content: string; subagent: boolean }[];
  assert(results.some((r) => r.name === "score_candidate" && r.content.includes('"ok": false')), "fabricated quote rejected by score_candidate");
  assert(results.some((r) => r.name === "fairness_check" && r.content.includes('"clean": false')), "fairness_check flags biased language");
  assert(results.some((r) => r.subagent), "subagent tool activity streamed");
  assert(results.some((r) => r.name === "task"), "task (subagent) result returned to main agent");
  assert(events.some((e) => e.type === "todos"), "todos streamed");
  assert(events.some((e) => e.type === "token"), "final answer text streamed");
  assert(events.some((e) => e.type === "scorecard_saved"), "scorecard_saved event");
  assert(card && card.recommendation === "advance" && card.overall_score >= 75, `scorecard persisted (${card?.overall_score} ${card?.recommendation})`);
  assert(cand?.stage === "screened", "candidate stage → screened");
  assert(thread && thread.messages.length > 10, `thread persisted (${thread?.messages.length} messages)`);
  assert(thread && Object.keys(thread.files).some((p) => p.includes("evidence.md")) && !Object.keys(thread.files).some((p) => p.startsWith("/skills/")), "workspace file persisted, skills excluded");
  const sawSkillList = main.seen[0].some((m) => JSON.stringify(m.content).includes("structured-screening"));
  assert(sawSkillList, "skills advertised in system prompt");
  assert(fairnessCheck("Owned Visa settlement files; fixed a race condition; added a foreign key.").length === 0, "fairness lint ignores payments/db vocabulary");
  assert(fairnessCheck("Dana is a mother of two who graduated in 1998").length >= 2, "fairness lint catches family + age proxies");
  assert(verifyQuote("Built ACH origination \u2014 NACHA files", "built ach origination - nacha files"), "quote verification normalises dashes/case");
  if (process.env.SMOKE_DUMP) {
    const fs = await import("node:fs");
    fs.writeFileSync(`${process.env.SMOKE_DUMP}/events.ndjson`, events.map((e) => JSON.stringify(e)).join("\n") + "\n");
    fs.writeFileSync(`${process.env.SMOKE_DUMP}/detail.json`, JSON.stringify({ candidate: cand, scorecard: card, transcript: [], files: thread?.files ?? {}, todos: thread?.todos ?? [] }));
  }
  console.log("\nAll smoke checks passed.");
}

run().catch((e) => { console.error(e); process.exit(1); });
