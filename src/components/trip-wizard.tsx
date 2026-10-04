"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, Coffee, Footprints, Loader2, Rocket, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { INTERESTS, type City, type Interest, type Pace, type Trip } from "@/lib/data/types";
import { cn } from "@/lib/utils";

export const CITY_STYLE: Record<string, { emoji: string; gradient: string; highlights: string[] }> = {
  lisbon: { emoji: "🚋", gradient: "from-amber-400 via-orange-400 to-rose-400", highlights: ["Belém", "Alfama", "Fado"] },
  rome: { emoji: "🏛️", gradient: "from-orange-500 via-red-400 to-amber-300", highlights: ["Colosseum", "Vatican", "Trastevere"] },
  kyoto: { emoji: "⛩️", gradient: "from-rose-500 via-pink-400 to-fuchsia-300", highlights: ["Fushimi Inari", "Gion", "Arashiyama"] },
};

export const INTEREST_EMOJI: Record<Interest, string> = {
  history: "🏰",
  food: "🍝",
  art: "🎨",
  architecture: "🏛️",
  nature: "🌿",
  views: "🌅",
  nightlife: "🍸",
  shopping: "🛍️",
  family: "👨‍👩‍👧",
};

const PACE_INFO: Record<Pace, { icon: typeof Coffee; title: string; desc: string }> = {
  relaxed: { icon: Coffee, title: "Relaxed", desc: "3 sights a day, long lunches" },
  balanced: { icon: Footprints, title: "Balanced", desc: "4 sights, a good mix" },
  packed: { icon: Rocket, title: "Packed", desc: "See it all, early to late" },
};

const BUDGETS = [
  { label: "Shoestring", value: 120 },
  { label: "Comfortable", value: 250 },
  { label: "Treat yourself", value: 500 },
];

const STEPS = ["Where", "When & budget", "Your vibe"];

function nextSaturday() {
  const d = new Date();
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7));
  return d.toISOString().slice(0, 10);
}

