import { NextResponse } from "next/server";
import { z } from "zod";

import { getRepo } from "@/lib/data/repo";

const body = z.object({
  unit_id: z.string().min(1),
  channel: z.enum(["sms", "email", "portal"]).default("portal"),
  message: z.string().trim().min(5, "Write the tenant's message.").max(4000),
});

export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join("; ") }, { status: 400 });
  }
  const repo = getRepo();
  if (!(await repo.getUnit(parsed.data.unit_id))) return NextResponse.json({ error: "Unknown unit" }, { status: 404 });
  const request = await repo.createRequest({ id: `req-${crypto.randomUUID().slice(0, 8)}`, ...parsed.data });
  return NextResponse.json({ request });
}
