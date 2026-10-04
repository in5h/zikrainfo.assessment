"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Circle,
  Compass,
  Database,
  FolderOpen,
  Loader2,
  Luggage,
  MousePointerClick,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
} from "lucide-react";

import { AgentPanel, type AgentPanelHandle } from "@/components/agent-panel";
import type { GlobeCity } from "@/components/globe";
import { ItineraryView } from "@/components/itinerary-view";
import { CITY_STYLE, TripWizard } from "@/components/trip-wizard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { TranscriptEntry } from "@/lib/agent/events";
import type { TripCheck } from "@/lib/agent/itinerary";
import type { City, StoredFile, Todo, Trip } from "@/lib/data/types";
import { cn } from "@/lib/utils";

const Globe = dynamic(() => import("@/components/globe").then((m) => m.Globe), {
  ssr: false,
  loading: () => <div className="aspect-square w-full animate-pulse rounded-full bg-teal-900/10" />,
});

type Status = { storage: "supabase" | "memory"; mode: "claude" | "demo"; model: string };
type Detail = {
  trip: Trip;
  city: City;
  check: TripCheck | null;
  transcript: TranscriptEntry[];
  files: Record<string, StoredFile>;
  todos: Todo[];
};

const LABEL_SIDE: Record<string, "left" | "right"> = { lisbon: "left", rome: "right" };

const DEFAULT_STEPS = ["Read the trip request", "Get local recommendations", "Draft day-by-day plan", "Check hours, travel, meals & budget", "Save itinerary + checklist"];

const fmtRange = (t: Trip) => {
  const s = new Date(`${t.start_date}T12:00:00Z`);
  const e = new Date(s);
  e.setUTCDate(e.getUTCDate() + t.days_count - 1);
  const o: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", timeZone: "UTC" };
  return t.days_count === 1 ? s.toLocaleDateString(undefined, o) : `${s.toLocaleDateString(undefined, o)} – ${e.toLocaleDateString(undefined, o)}`;
};

function TripChip({ t, active, onOpen, onDelete, disabled }: { t: Trip; active?: boolean; onOpen: () => void; onDelete: () => void; disabled?: boolean }) {
  const st = CITY_STYLE[t.city_id];
  return (
    <div className={cn("group flex items-center gap-2.5 rounded-2xl border bg-card p-2 transition hover:border-primary/40 hover:shadow-sm", active && "border-primary ring-1 ring-primary")}>
      <button type="button" disabled={disabled} onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
        <div className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-xl", st?.gradient)}>{st?.emoji ?? "📍"}</div>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{t.status === "planned" ? t.title : `${t.title} · draft`}</div>
          <div className="text-xs text-muted-foreground">
            {fmtRange(t)}
            {t.status === "planned" && ` · $${t.total_cost}`}
          </div>
        </div>
      </button>
      <button type="button" onClick={onDelete} disabled={disabled} className="rounded-lg p-1.5 text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:bg-red-50 hover:text-red-600" title="Delete trip">
        <Trash2 className="size-3.5" />
      </button>
    </div>
  );
}

