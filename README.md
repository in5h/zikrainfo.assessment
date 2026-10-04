# Wayfarer: an AI trip planner that checks the details

Pick a city, dates, a budget and your interests. Wayfarer's agent plans a day-by-day itinerary and shows it on a map. Before showing you anything, it **checks every stop**: is it open that day and at that time, how long is the walk or metro ride from the last stop, is there lunch and dinner, does the day fit your pace, and does the trip fit your budget. Then you can refine it in chat: *"make it more relaxed"*, *"cheaper please"*, *"add more art"*.

**It works with no API key.** Without `ANTHROPIC_API_KEY`, a built-in offline planner drives the same agent harness, so every feature works on your laptop straight away. Add a key and Claude takes over the planning and free-form chat.

> Stack: Next.js 16 (App Router) · Tailwind v4 · shadcn/ui · Supabase (Postgres) · LangGraph **Deep Agents** (`deepagents` JS) · Claude via `@langchain/anthropic` · three.js globe · Leaflet maps · Vercel.

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

Open **http://localhost:3000**. Spin the 3D globe or pick a city, follow the 3 steps (*Where → When & budget → Your vibe*) and click **Plan my trip**. That's it: no keys, no database.

### Optional: use Claude instead of the offline planner

Create a file named `.env.local` in the project folder (copy `.env.example`) and add:

```
ANTHROPIC_API_KEY=sk-ant-...
```

Restart `npm run dev`. The badge in the top-right changes from **Demo mode** to the Claude model name.

### Optional: save trips in Supabase

Add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to `.env.local`, and run `supabase/migrations/0001_init.sql` once in the Supabase SQL editor. Without Supabase, trips are saved in your browser.

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
Browser (Next.js client: three.js globe · 3-step wizard · Leaflet map · timeline · agent panel)
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
                 (no database configured → trips live in the visitor's browser and are sent with each request)
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

## Deploy to Vercel (no keys needed)

1. Go to https://vercel.com, sign in with GitHub, click **Add New… → Project**, and import this repo.
2. Leave every setting as it is. **Don't add any environment variables.**
3. Click **Deploy**. In about 2 minutes you get a public link such as `https://your-project.vercel.app`.

Out of the box the app uses the **built-in demo Supabase project** (`src/lib/config.ts`) through Supabase's public anon key. Row-level-security policies (`supabase/migrations/0002_demo_access.sql`) make the catalog read-only and let the app read and write demo trips. Planning runs in **demo mode** (offline planner). Optional overrides:

| Env var | What changes |
|---|---|
| `ANTHROPIC_API_KEY` | Claude plans trips and answers free-form chat |
| `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | Use your own Supabase project with the secret server key (run both migrations + `supabase/seed.sql`) |
| `WAYFARER_STORAGE=memory` | No database: each visitor's trips are kept in their browser and sent with every request |

Security: RLS is on for every table. All data access goes through server routes. The demo project's anon policies allow reading and writing demo trips (no personal data). For a locked-down deployment, drop `0002_demo_access.sql` and use `SUPABASE_SERVICE_ROLE_KEY`.

_Sample data: coordinates, opening hours and prices are simplified typical values for the demo. Verify before travelling._
