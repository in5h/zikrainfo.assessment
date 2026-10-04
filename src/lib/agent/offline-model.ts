import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AIMessage, HumanMessage, SystemMessage, ToolMessage, type BaseMessage } from "@langchain/core/messages";
import type { ChatResult } from "@langchain/core/outputs";

import type { City, Interest, Pace, Place } from "@/lib/data/types";
import { draftItinerary } from "./planner";

/**
 * Demo-mode "brain", used when no Anthropic key is configured.
 *
 * A deterministic chat model that drives the *real* Deep Agent harness: same
 * graph, same tools, same itinerary checker, same subagent, same database.
 * Instead of an LLM choosing each step, it follows the standard planning
 * workflow and reads tool results from the conversation. It understands a
 * handful of refinement requests by keyword ("more relaxed", "cheaper",
 * "more art"); free-form conversation needs Claude.
 */

type Json = Record<string, unknown>;
type Result = { name: string; content: string; json: Json | Json[] | null };

const DAY_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const INTEREST_WORDS: [RegExp, Interest][] = [
  [/\bhistor/i, "history"],
  [/\bfood|eat|restaurant|culinary/i, "food"],
  [/\bart\b|museum|galler/i, "art"],
  [/architect/i, "architecture"],
  [/nature|park|garden|green/i, "nature"],
  [/view|sunset|panoram/i, "views"],
  [/night|bar|drinks|music|fado/i, "nightlife"],
  [/shop|market/i, "shopping"],
  [/kid|family/i, "family"],
];

const textOf = (m: BaseMessage) =>
  typeof m.content === "string"
    ? m.content
    : m.content.map((b) => (typeof b === "string" ? b : "text" in b ? String(b.text) : "")).join("");

const parse = (s: string) => {
  try {
    return JSON.parse(s) as Json | Json[];
  } catch {
    return null;
  }
};

let seq = 0;
const call = (name: string, args: Json) => ({ id: `demo_${name}_${Date.now().toString(36)}_${seq++}`, name, args, type: "tool_call" as const });
const step = (...calls: ReturnType<typeof call>[]) => new AIMessage({ content: "", tool_calls: calls });

const PLAN_TODOS = ["Read the trip request", "Get local recommendations", "Draft day-by-day plan", "Check hours, travel, meals & budget", "Save itinerary + checklist"];
const REFINE_TODOS = ["Read the current trip", "Re-draft with your changes", "Check hours, travel, meals & budget", "Save the updated itinerary"];
const todos = (done: number, list = PLAN_TODOS) => ({
  todos: list.map((content, i) => ({ content, status: i < done ? "completed" : i === done ? "in_progress" : "pending" })),
});

/** search_places rows → Place objects for the drafter. */
function toPlaces(rows: Json[], cityId: string): Place[] {
  return rows.map((r) => {
    const h = r.hours as { open: string; close: string; closed: string[] };
    return {
      id: String(r.id),
      city_id: cityId,
      name: String(r.name),
      category: r.category as Place["category"],
      interests: r.interests as Interest[],
      lat: Number(r.lat),
      lng: Number(r.lng),
      neighborhood: String(r.neighborhood),
      hours: { open: h.open, close: h.close, closed: h.closed.map((d) => DAY_ABBR.indexOf(d)) },
      duration_min: Number(r.duration_min),
      cost: Number(r.cost_usd),
      rating: Number(r.rating),
      meals: r.meals as Place["meals"],
      blurb: String(r.blurb ?? ""),
    };
  });
}

type Refinement = { pace?: Pace; interests?: Interest[]; cheaper?: boolean; label: string };

