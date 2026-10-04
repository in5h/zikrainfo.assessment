"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Building2, Database, FolderOpen, Inbox, KanbanSquare, Mail, MessageSquare, Monitor, Play, Wrench } from "lucide-react";

import { AgentPanel, type AgentPanelHandle } from "@/components/agent-panel";
import { NewRequestDialog } from "@/components/new-request-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { STATUS_LABEL, URGENCY_STYLE, WorkOrderCard, timeLeft } from "@/components/work-order-card";
import type { TranscriptEntry } from "@/lib/agent/events";
import type {
  Landlord,
  MaintenanceRequest,
  RequestStatus,
  StoredFile,
  Todo,
  Unit,
  Urgency,
  Vendor,
  WorkOrder,
} from "@/lib/data/types";
import { cn } from "@/lib/utils";

type Status = { storage: "supabase" | "memory"; llmConfigured: boolean; model: string; subagentModel: string };
type InboxData = { landlord: Landlord; requests: MaintenanceRequest[]; units: Unit[]; vendors: Vendor[]; workOrders: WorkOrder[] };
type Detail = {
  request: MaintenanceRequest;
  unit: Unit | null;
  workOrders: WorkOrder[];
  transcript: TranscriptEntry[];
  files: Record<string, StoredFile>;
  todos: Todo[];
};

const REQ_STATUS: Record<RequestStatus, { label: string; cls: string }> = {
  new: { label: "New", cls: "bg-blue-500/15 text-blue-700 dark:text-blue-300" },
  triaged: { label: "Ready to send", cls: "bg-violet-500/15 text-violet-700 dark:text-violet-300" },
  awaiting_tenant: { label: "Waiting on tenant", cls: "bg-slate-500/15 text-slate-700 dark:text-slate-300" },
  needs_approval: { label: "Needs approval", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  dispatched: { label: "Dispatched", cls: "bg-emerald-600/15 text-emerald-700 dark:text-emerald-400" },
  resolved: { label: "Resolved", cls: "bg-muted text-muted-foreground" },
};

const CHANNEL_ICON = { sms: MessageSquare, email: Mail, portal: Monitor };
const RANK: Record<Urgency, number> = { emergency: 0, urgent: 1, routine: 2 };
const BOARD = "__board__";

function ago(iso: string) {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 60) return `${m}m ago`;
  if (m < 48 * 60) return `${Math.round(m / 60)}h ago`;
  return `${Math.round(m / 1440)}d ago`;
}

function topUrgency(orders: WorkOrder[]): Urgency | null {
  return orders.reduce<Urgency | null>((best, w) => (best === null || RANK[w.urgency] < RANK[best] ? w.urgency : best), null);
}

