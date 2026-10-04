import { NextResponse } from "next/server";

import { getRepo } from "@/lib/data/repo";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const repo = getRepo();
    const [landlord, requests, units, vendors, workOrders] = await Promise.all([
      repo.landlord(),
      repo.listRequests(),
      repo.listUnits(),
      repo.listVendors(),
      repo.listWorkOrders(),
    ]);
    return NextResponse.json({ landlord, requests, units, vendors, workOrders });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
