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
  MapPin,
  ListTodo,
  Loader2,
  Save,
  ShieldCheck,
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
  get_trip: { label: "Read trip request", icon: ClipboardList },
  search_places: { label: "Searched places", icon: MapPin },
  task: { label: "Asked the local-expert", icon: Bot },
  check_itinerary: { label: "Checked itinerary", icon: ShieldCheck },
  save_itinerary: { label: "Saved itinerary", icon: Save },
  list_trips: { label: "Read saved trips", icon: Database },
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
    case "search_places":
      return Array.isArray(r) ? { text: `${(r as unknown[]).length} results${args.category ? ` · ${args.category}` : ""}`, tone: "ok" } : null;
    case "check_itinerary":
      if (!r) return { text: "invalid input", tone: "warn" };
      return r.ok
        ? { text: `feasible · $${r.total_cost} of $${r.budget}`, tone: "ok" }
        : { text: `${(r.problems as unknown[]).length} problem(s) — revising`, tone: "warn" };
    case "save_itinerary":
      return r?.saved ? { text: `saved · $${r.total_cost}`, tone: "ok" } : { text: "refused — fixing", tone: "warn" };
    case "read_file":
    case "write_file":
    case "edit_file":
      return { text: String(args.file_path ?? args.path ?? ""), tone: "ok" };
    case "task":
      return { text: "shortlist returned", tone: "ok" };
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
