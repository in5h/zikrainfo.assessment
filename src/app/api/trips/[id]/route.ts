import { NextResponse, type NextRequest } from "next/server";

import { getRepo } from "@/lib/data/repo";
import { tripDetail } from "@/lib/server/trip-detail";
import { handle } from "@/lib/server/handle";

export const dynamic = "force-dynamic";

export const GET = handle(async (_req: NextRequest, ctx: RouteContext<"/api/trips/[id]">) => {
  const { id } = await ctx.params;
  const repo = getRepo();
  const trip = await repo.getTrip(id);
  if (!trip) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(await tripDetail(trip, await repo.getThread(`t-${id}`)));
});

export const DELETE = handle(async (_req: NextRequest, ctx: RouteContext<"/api/trips/[id]">) => {
  const { id } = await ctx.params;
  await getRepo().deleteTrip(id);
  return NextResponse.json({ ok: true });
});
