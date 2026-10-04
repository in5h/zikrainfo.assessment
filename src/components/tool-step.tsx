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
  History,
  ListTodo,
  Loader2,
  Save,
  ShieldCheck,
  Siren,
  Wrench,
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
  get_request: { label: "Read request & unit", icon: ClipboardList },
  get_unit_history: { label: "Read repair history", icon: History },
  task: { label: "Delegated to history-analyst", icon: Bot },
  classify_urgency: { label: "Classified urgency", icon: Siren },
  find_vendors: { label: "Ranked vendors", icon: Wrench },
  check_message: { label: "Checked message", icon: ShieldCheck },
  create_work_order: { label: "Saved work order", icon: Save },
  list_open_work_orders: { label: "Read open work orders", icon: Database },
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
    case "classify_urgency": {
      if (!r?.ok) return { text: `${(r?.problems as unknown[] | undefined)?.length ?? "?"} problem(s) — revising`, tone: "warn" };
      const net = (r.escalated_by_safety_net as string[] | undefined)?.length ? " · safety net escalated" : "";
      return { text: `${r.urgency} · ${r.respond_within_hours}h${net}`, tone: "ok" };
    }
    case "find_vendors": {
      const v = (r?.vendors as { name: string }[] | undefined) ?? [];
      return v.length ? { text: `${v.length} eligible · top: ${v[0].name}`, tone: "ok" } : { text: "none eligible", tone: "warn" };
    }
    case "check_message":
      return r?.clean
        ? { text: `${args.audience} message clean`, tone: "ok" }
        : { text: `${(r?.flags as unknown[] | undefined)?.length ?? "?"} flag(s) — rewriting`, tone: "warn" };
    case "create_work_order":
      return r?.saved ? { text: `${r.urgency} · ${r.status}`, tone: "ok" } : { text: "refused — fixing", tone: "warn" };
    case "read_file":
    case "write_file":
    case "edit_file":
      return { text: String(args.file_path ?? args.path ?? ""), tone: "ok" };
    case "task":
      return { text: "history returned", tone: "ok" };
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
