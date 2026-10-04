import { NextResponse } from "next/server";

import type { Thread, Trip } from "@/lib/data/types";
import { tripDetail } from "@/lib/server/trip-detail";

export const dynamic = "force-dynamic";

/**
 * Browser-storage mode (no database configured): the browser owns its trips
 * and sends one here to get the computed view (timeline, legs, transcript).
 * Nothing is stored.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { trip?: Trip; thread?: Thread | null } | null;
  if (!body?.trip?.id || !body.trip.city_id) return NextResponse.json({ error: "Missing trip" }, { status: 400 });
  return NextResponse.json(await tripDetail(body.trip, body.thread ?? null));
}