function parseRefinement(text: string, pace: Pace, interests: Interest[]): Refinement | null {
  const order: Pace[] = ["relaxed", "balanced", "packed"];
  const r: Refinement = { label: "" };
  const labels: string[] = [];
  if (/relax|slow|less|fewer|chill|easier|lighter/i.test(text)) {
    r.pace = order[Math.max(0, order.indexOf(pace) - 1)];
    labels.push(`pace → ${r.pace}`);
  } else if (/pack|busier|more stops|faster|squeeze|intense/i.test(text)) {
    r.pace = order[Math.min(2, order.indexOf(pace) + 1)];
    labels.push(`pace → ${r.pace}`);
  }
  if (/cheap|budget|save|less expensive|afford/i.test(text)) {
    r.cheaper = true;
    labels.push("cheaper picks");
  }
  const added = INTEREST_WORDS.filter(([re, i]) => re.test(text) && !interests.includes(i)).map(([, i]) => i);
  if (/more|add|include|love|into/i.test(text) && added.length) {
    r.interests = [...interests, ...added];
    labels.push(`+${added.join(", +")}`);
  }
  r.label = labels.join(", ");
  return labels.length ? r : null;
}

export class OfflinePlannerModel extends BaseChatModel {
  _llmType() {
    return "wayfarer-offline";
  }
  bindTools() {
    return this as never;
  }

  async _generate(messages: BaseMessage[]): Promise<ChatResult> {
    const msg = this.next(messages);
    return { generations: [{ message: msg, text: textOf(msg) }] };
  }

  private next(messages: BaseMessage[]): AIMessage {
    const system = messages.find((m) => SystemMessage.isInstance(m));
    const lastHuman = [...messages].reverse().findIndex((m) => HumanMessage.isInstance(m));
    const turn = lastHuman < 0 ? messages : messages.slice(messages.length - 1 - lastHuman);
    const human = textOf(turn[0] ?? new HumanMessage(""));
    const results: Result[] = turn
      .filter((m): m is ToolMessage => ToolMessage.isInstance(m))
      .map((m) => ({ name: m.name ?? "", content: textOf(m), json: parse(textOf(m)) }));
    const of = (name: string) => results.filter((r) => r.name === name);
    // Arguments of this turn's tool calls (e.g. the days we last sent to check_itinerary).
    const argsOf = (name: string) =>
      turn.flatMap((m) => (AIMessage.isInstance(m) ? (m.tool_calls ?? []) : [])).filter((c) => c.name === name).map((c) => c.args as Json);

    if (system && /local expert for one city/i.test(textOf(system))) return this.localExpert(human, of);

    const tripId = human.match(/trip_id=(\S+)/)?.[1];
    if (!tripId) return new AIMessage("Pick or create a trip first.");
    const ask = human.split("\n").slice(1).join("\n").trim();
    const isPlan = /\b(plan|re-?plan|build|create|start|itinerary)\b/i.test(ask);
    return this.plan(tripId, ask, isPlan, of, argsOf);
  }

  private localExpert(human: string, of: (n: string) => Result[]): AIMessage {
    const cityId = human.match(/city_id=(\S+)/)?.[1] ?? "";
    const interests = (human.match(/interests=([\w,]+)/)?.[1] ?? "").split(",").filter(Boolean);
    const sights = of("search_places")[0]?.json as Json[] | undefined;
    if (!sights) return step(call("search_places", { city_id: cityId, interests, category: null, open_on: null, max_cost: null }));
    const food = of("search_places")[1]?.json as Json[] | undefined;
    if (!food) return step(call("search_places", { city_id: cityId, interests, category: "food", open_on: null, max_cost: null }));

    const byHood = new Map<string, Json[]>();
    for (const p of sights.filter((p) => Number(p.matches_interests) > 0 && p.category !== "food" && p.category !== "cafe")) {
      byHood.set(String(p.neighborhood), [...(byHood.get(String(p.neighborhood)) ?? []), p]);
    }
    const lines = [...byHood.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 5)
      .map(([hood, ps]) => {
        const eats = food.filter((f) => f.neighborhood === hood).slice(0, 2);
        const closed = (p: Json) => ((p.hours as Json).closed as string[]).length ? ` (closed ${((p.hours as Json).closed as string[]).join("/")})` : "";
        return `- **${hood}**: ${ps
          .slice(0, 4)
          .map((p) => `${p.name} [${p.id}]${closed(p)}`)
          .join(", ")}${eats.length ? `. Eat: ${eats.map((f) => `${f.name} [${f.id}] (${(f.meals as string[]).join("/")})`).join(", ")}` : ""}`;
      });
    return new AIMessage(`${lines.join("\n")}\n- Pair neighbouring areas on the same day; keep far-flung districts for their own half day.`);
  }