export function TripWizard({
  cities,
  cityId,
  onCity,
  onCreated,
}: {
  cities: City[];
  cityId: string;
  onCity: (id: string) => void;
  onCreated: (t: Trip) => void;
}) {
  const [step, setStep] = useState(0);
  const [start, setStart] = useState(nextSaturday);
  const [days, setDays] = useState(2);
  const [budget, setBudget] = useState(250);
  const [interests, setInterests] = useState<Interest[]>(["history", "food", "views"]);
  const [pace, setPace] = useState<Pace>("balanced");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const city = cities.find((c) => c.id === cityId);

  const toggle = (i: Interest) => setInterests((cur) => (cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i]));

  async function submit() {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/trips", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ city_id: cityId, start_date: start, days_count: days, budget, interests, pace, notes }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) return setError(data.error ?? "Couldn't create the trip");
    onCreated(data.trip);
  }

  return (
    <div className="rounded-3xl border bg-card/90 p-5 shadow-xl shadow-teal-900/5 backdrop-blur sm:p-6">
      {/* Progress */}
      <ol className="mb-6 flex items-center gap-2">
        {STEPS.map((s, i) => (
          <li key={s} className="flex flex-1 items-center gap-2">
            <button
              type="button"
              onClick={() => i < step && setStep(i)}
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition",
                i < step ? "bg-primary text-primary-foreground" : i === step ? "bg-foreground text-background" : "bg-muted text-muted-foreground"
              )}
            >
              {i < step ? <Check className="size-3.5" /> : i + 1}
            </button>
            <span className={cn("hidden text-xs font-medium sm:inline", i === step ? "text-foreground" : "text-muted-foreground")}>{s}</span>
            {i < STEPS.length - 1 && <span className={cn("h-px flex-1", i < step ? "bg-primary" : "bg-border")} />}
          </li>
        ))}
      </ol>

      <div className="min-h-[300px]">
        {step === 0 && (
          <div className="space-y-3">
            <h2 className="font-display text-2xl font-semibold">Where are you headed?</h2>
            <p className="text-sm text-muted-foreground">Pick a city here or tap a pin on the globe.</p>
            <div className="grid gap-2.5">
              {cities.map((c) => {
                const st = CITY_STYLE[c.id];
                const active = c.id === cityId;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => onCity(c.id)}
                    className={cn(
                      "flex items-center gap-3 rounded-2xl border p-2.5 text-left transition",
                      active ? "border-primary bg-accent/60 ring-1 ring-primary" : "hover:border-primary/40 hover:bg-muted/50"
                    )}
                  >
                    <div className={cn("flex size-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-2xl shadow-sm", st?.gradient)}>{st?.emoji}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-1.5">
                        <span className="font-semibold">{c.name}</span>
                        <span className="text-xs text-muted-foreground">{c.country}</span>
                      </div>
                      <div className="truncate text-xs text-muted-foreground">{c.tagline}</div>
                      <div className="mt-1 flex gap-1">
                        {st?.highlights.map((h) => (
                          <span key={h} className="rounded-full bg-muted px-1.5 py-0.5 text-[10px]">
                            {h}
                          </span>
                        ))}
                      </div>
                    </div>
                    <span className={cn("flex size-5 items-center justify-center rounded-full border", active && "border-primary bg-primary text-primary-foreground")}>
                      {active && <Check className="size-3" />}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-5">
            <h2 className="font-display text-2xl font-semibold">When, and for how long?</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">First day</span>
                <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="h-11" />
              </label>
              <div className="space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">Number of days</span>
                <div className="flex h-11 items-center justify-between rounded-md border px-1">
                  <Button variant="ghost" size="icon" className="size-9" onClick={() => setDays((d) => Math.max(1, d - 1))} disabled={days <= 1} aria-label="Fewer days">
                    −
                  </Button>
                  <span className="font-semibold tabular-nums">
                    {days} day{days > 1 ? "s" : ""}
                  </span>
                  <Button variant="ghost" size="icon" className="size-9" onClick={() => setDays((d) => Math.min(5, d + 1))} disabled={days >= 5} aria-label="More days">
                    +
                  </Button>
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Budget per person (tickets, food, metro)</span>
              <div className="grid grid-cols-3 gap-2">
                {BUDGETS.map((b) => (
                  <button
                    key={b.value}
                    type="button"
                    onClick={() => setBudget(b.value)}
                    className={cn("rounded-xl border p-2.5 text-left transition", budget === b.value ? "border-primary bg-accent/60 ring-1 ring-primary" : "hover:border-primary/40")}
                  >
                    <div className="text-sm font-semibold">${b.value}</div>
                    <div className="text-[11px] text-muted-foreground">{b.label}</div>
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 pt-1">
                <span className="text-xs text-muted-foreground">or exactly</span>
                <div className="relative w-28">
                  <span className="absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                  <Input type="number" min={20} step={10} value={budget} onChange={(e) => setBudget(Number(e.target.value))} className="h-8 pl-5" />
                </div>
                <span className="text-xs text-muted-foreground">≈ ${Math.round(budget / days)}/day</span>
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <h2 className="font-display text-2xl font-semibold">What&apos;s your vibe?</h2>
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">I&apos;m into… (pick a few)</span>
              <div className="flex flex-wrap gap-1.5">
                {INTERESTS.map((i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => toggle(i)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-sm capitalize transition active:scale-95",
                      interests.includes(i) ? "border-primary bg-primary text-primary-foreground shadow-sm" : "bg-card hover:border-primary/50"
                    )}
                  >
                    {INTEREST_EMOJI[i]} {i}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Pace</span>
              <div className="grid grid-cols-3 gap-2">
                {(Object.keys(PACE_INFO) as Pace[]).map((p) => {
                  const Icon = PACE_INFO[p].icon;
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPace(p)}
                      className={cn("rounded-xl border p-2.5 text-left transition", pace === p ? "border-primary bg-accent/60 ring-1 ring-primary" : "hover:border-primary/40")}
                    >
                      <Icon className="mb-1 size-4 text-primary" />
                      <div className="text-sm font-semibold">{PACE_INFO[p].title}</div>
                      <div className="text-[11px] leading-tight text-muted-foreground">{PACE_INFO[p].desc}</div>
                    </button>
                  );
                })}
              </div>
            </div>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything else? (optional) e.g. travelling with my mum" className="min-h-12 text-sm" />
          </div>
        )}
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-5 flex items-center gap-2">
        {step > 0 && (
          <Button variant="ghost" onClick={() => setStep((s) => s - 1)}>
            <ArrowLeft /> Back
          </Button>
        )}
        <div className="ml-auto text-xs text-muted-foreground">
          {city?.name} · {days}d · ${budget}
        </div>
        {step < STEPS.length - 1 ? (
          <Button className="h-11 px-5" onClick={() => setStep((s) => s + 1)}>
            Next <ArrowRight />
          </Button>
        ) : (
          <Button className="h-11 bg-gradient-to-r from-teal-600 to-cyan-600 px-5 shadow-md" onClick={submit} disabled={saving || interests.length === 0}>
            {saving ? <Loader2 className="animate-spin" /> : <Sparkles />} Plan my trip
          </Button>
        )}
      </div>
    </div>
  );
}
