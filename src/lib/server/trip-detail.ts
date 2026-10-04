import "server-only";

import { checkTrip } from "@/lib/agent/itinerary";
import { transcript } from "@/lib/agent/run";
import { getRepo } from "@/lib/data/repo";
import type { Thread, Trip } from "@/lib/data/types";

/** Everything the trip page needs. The saved plan is re-checked on read, so the UI always shows computed times and legs. */
export async function tripDetail(trip: Trip, thread: Thread | null) {
  const repo = getRepo();
  const [city, places] = await Promise.all([repo.getCity(trip.city_id), repo.listPlaces(trip.city_id)]);
  const check = city && trip.days.length ? checkTrip({ ...trip, city, days: trip.days }, places) : null;
  return {
    trip,
    city,
    check,
    transcript: thread ? transcript(thread.messages) : [],
    files: thread?.files ?? {},
    todos: thread?.todos ?? [],
  };
}
