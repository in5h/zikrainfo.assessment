/**
 * Offline end-to-end harness test (no API key needed). Runs real planning turns
 * through the Deep Agent graph, tools, subagent and repo (in-memory) using the
 * demo-mode offline planner, then unit-checks the itinerary rules.
 * Run: npm run smoke
 */
import { checkTrip } from "../src/lib/agent/itinerary";
import { runTurn, type AgentEvent } from "../src/lib/agent/run";
import { getRepo } from "../src/lib/data/repo";
import { CITIES } from "../src/lib/data/seed";
import type { Interest, Pace, Trip } from "../src/lib/data/types";

let failed = false;
const assert = (cond: unknown, msg: string) => {
  console.log(`${cond ? "PASS" : "FAIL"}: ${msg}`);
  if (!cond) failed = true;
};

async function newTrip(city_id: string, start_date: string, days_count: number, budget: number, interests: Interest[], pace: Pace) {
  const now = new Date().toISOString();
  const trip: Trip = {
    id: `trip-${city_id}-${pace}-${days_count}-${Math.random().toString(36).slice(2, 6)}`,
    city_id,
    title: "",
    start_date,
    days_count,
    budget,
    interests,
    pace,
    notes: "",
    status: "draft",
    days: [],
    summary: "",
    tips: [],
    total_cost: 0,
    created_at: now,
    updated_at: now,
  };
  return getRepo().saveTrip(trip);
}

async function turn(tripId: string, message: string) {
  const events: AgentEvent[] = [];
  for await (const e of runTurn({ threadId: `t-${tripId}`, tripId, message, apiKey: null })) events.push(e);
  return events;
}

const results = (events: AgentEvent[], name: string) =>
  events.filter((e): e is Extract<AgentEvent, { type: "tool_result" }> => e.type === "tool_result" && e.name === name);

async function recheck(trip: Trip) {
  const repo = getRepo();
  const city = (await repo.getCity(trip.city_id))!;
  return checkTrip({ ...trip, city, days: trip.days }, await repo.listPlaces(trip.city_id));
}