function PlanningProgress({ todos, busy, city, onStart }: { todos: Todo[]; busy: boolean; city: City; onStart: () => void }) {
  const steps = todos.length ? todos : DEFAULT_STEPS.map((content) => ({ content, status: "pending" as const }));
  const done = steps.filter((s) => s.status === "completed").length;
  return (
    <div className="overflow-hidden rounded-3xl border bg-card shadow-sm">
      <div className="h-1.5 bg-muted">
        <div className="h-full bg-gradient-to-r from-teal-500 to-cyan-500 transition-all duration-700" style={{ width: `${busy ? Math.max(8, (done / steps.length) * 100) : 0}%` }} />
      </div>
      <div className="grid gap-6 p-6 sm:grid-cols-[auto_1fr] sm:p-8">
        <div className="relative mx-auto flex size-28 items-center justify-center">
          <div className={cn("absolute inset-0 rounded-full bg-gradient-to-br from-teal-200 to-amber-100", busy && "animate-pulse")} />
          <Compass className={cn("relative size-14 text-teal-700", busy && "animate-[spin_6s_linear_infinite]")} />
        </div>
        <div>
          <h2 className="font-display text-2xl font-semibold">{busy ? `Planning your ${city.name} trip…` : "Ready when you are"}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {busy
              ? "Your agent is shortlisting places, drafting each day and checking every stop. This takes a few seconds."
              : "Your agent will draft each day and check opening hours, travel times, meals and budget."}
          </p>
          <ul className="mt-4 space-y-2">
            {steps.map((s, i) => (
              <li key={i} className={cn("flex items-center gap-2 text-sm transition", s.status === "pending" && "text-muted-foreground")}>
                {s.status === "completed" ? (
                  <CheckCircle2 className="size-4 text-emerald-600" />
                ) : s.status === "in_progress" ? (
                  <Loader2 className="size-4 animate-spin text-primary" />
                ) : (
                  <Circle className="size-4" />
                )}
                {s.content}
              </li>
            ))}
          </ul>
          {!busy && (
            <Button className="mt-5" onClick={onStart}>
              <Sparkles /> Plan this trip
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export function Workspace() {
  const [status, setStatus] = useState<Status | null>(null);
  const [cities, setCities] = useState<City[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [cityId, setCityId] = useState("lisbon");
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [busy, setBusy] = useState(false);
  const [showTrips, setShowTrips] = useState(false);
  const [showFiles, setShowFiles] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panel = useRef<AgentPanelHandle>(null);
  const autoPlan = useRef<string | null>(null);

  useEffect(() => {
    fetch("/api/status").then((r) => r.json()).then(setStatus).catch(() => {});
    Promise.all([fetch("/api/cities").then((r) => r.json()), fetch("/api/trips").then((r) => r.json())])
      .then(([c, t]) => {
        if (c.error || t.error) throw new Error(c.error ?? t.error);
        setCities(c.cities);
        setTrips(t.trips);
      })
      .catch((e) => setError(e.message));
  }, []);

  const globeCities = useMemo<GlobeCity[]>(
    () => cities.map((c) => ({ id: c.id, name: c.name, country: c.country, lat: c.center[0], lng: c.center[1], emoji: CITY_STYLE[c.id]?.emoji ?? "📍", side: LABEL_SIDE[c.id] })),
    [cities]
  );

  const loadTrips = useCallback(() => fetch("/api/trips").then((r) => r.json()).then((d) => setTrips(d.trips ?? [])), []);

  const select = useCallback((id: string | null) => {
    setSelected(id);
    setDetail(null);
    setShowFiles(false);
    setShowTrips(false);
    setTodos([]);
    if (id)
      fetch(`/api/trips/${id}`)
        .then((r) => r.json())
        .then((d: Detail) => {
          setDetail(d);
          setTodos(d.todos ?? []);
        });
    window.scrollTo({ top: 0 });
  }, []);

  const refresh = useCallback(() => {
    loadTrips();
    if (selected)
      fetch(`/api/trips/${selected}`)
        .then((r) => r.json())
        .then((d) => setDetail((prev) => (prev ? { ...prev, trip: d.trip, check: d.check, files: d.files } : prev)));
  }, [selected, loadTrips]);

  async function remove(id: string) {
    await fetch(`/api/trips/${id}`, { method: "DELETE" });
    if (selected === id) select(null);
    loadTrips();
  }

  // A freshly created trip starts planning as soon as its agent panel mounts.
  const onPanelReady = useCallback(
    (handle: AgentPanelHandle | null) => {
      panel.current = handle;
      if (handle && autoPlan.current && autoPlan.current === selected) {
        autoPlan.current = null;
        setTimeout(() => handle.send("Plan this trip."), 50);
      }
    },
    [selected]
  );

  if (error) {
    return (
      <div className="mx-auto max-w-lg p-10 text-sm">
        <h1 className="mb-2 text-lg font-semibold">Couldn&apos;t load data</h1>
        <p className="text-muted-foreground">{error}</p>
        <p className="mt-2 text-muted-foreground">If using Supabase, run the SQL in supabase/migrations first.</p>
      </div>
    );
  }

  const trip = detail?.trip;
  const files = Object.entries(detail?.files ?? {}).filter(([p]) => !p.startsWith("/skills/"));

  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh">
      {/* Header */}
      <header className="sticky top-0 z-[1100] flex items-center gap-3 border-b bg-background/80 px-4 py-2.5 backdrop-blur-md">
        <button type="button" onClick={() => select(null)} className="flex items-center gap-2" disabled={busy}>
          <div className="flex size-8 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-cyan-600 text-white shadow-sm">
            <Compass className="size-4.5" />
          </div>
          <span className="font-display text-xl font-semibold">Wayfarer</span>
        </button>

        <div className="relative ml-2">
          <Button variant="ghost" size="sm" onClick={() => setShowTrips((v) => !v)}>
            <Luggage /> My trips{trips.length > 0 && <span className="rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">{trips.length}</span>}
            <ChevronDown className={cn("transition-transform", showTrips && "rotate-180")} />
          </Button>
          {showTrips && (
            <div className="absolute top-full left-0 mt-2 w-80 space-y-1.5 rounded-2xl border bg-popover p-2 shadow-xl">
              {trips.length === 0 ? (
                <p className="p-3 text-sm text-muted-foreground">No trips yet. Plan your first one!</p>
              ) : (
                trips.map((t) => <TripChip key={t.id} t={t} active={t.id === selected} disabled={busy} onOpen={() => select(t.id)} onDelete={() => remove(t.id)} />)
              )}
            </div>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {status && (
            <Badge
              variant="outline"
              className={cn("hidden gap-1 sm:inline-flex", status.mode === "demo" && "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300")}
              title={status.mode === "demo" ? "No ANTHROPIC_API_KEY set: an offline planner drives the same agent harness." : undefined}
            >
              <Sparkles className="size-3" /> {status.mode === "demo" ? "Demo mode" : status.model}
            </Badge>
          )}
          {status && (
            <Badge variant="outline" className="hidden gap-1 md:inline-flex">
              <Database className="size-3" /> {status.storage === "supabase" ? "Supabase" : "In-memory"}
            </Badge>
          )}
          {selected && (
            <Button size="sm" onClick={() => select(null)} disabled={busy}>
              <Plus /> New trip
            </Button>
          )}
        </div>
      </header>

      {!selected ? (
        /* ------------------------------------------------------------- Home */
        <main className="relative flex-1 overflow-y-auto">
          <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
            <div className="absolute -top-40 -left-40 size-[36rem] rounded-full bg-teal-200/40 blur-3xl" />
            <div className="absolute top-40 -right-40 size-[32rem] rounded-full bg-amber-200/40 blur-3xl" />
          </div>
          <div className="relative mx-auto grid max-w-6xl items-center gap-8 px-4 py-8 lg:grid-cols-[minmax(0,460px)_1fr] lg:py-12">
            <div className="space-y-6">
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-full border bg-card/70 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
                  <Sparkles className="size-3 text-primary" /> AI trip planner · every stop checked
                </span>
                <h1 className="mt-4 font-display text-4xl leading-[1.1] font-semibold sm:text-5xl">
                  City trips that <span className="bg-gradient-to-r from-teal-600 to-cyan-500 bg-clip-text text-transparent">actually work</span>.
                </h1>
                <p className="mt-3 text-muted-foreground">
                  Tell us where, when and what you love. Your agent plans each day, then checks opening hours, walking times,
                  meals and budget, so you don&apos;t have to.
                </p>
              </div>
              {cities.length ? (
                <TripWizard
                  cities={cities}
                  cityId={cityId}
                  onCity={setCityId}
                  onCreated={(t) => {
                    autoPlan.current = t.id;
                    loadTrips();
                    select(t.id);
                  }}
                />
              ) : (
                <Skeleton className="h-96 rounded-3xl" />
              )}
            </div>

            <div className="relative">
              {globeCities.length > 0 && <Globe cities={globeCities} selected={cityId} onSelect={setCityId} className="mx-auto aspect-square w-full max-w-[600px]" />}
              <div className="mt-2 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                <MousePointerClick className="size-3.5" /> Drag to spin · tap a city to choose it
              </div>
            </div>
          </div>

          {trips.length > 0 && (
            <section className="relative mx-auto max-w-6xl px-4 pb-12">
              <h2 className="mb-3 font-display text-xl font-semibold">Your trips</h2>
              <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {trips.map((t) => (
                  <TripChip key={t.id} t={t} onOpen={() => select(t.id)} onDelete={() => remove(t.id)} />
                ))}
              </div>
            </section>
          )}
        </main>
      ) : (
        /* ------------------------------------------------------------- Trip */
        <div className="grid flex-1 grid-cols-1 lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_400px]">
          <main className="lg:min-h-0 lg:overflow-y-auto">
            {!detail || !trip ? (
              <div className="mx-auto max-w-4xl space-y-4 p-6">
                <Skeleton className="h-40 rounded-3xl" />
                <Skeleton className="h-80 rounded-3xl" />
              </div>
            ) : (
              <div className="mx-auto max-w-4xl space-y-5 p-4 lg:p-6">
                <button type="button" onClick={() => select(null)} disabled={busy} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                  <ArrowLeft className="size-4" /> All destinations
                </button>

                <div className={cn("relative overflow-hidden rounded-3xl bg-gradient-to-br p-6 text-white shadow-md", CITY_STYLE[trip.city_id]?.gradient)}>
                  <div className="absolute -top-6 -right-2 text-[9rem] leading-none opacity-20 select-none">{CITY_STYLE[trip.city_id]?.emoji}</div>
                  <div className="relative">
                    <div className="flex items-center gap-1.5 text-sm opacity-90">
                      <CalendarDays className="size-4" /> {fmtRange(trip)} · {detail.city.name}, {detail.city.country}
                    </div>
                    <h1 className="mt-1 font-display text-3xl font-semibold drop-shadow-sm sm:text-4xl">
                      {trip.status === "planned" ? trip.title : `${trip.days_count} day${trip.days_count > 1 ? "s" : ""} in ${detail.city.name}`}
                    </h1>
                    {trip.summary && <p className="mt-2 max-w-2xl text-sm opacity-95">{trip.summary}</p>}
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {[trip.pace, `$${trip.budget} budget`, ...trip.interests].map((x) => (
                        <span key={x} className="rounded-full bg-white/25 px-2.5 py-0.5 text-xs capitalize backdrop-blur">
                          {x}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {detail.check && !busy ? (
                  <>
                    <ItineraryView trip={trip} city={detail.city} check={detail.check} />
                    <div className="flex flex-wrap items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => panel.current?.send("Re-plan this trip from scratch.")}>
                        <RefreshCw /> Re-plan from scratch
                      </Button>
                      {files.length > 0 && (
                        <Button variant="ghost" size="sm" onClick={() => setShowFiles((v) => !v)}>
                          <FolderOpen /> Checklist & agent files
                        </Button>
                      )}
                    </div>
                    {showFiles &&
                      files.map(([path, f]) => (
                        <div key={path} className="rounded-2xl border bg-card p-4">
                          <div className="mb-2 font-mono text-xs text-muted-foreground">{path}</div>
                          <pre className="text-sm whitespace-pre-wrap">{f.content}</pre>
                        </div>
                      ))}
                  </>
                ) : (
                  <PlanningProgress todos={todos} busy={busy} city={detail.city} onStart={() => panel.current?.send("Plan this trip.")} />
                )}
              </div>
            )}
          </main>

          <aside className="flex h-[80dvh] flex-col border-t bg-card/50 lg:h-auto lg:min-h-0 lg:border-t-0 lg:border-l">
            {detail ? (
              <AgentPanel
                key={selected}
                ref={onPanelReady}
                tripId={selected}
                title={trip?.status === "planned" ? "Ask for changes any time" : "Planning your trip"}
                suggestions={detail.check ? ["Make it more relaxed", "Cheaper please", "Add more art", "Pack in more"] : ["Plan this trip."]}
                transcript={detail.transcript}
                initialTodos={detail.todos}
                onTodos={setTodos}
                onFiles={() => {}}
                onSaved={refresh}
                onBusy={setBusy}
              />
            ) : (
              <Skeleton className="m-4 h-full" />
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
