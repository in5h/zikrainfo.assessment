import { NextResponse } from "next/server";

import { getRepo } from "@/lib/data/repo";
import { handle } from "@/lib/server/handle";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  try {
    const repo = getRepo();
    const cities = await repo.listCities();
    return NextResponse.json({ cities });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
});
