"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import type { MaintenanceRequest, Unit } from "@/lib/data/types";

const selectClass =
  "border-input dark:bg-input/30 h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export function NewRequestDialog({ units, onCreated }: { units: Unit[]; onCreated: (r: MaintenanceRequest) => void }) {
  const [open, setOpen] = useState(false);
  const [unitId, setUnitId] = useState("");
  const [channel, setChannel] = useState<"sms" | "email" | "portal">("sms");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ unit_id: unitId || units[0]?.id, channel, message }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) return setError(data.error ?? "Could not add request");
    onCreated(data.request);
    setOpen(false);
    setMessage("");
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="w-full">
          <Plus /> New request
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Log a tenant request</DialogTitle>
          <DialogDescription>Paste the tenant&apos;s text, email or portal message as they wrote it.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <select className={selectClass} value={unitId || units[0]?.id} onChange={(e) => setUnitId(e.target.value)}>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.property_name} {u.unit_label} · {u.tenant_name}
                </option>
              ))}
            </select>
            <select className={selectClass} value={channel} onChange={(e) => setChannel(e.target.value as typeof channel)}>
              <option value="sms">SMS</option>
              <option value="email">Email</option>
              <option value="portal">Portal</option>
            </select>
          </div>
          <Textarea
            placeholder="e.g. The toilet keeps running and now water is leaking from the base…"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="h-32 [field-sizing:fixed]"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={saving || message.trim().length < 5}>
            {saving ? "Adding…" : "Add to inbox"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
