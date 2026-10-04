import "server-only";
import { tool } from "langchain";
import { z } from "zod";

import { getRepo } from "@/lib/data/repo";
import { CATEGORIES, INTERESTS, PACES, type Trip } from "@/lib/data/types";
import { addDays, checkTrip, weekdayName, type TripCheck } from "./itinerary";

const json = (v: unknown) => JSON.stringify(v, null, 2);
export const DAY_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const daysSchema = z
  .array(
    z.object({
      date: z.string().describe("YYYY-MM-DD; day 1 = trip start_date"),
      theme: z.string().describe("Short theme, e.g. 'Belém & the riverside'"),
      stops: z.array(
        z.object({
          place_id: z.string().describe("Id from search_places"),
          start: z.string().nullable().describe("Optional 'HH:MM'; null to start as soon as you arrive (or when it opens)"),
          note: z.string().nullable().describe("Optional tip for this stop, e.g. 'book ahead'"),
        })
      ),
    })
  )
  .describe("One entry per trip day, stops in visiting order");

type DaysInput = z.infer<typeof daysSchema>;
const clean = (days: DaysInput) =>
  days.map((d) => ({ ...d, stops: d.stops.map((s) => ({ place_id: s.place_id, start: s.start ?? undefined, note: s.note ?? undefined })) }));

async function load(trip_id: string) {
  const repo = getRepo();
  const trip = await repo.getTrip(trip_id);
  if (!trip) return { error: `No trip with id "${trip_id}".` } as const;
  const [city, places] = await Promise.all([repo.getCity(trip.city_id), repo.listPlaces(trip.city_id)]);
  if (!city) return { error: `City "${trip.city_id}" not found.` } as const;
  return { trip, city, places } as const;
}

/** Compact, model-friendly view of a check result. */
function summarize(c: TripCheck) {
  return {
    ok: c.ok,
    problems: c.problems,
    warnings: c.warnings,
    total_cost: c.total_cost,
    budget: c.budget,
    remaining: c.remaining,
    interest_match_pct: c.interest_match,
    days: c.days.map((d) => ({
      date: d.date,
      weekday: d.weekday,
      cost: d.cost,
      walking_minutes: d.walking_minutes,
      lunch: d.has_lunch,
      dinner: d.has_dinner,
      ends_at: d.ends_at,
      timeline: d.timeline.map(
        (t) =>
          `${t.start}–${t.end} ${t.name} [${t.place_id}] $${t.cost}${t.leg ? ` (${t.leg.mode} ${t.leg.minutes}m)` : ""}${t.issue ? ` ⚠ ${t.issue}` : ""}`
      ),
    })),
  };
}

export const getTrip = tool(
  async ({ trip_id }) => {
    const r = await load(trip_id);
    if ("error" in r) return r.error;
    const { trip, city } = r;
    return json({
      trip_id: trip.id,
      city: { id: city.id, name: city.name, country: city.country, transit_cost_per_hop: city.transit_cost },
      start_date: trip.start_date,
      days: Array.from({ length: trip.days_count }, (_, i) => {
        const date = addDays(trip.start_date, i);
        return { day: i + 1, date, weekday: weekdayName(date) };
      }),
      budget_per_person_usd: trip.budget,
      interests: trip.interests,
      pace: trip.pace,
      traveller_notes: trip.notes,
      status: trip.status,
      current_plan: trip.days.length ? trip.days : null,
    });
  },
  {
    name: "get_trip",
    description: "Fetch the trip request: city, dates (with weekdays), per-person budget in USD, interests, pace, traveller notes and the current plan, if any.",
    schema: z.object({ trip_id: z.string() }),
  }
);

