import { NextResponse, type NextRequest } from "next/server";

import { checkTrip } from "@/lib/agent/itinerary";
import { transcript } from "@/lib/agent/run";
import { getRepo } from "@/lib/data/repo";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/trips/[id]">) {
  const { id } = await ctx.params;
  const repo = getRepo();
  const trip = await repo.getTrip(id);
  if (!trip) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [city, places, thread] = await Promise.all([repo.getCity(trip.city_id), repo.listPlaces(trip.city_id), repo.getThread(`t-${id}`)]);
  // The saved plan is re-checked on read, so the UI always shows computed times and legs.
  const check = city && trip.days.length ? checkTrip({ ...trip, city, days: trip.days }, places) : null;
  return NextResponse.json({
    trip,
    city,
    check,
    transcript: thread ? transcript(thread.messages) : [],
    files: thread?.files ?? {},
    todos: thread?.todos ?? [],
  });
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/trips/[id]">) {
  const { id } = await ctx.params;
  await getRepo().deleteTrip(id);
  return NextResponse.json({ ok: true });
}
