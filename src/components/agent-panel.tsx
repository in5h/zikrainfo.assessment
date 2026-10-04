"use client";

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowUp, Bot, CheckCircle2, Circle, Loader2, Sparkles } from "lucide-react";

import { ToolStep, type Step } from "@/components/tool-step";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { AgentEvent, TranscriptEntry } from "@/lib/agent/events";
import type { StoredFile, Todo } from "@/lib/data/types";
import { cn } from "@/lib/utils";

type Item = { role: "user"; text: string } | { role: "assistant"; text: string; steps: Step[]; error?: string };

export type AgentPanelHandle = { send: (text: string) => void };

/** Fold a stored transcript (assistant tool calls + tool results) into chat items. */
function fromTranscript(entries: TranscriptEntry[]): Item[] {
  const items: Item[] = [];
  let cur: Extract<Item, { role: "assistant" }> | null = null;
  let pending: Step[] = [];
  for (const e of entries) {
    if (e.role === "user") {
      cur = null;
      items.push({ role: "user", text: e.text });
      continue;
    }
    if (!cur) {
      cur = { role: "assistant", text: "", steps: [] };
      items.push(cur);
    }
    if (e.role === "assistant") {
      if (e.text) cur.text = cur.text ? `${cur.text}\n\n${e.text}` : e.text;
      for (const tc of e.toolCalls ?? []) {
        const s: Step = { id: crypto.randomUUID(), name: tc.name, args: tc.args };
        cur.steps.push(s);
        pending.push(s);
      }
    } else {
      const idx = pending.findIndex((p) => p.name === e.name);
      const s = idx >= 0 ? pending.splice(idx, 1)[0] : pending.shift();
      if (s) s.result = e.text;
    }
  }
  pending = [];
  return items;
}

function Markdown({ text }: { text: string }) {
  return (
    <div className="space-y-2 text-sm leading-relaxed [&_li]:ml-4 [&_ol]:list-decimal [&_strong]:font-semibold [&_table]:text-xs [&_td]:border [&_td]:px-1.5 [&_th]:border [&_th]:px-1.5 [&_ul]:list-disc">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  );
}