async function run() {
  const repo = getRepo();

  // ---- 1. Full plan: Lisbon starting on a Monday (Belém sights are closed Mondays)
  const lis = await newTrip("lisbon", "2026-10-12", 2, 250, ["history", "food", "views"], "balanced");
  const ev = await turn(lis.id, "Plan this trip.");
  for (const e of ev) if (e.type !== "token") console.log("  ", JSON.stringify(e).slice(0, 160));
  console.log();

  assert(ev.some((e) => e.type === "todos"), "plan (todos) streamed");
  assert(results(ev, "read_file").length >= 2, "itinerary + city skills read");
  assert(results(ev, "task").length === 1 && ev.some((e) => e.type === "tool_result" && e.subagent), "local-expert subagent ran");
  assert(results(ev, "check_itinerary").length >= 1, "draft validated with check_itinerary");
  assert(results(ev, "save_itinerary")[0]?.content.includes('"saved": true'), "itinerary saved");
  assert(ev.some((e) => e.type === "trip_saved"), "trip_saved event");
  assert(ev.some((e) => e.type === "token"), "final summary streamed");

  const saved = (await repo.getTrip(lis.id))!;
  const c = await recheck(saved);
  assert(saved.status === "planned" && saved.days.length === 2, "trip persisted as planned with 2 days");
  assert(c.ok, `saved plan re-checks clean (${c.problems.join(" | ") || "no problems"})`);
  assert(c.days.every((d) => d.has_lunch), "every day has lunch in the window");
  assert(c.total_cost <= saved.budget, `within budget ($${c.total_cost} ≤ $${saved.budget})`);
  const monday = saved.days[0].stops.map((s) => s.place_id);
  assert(!monday.includes("lis-belem-tower") && !monday.includes("lis-jeronimos"), "Monday avoids Belém sights closed on Mondays");
  const thread = await repo.getThread(`t-${lis.id}`);
  assert(thread && Object.keys(thread.files).some((p) => p.endsWith("checklist.md")), "checklist written to agent workspace");

  // ---- 2. Refinements
  const ev2 = await turn(lis.id, "Can you make it more relaxed?");
  const relaxed = (await repo.getTrip(lis.id))!;
  assert(results(ev2, "save_itinerary")[0]?.content.includes('"saved": true') && relaxed.pace === "relaxed", "refine: more relaxed → pace saved as relaxed");
  assert(relaxed.days.every((d) => d.stops.length <= 5), "relaxed days respect the 5-stop limit");

  const before = relaxed.total_cost;
  await turn(lis.id, "Cheaper please");
  const cheaper = (await repo.getTrip(lis.id))!;
  assert(cheaper.total_cost <= before, `refine: cheaper → $${before} → $${cheaper.total_cost}`);

  const ev3 = await turn(lis.id, "What's the weather like?");
  assert(ev3.some((e) => e.type === "token" && /demo mode/i.test(e.text)), "unsupported question → helpful demo-mode reply");

  // ---- 3. Every city × pace plans successfully
  for (const city of CITIES) {
    for (const [pace, days, budget] of [["relaxed", 1, 120], ["balanced", 3, 400], ["packed", 2, 300]] as const) {
      const t = await newTrip(city.id, "2026-10-17", days, budget, ["history", "art", "food", "nature"], pace);
      const e = await turn(t.id, "Plan this trip.");
      const s = (await repo.getTrip(t.id))!;
      const chk = s.days.length ? await recheck(s) : null;
      assert(
        results(e, "save_itinerary").some((r) => r.content.includes('"saved": true')) && chk?.ok,
        `${city.name} ${pace} ${days}d $${budget} → saved, ${s.days.reduce((a, d) => a + d.stops.length, 0)} stops, $${s.total_cost}${chk && !chk.ok ? ` (${chk.problems[0]})` : ""}`
      );
    }
  }

  // ---- 4. Rule checks
  const rome = (await repo.getCity("rome"))!;
  const romePlaces = await repo.listPlaces("rome");
  const sundayVatican = checkTrip(
    { city: rome, pace: "balanced", budget: 500, interests: ["art"], start_date: "2026-10-18", days_count: 1, days: [{ date: "2026-10-18", theme: "x", stops: [{ place_id: "rom-vatican-museums" }, { place_id: "rom-roscioli", start: "13:00" }] }] },
    romePlaces
  );
  assert(sundayVatican.problems.some((p) => /closed on Sundays/.test(p)), "checker: Vatican Museums on a Sunday is rejected");
  const noLunch = checkTrip(
    { city: rome, pace: "balanced", budget: 500, interests: ["history"], start_date: "2026-10-19", days_count: 1, days: [{ date: "2026-10-19", theme: "x", stops: [{ place_id: "rom-colosseum" }, { place_id: "rom-forum" }] }] },
    romePlaces
  );
  assert(noLunch.problems.some((p) => /no lunch/.test(p)), "checker: day without lunch is rejected");
  const tooEarly = checkTrip(
    { city: rome, pace: "balanced", budget: 500, interests: ["history"], start_date: "2026-10-19", days_count: 1, days: [{ date: "2026-10-19", theme: "x", stops: [{ place_id: "rom-colosseum", start: "09:00" }, { place_id: "rom-vatican-museums", start: "10:00" }] }] },
    romePlaces
  );
  assert(tooEarly.problems.some((p) => /earliest arrival/.test(p)), "checker: impossible cross-town timing is rejected");
  const legs = tooEarly.days[0].timeline[1].leg;
  assert(legs?.mode === "transit", `checker: Colosseum → Vatican is a transit leg (${legs?.minutes} min)`);
  const broke = checkTrip(
    { city: rome, pace: "balanced", budget: 30, interests: ["food"], start_date: "2026-10-19", days_count: 1, days: [{ date: "2026-10-19", theme: "x", stops: [{ place_id: "rom-roscioli", start: "12:30" }] }] },
    romePlaces
  );
  assert(broke.problems.some((p) => /over the \$30 budget/.test(p)), "checker: over-budget plan is rejected");

  if (failed) process.exit(1);
  console.log("\nAll smoke checks passed.");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
