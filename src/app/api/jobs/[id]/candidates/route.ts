import { NextResponse, type NextRequest } from "next/server";

import { getRepo } from "@/lib/data/repo";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/jobs/[id]/candidates">) {
  const { id } = await ctx.params;
  try {
    const repo = getRepo();
    const [candidates, scorecards] = await Promise.all([repo.listCandidates(id), repo.latestScorecardsForJob(id)]);
    return NextResponse.json({ candidates, scorecards });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