  private plan(tripId: string, ask: string, isPlan: boolean, of: (n: string) => Result[], argsOf: (n: string) => Json[]): AIMessage {
    const trip = of("get_trip")[0]?.json as Json | undefined;
    if (!trip) return step(...(isPlan ? [call("write_todos", todos(0))] : []), call("get_trip", { trip_id: tripId }));

    const city = trip.city as Json;
    const cityId = String(city.id);
    const pace0 = trip.pace as Pace;
    const interests0 = trip.interests as Interest[];
    const dates = (trip.days as Json[]).map((d) => `${d.date} (${d.weekday})`);

    // Refinement turn: understand a few common asks by keyword.
    let refine: Refinement | null = null;
    if (!isPlan && trip.current_plan) {
      refine = parseRefinement(ask, pace0, interests0);
      if (!refine) {
        return new AIMessage(
          "In demo mode I can **plan** a trip, or refine it with requests like *“make it more relaxed”*, *“pack in more”*, *“cheaper please”* or *“add more art”*. For anything else, add an Anthropic API key to switch to Claude."
        );
      }
    }
    const pace = refine?.pace ?? pace0;
    const interests = refine?.interests ?? interests0;

    if (refine && !of("write_todos").some((r) => r.content.includes("Re-draft"))) {
      return step(call("write_todos", todos(1, REFINE_TODOS)), call("search_places", { city_id: cityId, interests, category: null, open_on: null, max_cost: null }));
    }
    if (!refine) {
      if (!of("read_file").length) {
        return step(
          call("write_todos", todos(1)),
          call("read_file", { file_path: "/skills/itinerary-design/SKILL.md" }),
          call("read_file", { file_path: `/skills/city-${cityId}/SKILL.md` })
        );
      }
      if (!of("task").length) {
        return step(
          call("task", {
            subagent_type: "local-expert",
            description: `city_id=${cityId} interests=${interests.join(",")} pace=${pace} dates=${dates.join(", ")}. Shortlist by neighbourhood with meal spots.`,
          })
        );
      }
    }

    const catalog = of("search_places")[0]?.json as Json[] | undefined;
    if (!catalog) {
      return step(...(refine ? [] : [call("write_todos", todos(2))]), call("search_places", { city_id: cityId, interests, category: null, open_on: null, max_cost: null }));
    }
    const places = toPlaces(catalog, cityId);
    const cityObj: City = { id: cityId, name: String(city.name), country: String(city.country), center: [0, 0], tagline: "", transit_cost: Number(city.transit_cost_per_hop) };

    // Draft → check → (re-draft cheaper / lighter) → check, at most 4 times.
    const checks = of("check_itinerary");
    const lastCheck = checks.at(-1)?.json as Json | undefined;
    const pressure = (refine?.cheaper ? 8 : 0) + checks.length * 2;
    const draft = () =>
      draftItinerary({ city: cityObj, places, start_date: String(trip.start_date), days_count: (trip.days as Json[]).length, interests, pace, pressure }).map(
        (d) => ({ ...d, stops: d.stops.map((s) => ({ place_id: s.place_id, start: s.start ?? null, note: s.note ?? null })) })
      );

    if (checks.length >= 4 && !lastCheck?.ok) {
      const problems = (lastCheck?.problems as string[] | undefined) ?? [checks.at(-1)?.content.slice(0, 200) ?? "unknown error"];
      return new AIMessage(`I couldn't make every rule pass:\n${problems.map((p) => `- ${p}`).join("\n")}\n\nTry a bigger budget, a more relaxed pace, or fewer days.`);
    }
    if (!lastCheck || !lastCheck.ok) {
      const progress = checks.length === 0 ? [call("write_todos", refine ? todos(2, REFINE_TODOS) : todos(3))] : [];
      return step(...progress, call("check_itinerary", { trip_id: tripId, days: draft() }));
    }

    const lastDays = (argsOf("check_itinerary").at(-1)?.days as Json[] | undefined) ?? [];
    const saved = of("save_itinerary");
    const cityName = String(city.name);
    if (!saved.length) {
      const days = lastCheck.days as Json[];
      return step(
        ...(refine ? [call("write_todos", todos(4, REFINE_TODOS))] : []),
        call("save_itinerary", {
          trip_id: tripId,
          title: `${(trip.days as Json[]).length} ${pace} day${(trip.days as Json[]).length > 1 ? "s" : ""} in ${cityName}`,
          days: lastDays,
          summary: `A ${pace} ${(trip.days as Json[]).length}-day plan for ${interests.join(", ")}: ${lastDays.map((d, i) => `Day ${i + 1} ${d.theme}`).join("; ")}. Total ≈ $${lastCheck.total_cost} of your $${lastCheck.budget} budget.`,
          tips: this.tips(cityId, days),
          pace: refine?.pace ?? null,
          budget: null,
          interests: refine?.interests ?? null,
        })
      );
    }

    const s = saved[0].json as Json;
    if (!s.saved) {
      return new AIMessage(`I couldn't make every rule pass:\n${((s.problems as string[]) ?? []).map((p) => `- ${p}`).join("\n")}\n\nTry a bigger budget, a more relaxed pace, or fewer days.`);
    }

    if (!refine && !of("write_file").length) {
      return step(
        call("write_todos", todos(5)),
        call("write_file", { file_path: `/workspace/${tripId}/checklist.md`, content: this.checklist(cityName, lastCheck) })
      );
    }

    const days = lastCheck.days as Json[];
    const lines = days.map((d, i) => `- **Day ${i + 1} (${d.weekday})**: ${(lastDays[i] as Json)?.theme ?? ""} · ${(d.timeline as string[]).length} stops · $${d.cost}`);
    const warn = ((lastCheck.warnings as string[]) ?? []).slice(0, 2);
    return new AIMessage(
      [
        refine ? `Updated (${refine.label}).` : `Here's your ${cityName} plan.`,
        ...lines,
        `Total **$${lastCheck.total_cost}** of $${lastCheck.budget} · every stop checked for opening hours, travel time and meals.`,
        ...(warn.length ? [`Heads-up: ${warn.join(" ")}`] : []),
        "_Demo mode: offline planner, no LLM. Add an Anthropic key for free-form chat._",
      ].join("\n")
    );
  }

