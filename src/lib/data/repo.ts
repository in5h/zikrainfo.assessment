import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { CITIES, seedPlaces } from "./seed";
import type { City, Place, Thread, Trip } from "./types";

/**
 * Persistence layer. Uses Supabase when SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 * are set; otherwise falls back to an in-process store so the app runs locally
 * with zero setup. The interface is identical either way.
 */
export interface Repo {
  kind: "supabase" | "memory";
  listCities(): Promise<City[]>;
  getCity(id: string): Promise<City | null>;
  listPlaces(cityId: string): Promise<Place[]>;
  listTrips(): Promise<Trip[]>;
  getTrip(id: string): Promise<Trip | null>;
  saveTrip(t: Trip): Promise<Trip>;
  deleteTrip(id: string): Promise<void>;
  getThread(id: string): Promise<Thread | null>;
  saveThread(t: Omit<Thread, "updated_at">): Promise<void>;
}

// ---------------------------------------------------------------- memory ----

type MemoryState = { places: Place[]; trips: Map<string, Trip>; threads: Map<string, Thread> };
const g = globalThis as unknown as { __wayfarerMemory?: MemoryState };
const mem = () => (g.__wayfarerMemory ??= { places: seedPlaces(), trips: new Map(), threads: new Map() });

const memoryRepo: Repo = {
  kind: "memory",
  async listCities() {
    return CITIES;
  },
  async getCity(id) {
    return CITIES.find((c) => c.id === id) ?? null;
  },
  async listPlaces(cityId) {
    return mem().places.filter((p) => p.city_id === cityId);
  },
  async listTrips() {
    return [...mem().trips.values()].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  },
  async getTrip(id) {
    return mem().trips.get(id) ?? null;
  },
  async saveTrip(t) {
    const row = { ...t, updated_at: new Date().toISOString() };
    mem().trips.set(t.id, row);
    return row;
  },
  async deleteTrip(id) {
    mem().trips.delete(id);
    mem().threads.delete(`t-${id}`);
  },
  async getThread(id) {
    return mem().threads.get(id) ?? null;
  },
  async saveThread(t) {
    mem().threads.set(t.id, { ...t, updated_at: new Date().toISOString() });
  },
};

// -------------------------------------------------------------- supabase ----

function must<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(`Supabase: ${res.error.message}`);
  return res.data;
}

const numTrip = (t: Trip): Trip => ({ ...t, budget: Number(t.budget), total_cost: Number(t.total_cost), days_count: Number(t.days_count) });
const numPlace = (p: Place): Place => ({ ...p, lat: Number(p.lat), lng: Number(p.lng), cost: Number(p.cost), rating: Number(p.rating) });

function supabaseRepo(db: SupabaseClient): Repo {
  let seeded: Promise<void> | null = null;
  // The first request against an empty project seeds the city catalog.
  const ensureSeeded = () =>
    (seeded ??= (async () => {
      const { count, error } = await db.from("places").select("id", { count: "exact", head: true });
      if (error) throw new Error(`Supabase: ${error.message}`);
      if ((count ?? 0) > 0) return;
      must(await db.from("cities").upsert(CITIES));
      must(await db.from("places").upsert(seedPlaces()));
    })().catch((e) => {
      seeded = null;
      throw e;
    }));

  return {
    kind: "supabase",
    async listCities() {
      await ensureSeeded();
      return must(await db.from("cities").select("*").order("name")) as City[];
    },
    async getCity(id) {
      await ensureSeeded();
      return must(await db.from("cities").select("*").eq("id", id).maybeSingle()) as City | null;
    },
    async listPlaces(cityId) {
      await ensureSeeded();
      return (must(await db.from("places").select("*").eq("city_id", cityId)) as Place[]).map(numPlace);
    },
    async listTrips() {
      return (must(await db.from("trips").select("*").order("updated_at", { ascending: false })) as Trip[]).map(numTrip);
    },
    async getTrip(id) {
      const t = must(await db.from("trips").select("*").eq("id", id).maybeSingle()) as Trip | null;
      return t ? numTrip(t) : null;
    },
    async saveTrip(t) {
      return numTrip(must(await db.from("trips").upsert({ ...t, updated_at: new Date().toISOString() }).select("*").single()) as Trip);
    },
    async deleteTrip(id) {
      must(await db.from("threads").delete().eq("id", `t-${id}`));
      must(await db.from("trips").delete().eq("id", id));
    },
    async getThread(id) {
      return must(await db.from("threads").select("*").eq("id", id).maybeSingle()) as Thread | null;
    },
    async saveThread(t) {
      must(await db.from("threads").upsert({ ...t, updated_at: new Date().toISOString() }));
    },
  };
}

let cached: Repo | null = null;

export function getRepo(): Repo {
  if (cached) return cached;
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  cached =
    url && key
      ? supabaseRepo(createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }))
      : memoryRepo;
  return cached;
}
