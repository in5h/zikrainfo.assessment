# Wayfarer: an AI trip planner that checks the details

Pick a city, dates, a budget and your interests. Wayfarer's agent plans a day-by-day itinerary and shows it on a map. Before showing you anything, it **checks every stop**: is it open that day and at that time, how long is the walk or metro ride from the last stop, is there lunch and dinner, does the day fit your pace, and does the trip fit your budget. Then you can refine it in chat: *"make it more relaxed"*, *"cheaper please"*, *"add more art"*.

**It works with no API key.** Without `ANTHROPIC_API_KEY`, a built-in offline planner drives the same agent harness, so every feature works on your laptop straight away. Add a key and Claude takes over the planning and free-form chat.

> Stack: Next.js 16 (App Router) · Tailwind v4 · shadcn/ui · Supabase (Postgres) · LangGraph **Deep Agents** (`deepagents` JS) · Claude via `@langchain/anthropic` · Leaflet maps · Vercel.

See **[NOTES.md](./NOTES.md)** for the written submission note.

---

## Run it on your laptop (Windows, Mac or Linux)

You need **Node.js 20+** (https://nodejs.org) and **Git**.

```bash
git clone -b claude/cool-ramanujan-z919qm https://github.com/in5h/zikrainfo.assessment.git wayfarer
cd wayfarer
npm install
npm run dev
```

Open **http://localhost:3000**, pick a city and click **Plan my trip**. That's it: no keys, no database.

### Optional: use Claude instead of the offline planner

Create a file named `.env.local` in the project folder (copy `.env.example`) and add:

```
ANTHROPIC_API_KEY=sk-ant-...
```

Restart `npm run dev`. The badge in the top-right changes from **Demo mode** to the Claude model name.

### Optional: save trips in Supabase

Add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to `.env.local`, and run `supabase/migrations/0001_init.sql` once in the Supabase SQL editor. Without Supabase, trips are kept in memory until you restart.

---

## What to try

| Try | What it shows |
|---|---|
| **Lisbon, starting on a Monday** | Belém Tower and Jerónimos are closed Mondays, so the planner moves them to another day |
| **Rome, 3 days, art + history** | Vatican Museums are avoided on Sundays; Ancient Rome is clustered into one morning |
| **Kyoto, relaxed** | Temples are only scheduled while open (most close 16:00–17:00); 3 sights + 2 meals per day |
| Click **Make it more relaxed** | Fewer stops per day; pace saved |
| Click **Cheaper please** | Re-plans with cheaper meals and free sights; total goes down |
| Expand any step in the agent panel | See the exact tool input and output |

---

## Architecture

```
Browser (Next.js client: trip form · Leaflet map · timeline · agent panel)
  │  POST /api/chat  ──►  NDJSON stream of agent events (tokens, tool calls, todos, files)
  ▼
Next.js route handlers (Node runtime, maxDuration 300s)
  │
  ├── runTurn()  ── LangGraph Deep Agent (createDeepAgent)
  │     ├── model: Claude (if ANTHROPIC_API_KEY)  ·  else OfflinePlannerModel (demo mode)
  │     ├── middleware: todoList (planning) + built-ins (filesystem, subagents, skills, summarization)
  │     ├── skills: itinerary-design · city-lisbon · city-rome · city-kyoto
  │     ├── tools: get_trip · search_places · check_itinerary · save_itinerary · list_trips
  │     └── subagent: local-expert (isolated context: shortlist by neighbourhood)
  │
  └── Repo  ──►  Supabase Postgres: cities · places · trips · threads
                 (in-memory fallback when Supabase isn't configured)
```

Key files:

- `src/lib/agent/itinerary.ts`: the checker (travel legs, opening hours, closed days, meals, pace, budget). Pure and unit-tested.
- `src/lib/agent/tools.ts`: the five custom tools
- `src/lib/agent/knowledge.ts`: system prompt, subagent prompt and skills (domain knowledge)
- `src/lib/agent/agent.ts`: harness assembly (`createDeepAgent`) and model selection
- `src/lib/agent/offline-model.ts` + `planner.ts`: demo-mode brain (no API key)
- `src/lib/agent/run.ts`: streams a turn and persists thread state
- `src/lib/data/seed.ts`: curated catalog of 3 cities and ~60 places
- `supabase/migrations/0001_init.sql`: schema

---

## Checks

```bash
npm run lint
npm run typecheck
npm run smoke    # end-to-end agent test, no API key needed
npm run build
```

`npm run smoke` plans real trips through the full Deep Agent graph (tools, subagent, skills, repo), for every city × pace combination. It also tests refinements and the checker's rules: closed days, missing lunch, impossible timing, over budget.

## Deploy (Vercel + Supabase)

1. Supabase: create a project, run `supabase/migrations/0001_init.sql`. The catalog seeds itself on the first request.
2. Vercel: import the repo and set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and optionally `ANTHROPIC_API_KEY`. Deploy.

Security: RLS is on for every table with no public policies. All data access goes through server routes using the service-role key.

_Sample data: coordinates, opening hours and prices are simplified typical values for the demo. Verify before travelling._
