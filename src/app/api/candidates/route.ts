import { NextResponse } from "next/server";
import { z } from "zod";

import { getRepo } from "@/lib/data/repo";

const body = z.object({
  job_id: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().max(200).optional().nullable(),
  headline: z.string().trim().max(200).optional().nullable(),
  resume_text: z.string().trim().min(80, "Paste the full resume text (at least a few lines).").max(30000),
});

export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join("; ") }, { status: 400 });
  }
  const repo = getRepo();
  if (!(await repo.getJob(parsed.data.job_id))) return NextResponse.json({ error: "Unknown job" }, { status: 404 });
  const slug = parsed.data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 30);
  const candidate = await repo.createCandidate({
    id: `cand-${slug}-${crypto.randomUUID().slice(0, 6)}`,
    job_id: parsed.data.job_id,
    name: parsed.data.name,
    email: parsed.data.email || null,
    headline: parsed.data.headline || null,
    source: "Pasted",
    resume_text: parsed.data.resume_text,
  });
  return NextResponse.json({ candidate });
}
