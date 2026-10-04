"use client";

import { useState } from "react";
import { AlertTriangle, Check, CheckCircle2, Clock, Copy, HelpCircle, Phone, Send, ShieldAlert, Wrench } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Unit, Urgency, Vendor, WorkOrder } from "@/lib/data/types";
import { cn } from "@/lib/utils";

export const URGENCY_STYLE: Record<Urgency, { label: string; variant: "danger" | "warning" | "secondary"; bar: string }> = {
  emergency: { label: "Emergency", variant: "danger", bar: "bg-red-600" },
  urgent: { label: "Urgent", variant: "warning", bar: "bg-amber-500" },
  routine: { label: "Routine", variant: "secondary", bar: "bg-slate-400" },
};

export const STATUS_LABEL: Record<WorkOrder["status"], string> = {
  ready: "Ready to send",
  awaiting_tenant: "Waiting on tenant",
  needs_approval: "Needs your approval",
  dispatched: "Sent",
  resolved: "Resolved",
};

export function timeLeft(iso: string) {
  const ms = new Date(iso).getTime() - Date.now();
  const abs = Math.abs(ms);
  const h = Math.floor(abs / 3600_000);
  const m = Math.round((abs % 3600_000) / 60_000);
  const span = h >= 48 ? `${Math.round(h / 24)}d` : h > 0 ? `${h}h ${m}m` : `${m}m`;
  return ms >= 0 ? `${span} left` : `${span} overdue`;
}

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 px-2 text-xs"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? <Check /> : <Copy />} {done ? "Copied" : label}
    </Button>
  );
}

export function WorkOrderCard({
  wo,
  unit,
  vendor,
  approvalLimit,
  onStatus,
}: {
  wo: WorkOrder;
  unit: Unit | null;
  vendor: Vendor | null;
  approvalLimit: number;
  onStatus: (status: "dispatched" | "resolved") => void;
}) {
  const u = URGENCY_STYLE[wo.urgency];
  const open = wo.status !== "dispatched" && wo.status !== "resolved";

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <div className={cn("h-1.5", u.bar)} />
      <CardHeader className="flex flex-row flex-wrap items-center gap-2 py-4">
        <Badge variant={u.variant} className="text-sm">
          {wo.urgency === "emergency" && <ShieldAlert />} {u.label}
        </Badge>
        <CardTitle className="text-base">{wo.category}</CardTitle>
        <span className="text-xs text-muted-foreground capitalize">· {wo.trade}</span>
        <div className="ml-auto flex items-center gap-2 text-xs">
          {open && (
            <span className={cn("flex items-center gap-1 font-medium", new Date(wo.respond_by) < new Date() && "text-red-600")}>
              <Clock className="size-3.5" /> {timeLeft(wo.respond_by)}
            </span>
          )}
          <Badge variant="outline">{STATUS_LABEL[wo.status]}</Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pb-5">
        {wo.safety_steps.length > 0 && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm dark:border-red-900 dark:bg-red-950/40">
            <div className="mb-1.5 flex items-center gap-1.5 font-semibold text-red-800 dark:text-red-300">
              <AlertTriangle className="size-4" /> Safety steps sent to the tenant first
            </div>
            <ol className="list-decimal space-y-0.5 pl-5 text-red-900 dark:text-red-200">
              {wo.safety_steps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          </div>
        )}

        <div className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Why: </span>
          {wo.rationale}
        </div>

        {wo.followup_questions.length > 0 && (
          <div className="rounded-md border p-3 text-sm">
            <div className="mb-1 flex items-center gap-1.5 font-medium">
              <HelpCircle className="size-4 text-primary" /> Asking the tenant
            </div>
            <ul className="list-disc space-y-0.5 pl-5">
              {wo.followup_questions.map((q, i) => (
                <li key={i}>{q}</li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">When they reply, paste it into the chat and the agent will update this work order.</p>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-md border p-3">
            <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Wrench className="size-3.5" /> Vendor
            </div>
            {vendor ? (
              <>
                <div className="text-sm font-medium">{vendor.name}</div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Phone className="size-3" /> {vendor.phone} · {vendor.rating}★{vendor.preferred && " · preferred"}
                </div>
              </>
            ) : (
              <div className="text-sm text-muted-foreground">Not assigned yet</div>
            )}
          </div>
          <div className="rounded-md border p-3">
            <div className="mb-1 text-xs font-medium text-muted-foreground">Estimate</div>
            {vendor ? (
              <>
                <div className="text-sm font-medium tabular-nums">
                  ${wo.estimate_low}–${wo.estimate_high}
                </div>
                <div className="text-xs text-muted-foreground">
                  {wo.needs_approval
                    ? `Over your $${approvalLimit} limit — needs approval`
                    : wo.urgency === "emergency"
                      ? "Emergency — dispatch without waiting"
                      : `Within your $${approvalLimit} limit`}
                </div>
              </>
            ) : (
              <div className="text-sm text-muted-foreground">—</div>
            )}
          </div>
        </div>

        {wo.scope && (
          <div className="text-sm">
            <span className="font-medium">Scope: </span>
            {wo.scope}
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">To tenant{unit ? ` · ${unit.tenant_name} (${unit.tenant_phone})` : ""}</span>
              <CopyButton text={wo.tenant_message} />
            </div>
            <div className="rounded-2xl rounded-tl-sm bg-primary/10 px-3 py-2 text-sm whitespace-pre-wrap">{wo.tenant_message}</div>
          </div>
          {wo.vendor_message && (
            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">To vendor</span>
                <CopyButton text={wo.vendor_message} />
              </div>
              <div className="rounded-2xl rounded-tl-sm bg-muted px-3 py-2 text-sm whitespace-pre-wrap">{wo.vendor_message}</div>
            </div>
          )}
        </div>

        {open && wo.status !== "awaiting_tenant" && (
          <div className="flex flex-wrap items-center gap-2 border-t pt-4">
            <Button onClick={() => onStatus("dispatched")} variant={wo.urgency === "emergency" ? "destructive" : "default"}>
              <Send />
              {wo.urgency === "emergency"
                ? "Send now"
                : wo.needs_approval
                  ? `Approve $${wo.estimate_high} & send`
                  : "Approve & send"}
            </Button>
            <span className="text-xs text-muted-foreground">Marks both messages as sent (demo — no real SMS).</span>
          </div>
        )}
        {wo.status === "dispatched" && (
          <div className="flex items-center gap-2 border-t pt-4">
            <Button variant="outline" onClick={() => onStatus("resolved")}>
              <CheckCircle2 /> Mark resolved
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
