import { z } from "zod";

import { resolveApiKey } from "@/lib/agent/agent";
import type { AgentEvent } from "@/lib/agent/events";
import { runTurn } from "@/lib/agent/run";
import { getRepo } from "@/lib/data/repo";
import type { Thread, Trip } from "@/lib/data/types";

export const dynamic = "force-dynamic";
// Planning a trip is ~8–14 model calls plus a subagent; give it room on Vercel.
export const maxDuration = 300;

const body = z.object({
  tripId: z.string().min(1),
  message: z.string().trim().min(1).max(8000),
  // Browser-storage mode: the browser sends its copy of the trip and conversation.
  trip: z.unknown().optional(),
  thread: z.unknown().optional(),
});

export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const { tripId, message } = parsed.data;
  const repo = getRepo();
  const threadId = `t-${tripId}`;

  // Without a database, serverless instances share no memory, so the browser is
  // the source of truth: load its copy into this instance before running.
  const browserMode = repo.kind === "memory";
  if (browserMode) {
    const trip = parsed.data.trip as Trip | undefined;
    if (trip?.id === tripId) await repo.saveTrip(trip);
    const thread = parsed.data.thread as Thread | null | undefined;
    if (thread?.id === threadId) await repo.saveThread(thread);
  }
  if (!(await repo.getTrip(tripId))) return Response.json({ error: "Unknown trip" }, { status: 404 });

  // No key → demo mode: a deterministic offline model drives the same harness.
  const apiKey = resolveApiKey(req.headers.get("x-anthropic-key"));
  const encoder = new TextEncoder();
  const send = (c: ReadableStreamDefaultController, e: AgentEvent) => c.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of runTurn({ threadId, tripId, message, apiKey })) {
          if (event.type === "done" && browserMode) {
            const [trip, thread] = await Promise.all([repo.getTrip(tripId), repo.getThread(threadId)]);
            if (trip) send(controller, { type: "state", trip, thread });
          }
          send(controller, event);
        }
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
