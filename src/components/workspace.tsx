"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarDays, Compass, Database, FolderOpen, Map as MapIcon, Plus, RefreshCw, Sparkles, Trash2 } from "lucide-react";

import { AgentPanel, type AgentPanelHandle } from "@/components/agent-panel";
import { ItineraryView } from "@/components/itinerary-view";
import { CITY_STYLE, TripForm } from "@/components/trip-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { TranscriptEntry } from "@/lib/agent/events";
import type { TripCheck } from "@/lib/agent/itinerary";
import type { City, StoredFile, Todo, Trip } from "@/lib/data/types";
import { cn } from "@/lib/utils";

type Status = { storage: "supabase" | "memory"; mode: "claude" | "demo"; model: string };
type Detail = {
  trip: Trip;
  city: City;
  check: TripCheck | null;
  transcript: TranscriptEntry[];
  files: Record<string, StoredFile>;
  todos: Todo[];
};

const fmtRange = (t: Trip) => {
  const s = new Date(`${t.start_date}T12:00:00Z`);
  const e = new Date(s);
  e.setUTCDate(e.getUTCDate() + t.days_count - 1);
  const o: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", timeZone: "UTC" };
  return t.days_count === 1 ? s.toLocaleDateString(undefined, o) : `${s.toLocaleDateString(undefined, o)} – ${e.toLocaleDateString(undefined, o)}`;
};

