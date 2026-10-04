# ScreenPilot: a resume-screening Deep Agent

ScreenPilot screens one resume against one job's rubric. A recruiter opens a candidate and clicks **Run AI screen**. The agent then:

1. writes a plan,
2. reads the requisition and the resume,
3. hands evidence extraction to a subagent,
4. scores each rubric criterion with **verbatim quotes that are checked against the resume**,
5. drafts interview questions and the right email (an invite, or a respectful decline),
6. lints everything it wrote for bias,
7. saves a scorecard to Supabase.

The recruiter still makes the final call (Advance / Hold / Decline). They can also keep chatting with the agent: "why a 2 on payments?", "make the email warmer", "who should I interview first?".

> Stack: Next.js 16 (App Router) · Tailwind v4 · shadcn/ui · Supabase (Postgres) · LangGraph **Deep Agents** (`deepagents` JS) · Claude via `@langchain/anthropic` · deployed on Vercel.

See **[NOTES.md](./NOTES.md)** for the written submission note (problem, harness design, time spent, what's next).

---

## Try it

The app opens on a seeded demo: two jobs (Senior Backend Engineer, Payments; CSM, Mid-Market) with five fictional candidates. Good things to try:

| Candidate | What it shows |
|---|---|
| **Priya Raman** (Backend) | Strong match: high scores backed by dense evidence, an invite email (expected **advance**) |
| **Marcus Oyelaran** (Backend) | Adjacent experience (Stripe integration, not ledger ownership) gets capped scores; expected to land on **hold** |
| **Dana Whitfield** (Backend) | Fairness guardrails: the resume mentions family status, a career break and a 1998 degree. None of these affect the scores or show up in the agent's text |
| **Jordan Kim** (CSM) | Sales profile with no book of business: must-have gaps; expected **decline** with a respectful decline note |

You can also **Add candidate** and paste any resume, or open **Pipeline overview** and ask the agent to compare candidates.

---

## Architecture

```
Browser (Next.js client)
  │  POST /api/chat  ──►  NDJSON stream of agent events (tokens, tool calls, todos, files)
  ▼
Next.js route handlers (Vercel Functions, Node runtime, maxDuration 300s)
  │
  ├── runTurn()  ── LangGraph Deep Agent (createDeepAgent)
  │     ├── model: Claude (ChatAnthropic, adaptive thinking, effort=medium)
  │     ├── middleware: todoList (planning) + built-ins (filesystem, subagents, skills, summarization, prompt caching)
  │     ├── skills (/skills/*/SKILL.md): structured-screening · fair-hiring · candidate-outreach
  │     ├── custom tools: get_job_requisition · get_candidate_profile · list_pipeline
  │     │                 score_candidate · fairness_check · save_scorecard
  │     └── subagent: evidence-extractor (isolated context, cheaper model)
  │
  └── Repo  ──►  Supabase Postgres: jobs · candidates · scorecards · threads
                 (in-memory fallback when Supabase env vars are absent)
```

Key files:

- `src/lib/agent/agent.ts`: harness assembly (`createDeepAgent`)
- `src/lib/agent/tools.ts`: the six custom tools
- `src/lib/agent/scoring.ts`: deterministic scoring, quote verification, fairness lint (pure, unit-testable)
- `src/lib/agent/knowledge.ts`: system prompt, subagent prompt, skills (domain knowledge)
- `src/lib/agent/run.ts`: streams a turn and persists thread state (messages + virtual FS + todos)
- `src/lib/data/repo.ts`: Supabase repository with an in-memory fallback
- `supabase/migrations/0001_init.sql`: schema

---

## Run locally

```bash
npm install
cp .env.example .env.local   # add ANTHROPIC_API_KEY (Supabase optional)
npm run dev                  # http://localhost:3000
```

Without Supabase variables, the app uses an in-memory store seeded with demo data. That's enough to try it out.

### Checks

```bash
npm run lint
npm run typecheck
npm run smoke    # offline end-to-end harness test (scripted model, no API key needed)
npm run build
```

`npm run smoke` runs a whole screening turn through the real Deep Agent graph, tools, subagent and repo, with a scripted model standing in for Claude. It asserts that fabricated quotes are rejected, biased text is flagged, subagent activity streams, the scorecard is saved and the thread is persisted.

---

## Deploy (Supabase + Vercel)

1. **Supabase:** create a project. In the SQL editor, run `supabase/migrations/0001_init.sql`. The demo data seeds itself on the first request.
2. **Vercel:** import this repo and set these environment variables:
   - `ANTHROPIC_API_KEY`
   - `SUPABASE_URL` (Project Settings → API → Project URL)
   - `SUPABASE_SERVICE_ROLE_KEY` (server-only; it's never sent to the browser)
   - optional: `ANTHROPIC_MODEL`, `ANTHROPIC_SUBAGENT_MODEL`, `LANGSMITH_TRACING`, `LANGSMITH_API_KEY`
3. Deploy. `/api/chat` declares `maxDuration = 300`, which fits a full screen (about 8–12 model calls).

Security: RLS is on for every table, with no public policies. All database access goes through server routes that use the service-role key. The anon key is never used.
