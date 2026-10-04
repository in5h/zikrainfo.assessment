import { NextResponse } from "next/server";

import { getRepo } from "@/lib/data/repo";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const repo = getRepo();
    const cities = await repo.listCities();
    return NextResponse.json({ cities });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