export const searchPlaces = tool(
  async ({ city_id, interests, category, open_on, max_cost }) => {
    const places = await getRepo().listPlaces(city_id);
    if (!places.length) return `No places for city "${city_id}".`;
    const weekday = open_on ? new Date(`${open_on}T12:00:00Z`).getUTCDay() : null;
    const rows = places
      .filter((p) => !category || p.category === category)
      .filter((p) => max_cost == null || p.cost <= max_cost)
      .filter((p) => weekday == null || !p.hours.closed.includes(weekday))
      .map((p) => ({ p, match: p.interests.filter((i) => (interests ?? []).includes(i)).length }))
      .sort((a, b) => b.match - a.match || b.p.rating - a.p.rating)
      .map(({ p, match }) => ({
        id: p.id,
        name: p.name,
        category: p.category,
        neighborhood: p.neighborhood,
        interests: p.interests,
        matches_interests: match,
        lat: +p.lat.toFixed(4),
        lng: +p.lng.toFixed(4),
        hours: { open: p.hours.open, close: p.hours.close, closed: p.hours.closed.map((d) => DAY_ABBR[d]) },
        duration_min: p.duration_min,
        cost_usd: p.cost,
        rating: p.rating,
        meals: p.meals ?? [],
        blurb: p.blurb,
      }));
    return json(rows);
  },
  {
    name: "search_places",
    description:
      "Search the city's curated place catalog (with coordinates for clustering). Filter by category, max cost, or 'open_on' (YYYY-MM-DD) to drop places closed that weekday. Results are sorted by interest match, then rating. Food places list which meals they serve.",
    schema: z.object({
      city_id: z.string(),
      interests: z.array(z.enum(INTERESTS)).nullable().describe("Traveller interests, used for ranking"),
      category: z.enum(CATEGORIES).nullable(),
      open_on: z.string().nullable().describe("YYYY-MM-DD"),
      max_cost: z.number().nullable(),
    }),
  }
);

export const checkItinerary = tool(
  async ({ trip_id, days }) => {
    const r = await load(trip_id);
    if ("error" in r) return r.error;
    const c = checkTrip({ ...r.trip, city: r.city, days: clean(days) }, r.places);
    return json({
      ...summarize(c),
      next: c.ok ? "Feasible. Address warnings if easy, then save_itinerary." : "Fix every problem (swap, reorder, or move stops to another day) and check again.",
    });
  },
  {
    name: "check_itinerary",
    description:
      "Validate a draft itinerary deterministically: computes travel legs (walk vs transit) and the real timeline, then checks opening hours and closed weekdays, overlaps, lunch (11:30–14:30) and dinner, pace limits, duplicates and the total budget. Returns problems (must fix) and warnings.",
    schema: z.object({ trip_id: z.string(), days: daysSchema }),
  }
);

export const saveItinerary = tool(
  async (input) => {
    const r = await load(input.trip_id);
    if ("error" in r) return r.error;
    const repo = getRepo();
    // Preference changes the traveller asked for in chat are applied here, then re-checked.
    const trip: Trip = {
      ...r.trip,
      pace: input.pace ?? r.trip.pace,
      budget: input.budget ?? r.trip.budget,
      interests: input.interests ?? r.trip.interests,
    };
    const days = clean(input.days);
    // Re-validate on the server: the model can't save an infeasible plan.
    const c = checkTrip({ ...trip, city: r.city, days }, r.places);
    if (!c.ok) return json({ saved: false, problems: c.problems, next: "Fix the problems with check_itinerary, then save again." });

    const saved = await repo.saveTrip({
      ...trip,
      title: input.title,
      days: c.days.map((d, i) => ({
        date: d.date,
        theme: days[i].theme,
        stops: d.timeline.map((t) => ({ place_id: t.place_id, start: t.start, note: t.note })),
      })),
      summary: input.summary,
      tips: input.tips,
      total_cost: c.total_cost,
      status: "planned",
    });
    return json({ saved: true, trip_id: saved.id, total_cost: saved.total_cost, budget: saved.budget, warnings: c.warnings });
  },
  {
    name: "save_itinerary",
    description:
      "Save the final itinerary to the database. Re-runs every check_itinerary rule on the server and refuses to save an infeasible plan. Pass pace/budget/interests only if the traveller asked to change them. Call again after any revision.",
    schema: z.object({
      trip_id: z.string(),
      title: z.string().describe("e.g. 'Two tasty days in Lisbon'"),
      days: daysSchema,
      summary: z.string().describe("2–3 sentences on the shape of the trip"),
      tips: z.array(z.string()).max(6).describe("Practical tips: bookings, transport passes, what to wear"),
      pace: z.enum(PACES).nullable(),
      budget: z.number().nullable(),
      interests: z.array(z.enum(INTERESTS)).nullable(),
    }),
  }
);

export const listTrips = tool(
  async () => {
    const trips = await getRepo().listTrips();
    return json(
      trips.map((t) => ({ trip_id: t.id, title: t.title, city: t.city_id, start_date: t.start_date, days: t.days_count, status: t.status, total_cost: t.total_cost, budget: t.budget }))
    );
  },
  { name: "list_trips", description: "List the traveller's saved trips.", schema: z.object({}) }
);

export const expertTools = [searchPlaces];
export const allTools = [getTrip, searchPlaces, checkItinerary, saveItinerary, listTrips];
