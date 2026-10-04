"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Briefcase, Database, FileText, FolderOpen, LayoutList, Play, ScanSearch, ThumbsDown, ThumbsUp, Pause } from "lucide-react";

import { AddCandidateDialog } from "@/components/add-candidate-dialog";
import { AgentPanel, type AgentPanelHandle } from "@/components/agent-panel";
import { REC_STYLE, ScorecardView } from "@/components/scorecard-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { TranscriptEntry } from "@/lib/agent/events";
import type { Candidate, Job, Scorecard, Stage, StoredFile, Todo } from "@/lib/data/types";
import { cn } from "@/lib/utils";

type Status = { storage: "supabase" | "memory"; llmConfigured: boolean; model: string; subagentModel: string };
type Detail = {
  candidate: Candidate;
  scorecard: Scorecard | null;
  transcript: TranscriptEntry[];
  files: Record<string, StoredFile>;
  todos: Todo[];
};

const STAGE_STYLE: Record<Stage, string> = {
  new: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
  screened: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  advance: "bg-emerald-600/15 text-emerald-700 dark:text-emerald-400",
  hold: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  reject: "bg-red-600/15 text-red-700 dark:text-red-400",
};

function StageBadge({ stage }: { stage: Stage }) {
  return <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-medium capitalize", STAGE_STYLE[stage])}>{stage}</span>;
}

const PIPELINE = "__pipeline__";