export function Workspace() {
  const [status, setStatus] = useState<Status | null>(null);
  const [cities, setCities] = useState<City[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [busy, setBusy] = useState(false);
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

  const loadTrips = useCallback(() => fetch("/api/trips").then((r) => r.json()).then((d) => setTrips(d.trips ?? [])), []);

  const loadDetail = useCallback(async (id: string) => {
    const d = await fetch(`/api/trips/${id}`).then((r) => r.json());
    setDetail(d);
  }, []);

  const select = useCallback(
    (id: string | null) => {
      setSelected(id);
      setDetail(null);
      setShowFiles(false);
      if (id) loadDetail(id);
    },
    [loadDetail]
  );

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
  const onPanelReady = useCallback((handle: AgentPanelHandle | null) => {
    panel.current = handle;
    if (handle && autoPlan.current && autoPlan.current === selected) {
      autoPlan.current = null;
      setTimeout(() => handle.send("Plan this trip."), 50);
    }
  }, [selected]);

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
      <header className="flex flex-wrap items-center gap-3 border-b bg-card/60 px-4 py-2.5 backdrop-blur">
        <button type="button" onClick={() => select(null)} className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-teal-500 to-cyan-600 text-white shadow-sm">
            <Compass className="size-4.5" />
          </div>
          <div className="text-left leading-tight">
            <div className="font-display text-lg font-semibold">Wayfarer</div>
            <div className="text-[11px] text-muted-foreground">AI trip planner that checks the details</div>
          </div>
        </button>
        <div className="ml-auto flex items-center gap-2">
          {status && (
            <>
              <Badge
                variant="outline"
                className={cn("gap-1", status.mode === "demo" && "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300")}
                title={status.mode === "demo" ? "No ANTHROPIC_API_KEY: an offline planner drives the same agent harness." : undefined}
              >
                <Sparkles className="size-3" /> {status.mode === "demo" ? "Demo mode · offline planner" : status.model}
              </Badge>
              <Badge variant="outline" className="hidden gap-1 sm:inline-flex">
                <Database className="size-3" /> {status.storage === "supabase" ? "Supabase" : "In-memory"}
              </Badge>
            </>
          )}
        </div>
      </header>

      <div className="grid flex-1 grid-cols-1 lg:min-h-0 lg:grid-cols-[340px_minmax(0,1fr)_400px]">
        {/* Left: new trip + saved trips */}
        <aside className="space-y-6 border-b p-4 lg:min-h-0 lg:overflow-y-auto lg:border-r lg:border-b-0">
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold">New trip</h2>
              {selected && (
                <Button size="sm" variant="ghost" onClick={() => select(null)}>
                  <Plus /> New
                </Button>
              )}
            </div>
            {cities.length ? (
              <TripForm
                cities={cities}
                busy={busy}
                onCreated={(t) => {
                  autoPlan.current = t.id;
                  loadTrips();
                  select(t.id);
                }}
              />
            ) : (
              <Skeleton className="h-96" />
            )}
          </div>

          <div>
            <h2 className="mb-2 font-display text-lg font-semibold">Your trips</h2>
            {trips.length === 0 && <p className="text-sm text-muted-foreground">No trips yet. Plan your first one above.</p>}
            <div className="space-y-1.5">
              {trips.map((t) => {
                const st = CITY_STYLE[t.city_id];
                return (
                  <div
                    key={t.id}
                    className={cn("group flex items-center gap-2.5 rounded-xl border bg-card p-2 transition hover:border-primary/40", selected === t.id && "border-primary ring-1 ring-primary")}
                  >
                    <button type="button" disabled={busy} onClick={() => select(t.id)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
                      <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-lg", st?.gradient)}>{st?.emoji ?? "📍"}</div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{t.status === "planned" ? t.title : `${t.title} (draft)`}</div>
                        <div className="text-xs text-muted-foreground">
                          {fmtRange(t)}
                          {t.status === "planned" && ` · $${t.total_cost}`}
                        </div>
                      </div>
                    </button>
                    <button type="button" onClick={() => remove(t.id)} disabled={busy} className="rounded p-1 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-red-600" title="Delete trip">
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>

        {/* Center */}
        <main className="lg:min-h-0 lg:overflow-y-auto">
          {!selected ? (
            <div className="flex h-full flex-col items-center justify-center p-8 text-center">
              <div className="relative mb-6">
                <div className="absolute inset-0 rounded-full bg-gradient-to-br from-teal-300 to-amber-200 opacity-60 blur-2xl" />
                <div className="relative flex size-24 items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-cyan-600 text-white shadow-lg">
                  <MapIcon className="size-10" />
                </div>
              </div>
              <h1 className="font-display text-4xl font-semibold">Where to next?</h1>
              <p className="mt-3 max-w-md text-muted-foreground">
                Pick a city, your dates, budget and interests. The agent drafts a day-by-day plan, then checks every stop
                for opening hours, walking time, meals and budget before it shows you anything.
              </p>
              <div className="mt-8 grid max-w-xl grid-cols-1 gap-3 text-left text-sm sm:grid-cols-3">
                {[
                  ["🗺️", "Clustered days", "Neighbourhoods grouped so you walk, not commute."],
                  ["⏰", "Really open", "Closed Mondays and early closings handled."],
                  ["💸", "On budget", "Tickets, meals and transit add up to your limit."],
                ].map(([e, t, d]) => (
                  <div key={t} className="rounded-xl border bg-card p-3">
                    <div className="text-xl">{e}</div>
                    <div className="mt-1 font-medium">{t}</div>
                    <div className="text-xs text-muted-foreground">{d}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : !detail || !trip ? (
            <div className="space-y-4 p-6">
              <Skeleton className="h-12 w-2/3" />
              <Skeleton className="h-20" />
              <Skeleton className="h-80" />
            </div>
          ) : (
            <div className="mx-auto max-w-4xl space-y-5 p-4 lg:p-6">
              <div className={cn("relative overflow-hidden rounded-2xl bg-gradient-to-br p-5 text-white shadow-sm", CITY_STYLE[trip.city_id]?.gradient)}>
                <div className="absolute -top-4 -right-2 text-8xl opacity-25">{CITY_STYLE[trip.city_id]?.emoji}</div>
                <div className="relative">
                  <div className="flex items-center gap-1.5 text-sm opacity-90">
                    <CalendarDays className="size-4" /> {fmtRange(trip)} · {detail.city.name}, {detail.city.country}
                  </div>
                  <h1 className="mt-1 font-display text-3xl font-semibold drop-shadow-sm">{trip.status === "planned" ? trip.title : `Planning ${detail.city.name}…`}</h1>
                  {trip.summary && <p className="mt-2 max-w-2xl text-sm opacity-95">{trip.summary}</p>}
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {[trip.pace, ...trip.interests].map((x) => (
                      <span key={x} className="rounded-full bg-white/25 px-2.5 py-0.5 text-xs capitalize backdrop-blur">
                        {x}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {detail.check ? (
                <ItineraryView trip={trip} city={detail.city} check={detail.check} />
              ) : (
                <div className="rounded-2xl border border-dashed bg-card p-10 text-center">
                  <Sparkles className="mx-auto mb-3 size-6 text-primary" />
                  <div className="font-medium">{busy ? "Your agent is planning…" : "Ready to plan"}</div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {busy ? "Watch it work on the right: shortlist, draft, check, fix, save." : "Click the button and the agent will build your itinerary."}
                  </p>
                  {!busy && (
                    <Button className="mt-4" onClick={() => panel.current?.send("Plan this trip.")}>
                      <Sparkles /> Plan this trip
                    </Button>
                  )}
                </div>
              )}

              {detail.check && (
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" size="sm" disabled={busy} onClick={() => panel.current?.send("Re-plan this trip from scratch.")}>
                    <RefreshCw /> Re-plan
                  </Button>
                  {files.length > 0 && (
                    <Button variant="ghost" size="sm" onClick={() => setShowFiles((v) => !v)}>
                      <FolderOpen /> Agent files ({files.length})
                    </Button>
                  )}
                </div>
              )}
              {showFiles &&
                files.map(([path, f]) => (
                  <div key={path} className="rounded-xl border bg-card p-4">
                    <div className="mb-2 font-mono text-xs text-muted-foreground">{path}</div>
                    <pre className="text-sm whitespace-pre-wrap">{f.content}</pre>
                  </div>
                ))}
            </div>
          )}
        </main>

        {/* Right: agent */}
        <aside className="flex h-[85dvh] flex-col border-t bg-card/40 lg:h-auto lg:min-h-0 lg:border-t-0 lg:border-l">
          {selected && detail ? (
            <AgentPanel
              key={selected}
              ref={onPanelReady}
              tripId={selected}
              title={trip?.title ?? ""}
              suggestions={
                detail.check
                  ? ["Make it more relaxed", "Cheaper please", "Add more art", "Pack in more"]
                  : ["Plan this trip."]
              }
              transcript={detail.transcript}
              initialTodos={detail.todos}
              onFiles={() => {}}
              onSaved={refresh}
              onBusy={setBusy}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center p-8 text-center text-sm text-muted-foreground">
              <Sparkles className="mb-2 size-5 text-primary" />
              Your planning agent appears here once you start a trip. You&apos;ll see each step it takes, from shortlisting
              places to checking hours and budget.
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
