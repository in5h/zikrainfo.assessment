import { z } from "zod";

import { resolveApiKey } from "@/lib/agent/agent";
import { runTurn } from "@/lib/agent/run";
import { getRepo } from "@/lib/data/repo";

export const dynamic = "force-dynamic";
// Planning a trip is ~8–14 model calls plus a subagent; give it room on Vercel.
export const maxDuration = 300;

const body = z.object({
  tripId: z.string().min(1),
  message: z.string().trim().min(1).max(8000),
});

export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const { tripId, message } = parsed.data;
  if (!(await getRepo().getTrip(tripId))) return Response.json({ error: "Unknown trip" }, { status: 404 });

  // No key → demo mode: a deterministic offline model drives the same harness.
  const apiKey = resolveApiKey(req.headers.get("x-anthropic-key"));
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of runTurn({ threadId: `t-${tripId}`, tripId, message, apiKey })) {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
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
