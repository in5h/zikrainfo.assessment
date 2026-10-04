import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getRepo } from "@/lib/data/repo";
import type { RequestStatus } from "@/lib/data/types";

export const dynamic = "force-dynamic";

// Owner actions. "dispatched" stands in for "messages sent" (this demo doesn't
// send real SMS/email); "resolved" closes the job.
const body = z.object({ status: z.enum(["dispatched", "resolved"]) });

export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/work-orders/[id]">) {
  const { id } = await ctx.params;
  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  const repo = getRepo();
  const wo = await repo.setWorkOrderStatus(id, parsed.data.status);
  if (!wo) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const all = await repo.listWorkOrders({ request_id: wo.request_id });
  const status: RequestStatus = all.every((w) => w.status === "resolved")
    ? "resolved"
    : all.every((w) => w.status === "dispatched" || w.status === "resolved")
      ? "dispatched"
      : all.some((w) => w.status === "awaiting_tenant")
        ? "awaiting_tenant"
        : all.some((w) => w.status === "needs_approval")
          ? "needs_approval"
          : "triaged";
  await repo.setRequestStatus(wo.request_id, status);
  return NextResponse.json({ workOrder: wo });
}
