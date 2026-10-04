import { NextResponse, type NextRequest } from "next/server";

import { transcript } from "@/lib/agent/run";
import { getRepo } from "@/lib/data/repo";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/requests/[id]">) {
  const { id } = await ctx.params;
  const repo = getRepo();
  const request = await repo.getRequest(id);
  if (!request) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [unit, workOrders, thread] = await Promise.all([
    repo.getUnit(request.unit_id),
    repo.listWorkOrders({ request_id: id }),
    repo.getThread(`t-${id}`),
  ]);
  return NextResponse.json({
    request,
    unit,
    workOrders,
    transcript: thread ? transcript(thread.messages) : [],
    files: thread?.files ?? {},
    todos: thread?.todos ?? [],
  });
}
