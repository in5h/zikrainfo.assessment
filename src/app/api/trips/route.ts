import { NextResponse } from "next/server";
import { z } from "zod";

import { getRepo } from "@/lib/data/repo";
import { INTERESTS, PACES } from "@/lib/data/types";
import { handle } from "@/lib/server/handle";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  try {
    return NextResponse.json({ trips: await getRepo().listTrips() });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
});

const body = z.object({
  city_id: z.string().min(1),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  days_count: z.number().int().min(1).max(5),
  budget: z.number().min(20).max(10000),
  interests: z.array(z.enum(INTERESTS)).min(1, "Pick at least one interest."),
  pace: z.enum(PACES),
  notes: z.string().max(500).default(""),
});

export const POST = handle(async (req: Request) => {
  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join("; ") }, { status: 400 });
  }
  const repo = getRepo();
  const city = await repo.getCity(parsed.data.city_id);
  if (!city) return NextResponse.json({ error: "Unknown city" }, { status: 404 });
  const now = new Date().toISOString();
  const trip = await repo.saveTrip({
    id: `trip-${crypto.randomUUID().slice(0, 8)}`,
    ...parsed.data,
    title: `${parsed.data.days_count} day${parsed.data.days_count > 1 ? "s" : ""} in ${city.name}`,
    status: "draft",
    days: [],
    summary: "",
    tips: [],
    total_cost: 0,
    created_at: now,
    updated_at: now,
  });
  return NextResponse.json({ trip });
});
