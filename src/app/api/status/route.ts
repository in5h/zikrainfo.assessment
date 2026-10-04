import { NextResponse } from "next/server";

import { MAIN_MODEL, SUBAGENT_MODEL } from "@/lib/agent/agent";
import { getRepo } from "@/lib/data/repo";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    storage: getRepo().kind,
    llmConfigured: Boolean(process.env.ANTHROPIC_API_KEY),
    model: MAIN_MODEL,
    subagentModel: SUBAGENT_MODEL,
  });
}