export function Workspace() {
  const [status, setStatus] = useState<Status | null>(null);
  const [data, setData] = useState<InboxData | null>(null);
  const [selected, setSelected] = useState<string>(BOARD);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [files, setFiles] = useState<Record<string, StoredFile>>({});
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState("work");
  const [loadError, setLoadError] = useState<string | null>(null);
  const panel = useRef<AgentPanelHandle>(null);

  const loadInbox = useCallback(async () => {
    const d = await fetch("/api/inbox").then((r) => r.json());
    if (d.error) throw new Error(d.error);
    setData(d);
  }, []);

  useEffect(() => {
    fetch("/api/status").then((r) => r.json()).then(setStatus).catch(() => {});
    fetch("/api/inbox")
      .then((r) => r.json())
      .then((d) => (d.error ? setLoadError(d.error) : setData(d)))
      .catch((e) => setLoadError(e.message));
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    const d = await fetch(`/api/requests/${id}`).then((r) => r.json());
    setDetail(d);
    setFiles(d.files ?? {});
  }, []);

  const select = useCallback(
    (id: string) => {
      setSelected(id);
      setDetail(null);
      setFiles({});
      setTab("work");
      if (id !== BOARD) loadDetail(id);
    },
    [loadDetail]
  );

  const refresh = useCallback(() => {
    loadInbox().catch(() => {});
    if (selected !== BOARD)
      fetch(`/api/requests/${selected}`)
        .then((r) => r.json())
        .then((d) => setDetail((prev) => (prev ? { ...prev, request: d.request, workOrders: d.workOrders } : prev)));
  }, [selected, loadInbox]);

  async function setWorkOrderStatus(id: string, s: "dispatched" | "resolved") {
    await fetch(`/api/work-orders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: s }),
    });
    refresh();
  }

  const unitOf = useCallback((id: string) => data?.units.find((u) => u.id === id) ?? null, [data]);
  const vendorOf = useCallback((id: string | null) => data?.vendors.find((v) => v.id === id) ?? null, [data]);

  // Inbox: untriaged first (newest), then by urgency of their work orders.
  const inbox = useMemo(() => {
    if (!data) return [];
    return data.requests
      .map((r) => {
        const orders = data.workOrders.filter((w) => w.request_id === r.id);
        return { r, orders, urgency: topUrgency(orders) };
      })
      .sort((a, b) => {
        const ra = a.r.status === "resolved" ? 9 : a.urgency ? RANK[a.urgency] + 1 : 0;
        const rb = b.r.status === "resolved" ? 9 : b.urgency ? RANK[b.urgency] + 1 : 0;
        return ra - rb || b.r.received_at.localeCompare(a.r.received_at);
      });
  }, [data]);

  const openOrders = useMemo(
    () =>
      (data?.workOrders ?? [])
        .filter((w) => w.status !== "resolved" && data?.requests.some((r) => r.id === w.request_id))
        .sort((a, b) => a.respond_by.localeCompare(b.respond_by)),
    [data]
  );
  const untriaged = data?.requests.filter((r) => r.status === "new").length ?? 0;

  const disabledReason =
    status && !status.llmConfigured ? "ANTHROPIC_API_KEY is not set on the server — the agent is disabled." : undefined;
  const workspaceFiles = Object.entries(files).filter(([p]) => !p.startsWith("/skills/"));

  if (loadError) {
    return (
      <div className="mx-auto max-w-lg p-10 text-sm">
        <h1 className="mb-2 text-lg font-semibold">Couldn&apos;t load data</h1>
        <p className="text-muted-foreground">{loadError}</p>
        <p className="mt-2 text-muted-foreground">If using Supabase, run the SQL in supabase/migrations first.</p>
      </div>
    );
  }

  const unit = detail?.unit ?? null;

  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh">
      <header className="flex flex-wrap items-center gap-3 border-b px-4 py-2.5">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Wrench className="size-4" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold">FixDesk</div>
            <div className="text-[11px] text-muted-foreground">Maintenance triage agent{data ? ` · ${data.landlord.name}` : ""}</div>
          </div>
        </div>
        <div className="ml-auto hidden items-center gap-2 md:flex">
          {data && <Badge variant="outline">Approval limit ${data.landlord.approval_limit}</Badge>}
          {status && (
            <>
              <Badge variant="outline" className="gap-1">
                <Database className="size-3" /> {status.storage === "supabase" ? "Supabase" : "In-memory demo store"}
              </Badge>
              <Badge variant="outline">{status.model}</Badge>
            </>
          )}
        </div>
      </header>

      <div className="grid flex-1 grid-cols-1 lg:min-h-0 lg:grid-cols-[290px_minmax(0,1fr)_420px]">
        {/* Inbox */}
        <aside className="flex max-h-80 flex-col border-b lg:max-h-none lg:min-h-0 lg:border-r lg:border-b-0">
          <div className="space-y-2 p-3">
            <button
              type="button"
              onClick={() => select(BOARD)}
              disabled={busy}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-accent",
                selected === BOARD && "bg-accent font-medium"
              )}
            >
              <KanbanSquare className="size-4" /> Today&apos;s board
              {untriaged > 0 && <span className="ml-auto rounded-full bg-blue-600 px-1.5 text-[11px] text-white">{untriaged} new</span>}
            </button>
            {data && <NewRequestDialog units={data.units} onCreated={(r) => loadInbox().then(() => select(r.id))} />}
          </div>
          <div className="flex items-center gap-1.5 px-3 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            <Inbox className="size-3" /> Inbox ({data?.requests.length ?? 0})
          </div>
          <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
            {!data && <Skeleton className="h-16" />}
            {inbox.map(({ r, urgency }) => {
              const u = unitOf(r.unit_id);
              const Icon = CHANNEL_ICON[r.channel];
              return (
                <button
                  key={r.id}
                  type="button"
                  disabled={busy}
                  onClick={() => select(r.id)}
                  className={cn(
                    "relative w-full rounded-md py-2 pr-2.5 pl-3.5 text-left hover:bg-accent disabled:opacity-60",
                    selected === r.id && "bg-accent",
                    r.status === "resolved" && "opacity-60"
                  )}
                >
                  {urgency && <span className={cn("absolute top-2 bottom-2 left-1 w-1 rounded", URGENCY_STYLE[urgency].bar)} />}
                  <div className="flex items-center gap-1.5">
                    <Icon className="size-3 text-muted-foreground" />
                    <span className="truncate text-sm font-medium">
                      {u ? `${u.property_name} ${u.unit_label}` : r.unit_id}
                    </span>
                    <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">{ago(r.received_at)}</span>
                  </div>
                  <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{r.message}</div>
                  <div className="mt-1 flex gap-1">
                    <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", REQ_STATUS[r.status].cls)}>
                      {REQ_STATUS[r.status].label}
                    </span>
                    {urgency && (
                      <span className="rounded border px-1.5 py-0.5 text-[10px] font-medium">{URGENCY_STYLE[urgency].label}</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* Main */}
        <main className="lg:min-h-0 lg:overflow-y-auto">
          {selected === BOARD ? (
            <div className="mx-auto max-w-4xl space-y-4 p-4 lg:p-6">
              <div>
                <h1 className="text-xl font-semibold">Today&apos;s board</h1>
                <p className="text-sm text-muted-foreground">
                  {untriaged} request{untriaged === 1 ? "" : "s"} waiting for triage · {openOrders.length} open work order
                  {openOrders.length === 1 ? "" : "s"}. Open a request and click <b>Triage with agent</b>.
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                {(["emergency", "urgent", "routine"] as const).map((level) => {
                  const col = openOrders.filter((w) => w.urgency === level);
                  return (
                    <div key={level} className="rounded-lg border bg-muted/30">
                      <div className="flex items-center gap-2 border-b px-3 py-2">
                        <span className={cn("size-2 rounded-full", URGENCY_STYLE[level].bar)} />
                        <span className="text-sm font-medium">{URGENCY_STYLE[level].label}</span>
                        <span className="ml-auto text-xs text-muted-foreground">{col.length}</span>
                      </div>
                      <div className="space-y-2 p-2">
                        {col.length === 0 && <div className="px-1 py-3 text-xs text-muted-foreground">Nothing here.</div>}
                        {col.map((w) => {
                          const u = unitOf(w.unit_id);
                          return (
                            <button
                              key={w.id}
                              type="button"
                              onClick={() => select(w.request_id)}
                              className="w-full rounded-md border bg-card p-2.5 text-left text-sm shadow-xs hover:border-primary/40"
                            >
                              <div className="font-medium">{w.category}</div>
                              <div className="text-xs text-muted-foreground">
                                {u ? `${u.property_name} ${u.unit_label}` : w.unit_id} · {vendorOf(w.vendor_id)?.name ?? "no vendor"}
                              </div>
                              <div className="mt-1.5 flex items-center justify-between text-[11px]">
                                <span className="rounded bg-muted px-1.5 py-0.5">{STATUS_LABEL[w.status]}</span>
                                {w.status !== "dispatched" && <span className="text-muted-foreground">{timeLeft(w.respond_by)}</span>}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
              <Card className="gap-3">
                <CardHeader>
                  <CardTitle className="text-base">How triage works</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3 text-sm sm:grid-cols-3">
                  <div>
                    <div className="font-medium">1 · Agent reads &amp; quotes</div>
                    <p className="text-muted-foreground">Splits the message into issues and quotes the tenant word for word as evidence.</p>
                  </div>
                  <div>
                    <div className="font-medium">2 · Rules decide</div>
                    <p className="text-muted-foreground">
                      A fixed rule table sets urgency and response time. A keyword safety net can only escalate.
                    </p>
                  </div>
                  <div>
                    <div className="font-medium">3 · You send</div>
                    <p className="text-muted-foreground">Drafts are checked and saved. Nothing goes out until you click Send.</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : !detail ? (
            <div className="space-y-3 p-6">
              <Skeleton className="h-10 w-1/2" />
              <Skeleton className="h-32" />
              <Skeleton className="h-64" />
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-4 p-4 lg:p-6">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h1 className="text-xl font-semibold">
                      {unit ? `${unit.property_name} · Unit ${unit.unit_label}` : detail.request.unit_id}
                    </h1>
                    <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-medium", REQ_STATUS[detail.request.status].cls)}>
                      {REQ_STATUS[detail.request.status].label}
                    </span>
                  </div>
                  {unit && (
                    <p className="text-sm text-muted-foreground">
                      {unit.tenant_name} · {unit.tenant_phone} · {unit.address}
                    </p>
                  )}
                </div>
                <Button
                  onClick={() => panel.current?.send("Triage this request.")}
                  disabled={busy || Boolean(disabledReason)}
                  variant={detail.workOrders.length ? "outline" : "default"}
                >
                  <Play /> {detail.workOrders.length ? "Re-triage" : "Triage with agent"}
                </Button>
              </div>

              <div className="rounded-2xl rounded-tl-sm border bg-card p-4 shadow-xs">
                <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                  {(() => {
                    const Icon = CHANNEL_ICON[detail.request.channel];
                    return <Icon className="size-3" />;
                  })()}
                  {unit?.tenant_name} via {detail.request.channel} · {ago(detail.request.received_at)}
                </div>
                <p className="text-[15px] leading-relaxed">{detail.request.message}</p>
              </div>

              <Tabs value={tab} onValueChange={setTab}>
                <TabsList>
                  <TabsTrigger value="work">
                    <Wrench /> Work orders {detail.workOrders.length > 0 && `(${detail.workOrders.length})`}
                  </TabsTrigger>
                  <TabsTrigger value="unit">
                    <Building2 /> Unit
                  </TabsTrigger>
                  <TabsTrigger value="files">
                    <FolderOpen /> Agent files {workspaceFiles.length > 0 && `(${workspaceFiles.length})`}
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="work" className="mt-2 space-y-4">
                  {detail.workOrders.length === 0 ? (
                    <Card>
                      <CardContent className="py-10 text-center text-sm text-muted-foreground">
                        {busy ? "The agent is triaging. Watch its steps on the right." : "Not triaged yet. Click “Triage with agent”."}
                      </CardContent>
                    </Card>
                  ) : (
                    detail.workOrders.map((w) => (
                      <WorkOrderCard
                        key={w.id}
                        wo={w}
                        unit={unit}
                        vendor={vendorOf(w.vendor_id)}
                        approvalLimit={data?.landlord.approval_limit ?? 0}
                        onStatus={(s) => setWorkOrderStatus(w.id, s)}
                      />
                    ))
                  )}
                </TabsContent>
                <TabsContent value="unit" className="mt-2">
                  {unit && (
                    <Card className="gap-3">
                      <CardContent className="space-y-3 text-sm">
                        <div>
                          <div className="text-xs font-medium text-muted-foreground">Shutoffs</div>
                          {unit.shutoffs}
                        </div>
                        <div>
                          <div className="text-xs font-medium text-muted-foreground">Access</div>
                          {unit.access_notes}
                        </div>
                        <div>
                          <div className="text-xs font-medium text-muted-foreground">Equipment</div>
                          <ul className="list-disc pl-5">
                            {unit.appliances.map((a, i) => (
                              <li key={i}>
                                {a.type}
                                {a.fuel && ` (${a.fuel})`}
                                {a.age_years != null && ` · ${a.age_years} yrs`}
                                {a.notes && ` · ${a.notes}`}
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <div className="text-xs font-medium text-muted-foreground">Repair history</div>
                          {(() => {
                            const hist = (data?.workOrders ?? []).filter((w) => w.unit_id === unit.id && w.request_id !== detail.request.id);
                            return hist.length ? (
                              <ul className="space-y-1">
                                {hist.map((w) => (
                                  <li key={w.id} className="text-xs">
                                    <span className="tabular-nums text-muted-foreground">{w.created_at.slice(0, 10)}</span> · {w.category} ·{" "}
                                    {w.scope}
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="text-xs text-muted-foreground">No previous work orders.</p>
                            );
                          })()}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>
                <TabsContent value="files" className="mt-2 space-y-3">
                  {workspaceFiles.length === 0 ? (
                    <Card>
                      <CardContent className="py-8 text-center text-sm text-muted-foreground">
                        The agent&apos;s virtual filesystem (e.g. the owner note) appears here.
                      </CardContent>
                    </Card>
                  ) : (
                    workspaceFiles.map(([path, f]) => (
                      <Card key={path} className="gap-2 py-4">
                        <CardHeader>
                          <CardTitle className="font-mono text-xs">{path}</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <pre className="max-h-96 overflow-auto text-xs whitespace-pre-wrap">{f.content}</pre>
                        </CardContent>
                      </Card>
                    ))
                  )}
                </TabsContent>
              </Tabs>
            </div>
          )}
        </main>

        {/* Agent */}
        <aside className="flex h-[85dvh] flex-col border-t lg:h-auto lg:min-h-0 lg:border-t-0 lg:border-l">
          {data && (selected === BOARD || detail) ? (
            <AgentPanel
              key={selected}
              ref={panel}
              requestId={selected === BOARD ? null : selected}
              title={selected === BOARD ? `Portfolio · ${data.landlord.name}` : `Request from ${unit?.tenant_name ?? ""}`}
              suggestions={
                selected === BOARD
                  ? ["What needs my attention right now?", "Which open jobs need my approval?"]
                  : detail?.workOrders.length
                    ? ["Make the tenant text shorter", "Why this urgency?", "Use a cheaper vendor if it's safe to"]
                    : ["Triage this request."]
              }
              transcript={selected === BOARD ? [] : (detail?.transcript ?? [])}
              initialTodos={selected === BOARD ? [] : (detail?.todos ?? [])}
              disabledReason={disabledReason}
              onFiles={(f) => setFiles((prev) => ({ ...prev, ...f }))}
              onSaved={refresh}
              onBusy={setBusy}
            />
          ) : (
            <div className="p-4">
              <Skeleton className="h-full min-h-60" />
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
