import { NextResponse } from "next/server";

import { MAIN_MODEL, SUBAGENT_MODEL } from "@/lib/agent/agent";
import { getRepo } from "@/lib/data/repo";

export const dynamic = "force-dynamic";

export async function GET() {
  const claude = Boolean(process.env.ANTHROPIC_API_KEY);
  return NextResponse.json({
    // "browser" = no database configured: each visitor's trips live in their own browser.
    storage: getRepo().kind === "memory" ? "browser" : "supabase",
    // "demo" = no key configured: the offline planner drives the same agent harness.
    mode: claude ? "claude" : "demo",
    model: claude ? MAIN_MODEL : "offline planner",
    subagentModel: claude ? SUBAGENT_MODEL : "offline planner",
  });
}
