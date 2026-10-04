"use client";

import { useState } from "react";
import { Check, Copy, MessageSquareQuote, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Recommendation, Scorecard } from "@/lib/data/types";
import { cn } from "@/lib/utils";

export const REC_STYLE: Record<Recommendation, { label: string; variant: "success" | "warning" | "danger" }> = {
  advance: { label: "Advance", variant: "success" },
  hold: { label: "Hold — review", variant: "warning" },
  reject: { label: "Decline", variant: "danger" },
};

function ScorePips({ score }: { score: number }) {
  return (
    <div className="flex gap-0.5" aria-label={`${score} of 4`}>
      {[1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className={cn(
            "h-2 w-5 rounded-sm",
            i <= score
              ? score >= 3
                ? "bg-emerald-500"
                : score === 2
                  ? "bg-amber-500"
                  : "bg-red-500"
              : "bg-muted"
          )}
        />
      ))}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? <Check /> : <Copy />} {done ? "Copied" : "Copy email"}
    </Button>
  );
}

export function ScorecardView({ card }: { card: Scorecard }) {
  const rec = REC_STYLE[card.recommendation];
  return (
    <div className="space-y-4">
      <Card className="gap-4">
        <CardHeader className="flex flex-row items-start gap-5">
          <div className="flex size-20 shrink-0 flex-col items-center justify-center rounded-full border-4 border-primary/20">
            <span className="text-2xl font-bold tabular-nums">{Math.round(card.overall_score)}</span>
            <span className="text-[10px] text-muted-foreground">/ 100</span>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant={rec.variant} className="text-sm">
                AI recommends: {rec.label}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {new Date(card.created_at).toLocaleString()}
              </span>
            </div>
            <p className="text-sm leading-relaxed">{card.summary}</p>
          </div>
        </CardHeader>
      </Card>

      <Card className="gap-3">
        <CardHeader>
          <CardTitle className="text-base">Rubric</CardTitle>
          <CardDescription>Each score is backed by quotes verified verbatim against the resume.</CardDescription>
        </CardHeader>
        <CardContent className="divide-y">
          {card.criteria.map((c) => (
            <div key={c.criterion_id} className="space-y-1.5 py-3 first:pt-0 last:pb-0">
              <div className="flex items-center gap-3">
                <ScorePips score={c.score} />
                <span className="text-sm font-medium">{c.label}</span>
                {c.must_have && (
                  <Badge variant="outline" className="text-[10px]">
                    must-have
                  </Badge>
                )}
                <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                  {c.score}/4 · w{c.weight}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">{c.rationale}</p>
              {c.evidence.length > 0 && (
                <ul className="space-y-1">
                  {c.evidence.map((e, i) => (
                    <li key={i} className="flex gap-1.5 border-l-2 border-primary/30 pl-2 text-xs italic">
                      <MessageSquareQuote className="mt-0.5 size-3 shrink-0 not-italic text-primary/60" />
                      {e}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="gap-3">
          <CardHeader>
            <CardTitle className="text-base text-emerald-700 dark:text-emerald-400">Strengths</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1 pl-4 text-sm">
              {card.strengths.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card className="gap-3">
          <CardHeader>
            <CardTitle className="text-base text-amber-700 dark:text-amber-400">Gaps to probe</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1 pl-4 text-sm">
              {card.concerns.length ? card.concerns.map((s, i) => <li key={i}>{s}</li>) : <li>None noted</li>}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card className="gap-3">
        <CardHeader>
          <CardTitle className="text-base">Interview plan</CardTitle>
          <CardDescription>Targets the weakest-evidenced criteria.</CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal space-y-1.5 pl-5 text-sm">
            {card.interview_questions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ol>
        </CardContent>
      </Card>

      {card.outreach_body && (
        <Card className="gap-3">
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="space-y-1.5">
              <CardTitle className="text-base">
                {card.recommendation === "reject" ? "Decline note (draft)" : "Outreach email (draft)"}
              </CardTitle>
              <CardDescription>Review before sending — nothing is sent automatically.</CardDescription>
            </div>
            <CopyButton text={`Subject: ${card.outreach_subject ?? ""}\n\n${card.outreach_body}`} />
          </CardHeader>
          <CardContent>
            <div className="rounded-md border bg-muted/30 p-4 text-sm">
              <div className="mb-3 border-b pb-2 font-medium">Subject: {card.outreach_subject}</div>
              <div className="whitespace-pre-wrap leading-relaxed">{card.outreach_body}</div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex items-start gap-2 rounded-md border border-dashed p-3 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" />
        <div>
          Passed fairness lint on all generated text.
          {card.fairness_notes.length > 0 && (
            <ul className="mt-1 list-disc pl-4">
              {card.fairness_notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
