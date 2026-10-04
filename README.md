# FixDesk: a maintenance triage agent for small landlords

FixDesk is for someone who owns or manages 5–50 rental units and gets tenant texts like *"water is coming out from under the sink!"* at all hours. You open the request and click **Triage with agent**. The agent then:

1. plans its steps,
2. reads the request, the unit record (shutoff locations, access notes, equipment) and the repair history,
3. splits the message into separate issues,
4. classifies each issue's urgency against a **fixed safety rule table**, with a keyword safety net that can only escalate,
5. ranks eligible vendors and estimates the cost,
6. drafts the tenant reply (safety steps first) and the vendor dispatch message,
7. checks both messages for liability, guarantee and Fair Housing problems,
8. saves a validated work order to Supabase.

**Nothing is sent until you click Send.** You can keep chatting with the agent: paste the tenant's reply, ask "why emergency?", or ask "what needs my attention right now?".

> Stack: Next.js 16 (App Router) · Tailwind v4 · shadcn/ui · Supabase (Postgres) · LangGraph **Deep Agents** (`deepagents` JS) · Claude via `@langchain/anthropic` · Vercel.

See **[NOTES.md](./NOTES.md)** for the written submission note.

---

## Try it

The app opens on a fictional portfolio: 2 properties, 6 units, 9 vendors and 7 incoming requests. Here's what each request is designed to show. The urgency, vendor and approval outcomes come from deterministic code; the wording comes from the model.

| Request | What it shows |
|---|---|
| **Maple 2B**: "water…spreading across the floor" | Emergency leak; shutoff location from the unit record goes first in the tenant reply; 24/7 plumber only; the scope asks the plumber to check the unit below |
| **Maple 1A**: "rotten eggs near the stove" | Gas emergency: tells the tenant to leave and call the utility, even though the tenant never said "gas" |
| **Maple 2A**: outlet sparked, burning smell | Electrical emergency with breaker instructions |
| **Pine 3C**: no heat, 58°F, "third time this winter" | Urgent (24h). The history subagent finds 2 prior furnace repairs on a 17-year-old unit and suggests a replacement quote |
| **Pine 4A**: dishwasher + closet door | One message becomes **two work orders** with different trades and urgencies |
| **Pine 4A**: "something is wrong with the fridge" | Too vague to guess, so the agent sends follow-up questions; paste a reply and it updates the work order |
| **Maple 1B**: dripping faucet | Routine; vendor ranking favours the weekday plumber that fits under the $400 approval limit |

Use **New request** to log your own tenant message.

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
  │     ├── skills (/skills/*/SKILL.md): maintenance-triage · tenant-communication
  │     ├── custom tools: get_request · get_unit_history · classify_urgency · find_vendors
  │     │                 check_message · create_work_order · list_open_work_orders
  │     └── subagent: history-analyst (isolated context, cheaper model)
  │
  └── Repo  ──►  Supabase Postgres: landlords · units · vendors · requests · work_orders · threads
                 (in-memory fallback when Supabase env vars are absent)
```

Key files:

- `src/lib/agent/triage.ts`: the rules engine (urgency table, safety net, vendor ranking, estimates, approval, message lint). Pure and unit-tested.
- `src/lib/agent/tools.ts`: the seven custom tools
- `src/lib/agent/knowledge.ts`: system prompt, subagent prompt and skills (domain knowledge)
- `src/lib/agent/agent.ts`: harness assembly (`createDeepAgent`)
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

Without Supabase variables, the app uses an in-memory store seeded with the demo portfolio.

### Checks

```bash
npm run lint
npm run typecheck
npm run smoke    # offline end-to-end harness test (scripted model, no API key needed)
npm run build
```

`npm run smoke` runs a full triage turn through the real Deep Agent graph, tools, subagent and repo, with a scripted model standing in for Claude. It then unit-checks the rules engine. 27 assertions, including:

- fabricated quotes are rejected,
- the safety net escalates an under-called leak,
- emergency vendor search excludes non-24/7 vendors,
- a work order without shutoff instructions is refused,
- gas, heat and vague-message rules behave as specified.

---

## Deploy (Supabase + Vercel)

1. **Supabase:** create a project. In the SQL editor, run `supabase/migrations/0001_init.sql`. The demo portfolio seeds itself on the first request.
2. **Vercel:** import this repo and set these environment variables:
   - `ANTHROPIC_API_KEY`
   - `SUPABASE_URL` (Project Settings → API → Project URL)
   - `SUPABASE_SERVICE_ROLE_KEY` (server-only, never sent to the browser)
   - optional: `ANTHROPIC_MODEL`, `ANTHROPIC_SUBAGENT_MODEL`, `LANGSMITH_TRACING`, `LANGSMITH_API_KEY`
3. Deploy.

Security: RLS is enabled on every table with no public policies. All database access goes through server routes using the service-role key.

**Not legal advice.** The triage rules and messaging guidance are sensible defaults for a demo. Real notice-of-entry and habitability rules vary by state and city.
