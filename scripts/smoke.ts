/**
 * Offline end-to-end harness test: runs a full "triage the kitchen leak" turn
 * through the real Deep Agent graph, real tools and repo (in-memory), with a
 * scripted model standing in for Claude. Then unit-checks the rules engine.
 * Run: npm run smoke
 */
import { AIMessage } from "@langchain/core/messages";

import { runTurn } from "../src/lib/agent/run";
import { classify, lintMessage, missingSafety, needsApproval, rankVendors } from "../src/lib/agent/triage";
import { getRepo } from "../src/lib/data/repo";
import { LANDLORD, seedUnits, seedVendors } from "../src/lib/data/seed";
import { ScriptedChatModel } from "./scripted-model";

const R = "req-leak-2b";
const tc = (name: string, args: Record<string, unknown>) => ({
  id: `call_${name}_${Math.random().toString(36).slice(2, 8)}`,
  name,
  args,
  type: "tool_call" as const,
});

// The model under-calls it as a drip; the safety net must escalate.
const issue = {
  summary: "Kitchen sink leak",
  trade: "plumbing",
  hazards: ["minor_leak_or_drip"],
  evidence: ["water coming out from under the kitchen sink", "it's spreading across the floor"],
  indoor_temp_f: null,
};
const goodTenant =
  "Diego, please shut off the water now: valves under the kitchen sink (left = hot, right = cold). Keep cords away from the water and move valuables off the floor. A plumber is being dispatched and we're aiming for someone there within 2 hours. — Sam, Maple & Pine Rentals";
const vendorMsg =
  "EMERGENCY: active leak under kitchen sink at 118 Maple Ct, Unit 2B. Tenant Diego, 555-0104. Respond within 2h. Also check the ceiling of unit 1B below. Call before exceeding $400. Reply with ETA.";

const main = new ScriptedChatModel([
  new AIMessage({ content: "", tool_calls: [tc("write_todos", { todos: [{ content: "Read request", status: "in_progress" }, { content: "Classify + vendor", status: "pending" }, { content: "Draft + save", status: "pending" }] })] }),
  new AIMessage({ content: "", tool_calls: [tc("get_request", { request_id: R }), tc("read_file", { file_path: "/skills/maintenance-triage/SKILL.md" })] }),
  new AIMessage({ content: "", tool_calls: [tc("task", { description: "unit_id=maple-2b issue: kitchen sink leak", subagent_type: "history-analyst" })] }),
  new AIMessage({ content: "", tool_calls: [tc("classify_urgency", { request_id: R, issue: { ...issue, evidence: ["the pipe burst"] } })] }),
  new AIMessage({ content: "", tool_calls: [tc("classify_urgency", { request_id: R, issue })] }),
  new AIMessage({ content: "", tool_calls: [tc("find_vendors", { request_id: R, trade: "plumbing", urgency: "emergency" })] }),
  new AIMessage({ content: "", tool_calls: [tc("check_message", { request_id: R, audience: "tenant", text: "So sorry! We'll reimburse you for any damage and guarantee it's fixed tonight." })] }),
  new AIMessage({ content: "", tool_calls: [tc("create_work_order", { request_id: R, work_order_id: null, issue, vendor_id: "v-rapid-rooter", scope: "Stop leak", followup_questions: [], tenant_message: "A plumber is on the way.", vendor_message: vendorMsg })] }),
  new AIMessage({ content: "", tool_calls: [tc("create_work_order", { request_id: R, work_order_id: null, issue, vendor_id: "v-rapid-rooter", scope: "Stop the leak under the kitchen sink; inspect supply lines; check 1B ceiling.", followup_questions: [], tenant_message: goodTenant, vendor_message: vendorMsg })] }),
  new AIMessage({ content: "", tool_calls: [tc("write_file", { file_path: `/workspace/${R}/owner-note.md`, content: "# Owner note\nEmergency leak, Rapid Rooter dispatched." })] }),
  new AIMessage("**Emergency**: active leak (safety net caught it). Rapid Rooter, est. $431–$713, no approval needed for emergencies. Check 1B's ceiling."),
]);

const sub = new ScriptedChatModel([
  new AIMessage({ content: "", tool_calls: [tc("get_unit_history", { unit_id: "maple-2b" })] }),
  new AIMessage("No relevant history."),
]);

let failed = false;
const assert = (cond: unknown, msg: string) => {
  console.log(`${cond ? "PASS" : "FAIL"}: ${msg}`);
  if (!cond) failed = true;
};

