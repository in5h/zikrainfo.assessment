import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { seedCandidates, seedJobs } from "./seed";
import type { Candidate, Job, Scorecard, Stage, Thread } from "./types";

/**
 * Persistence layer. Uses Supabase when SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 * are set; otherwise falls back to an in-process store so the app still runs
 * locally with zero setup. The interface is identical either way.
 */
export interface Repo {
  kind: "supabase" | "memory";
  listJobs(): Promise<Job[]>;
  getJob(id: string): Promise<Job | null>;
  listCandidates(jobId: string): Promise<Candidate[]>;
  getCandidate(id: string): Promise<Candidate | null>;
  createCandidate(c: Omit<Candidate, "created_at" | "stage">): Promise<Candidate>;
  setStage(candidateId: string, stage: Stage): Promise<void>;
  latestScorecard(candidateId: string): Promise<Scorecard | null>;
  latestScorecardsForJob(jobId: string): Promise<Record<string, Scorecard>>;
  saveScorecard(s: Omit<Scorecard, "id" | "created_at">): Promise<Scorecard>;
  getThread(id: string): Promise<Thread | null>;
  saveThread(t: Omit<Thread, "updated_at">): Promise<void>;
}

// ---------------------------------------------------------------- memory ----

type MemoryState = {
  jobs: Job[];
  candidates: Candidate[];
  scorecards: Scorecard[];
  threads: Map<string, Thread>;
};

const g = globalThis as unknown as { __screenpilotMemory?: MemoryState };

function memoryState(): MemoryState {
  if (!g.__screenpilotMemory) {
    g.__screenpilotMemory = {
      jobs: seedJobs(),
      candidates: seedCandidates(),
      scorecards: [],
      threads: new Map(),
    };
  }
  return g.__screenpilotMemory;
}

const memoryRepo: Repo = {
  kind: "memory",
  async listJobs() {
    return memoryState().jobs;
  },
  async getJob(id) {
    return memoryState().jobs.find((j) => j.id === id) ?? null;
  },
  async listCandidates(jobId) {
    return memoryState()
      .candidates.filter((c) => c.job_id === jobId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  },
  async getCandidate(id) {
    return memoryState().candidates.find((c) => c.id === id) ?? null;
  },
  async createCandidate(c) {
    const row: Candidate = { ...c, stage: "new", created_at: new Date().toISOString() };
    memoryState().candidates.push(row);
    return row;
  },
  async setStage(candidateId, stage) {
    const c = memoryState().candidates.find((x) => x.id === candidateId);
    if (c) c.stage = stage;
  },
  async latestScorecard(candidateId) {
    const all = memoryState().scorecards.filter((s) => s.candidate_id === candidateId);
    return all.at(-1) ?? null;
  },
  async latestScorecardsForJob(jobId) {
    const out: Record<string, Scorecard> = {};
    for (const s of memoryState().scorecards) if (s.job_id === jobId) out[s.candidate_id] = s;
    return out;
  },
  async saveScorecard(s) {
    const row: Scorecard = { ...s, id: crypto.randomUUID(), created_at: new Date().toISOString() };
    memoryState().scorecards.push(row);
    return row;
  },
  async getThread(id) {
    return memoryState().threads.get(id) ?? null;
  },
  async saveThread(t) {
    memoryState().threads.set(t.id, { ...t, updated_at: new Date().toISOString() });
  },
};

// -------------------------------------------------------------- supabase ----

function must<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(`Supabase: ${res.error.message}`);
  return res.data;
}

function supabaseRepo(db: SupabaseClient): Repo {
  let seeded: Promise<void> | null = null;
  // First request against an empty project seeds the demo jobs + candidates,
  // so reviewers never land on a blank screen.
  const ensureSeeded = () =>
    (seeded ??= (async () => {
      const { count, error } = await db.from("jobs").select("id", { count: "exact", head: true });
      if (error) throw new Error(`Supabase: ${error.message}`);
      if ((count ?? 0) > 0) return;
      must(await db.from("jobs").upsert(seedJobs()));
      must(await db.from("candidates").upsert(seedCandidates()));
    })().catch((e) => {
      seeded = null;
      throw e;
    }));

  const num = (s: Scorecard) => ({ ...s, overall_score: Number(s.overall_score) });

  return {
    kind: "supabase",
    async listJobs() {
      await ensureSeeded();
      return must(await db.from("jobs").select("*").order("created_at")) as Job[];
    },
    async getJob(id) {
      await ensureSeeded();
      return must(await db.from("jobs").select("*").eq("id", id).maybeSingle()) as Job | null;
    },
    async listCandidates(jobId) {
      await ensureSeeded();
      return must(
        await db.from("candidates").select("*").eq("job_id", jobId).order("created_at", { ascending: false })
      ) as Candidate[];
    },
    async getCandidate(id) {
      return must(await db.from("candidates").select("*").eq("id", id).maybeSingle()) as Candidate | null;
    },
    async createCandidate(c) {
      return must(await db.from("candidates").insert({ ...c, stage: "new" }).select("*").single()) as Candidate;
    },
    async setStage(candidateId, stage) {
      must(await db.from("candidates").update({ stage }).eq("id", candidateId));
    },
    async latestScorecard(candidateId) {
      const row = must(
        await db
          .from("scorecards")
          .select("*")
          .eq("candidate_id", candidateId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      ) as Scorecard | null;
      return row ? num(row) : null;
    },
    async latestScorecardsForJob(jobId) {
      const rows = must(
        await db.from("scorecards").select("*").eq("job_id", jobId).order("created_at", { ascending: true })
      ) as Scorecard[];
      const out: Record<string, Scorecard> = {};
      for (const s of rows) out[s.candidate_id] = num(s);
      return out;
    },
    async saveScorecard(s) {
      return num(must(await db.from("scorecards").insert(s).select("*").single()) as Scorecard);
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