  private tips(cityId: string, days: Json[]): string[] {
    const base: Record<string, string[]> = {
      lisbon: ["Get a Viva Viagem card for metro, trams and the Santa Justa lift.", "Wear grippy shoes: the cobbles are steep and slippery."],
      rome: ["Book the Colosseum and Vatican Museums timed entries ahead.", "Cover shoulders and knees for St. Peter's."],
      kyoto: ["Temples close early (16:00–17:00), so do them in the morning.", "An IC card (ICOCA) works on buses and the subway."],
    };
    const late = days.some((d) => String(d.ends_at) > "22:00") ? ["Some evenings run late; plan a taxi back."] : [];
    return [...(base[cityId] ?? []), ...late];
  }

  private checklist(city: string, check: Json) {
    const days = check.days as Json[];
    return [
      `# ${city} checklist`,
      "",
      "## Book ahead",
      ...days.flatMap((d) => (d.timeline as string[]).filter((t) => /\$([2-9]\d|\d{3,})/.test(t)).map((t) => `- [ ] ${t.replace(/\s\(.*$/, "")} (${d.date})`)),
      "",
      "## Pack",
      "- [ ] Comfortable walking shoes",
      "- [ ] Refillable water bottle",
      "- [ ] Phone charger / power bank",
      "",
      `Budget: $${check.total_cost} planned of $${check.budget}.`,
    ].join("\n");
  }
}
