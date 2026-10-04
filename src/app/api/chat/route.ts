import { z } from "zod";

import { runTurn } from "@/lib/agent/run";
import { getRepo } from "@/lib/data/repo";

export const dynamic = "force-dynamic";
// A full screen is ~10 model calls plus a subagent; give it room on Vercel.
export const maxDuration = 300;

const body = z.object({
  jobId: z.string().min(1),
  candidateId: z.string().min(1).nullable(),
  message: z.string().trim().min(1).max(8000),
});

export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "ANTHROPIC_API_KEY is not configured on the server." }, { status: 503 });
  }
  const { jobId, candidateId, message } = parsed.data;
  const repo = getRepo();
  if (!(await repo.getJob(jobId))) return Response.json({ error: "Unknown job" }, { status: 404 });
  if (candidateId) {
    const c = await repo.getCandidate(candidateId);
    if (!c || c.job_id !== jobId) return Response.json({ error: "Unknown candidate" }, { status: 404 });
  }

  const threadId = candidateId ? `t-${candidateId}` : `t-job-${jobId}`;
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of runTurn({ threadId, jobId, candidateId, message })) {
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
