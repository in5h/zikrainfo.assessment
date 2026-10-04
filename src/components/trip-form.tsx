"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { INTERESTS, PACES, type City, type Interest, type Pace, type Trip } from "@/lib/data/types";
import { cn } from "@/lib/utils";

export const CITY_STYLE: Record<string, { emoji: string; gradient: string }> = {
  lisbon: { emoji: "🚋", gradient: "from-amber-400 via-orange-400 to-rose-400" },
  rome: { emoji: "🏛️", gradient: "from-orange-500 via-red-400 to-amber-300" },
  kyoto: { emoji: "⛩️", gradient: "from-rose-500 via-pink-400 to-fuchsia-300" },
};

const INTEREST_EMOJI: Record<Interest, string> = {
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

function nextSaturday() {
  const d = new Date();
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7));
  return d.toISOString().slice(0, 10);
}

function Segmented<T extends string | number>({ value, options, onChange, label }: { value: T; options: T[]; onChange: (v: T) => void; label: (v: T) => string }) {
  return (
    <div className="flex rounded-lg bg-muted p-1">
      {options.map((o) => (
        <button
          key={String(o)}
          type="button"
          onClick={() => onChange(o)}
          className={cn(
            "flex-1 rounded-md px-2 py-1.5 text-xs font-medium capitalize transition",
            value === o ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {label(o)}
        </button>
      ))}
    </div>
  );
}

export function TripForm({ cities, onCreated, busy }: { cities: City[]; onCreated: (t: Trip) => void; busy: boolean }) {
  const [cityId, setCityId] = useState("lisbon");
  const [start, setStart] = useState(nextSaturday);
  const [days, setDays] = useState(2);
  const [budget, setBudget] = useState(250);
  const [interests, setInterests] = useState<Interest[]>(["history", "food", "views"]);
  const [pace, setPace] = useState<Pace>("balanced");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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
    <div className="space-y-5">
      <div className="space-y-2">
        <Label>Where to?</Label>
        <div className="grid grid-cols-3 gap-2">
          {cities.map((c) => {
            const st = CITY_STYLE[c.id] ?? { emoji: "📍", gradient: "from-slate-400 to-slate-600" };
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setCityId(c.id)}
                className={cn(
                  "group relative overflow-hidden rounded-xl bg-gradient-to-br p-2.5 text-left text-white shadow-sm transition",
                  st.gradient,
                  cityId === c.id ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : "opacity-75 hover:opacity-100"
                )}
              >
                <div className="text-2xl drop-shadow">{st.emoji}</div>
                <div className="mt-3 text-sm font-semibold drop-shadow">{c.name}</div>
                <div className="text-[10px] opacity-90">{c.country}</div>
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">{cities.find((c) => c.id === cityId)?.tagline}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Start date</Label>
          <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Budget / person</Label>
          <div className="relative">
            <span className="absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">$</span>
            <Input type="number" min={20} step={10} value={budget} onChange={(e) => setBudget(Number(e.target.value))} className="pl-6" />
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Days</Label>
        <Segmented value={days} options={[1, 2, 3, 4, 5]} onChange={setDays} label={(d) => String(d)} />
      </div>

      <div className="space-y-2">
        <Label>Pace</Label>
        <Segmented value={pace} options={[...PACES]} onChange={setPace} label={(p) => p} />
      </div>

      <div className="space-y-2">
        <Label>Interests</Label>
        <div className="flex flex-wrap gap-1.5">
          {INTERESTS.map((i) => (
            <button
              key={i}
              type="button"
              onClick={() => toggle(i)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs capitalize transition",
                interests.includes(i) ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:border-primary/50"
              )}
            >
              {INTEREST_EMOJI[i]} {i}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label>Anything else? (optional)</Label>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. travelling with my mum, not too much walking" className="min-h-14 text-sm" />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button className="h-11 w-full text-base" onClick={submit} disabled={saving || busy || interests.length === 0}>
        {saving ? <Loader2 className="animate-spin" /> : <Sparkles />} Plan my trip
      </Button>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{children}</div>;
}
