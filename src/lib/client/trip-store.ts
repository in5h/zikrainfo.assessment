import type { Thread, Trip } from "@/lib/data/types";

/**
 * Browser-storage mode: when the server has no database, each visitor's trips
 * and agent conversations live in their own browser (localStorage) and are sent
 * along with each request. Every access is guarded: storage can be full,
 * disabled or unavailable (private windows), and the app must still work.
 */

const TRIPS = "wayfarer:trips";
const thread = (tripId: string) => `wayfarer:thread:${tripId}`;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota exceeded or storage disabled: keep working without persistence.
  }
}

export const tripStore = {
  list(): Trip[] {
    return read<Trip[]>(TRIPS, []).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  },
  get(id: string): Trip | null {
    return this.list().find((t) => t.id === id) ?? null;
  },
  save(trip: Trip) {
    write(TRIPS, [trip, ...read<Trip[]>(TRIPS, []).filter((t) => t.id !== trip.id)]);
  },
  remove(id: string) {
    write(TRIPS, read<Trip[]>(TRIPS, []).filter((t) => t.id !== id));
    try {
      localStorage.removeItem(thread(id));
    } catch {}
  },
  getThread(tripId: string): Thread | null {
    return read<Thread | null>(thread(tripId), null);
  },
  saveThread(tripId: string, t: Thread | null) {
    if (t) write(thread(tripId), t);
  },
};