async function run() {
  const events: { type: string; [k: string]: unknown }[] = [];
  const threadId = `t-${R}`;
  for await (const e of runTurn({ threadId, requestId: R, message: "Triage this request.", model: main, subagentModel: sub })) {
    events.push(e);
    if (e.type !== "token") console.log(JSON.stringify(e).slice(0, 200));
  }
  console.log();

  type Res = { name: string; content: string; subagent: boolean };
  const results = events.filter((e) => e.type === "tool_result") as unknown as Res[];
  const of = (name: string) => results.filter((r) => r.name === name);

  assert(of("classify_urgency")[0]?.content.includes('"ok": false'), "fabricated evidence rejected by classify_urgency");
  const cls = of("classify_urgency")[1]?.content ?? "";
  assert(cls.includes('"urgency": "emergency"') && cls.includes("active_water_leak"), "safety net escalated 'drip' to emergency leak");
  const vend = of("find_vendors")[0]?.content ?? "";
  assert(vend.includes("v-rapid-rooter") && !vend.includes("v-budget-plumb"), "emergency vendor search excludes non-24/7 vendors");
  assert(of("check_message")[0]?.content.includes('"clean": false'), "message lint flags liability + guarantee");
  assert(of("create_work_order")[0]?.content.includes('"saved": false'), "work order refused without shut-off instructions");
  assert(of("create_work_order")[1]?.content.includes('"saved": true'), "valid work order saved");
  assert(results.some((r) => r.subagent), "subagent tool activity streamed");
  assert(of("task").length === 1, "subagent result returned to main agent");
  assert(events.some((e) => e.type === "todos"), "todos streamed");
  assert(events.some((e) => e.type === "token"), "final answer text streamed");
  assert(events.some((e) => e.type === "work_order_saved"), "work_order_saved event");

  const repo = getRepo();
  const [wo] = await repo.listWorkOrders({ request_id: R });
  assert(wo && wo.urgency === "emergency" && wo.status === "ready" && !wo.needs_approval, `work order persisted (${wo?.urgency}, ${wo?.status}, $${wo?.estimate_low}–$${wo?.estimate_high})`);
  assert(wo?.safety_steps.some((s) => s.includes("under the kitchen sink")), "safety steps use the unit's shutoff location");
  assert((await repo.getRequest(R))?.status === "triaged", "request status → triaged");
  const thread = await repo.getThread(threadId);
  assert(thread && thread.messages.length > 10, `thread persisted (${thread?.messages.length} messages)`);
  assert(thread && Object.keys(thread.files).some((p) => p.endsWith("owner-note.md")) && !Object.keys(thread.files).some((p) => p.startsWith("/skills/")), "workspace file persisted, skills excluded");
  assert(main.seen[0].some((m) => JSON.stringify(m.content).includes("maintenance-triage")), "skills advertised in system prompt");

  // ---- rules engine unit checks
  const units = seedUnits();
  const u = (id: string) => units.find((x) => x.id === id)!;
  const gas = classify("I've been smelling something like rotten eggs near the stove", u("maple-1a"), { summary: "Stove", trade: "appliance", hazards: ["appliance_failure"], evidence: ["near the stove"] });
  assert(gas.urgency === "emergency" && gas.trade === "gas" && gas.call_911_or_utility, "rotten-egg smell → gas emergency, gas trade, call utility");
  const heat = (t: number) => classify("The thermostat says 58 degrees inside", u("pine-3c"), { summary: "No heat", trade: "hvac", hazards: ["no_heat"], evidence: ["thermostat says 58 degrees"], indoor_temp_f: t });
  assert(heat(58).urgency === "urgent" && heat(58).respond_within_hours === 24, "no heat at 58°F → urgent 24h");
  assert(heat(50).urgency === "emergency" && heat(50).respond_within_hours === 4, "no heat at 50°F → emergency 4h");
  const vague = classify("something is wrong with the fridge", u("pine-4a"), { summary: "Fridge", trade: "appliance", hazards: ["unclear"], evidence: [] });
  assert(vague.ok && vague.needs_followup, "vague message → follow-up questions required");
  const ranked = rankVendors(seedVendors(), u("pine-3c"), "gas", "emergency");
  assert(ranked.length > 0 && !ranked.some((v) => v.vendor_id === "v-northside-gas"), "vendors filtered by service area");
  const drip = rankVendors(seedVendors(), u("maple-1b"), "plumbing", "routine", LANDLORD.approval_limit);
  assert(drip[0]?.vendor_id === "v-budget-plumb" && drip[0].estimate_high <= LANDLORD.approval_limit, `routine job prefers a vendor within the approval limit (${drip[0]?.name})`);
  assert(needsApproval(LANDLORD, "routine", 450) && !needsApproval(LANDLORD, "emergency", 900), "approval: routine over limit yes, emergency no");
  assert(lintMessage("Keep everyone, including pets, away. We'll aim for 2 hours.", "tenant").length === 0, "lint: no false positives on normal safety text");
  assert(lintMessage("Tenant email diego.r@example.com", "vendor", u("maple-2b")).some((f) => f.category === "privacy"), "lint: tenant email blocked in vendor message");
  assert(missingSafety("A plumber is on the way", ["active_water_leak"]).length === 1, "missing shut-off instruction detected");

  if (process.env.SMOKE_DUMP) {
    const fs = await import("node:fs");
    fs.writeFileSync(`${process.env.SMOKE_DUMP}/events.ndjson`, events.map((e) => JSON.stringify(e)).join("\n") + "\n");
    const req = await repo.getRequest(R);
    fs.writeFileSync(
      `${process.env.SMOKE_DUMP}/detail.json`,
      JSON.stringify({ request: req, unit: await repo.getUnit(req!.unit_id), workOrders: await repo.listWorkOrders({ request_id: R }), transcript: [], files: thread?.files ?? {}, todos: thread?.todos ?? [] })
    );
  }

  if (failed) process.exit(1);
  console.log("\nAll smoke checks passed.");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
