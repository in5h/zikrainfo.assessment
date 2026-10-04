"use client";

import { useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  Bot,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Database,
  FileText,
  ListTodo,
  Loader2,
  Save,
  Scale,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

export type Step = {
  id: string;
  name: string;
  args: unknown;
  result?: string;
  subagent?: boolean;
};

const META: Record<string, { label: string; icon: LucideIcon }> = {
  write_todos: { label: "Updated plan", icon: ListTodo },
  get_job_requisition: { label: "Read job rubric", icon: ClipboardList },
  get_candidate_profile: { label: "Read resume", icon: FileText },
  list_pipeline: { label: "Read pipeline", icon: Users },
  task: { label: "Delegated to evidence-extractor", icon: Bot },
  score_candidate: { label: "Scored & verified evidence", icon: Scale },
  fairness_check: { label: "Fairness check", icon: ShieldCheck },
  save_scorecard: { label: "Saved scorecard", icon: Save },
  read_file: { label: "Read file", icon: BookOpen },
  write_file: { label: "Wrote file", icon: FileText },
  edit_file: { label: "Edited file", icon: FileText },
  ls: { label: "Listed files", icon: Database },
};

function parse(s?: string): Record<string, unknown> | null {
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/** One-line, human status for a finished tool call. */
function outcome(step: Step): { text: string; tone: "ok" | "warn" } | null {
  if (step.result === undefined) return null;
  const r = parse(step.result);
  const args = (step.args ?? {}) as Record<string, unknown>;
  switch (step.name) {
    case "score_candidate":
      return r?.ok
        ? { text: `${r.overall_score}/100 → ${r.recommendation}`, tone: "ok" }
        : { text: `${(r?.problems as unknown[] | undefined)?.length ?? "?"} problem(s) — revising`, tone: "warn" };
    case "fairness_check":
      return r?.clean
        ? { text: "clean", tone: "ok" }
        : { text: `${(r?.flags as unknown[] | undefined)?.length ?? "?"} flag(s) — rewriting`, tone: "warn" };
    case "save_scorecard":
      return r?.saved ? { text: "saved to pipeline", tone: "ok" } : { text: "refused — fixing", tone: "warn" };
    case "read_file":
    case "write_file":
    case "edit_file":
      return { text: String(args.file_path ?? args.path ?? ""), tone: "ok" };
    case "task":
      return { text: "evidence returned", tone: "ok" };
    default:
      return step.result.startsWith("Error") ? { text: "error", tone: "warn" } : null;
  }
}

export function ToolStep({ step }: { step: Step }) {
  const [open, setOpen] = useState(false);
  const meta = META[step.name] ?? { label: step.name, icon: Database };
  const Icon = meta.icon;
  const done = step.result !== undefined;
  const o = outcome(step);

  return (
    <div className={cn("rounded-md border bg-muted/40 text-xs", step.subagent && "ml-5 border-dashed")}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left"
      >
        {done ? (
          o?.tone === "warn" ? (
            <AlertTriangle className="size-3.5 text-amber-600" />
          ) : (
            <CheckCircle2 className="size-3.5 text-emerald-600" />
          )
        ) : (
          <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
        )}
        <Icon className="size-3.5 text-muted-foreground" />
        <span className="font-medium">
          {step.subagent ? "↳ " : ""}
          {meta.label}
        </span>
        {o && (
          <span className={cn("truncate", o.tone === "warn" ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground")}>
            · {o.text}
          </span>
        )}
        <ChevronRight className={cn("ml-auto size-3.5 shrink-0 transition-transform", open && "rotate-90")} />
      </button>
      {open && (
        <div className="space-y-2 border-t px-2.5 py-2 font-mono text-[11px] leading-relaxed">
          <div>
            <div className="mb-0.5 text-muted-foreground">input</div>
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words">{JSON.stringify(step.args, null, 2)}</pre>
          </div>
          {done && (
            <div>
              <div className="mb-0.5 text-muted-foreground">output</div>
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words">{step.result}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