export function Workspace() {
  const [status, setStatus] = useState<Status | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobId, setJobId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [scorecards, setScorecards] = useState<Record<string, Scorecard>>({});
  const [selected, setSelected] = useState<string>(PIPELINE);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [files, setFiles] = useState<Record<string, StoredFile>>({});
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState("scorecard");
  const [loadError, setLoadError] = useState<string | null>(null);
  const panel = useRef<AgentPanelHandle>(null);

  const job = useMemo(() => jobs.find((j) => j.id === jobId) ?? null, [jobs, jobId]);

  useEffect(() => {
    fetch("/api/status").then((r) => r.json()).then(setStatus).catch(() => {});
    fetch("/api/jobs")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setJobs(d.jobs);
        if (d.jobs[0]) {
          setJobId(d.jobs[0].id);
          return fetch(`/api/jobs/${d.jobs[0].id}/candidates`)
            .then((r) => r.json())
            .then((p) => {
              setCandidates(p.candidates ?? []);
              setScorecards(p.scorecards ?? {});
            });
        }
      })
      .catch((e) => setLoadError(e.message));
  }, []);

  const loadPipeline = useCallback(async (id: string) => {
    const d = await fetch(`/api/jobs/${id}/candidates`).then((r) => r.json());
    setCandidates(d.candidates ?? []);
    setScorecards(d.scorecards ?? {});
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    const d = await fetch(`/api/candidates/${id}`).then((r) => r.json());
    setDetail(d);
    setFiles(d.files ?? {});
  }, []);

  const select = useCallback(
    (id: string) => {
      setSelected(id);
      setDetail(null);
      setFiles({});
      setTab("scorecard");
      if (id !== PIPELINE) loadDetail(id);
    },
    [loadDetail]
  );

  const selectJob = useCallback(
    (id: string) => {
      setJobId(id);
      select(PIPELINE);
      loadPipeline(id);
    },
    [select, loadPipeline]
  );

  const refresh = useCallback(() => {
    if (jobId) loadPipeline(jobId);
    if (selected !== PIPELINE)
      fetch(`/api/candidates/${selected}`)
        .then((r) => r.json())
        .then((d) => setDetail((prev) => (prev ? { ...prev, candidate: d.candidate, scorecard: d.scorecard } : prev)));
  }, [jobId, selected, loadPipeline]);

  async function setStage(stage: Stage) {
    if (selected === PIPELINE) return;
    await fetch(`/api/candidates/${selected}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage }),
    });
    refresh();
  }

  const ranked = useMemo(
    () =>
      [...candidates].sort(
        (a, b) => (scorecards[b.id]?.overall_score ?? -1) - (scorecards[a.id]?.overall_score ?? -1)
      ),
    [candidates, scorecards]
  );

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

  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh">
      {/* Header */}
      <header className="flex flex-wrap items-center gap-3 border-b px-4 py-2.5">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <ScanSearch className="size-4" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold">ScreenPilot</div>
            <div className="text-[11px] text-muted-foreground">Evidence-based resume screening agent</div>
          </div>
        </div>
        <div className="flex max-w-full gap-1 overflow-x-auto lg:ml-4">
          {jobs.map((j) => (
            <Button
              key={j.id}
              size="sm"
              variant={j.id === jobId ? "secondary" : "ghost"}
              onClick={() => selectJob(j.id)}
              disabled={busy}
            >
              <Briefcase /> {j.title}
            </Button>
          ))}
        </div>
        <div className="ml-auto hidden items-center gap-2 md:flex">
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

      <div className="grid flex-1 grid-cols-1 lg:min-h-0 lg:grid-cols-[260px_minmax(0,1fr)_420px]">
        {/* Pipeline sidebar */}
        <aside className="flex max-h-72 flex-col border-b lg:max-h-none lg:min-h-0 lg:border-r lg:border-b-0">
          <div className="space-y-2 p-3">
            <button
              type="button"
              onClick={() => select(PIPELINE)}
              disabled={busy}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-accent",
                selected === PIPELINE && "bg-accent font-medium"
              )}
            >
              <LayoutList className="size-4" /> Pipeline overview
            </button>
            {jobId && (
              <AddCandidateDialog
                jobId={jobId}
                onCreated={(c) => {
                  loadPipeline(jobId);
                  select(c.id);
                }}
              />
            )}
          </div>
          <div className="px-3 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            Candidates ({candidates.length})
          </div>
          <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
            {candidates.length === 0 && !jobId && <Skeleton className="h-12" />}
            {candidates.map((c) => {
              const s = scorecards[c.id];
              return (
                <button
                  key={c.id}
                  type="button"
                  disabled={busy}
                  onClick={() => select(c.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left hover:bg-accent disabled:opacity-60",
                    selected === c.id && "bg-accent"
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{c.name}</div>
                    <div className="truncate text-xs text-muted-foreground">{c.headline}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {s && <span className="text-xs font-semibold tabular-nums">{Math.round(s.overall_score)}</span>}
                    <StageBadge stage={c.stage} />
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* Main */}
        <main className="lg:min-h-0 lg:overflow-y-auto">
          {selected === PIPELINE ? (
            <div className="mx-auto max-w-3xl space-y-4 p-4 lg:p-6">
              {job ? (
                <>
                  <div>
                    <h1 className="text-xl font-semibold">{job.title}</h1>
                    <p className="text-sm text-muted-foreground">
                      {job.company} · {job.team} · {job.location} · {job.comp_range}
                    </p>
                    <p className="mt-2 text-sm">{job.summary}</p>
                  </div>
                  <Card className="gap-3">
                    <CardHeader>
                      <CardTitle className="text-base">Hiring manager rubric</CardTitle>
                      <CardDescription>
                        The agent scores each criterion 0–4 with verbatim evidence. Weights and must-haves drive the
                        recommendation deterministically.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <table className="w-full text-sm">
                        <tbody className="divide-y">
                          {job.criteria.map((c) => (
                            <tr key={c.id} className="align-top">
                              <td className="py-2 pr-3">
                                <div className="font-medium">{c.label}</div>
                                <div className="text-xs text-muted-foreground">{c.signals}</div>
                              </td>
                              <td className="py-2 text-right whitespace-nowrap">
                                <span className="text-xs text-muted-foreground">weight {c.weight}</span>
                                {c.must_have && (
                                  <Badge variant="outline" className="ml-2 text-[10px]">
                                    must-have
                                  </Badge>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </CardContent>
                  </Card>
                  <Card className="gap-3">
                    <CardHeader>
                      <CardTitle className="text-base">Ranked pipeline</CardTitle>
                      <CardDescription>Select a candidate to screen them, or ask the agent to compare.</CardDescription>
                    </CardHeader>
                    <CardContent className="divide-y">
                      {ranked.map((c) => {
                        const s = scorecards[c.id];
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => select(c.id)}
                            disabled={busy}
                            className="flex w-full items-center gap-3 py-2.5 text-left hover:opacity-80"
                          >
                            <span className="w-10 text-lg font-semibold tabular-nums">
                              {s ? Math.round(s.overall_score) : "—"}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-medium">{c.name}</div>
                              <div className="truncate text-xs text-muted-foreground">
                                {s ? s.summary : "Not screened yet"}
                              </div>
                            </div>
                            {s && <Badge variant={REC_STYLE[s.recommendation].variant}>{REC_STYLE[s.recommendation].label}</Badge>}
                            <StageBadge stage={c.stage} />
                          </button>
                        );
                      })}
                    </CardContent>
                  </Card>
                </>
              ) : (
                <Skeleton className="h-64" />
              )}
            </div>
          ) : !detail ? (
            <div className="space-y-3 p-6">
              <Skeleton className="h-10 w-1/2" />
              <Skeleton className="h-40" />
              <Skeleton className="h-64" />
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-4 p-4 lg:p-6">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h1 className="text-xl font-semibold">{detail.candidate.name}</h1>
                    <StageBadge stage={detail.candidate.stage} />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {detail.candidate.headline} {detail.candidate.source && `· via ${detail.candidate.source}`}
                  </p>
                </div>
                <Button
                  onClick={() => panel.current?.send("Screen this candidate against the job rubric.")}
                  disabled={busy || Boolean(disabledReason)}
                >
                  <Play /> {detail.scorecard ? "Re-run screen" : "Run AI screen"}
                </Button>
              </div>

              {detail.scorecard && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-2.5">
                  <span className="px-1 text-xs font-medium text-muted-foreground">Your decision:</span>
                  <Button size="sm" variant={detail.candidate.stage === "advance" ? "default" : "outline"} onClick={() => setStage("advance")}>
                    <ThumbsUp /> Advance
                  </Button>
                  <Button size="sm" variant={detail.candidate.stage === "hold" ? "default" : "outline"} onClick={() => setStage("hold")}>
                    <Pause /> Hold
                  </Button>
                  <Button size="sm" variant={detail.candidate.stage === "reject" ? "default" : "outline"} onClick={() => setStage("reject")}>
                    <ThumbsDown /> Decline
                  </Button>
                </div>
              )}

              <Tabs value={tab} onValueChange={setTab}>
                <TabsList>
                  <TabsTrigger value="scorecard">Scorecard</TabsTrigger>
                  <TabsTrigger value="resume">
                    <FileText /> Resume
                  </TabsTrigger>
                  <TabsTrigger value="files">
                    <FolderOpen /> Agent files {workspaceFiles.length > 0 && `(${workspaceFiles.length})`}
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="scorecard" className="mt-2">
                  {detail.scorecard ? (
                    <ScorecardView card={detail.scorecard} />
                  ) : (
                    <Card>
                      <CardContent className="py-10 text-center text-sm text-muted-foreground">
                        {busy ? "The agent is screening — watch its steps on the right." : "Not screened yet. Click “Run AI screen”."}
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>
                <TabsContent value="resume" className="mt-2">
                  <Card>
                    <CardContent>
                      <pre className="font-sans text-sm leading-relaxed whitespace-pre-wrap">{detail.candidate.resume_text}</pre>
                    </CardContent>
                  </Card>
                </TabsContent>
                <TabsContent value="files" className="mt-2 space-y-3">
                  {workspaceFiles.length === 0 ? (
                    <Card>
                      <CardContent className="py-8 text-center text-sm text-muted-foreground">
                        The agent&apos;s virtual filesystem (working notes such as evidence.md) appears here.
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
          {jobId && (selected === PIPELINE || detail) ? (
            <AgentPanel
              key={`${jobId}:${selected}`}
              ref={panel}
              jobId={jobId}
              candidateId={selected === PIPELINE ? null : selected}
              title={selected === PIPELINE ? `Pipeline · ${job?.title ?? ""}` : `Screening ${detail?.candidate.name}`}
              suggestions={
                selected === PIPELINE
                  ? ["Who should I interview first, and why?", "Compare the screened candidates on the must-haves"]
                  : detail?.scorecard
                    ? ["Explain the lowest-scoring must-have", "Make the email shorter and warmer", "What should I probe in the phone screen?"]
                    : ["Screen this candidate against the job rubric."]
              }
              transcript={selected === PIPELINE ? [] : (detail?.transcript ?? [])}
              initialTodos={selected === PIPELINE ? [] : (detail?.todos ?? [])}
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
