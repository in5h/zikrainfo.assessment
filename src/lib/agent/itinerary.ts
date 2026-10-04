import type { City, DayPlan, Interest, Pace, Place } from "@/lib/data/types";

/**
 * Deterministic itinerary checks. The agent proposes which places to visit and
 * in what order; this code computes the actual timeline (travel legs, arrival
 * times) and decides whether the plan is feasible: opening hours, closed days,
 * overlaps, meals, pace, budget and duplicates. The model can't "hope" a museum
 * is open on a Monday.
 */

export const DAY_START = "09:00";
export const PACE_LIMITS: Record<Pace, { stops: number; walking: number; end: string }> = {
  relaxed: { stops: 5, walking: 75, end: "22:00" },
  balanced: { stops: 7, walking: 110, end: "23:00" },
  packed: { stops: 9, walking: 150, end: "23:59" },
};
export const LUNCH: [string, string] = ["11:30", "14:30"];
export const DINNER: [string, string] = ["18:00", "21:30"];

export const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
};
export const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(Math.round(m % 60)).padStart(2, "0")}`;

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const weekdayOf = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();
export const weekdayName = (date: string) => WEEKDAYS[weekdayOf(date)];

export function addDays(date: string, n: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// --------------------------------------------------------------- travel ----

export type Leg = { mode: "walk" | "transit"; minutes: number; km: number; cost: number };

export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Walk if it's under ~25 minutes; otherwise metro/bus/taxi: 10 min overhead + 20 km/h. Streets add ~30% over straight-line distance. */
export function travel(a: Place, b: Place, city: City): Leg {
  const km = distanceKm(a, b) * 1.3;
  const walk = Math.round((km / 4.8) * 60);
  if (walk <= 25) return { mode: "walk", minutes: Math.max(walk, 3), km: +km.toFixed(2), cost: 0 };
  return { mode: "transit", minutes: Math.round(10 + (km / 20) * 60), km: +km.toFixed(2), cost: city.transit_cost };
}

// ---------------------------------------------------------------- hours ----

export function openProblem(p: Place, weekday: number, start: number): string | null {
  if (p.hours.closed.includes(weekday)) return `${p.name} is closed on ${WEEKDAYS[weekday]}s.`;
  const open = toMin(p.hours.open);
  const close = toMin(p.hours.close);
  if (start < open) return `${p.name} opens at ${p.hours.open} (planned ${fmt(start)}).`;
  if (start + p.duration_min > close)
    return `${p.name} closes at ${p.hours.close}; a ${p.duration_min}-min visit starting ${fmt(start)} won't fit.`;
  return null;
}

// --------------------------------------------------------------- checks ----

export type TimelineStop = {
  place_id: string;
  name: string;
  category: string;
  neighborhood: string;
  lat: number;
  lng: number;
  start: string;
  end: string;
  cost: number;
  leg: Leg | null;
  note?: string;
  blurb: string;
  rating: number;
  issue: string | null;
};

export type DayCheck = {
  date: string;
  weekday: string;
  theme: string;
  timeline: TimelineStop[];
  cost: number;
  walking_minutes: number;
  has_lunch: boolean;
  has_dinner: boolean;
  ends_at: string;
};

export type TripCheck = {
  ok: boolean;
  problems: string[];
  warnings: string[];
  days: DayCheck[];
  total_cost: number;
  budget: number;
  remaining: number;
  interest_match: number;
};

type TripInput = { city: City; pace: Pace; budget: number; interests: Interest[]; start_date: string; days_count: number; days: DayPlan[] };

const isMeal = (p: Place, meal: "lunch" | "dinner") => (p.category === "food" || p.category === "market") && (p.meals ?? []).includes(meal);
const within = (t: number, [a, b]: [string, string]) => t >= toMin(a) && t <= toMin(b);

