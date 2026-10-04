# Submission note: Wayfarer

## The problem

Planning a short city break looks easy and goes wrong in the details. A typical AI chat itinerary reads beautifully and then falls apart on the ground:

- the museum is **closed on Mondays**,
- the "quick hop" between two sights is a **40-minute metro ride**,
- there's **no time left for lunch**,
- the day is **far too packed** for someone travelling with a parent,
- the total quietly **blows the budget**.

Travellers then spend hours cross-checking opening hours and maps.

Wayfarer does one workflow well: **trip request in → a feasible, well-paced, on-budget day-by-day itinerary out**, then lets you refine it in plain language.

## How the harness is designed

It's built on **LangGraph Deep Agents** (`createDeepAgent`, JS), running in Next.js route handlers.

| Harness piece | What it does here | Why |
|---|---|---|
| **Planning** (`write_todos`) | The agent plans its work, and the plan streams into the UI as a live checklist | Keeps a multi-step workflow on track and visible |
| **Skills** | `itinerary-design` (clustering, anchoring, meals, pace, budget) plus one guide per city (`city-lisbon`, `city-rome`, `city-kyoto`: neighbourhood pairings, closures, booking rules, food tips) | Domain knowledge loads on demand, so the base prompt stays small. Adding a city means adding a skill and data, not code |
| **Subagent** `local-expert` | Searches the catalog in an isolated context and returns a shortlist grouped by neighbourhood, with meal spots and closed-day warnings | Keeps raw catalog dumps out of the main context |
| **Virtual filesystem** | The agent writes a booking/packing checklist per trip | Working memory and a deliverable |
| **Custom tools (5)** | `get_trip`, `search_places`, `check_itinerary`, `save_itinerary`, `list_trips` | See below |

The important design choice: **the agent proposes, and code checks.**

- **`check_itinerary`** takes the agent's draft (which places, in what order) and computes the real timeline. Each travel leg is walk or transit based on distance; walking time uses a street-detour factor; transit adds overhead and cost. It then validates:
  - opening hours and closed weekdays,
  - impossible timings,
  - lunch between 11:30 and 14:30, and dinner,
  - pace limits (stops per day, walking minutes, end time),
  - duplicate sights,
  - the total budget.

  It returns problems (which must be fixed) and warnings. The agent loops until the plan is clean.
- **`save_itinerary` re-runs every check on the server** and refuses to save an infeasible plan. The model can't talk its way past a closed museum.
- The UI renders only computed data (times, legs, costs), so what you see is what was checked.

**Demo mode (no API key).** If `ANTHROPIC_API_KEY` isn't set, `OfflinePlannerModel`, a deterministic `BaseChatModel`, drives the *same* graph, tools, subagent, skills and database. It follows the standard workflow: plan → read skills → ask the local-expert → search → draft with a clustering heuristic → check → fix → save → write checklist. It understands a few refinements by keyword (relaxed / packed / cheaper / "add more X"). Anyone can run the full product with zero setup, and the harness is exercised end to end in tests without spending tokens. With a key, Claude Opus 5.5 (main) and Claude Sonnet 5.5 (subagent) take over.

**Persistence (Supabase).** `cities`, `places`, `trips` and `threads`. A thread stores the serialized LangChain messages plus the virtual filesystem and todos, so a trip's conversation resumes after a reload. RLS is on with no public policies, and all access goes through server routes. There's an in-memory fallback for zero-setup local runs.

**Streaming.** `/api/chat` streams NDJSON events: tokens, tool calls and results (subagent calls are tagged), todos and file updates. Every tool call is an expandable step in the agent panel.

## What it does (user flow)

1. Choose a city, start date, days (1–5), per-person budget, pace and interests, then click **Plan my trip**.
2. Watch the agent work: checklist, skills, local-expert shortlist, draft, check (and fix), save.
3. See the result:
   - a hero summary,
   - a budget bar, stop count and walking time,
   - a map with numbered stops and a route per day,
   - a timeline with travel legs ("18 min walk · 1.4 km"), costs and "Open until…" for every stop,
   - tips and warnings.
4. Refine: **Make it more relaxed**, **Cheaper please**, **Add more art**, or type your own request.
5. Trips are saved and listed under **Your trips**.

## Testing

`npm run smoke` runs real planning turns through the full harness in demo mode:

- a full Lisbon plan starting on a Monday (closed-day handling),
- refinements (relaxed, cheaper),
- every city × pace combination,
- checker unit tests: Vatican on a Sunday, missing lunch, impossible cross-town timing, over budget.

I also drove the built app in a headless browser with no API key to confirm the whole flow works.

## How long it took

_[Fill in your actual time]_

## What I'd build next

1. **Live data:** opening hours and ratings from a places API, and real transit routing instead of distance estimates.
2. **Bookings:** timed-ticket links for places that need reservations, plus calendar export (.ics).
3. **More cities:** each one is a skill plus catalog rows, and Claude could draft new city skills from guidebook text.
4. **Collaboration:** share a trip with travel companions and vote on stops.
5. **Evals:** a set of trip requests with tricky constraints (Mondays, Sundays, tight budgets), measuring how many check iterations each model needs and what the result quality is.
