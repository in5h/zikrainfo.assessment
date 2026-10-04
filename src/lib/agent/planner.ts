import type { City, DayPlan, Interest, Pace, Place } from "@/lib/data/types";
import { DINNER, LUNCH, PACE_LIMITS, addDays, distanceKm, fmt, openProblem, toMin, travel, weekdayOf } from "./itinerary";

/**
 * Heuristic itinerary drafter used by demo mode (no API key). It produces a
 * first draft that the same check_itinerary / save_itinerary tools then
 * validate. Claude does this step itself when a key is configured.
 */

const SIGHTS_PER_DAY: Record<Pace, number> = { relaxed: 3, balanced: 4, packed: 5 };
const isFood = (p: Place) => p.category === "food" || p.category === "cafe" || p.category === "market";

export type DraftOptions = {
  city: City;
  places: Place[];
  start_date: string;
  days_count: number;
  interests: Interest[];
  pace: Pace;
  /** 0 = ignore cost; higher = prefer cheaper places. */
  pressure: number;
};

export function draftItinerary(o: DraftOptions): DayPlan[] {
  const used = new Set<string>();
  const limits = PACE_LIMITS[o.pace];
  const match = (p: Place) => p.interests.filter((i) => o.interests.includes(i)).length;
  const score = (p: Place) => 3 * match(p) + p.rating - (o.pressure * p.cost) / 15;
  const wantsNight = o.interests.includes("nightlife");
  const wantsViews = o.interests.includes("views");

  return Array.from({ length: o.days_count }, (_, di) => {
    const date = addDays(o.start_date, di);
    const weekday = weekdayOf(date);
    const openToday = (p: Place) => !p.hours.closed.includes(weekday) && !used.has(p.id);

    // Sight pool: interest-matching, open today, nightlife only for night owls.
    const pool = o.places
      .filter((p) => !isFood(p) && openToday(p))
      .filter((p) => p.category !== "nightlife")
      .filter((p) => match(p) > 0 || o.interests.length === 0);
    const backup = o.places.filter((p) => !isFood(p) && p.category !== "nightlife" && openToday(p));
    const candidates = pool.length >= 2 ? pool : backup;
    if (!candidates.length) return { date, theme: "Free day", stops: [] };

    // Anchor on the best sight, then grow a geographic cluster around it.
    const anchor = [...candidates].sort((a, b) => score(b) - score(a))[0];
    const cluster = [anchor];
    while (cluster.length < SIGHTS_PER_DAY[o.pace] + 2) {
      const c = centroid(cluster);
      const next = candidates
        .filter((p) => !cluster.includes(p))
        .map((p) => ({ p, v: score(p) - distanceKm(c, p) * 1.2 }))
        .sort((a, b) => b.v - a.v)[0];
      if (!next || distanceKm(c, next.p) > 5) break;
      cluster.push(next.p);
    }
    // Visit order: earliest-closing first, then nearest neighbour.
    const ordered = nearestNeighbour(cluster.sort((a, b) => toMin(a.hours.close) - toMin(b.hours.close))[0], cluster);

    const stops: { place: Place; start: number }[] = [];
    let clock = toMin("09:00");
    let prev: Place | null = null;
    let lunch = false;
    let sights = 0;

    const add = (p: Place, start: number) => {
      stops.push({ place: p, start });
      used.add(p.id);
      clock = start + p.duration_min;
      prev = p;
    };
    const arrival = (p: Place) => clock + (prev ? travel(prev, p, o.city).minutes : 0);
    const pickMeal = (meal: "lunch" | "dinner", earliest: number, latest: number) => {
      const options = o.places
        .filter((p) => (p.category === "food" || p.category === "market") && (p.meals ?? []).includes(meal) && !p.hours.closed.includes(weekday))
        .filter((p) => !stops.some((s) => s.place.id === p.id))
        .map((p) => {
          const start = Math.max(arrival(p), toMin(p.hours.open), earliest);
          // Prefer somewhere new, but a repeat beats skipping a meal.
          const repeat = used.has(p.id) ? 4 : 0;
          return { p, start, v: p.rating - (prev ? distanceKm(prev, p) : 0) * 2 - (o.pressure * p.cost) / 12 - repeat };
        })
        .filter((x) => x.start <= latest && !openProblem(x.p, weekday, x.start))
        .sort((a, b) => b.v - a.v);
      return options[0] ?? null;
    };
    const addLunch = () => {
      const m = pickMeal("lunch", toMin("12:00"), toMin(LUNCH[1]));
      if (m) add(m.p, m.start);
      lunch = true;
    };

    for (const p of ordered) {
      if (sights >= SIGHTS_PER_DAY[o.pace]) break;
      if (!lunch && clock >= toMin("11:45")) addLunch();
      let start = Math.max(arrival(p), toMin(p.hours.open));
      // Don't let a long morning visit push lunch past the window.
      if (!lunch && start + p.duration_min > toMin("14:00")) {
        if (clock >= toMin("11:00")) {
          addLunch();
          start = Math.max(arrival(p), toMin(p.hours.open));
        } else continue;
      }
      if (openProblem(p, weekday, start)) continue;
      add(p, start);
      sights++;
    }
    if (!lunch) addLunch();

    // Golden hour: a viewpoint before dinner if the traveller likes views.
    if (wantsViews && clock < toMin("18:00") && stops.length < limits.stops - 1) {
      const view = o.places
        .filter((p) => p.category === "viewpoint" && openToday(p))
        .sort((a, b) => (prev ? distanceKm(prev, a) - distanceKm(prev, b) : 0))[0];
      if (view) {
        const s = Math.max(arrival(view), toMin("17:30"));
        if (!openProblem(view, weekday, s)) add(view, s);
      }
    }

    const dinner = pickMeal("dinner", toMin("19:30"), toMin(DINNER[1]));
    if (dinner && stops.length < limits.stops) add(dinner.p, dinner.start);

    if (wantsNight && stops.length < limits.stops) {
      const night = o.places
        .filter((p) => p.category === "nightlife" && openToday(p))
        .sort((a, b) => (prev ? distanceKm(prev, a) - distanceKm(prev, b) : 0))[0];
      if (night) {
        const s = Math.max(arrival(night), toMin(night.hours.open));
        if (!openProblem(night, weekday, s) && s + night.duration_min <= toMin(limits.end)) add(night, s);
      }
    }

    const hoods = [...new Set(stops.filter((s) => !isFood(s.place)).map((s) => s.place.neighborhood))].slice(0, 2);
    return {
      date,
      theme: hoods.length ? hoods.join(" & ") : "Exploring",
      stops: stops.map((s) => ({ place_id: s.place.id, start: fmt(s.start) })),
    };
  });
}

function centroid(ps: Place[]) {
  return { lat: ps.reduce((a, p) => a + p.lat, 0) / ps.length, lng: ps.reduce((a, p) => a + p.lng, 0) / ps.length };
}

function nearestNeighbour(start: Place, ps: Place[]) {
  const out = [start];
  const rest = ps.filter((p) => p !== start);
  while (rest.length) {
    const last = out[out.length - 1];
    rest.sort((a, b) => distanceKm(last, a) - distanceKm(last, b));
    out.push(rest.shift()!);
  }
  return out;
}
