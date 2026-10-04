"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import {
  AlertTriangle,
  Bus,
  Camera,
  CheckCircle2,
  Coffee,
  Footprints,
  Landmark,
  Lightbulb,
  Moon,
  Palette,
  ShoppingBag,
  Star,
  Trees,
  Utensils,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import type { TripCheck } from "@/lib/agent/itinerary";
import type { City, Trip } from "@/lib/data/types";
import { cn } from "@/lib/utils";

import { DAY_COLORS } from "./day-colors";

const TripMap = dynamic(() => import("./trip-map"), { ssr: false, loading: () => <Skeleton className="h-full w-full" /> });

const CAT_ICON: Record<string, LucideIcon> = {
  sight: Landmark,
  museum: Palette,
  food: Utensils,
  cafe: Coffee,
  viewpoint: Camera,
  park: Trees,
  nightlife: Moon,
  market: ShoppingBag,
  shopping: ShoppingBag,
};

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border bg-card px-3 py-2.5">
      <div className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

const fmtDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

export function ItineraryView({ trip, city, check }: { trip: Trip; city: City; check: TripCheck }) {
  const [active, setActive] = useState<number | null>(0);
  const stops = check.days.reduce((a, d) => a + d.timeline.length, 0);
  const walking = check.days.reduce((a, d) => a + d.walking_minutes, 0);
  const pct = Math.min(100, Math.round((check.total_cost / Math.max(1, check.budget)) * 100));
  const shown = active == null ? check.days.map((_, i) => i) : [active];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="col-span-2 rounded-xl border bg-card px-3 py-2.5">
          <div className="flex items-center justify-between text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            <span className="flex items-center gap-1">
              <Wallet className="size-3" /> Budget
            </span>
            <span className="normal-case">${check.remaining >= 0 ? check.remaining : 0} left</span>
          </div>
          <div className="text-lg font-semibold tabular-nums">
            ${check.total_cost} <span className="text-sm font-normal text-muted-foreground">/ ${check.budget} per person</span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
            <div className={cn("h-full rounded-full", pct > 90 ? "bg-amber-500" : "bg-primary")} style={{ width: `${pct}%` }} />
          </div>
        </div>
        <Stat label="Stops" value={String(stops)} sub={`${check.days.length} day${check.days.length > 1 ? "s" : ""} · ${trip.pace}`} />
        <Stat label="Walking" value={`${Math.round(walking / 6) / 10}h`} sub={`${check.interest_match}% match your interests`} />
      </div>

      <div className="h-80 overflow-hidden rounded-2xl border shadow-sm">
        <TripMap center={city.center} days={check.days} activeDay={active} />
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setActive(null)}
          className={cn("rounded-full border px-3 py-1.5 text-sm", active == null ? "border-foreground bg-foreground text-background" : "bg-card")}
        >
          All days
        </button>
        {check.days.map((d, i) => (
          <button
            key={d.date}
            type="button"
            onClick={() => setActive(i)}
            className={cn("flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm", active === i ? "border-foreground bg-foreground text-background" : "bg-card")}
          >
            <span className="size-2.5 rounded-full" style={{ background: DAY_COLORS[i % DAY_COLORS.length] }} />
            Day {i + 1} · {fmtDate(d.date)}
          </button>
        ))}
      </div>

      {shown.map((di) => {
        const d = check.days[di];
        const color = DAY_COLORS[di % DAY_COLORS.length];
        return (
          <section key={d.date} className="rounded-2xl border bg-card p-4 shadow-xs sm:p-5">
            <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h3 className="font-display text-xl font-semibold" style={{ color }}>
                Day {di + 1}
              </h3>
              <span className="font-display text-lg">{trip.days[di]?.theme}</span>
              <span className="ml-auto text-xs text-muted-foreground">
                {fmtDate(d.date)} · ${d.cost} · ends {d.ends_at}
              </span>
            </div>
            <ol className="relative">
              {d.timeline.map((t, i) => {
                const Icon = CAT_ICON[t.category] ?? Landmark;
                return (
                  <li key={t.place_id + i}>
                    {t.leg && (
                      <div className="flex items-center gap-2 py-1.5 pl-[4.5rem] text-xs text-muted-foreground">
                        {t.leg.mode === "walk" ? <Footprints className="size-3.5" /> : <Bus className="size-3.5" />}
                        {t.leg.minutes} min {t.leg.mode === "walk" ? "walk" : `metro/taxi · $${t.leg.cost}`} · {t.leg.km} km
                      </div>
                    )}
                    <div className="flex gap-3">
                      <div className="w-14 shrink-0 pt-2 text-right text-sm font-semibold tabular-nums">{t.start}</div>
                      <div className="relative flex flex-col items-center">
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-full text-white shadow-sm" style={{ background: color }}>
                          <Icon className="size-4" />
                        </div>
                      </div>
                      <div className="min-w-0 flex-1 rounded-xl border bg-background/60 px-3 py-2">
                        <div className="flex flex-wrap items-center gap-x-2">
                          <span className="font-medium">{t.name}</span>
                          <span className="text-xs text-muted-foreground">{t.neighborhood}</span>
                          <span className="ml-auto flex items-center gap-2 text-xs">
                            <span className="flex items-center gap-0.5 text-amber-600">
                              <Star className="size-3 fill-current" /> {t.rating}
                            </span>
                            <span className="font-medium tabular-nums">{t.cost ? `$${t.cost}` : "Free"}</span>
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground">{t.blurb}</p>
                        <div className="mt-1 flex items-center gap-1 text-[11px] text-emerald-700 dark:text-emerald-400">
                          <CheckCircle2 className="size-3" /> Open · until {t.end}
                          {t.note && <span className="ml-2 text-muted-foreground">· {t.note}</span>}
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}

      {(trip.tips.length > 0 || check.warnings.length > 0) && (
        <div className="grid gap-3 md:grid-cols-2">
          {trip.tips.length > 0 && (
            <div className="rounded-2xl border bg-card p-4">
              <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                <Lightbulb className="size-4 text-amber-500" /> Tips
              </div>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {trip.tips.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </div>
          )}
          {check.warnings.length > 0 && (
            <div className="rounded-2xl border bg-card p-4">
              <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                <AlertTriangle className="size-4 text-amber-500" /> Heads-up
              </div>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {check.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