export function AgentPanel({
  ref,
  requestId,
  title,
  suggestions,
  transcript,
  initialTodos,
  disabledReason,
  onTodos,
  onFiles,
  onSaved,
  onBusy,
}: {
  ref?: Ref<AgentPanelHandle>;
  requestId: string | null;
  title: string;
  suggestions: string[];
  transcript: TranscriptEntry[];
  initialTodos: Todo[];
  disabledReason?: string;
  onTodos?: (t: Todo[]) => void;
  onFiles?: (f: Record<string, StoredFile>) => void;
  onSaved?: () => void;
  onBusy?: (busy: boolean) => void;
}) {
  const [items, setItems] = useState<Item[]>(() => fromTranscript(transcript));
  const [todos, setTodos] = useState<Todo[]>(initialTodos);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [items]);

  const update = (fn: (a: Extract<Item, { role: "assistant" }>) => void) =>
    setItems((prev) => {
      const next = [...prev];
      const last = next.at(-1);
      if (last?.role !== "assistant") return prev;
      const copy = { ...last, steps: [...last.steps] };
      fn(copy);
      next[next.length - 1] = copy;
      return next;
    });

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy || disabledReason) return;
    setInput("");
    setBusy(true);
    onBusy?.(true);
    setItems((p) => [...p, { role: "user", text: message }, { role: "assistant", text: "", steps: [] }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, message }),
      });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error ?? "Request failed");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line) as AgentEvent;
          switch (ev.type) {
            case "token":
              update((a) => (a.text += ev.text));
              break;
            case "tool_call":
              update((a) => {
                // Text streamed before a tool call is interim narration; keep it, separated.
                if (a.text && !a.text.endsWith("\n\n")) a.text += "\n\n";
                a.steps.push({ id: ev.id, name: ev.name, args: ev.args, subagent: ev.subagent });
              });
              break;
            case "tool_result":
              update((a) => {
                const i = a.steps.findIndex((s) => s.id === ev.id);
                if (i >= 0) a.steps[i] = { ...a.steps[i], result: ev.content };
              });
              break;
            case "todos":
              setTodos(ev.todos);
              onTodos?.(ev.todos);
              break;
            case "files":
              onFiles?.(ev.files);
              break;
            case "work_order_saved":
              onSaved?.();
              break;
            case "error":
              update((a) => (a.error = ev.message));
              break;
          }
        }
      }
    } catch (e) {
      update((a) => (a.error = (e as Error).message));
    } finally {
      setBusy(false);
      onBusy?.(false);
      onSaved?.();
    }
  }

  useImperativeHandle(ref, () => ({ send }));

  const doneCount = todos.filter((t) => t.status === "completed").length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <Bot className="size-4 text-primary" />
        <div className="min-w-0">
          <div className="text-sm font-semibold">FixDesk agent</div>
          <div className="truncate text-xs text-muted-foreground">{title}</div>
        </div>
        {busy && <Loader2 className="ml-auto size-4 animate-spin text-muted-foreground" />}
      </div>

      {todos.length > 0 && (
        <div className="border-b bg-muted/30 px-4 py-2.5">
          <div className="mb-1.5 flex items-center justify-between text-xs font-medium">
            <span>Plan</span>
            <span className="text-muted-foreground tabular-nums">
              {doneCount}/{todos.length}
            </span>
          </div>
          <ul className="space-y-0.5">
            {todos.map((t, i) => (
              <li key={i} className="flex items-center gap-1.5 text-xs">
                {t.status === "completed" ? (
                  <CheckCircle2 className="size-3 text-emerald-600" />
                ) : t.status === "in_progress" ? (
                  <Loader2 className="size-3 animate-spin text-primary" />
                ) : (
                  <Circle className="size-3 text-muted-foreground" />
                )}
                <span className={cn(t.status === "completed" && "text-muted-foreground line-through")}>{t.content}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div ref={scroller} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {items.length === 0 && (
          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            <Sparkles className="mb-2 size-4 text-primary" />
            The agent plans, checks the unit&apos;s repair history with a subagent, classifies urgency against a fixed
            safety rule table, ranks vendors, drafts the tenant and vendor messages, and saves a work order. Nothing
            is sent until you click Send.
          </div>
        )}
        {items.map((it, i) =>
          it.role === "user" ? (
            <div key={i} className="ml-8 rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">
              {it.text}
            </div>
          ) : (
            <div key={i} className="space-y-2">
              {it.steps.length > 0 && (
                <div className="space-y-1">
                  {it.steps.map((s) => (
                    <ToolStep key={s.id} step={s} />
                  ))}
                </div>
              )}
              {it.text && <Markdown text={it.text} />}
              {it.error && (
                <div className="rounded-md border border-red-300 bg-red-50 p-2 text-xs text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
                  {it.error}
                </div>
              )}
              {busy && i === items.length - 1 && !it.text && it.steps.length === 0 && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" /> Thinking…
                </div>
              )}
            </div>
          )
        )}
      </div>

      <div className="space-y-2 border-t p-3">
        {disabledReason ? (
          <div className="rounded-md bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-300">{disabledReason}</div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                disabled={busy}
                onClick={() => send(s)}
                className="rounded-full border px-2.5 py-1 text-xs hover:bg-accent disabled:opacity-50"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            placeholder={requestId ? "Paste the tenant's reply, or ask for edits…" : "Ask about open maintenance…"}
            className="max-h-32 min-h-10 resize-none"
            disabled={busy || Boolean(disabledReason)}
          />
          <Button type="submit" size="icon" disabled={busy || !input.trim() || Boolean(disabledReason)}>
            <ArrowUp />
          </Button>
        </form>
      </div>
    </div>
  );
}