export function checkTrip(input: TripInput, catalog: Place[]): TripCheck {
  const problems: string[] = [];
  const warnings: string[] = [];
  const byId = new Map(catalog.filter((p) => p.city_id === input.city.id).map((p) => [p.id, p]));
  const seen = new Map<string, string>();
  const limits = PACE_LIMITS[input.pace];

  if (input.days.length !== input.days_count) problems.push(`Plan has ${input.days.length} day(s) but the trip is ${input.days_count} day(s).`);

  const days: DayCheck[] = input.days.map((day, di) => {
    const label = `Day ${di + 1}`;
    const expected = addDays(input.start_date, di);
    if (day.date !== expected) problems.push(`${label} should be dated ${expected} (got ${day.date}).`);
    const weekday = weekdayOf(expected);
    const timeline: TimelineStop[] = [];
    let clock = toMin(DAY_START);
    let prev: Place | null = null;
    let cost = 0;
    let walking = 0;

    for (const stop of day.stops) {
      const p = byId.get(stop.place_id);
      if (!p) {
        problems.push(`${label}: unknown place "${stop.place_id}" for ${input.city.name}. Use ids from search_places.`);
        continue;
      }
      // Repeating a sight is a mistake; eating at a favourite place twice is fine.
      if (seen.has(p.id)) {
        const msg = `${label}: ${p.name} is already on ${seen.get(p.id)}.`;
        if (p.category === "food" || p.category === "cafe" || p.category === "market") warnings.push(msg);
        else problems.push(msg);
      }
      seen.set(p.id, label);

      const leg = prev ? travel(prev, p, input.city) : null;
      const arrival = clock + (leg?.minutes ?? 0);
      let start = arrival;
      if (stop.start) {
        const wanted = toMin(stop.start);
        if (wanted < arrival) problems.push(`${label}: can't start ${p.name} at ${stop.start}; earliest arrival is ${fmt(arrival)}.`);
        start = Math.max(wanted, arrival);
      } else {
        start = Math.max(arrival, p.hours.closed.includes(weekday) ? arrival : toMin(p.hours.open));
      }
      const issue = openProblem(p, weekday, start);
      if (issue) problems.push(`${label}: ${issue}`);
      if (leg?.mode === "walk") walking += leg.minutes;
      cost += p.cost + (leg?.cost ?? 0);
      clock = start + p.duration_min;
      timeline.push({
        place_id: p.id,
        name: p.name,
        category: p.category,
        neighborhood: p.neighborhood,
        lat: p.lat,
        lng: p.lng,
        start: fmt(start),
        end: fmt(clock),
        cost: p.cost,
        leg,
        note: stop.note,
        blurb: p.blurb,
        rating: p.rating,
        issue,
      });
      prev = p;
    }

    const places = timeline.map((t) => byId.get(t.place_id)!);
    const has_lunch = timeline.some((t, i) => isMeal(places[i], "lunch") && within(toMin(t.start), LUNCH));
    const has_dinner = timeline.some((t, i) => isMeal(places[i], "dinner") && within(toMin(t.start), DINNER));
    if (!has_lunch) problems.push(`${label}: no lunch stop between ${LUNCH[0]} and ${LUNCH[1]}.`);
    if (!has_dinner && clock > toMin(DINNER[0])) warnings.push(`${label}: no dinner stop between ${DINNER[0]} and ${DINNER[1]}.`);
    if (timeline.length > limits.stops) problems.push(`${label}: ${timeline.length} stops is too many for a ${input.pace} pace (max ${limits.stops}).`);
    if (walking > limits.walking) warnings.push(`${label}: ${walking} min of walking is a lot for a ${input.pace} pace.`);
    if (clock > toMin(limits.end)) problems.push(`${label}: ends at ${fmt(clock)}, later than ${limits.end} for a ${input.pace} pace.`);
    if (timeline.length < 3) warnings.push(`${label}: only ${timeline.length} stop(s). Consider adding something.`);

    return { date: expected, weekday: WEEKDAYS[weekday], theme: day.theme, timeline, cost, walking_minutes: walking, has_lunch, has_dinner, ends_at: fmt(clock) };
  });

  const total_cost = days.reduce((a, d) => a + d.cost, 0);
  if (total_cost > input.budget) problems.push(`Total $${total_cost} is over the $${input.budget} budget by $${total_cost - input.budget}.`);

  const all = days.flatMap((d) => d.timeline.map((t) => byId.get(t.place_id)!)).filter((p) => p.category !== "food" && p.category !== "cafe");
  const matching = all.filter((p) => p.interests.some((i) => input.interests.includes(i))).length;
  const interest_match = all.length ? Math.round((matching / all.length) * 100) : 0;
  if (input.interests.length && interest_match < 50) warnings.push(`Only ${interest_match}% of sights match the traveller's interests.`);

  return { ok: problems.length === 0, problems, warnings, days, total_cost, budget: input.budget, remaining: input.budget - total_cost, interest_match };
}
