import { z } from "zod";

import { runTurn } from "@/lib/agent/run";
import { getRepo } from "@/lib/data/repo";

export const dynamic = "force-dynamic";
// A full triage is ~8–14 model calls plus a subagent; give it room on Vercel.
export const maxDuration = 300;

const body = z.object({
  requestId: z.string().min(1).nullable(),
  message: z.string().trim().min(1).max(8000),
});

export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "ANTHROPIC_API_KEY is not configured on the server." }, { status: 503 });
  }
  const { requestId, message } = parsed.data;
  if (requestId && !(await getRepo().getRequest(requestId))) {
    return Response.json({ error: "Unknown request" }, { status: 404 });
  }

  const threadId = requestId ? `t-${requestId}` : "t-portfolio";
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of runTurn({ threadId, requestId, message })) {
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
