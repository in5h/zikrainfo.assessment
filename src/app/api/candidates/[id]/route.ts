import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { transcript } from "@/lib/agent/run";
import { getRepo } from "@/lib/data/repo";
import { STAGES } from "@/lib/data/types";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/candidates/[id]">) {
  const { id } = await ctx.params;
  const repo = getRepo();
  const candidate = await repo.getCandidate(id);
  if (!candidate) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [scorecard, thread] = await Promise.all([repo.latestScorecard(id), repo.getThread(`t-${id}`)]);
  return NextResponse.json({
    candidate,
    scorecard,
    transcript: thread ? transcript(thread.messages) : [],
    files: thread?.files ?? {},
    todos: thread?.todos ?? [],
  });
}

export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/candidates/[id]">) {
  const { id } = await ctx.params;
  const parsed = z.object({ stage: z.enum(STAGES) }).safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid stage" }, { status: 400 });
  await getRepo().setStage(id, parsed.data.stage);
  return NextResponse.json({ ok: true });
}
