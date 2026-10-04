import { NextResponse } from "next/server";

import { getRepo } from "@/lib/data/repo";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ jobs: await getRepo().listJobs() });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
