import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { LANDLORD, seedHistory, seedRequests, seedUnits, seedVendors } from "./seed";
import type { Landlord, MaintenanceRequest, RequestStatus, Thread, Unit, Vendor, WorkOrder, WorkOrderStatus } from "./types";

/**
 * Persistence layer. Uses Supabase when SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 * are set; otherwise falls back to an in-process store so the app still runs
 * locally with zero setup. The interface is identical either way.
 */
export interface Repo {
  kind: "supabase" | "memory";
  landlord(): Promise<Landlord>;
  listUnits(): Promise<Unit[]>;
  getUnit(id: string): Promise<Unit | null>;
  listVendors(): Promise<Vendor[]>;
  listRequests(): Promise<MaintenanceRequest[]>;
  getRequest(id: string): Promise<MaintenanceRequest | null>;
  createRequest(r: Omit<MaintenanceRequest, "status" | "received_at">): Promise<MaintenanceRequest>;
  setRequestStatus(id: string, status: RequestStatus): Promise<void>;
  listWorkOrders(filter?: { request_id?: string; unit_id?: string }): Promise<WorkOrder[]>;
  saveWorkOrder(w: Omit<WorkOrder, "id" | "created_at"> & { id?: string }): Promise<WorkOrder>;
  setWorkOrderStatus(id: string, status: WorkOrderStatus): Promise<WorkOrder | null>;
  getThread(id: string): Promise<Thread | null>;
  saveThread(t: Omit<Thread, "updated_at">): Promise<void>;
}

const byNewest = <T extends { created_at?: string; received_at?: string }>(a: T, b: T) =>
  (b.created_at ?? b.received_at ?? "").localeCompare(a.created_at ?? a.received_at ?? "");

// ---------------------------------------------------------------- memory ----

type MemoryState = {
  units: Unit[];
  vendors: Vendor[];
  requests: MaintenanceRequest[];
  workOrders: WorkOrder[];
  threads: Map<string, Thread>;
};

const g = globalThis as unknown as { __fixdeskMemory?: MemoryState };

function mem(): MemoryState {
  g.__fixdeskMemory ??= {
    units: seedUnits(),
    vendors: seedVendors(),
    requests: seedRequests(),
    workOrders: seedHistory(),
    threads: new Map(),
  };
  return g.__fixdeskMemory;
}

const memoryRepo: Repo = {
  kind: "memory",
  async landlord() {
    return LANDLORD;
  },
  async listUnits() {
    return mem().units;
  },
  async getUnit(id) {
    return mem().units.find((u) => u.id === id) ?? null;
  },
  async listVendors() {
    return mem().vendors;
  },
  async listRequests() {
    return [...mem().requests].sort(byNewest);
  },
  async getRequest(id) {
    return mem().requests.find((r) => r.id === id) ?? null;
  },
  async createRequest(r) {
    const row: MaintenanceRequest = { ...r, status: "new", received_at: new Date().toISOString() };
    mem().requests.push(row);
    return row;
  },
  async setRequestStatus(id, status) {
    const r = mem().requests.find((x) => x.id === id);
    if (r) r.status = status;
  },
  async listWorkOrders(filter = {}) {
    return mem()
      .workOrders.filter(
        (w) => (!filter.request_id || w.request_id === filter.request_id) && (!filter.unit_id || w.unit_id === filter.unit_id)
      )
      .sort(byNewest);
  },
  async saveWorkOrder(w) {
    const state = mem();
    const existing = w.id ? state.workOrders.find((x) => x.id === w.id) : undefined;
    if (existing) {
      Object.assign(existing, w);
      return existing;
    }
    const row: WorkOrder = { ...w, id: w.id ?? `wo-${crypto.randomUUID().slice(0, 8)}`, created_at: new Date().toISOString() };
    state.workOrders.push(row);
    return row;
  },
  async setWorkOrderStatus(id, status) {
    const w = mem().workOrders.find((x) => x.id === id);
    if (!w) return null;
    w.status = status;
    return w;
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

const num = (w: WorkOrder): WorkOrder => ({
  ...w,
  estimate_low: Number(w.estimate_low),
  estimate_high: Number(w.estimate_high),
  respond_within_hours: Number(w.respond_within_hours),
});

function supabaseRepo(db: SupabaseClient): Repo {
  let seeded: Promise<void> | null = null;
  // The first request against an empty project seeds the demo portfolio, so
  // reviewers never land on a blank inbox.
  const ensureSeeded = () =>
    (seeded ??= (async () => {
      const { count, error } = await db.from("units").select("id", { count: "exact", head: true });
      if (error) throw new Error(`Supabase: ${error.message}`);
      if ((count ?? 0) > 0) return;
      must(await db.from("landlords").upsert(LANDLORD));
      must(await db.from("units").upsert(seedUnits()));
      must(await db.from("vendors").upsert(seedVendors()));
      must(await db.from("requests").upsert(seedRequests()));
      must(await db.from("work_orders").upsert(seedHistory()));
    })().catch((e) => {
      seeded = null;
      throw e;
    }));

  return {
    kind: "supabase",
    async landlord() {
      await ensureSeeded();
      const row = must(await db.from("landlords").select("*").limit(1).maybeSingle()) as Landlord | null;
      return row ? { ...row, approval_limit: Number(row.approval_limit) } : LANDLORD;
    },
    async listUnits() {
      await ensureSeeded();
      return must(await db.from("units").select("*").order("id")) as Unit[];
    },
    async getUnit(id) {
      return must(await db.from("units").select("*").eq("id", id).maybeSingle()) as Unit | null;
    },
    async listVendors() {
      await ensureSeeded();
      return (must(await db.from("vendors").select("*")) as Vendor[]).map((v) => ({
        ...v,
        callout_fee: Number(v.callout_fee),
        hourly_rate: Number(v.hourly_rate),
        rating: Number(v.rating),
      }));
    },
    async listRequests() {
      await ensureSeeded();
      return must(await db.from("requests").select("*").order("received_at", { ascending: false })) as MaintenanceRequest[];
    },
    async getRequest(id) {
      return must(await db.from("requests").select("*").eq("id", id).maybeSingle()) as MaintenanceRequest | null;
    },
    async createRequest(r) {
      return must(await db.from("requests").insert({ ...r, status: "new" }).select("*").single()) as MaintenanceRequest;
    },
    async setRequestStatus(id, status) {
      must(await db.from("requests").update({ status }).eq("id", id));
    },
    async listWorkOrders(filter = {}) {
      await ensureSeeded();
      let q = db.from("work_orders").select("*");
      if (filter.request_id) q = q.eq("request_id", filter.request_id);
      if (filter.unit_id) q = q.eq("unit_id", filter.unit_id);
      return (must(await q.order("created_at", { ascending: false })) as WorkOrder[]).map(num);
    },
    async saveWorkOrder(w) {
      const row = { ...w, id: w.id ?? `wo-${crypto.randomUUID().slice(0, 8)}` };
      return num(must(await db.from("work_orders").upsert(row).select("*").single()) as WorkOrder);
    },
    async setWorkOrderStatus(id, status) {
      const row = must(await db.from("work_orders").update({ status }).eq("id", id).select("*").maybeSingle()) as WorkOrder | null;
      return row ? num(row) : null;
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
