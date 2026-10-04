# Submission note: FixDesk

## The problem

Most US rentals are owned by small landlords: people with a handful of units and no property manager. They handle maintenance from their phone, usually in the evening. A tenant texts *"I smell rotten eggs near the stove"* or *"water is spreading across the floor"*, and the landlord has to work out, quickly and correctly:

- **How urgent is this?** A gas smell means get out now. A dripping faucet can wait a week.
- **What should the tenant do right now?** Shut off the water, and where is the valve? Leave the unit?
- **Who should I send, and what will it cost?** Is it within what I'd approve without thinking?
- **What do I say?** Without admitting liability, promising rent credits, or entering without notice.

Getting this wrong is expensive (water damage, safety incidents, disputes). Getting it slowly is stressful. A generic chatbot is risky here: it can sound confident while under-calling an emergency or inventing details.

FixDesk does one workflow well: **tenant message in → safe, well-scoped work order with drafted messages out.** The owner reviews and sends.

## How the harness is designed

It's built on **LangGraph Deep Agents** (`createDeepAgent`, JS), running in Next.js route handlers on Vercel.

| Harness piece | What it does here | Why |
|---|---|---|
| **Planning** (`write_todos`) | The agent plans the triage, and the plan streams live into the UI | Keeps a 10-step workflow on track and makes it visible |
| **Skills** (`/skills/*/SKILL.md`) | `maintenance-triage` (hazards, rule table, follow-up questions, repeat-issue heuristics) and `tenant-communication` (message structure, entry notice, liability, Fair Housing, vendor dispatch format) | Domain knowledge loads on demand, so the base prompt stays small. An owner could edit their own playbook |
| **Subagent** `history-analyst` | Reviews the unit's past work orders and equipment ages in an isolated context (cheaper model, low effort) | Finds patterns like "third no-heat call on a 17-year-old furnace" without filling the main context |
| **Virtual filesystem** | The agent writes an owner note per request (`/workspace/<id>/owner-note.md`). It persists with the thread and shows in "Agent files" | Gives the agent working memory and an audit trail |
| **Custom tools (7)** | `get_request`, `get_unit_history`, `classify_urgency`, `find_vendors`, `check_message`, `create_work_order`, `list_open_work_orders` | See below |

The important design choice: **the LLM reads and writes, and code decides anything safety- or money-related.**

- **`classify_urgency`.** The model proposes hazards for each issue, backed by *verbatim quotes* from the tenant. Code checks the quotes against the message, then applies a fixed rule table that sets urgency, response window and trade (gas, CO, fire, active leak, sparking, sewage = emergency). A **keyword safety net** escalates on phrases like "rotten eggs", "sparked" or "spreading across the floor" even if the model missed them. It can only raise urgency, never lower it. The tool also returns the tenant safety steps, built from the unit's real shutoff locations.
- **`find_vendors`.** Code filters vendors by trade, service area and 24/7 availability (for emergencies), ranks them, and estimates cost from the callout fee and typical hours, with an after-hours multiplier for emergencies.
- **Approval rule.** Non-emergencies estimated above the owner's limit ($400 in the demo) need approval. Emergencies are never blocked on approval, because life safety and protecting the property come first.
- **`check_message`.** Lints drafts for admitting fault or promising reimbursement, rent-credit promises, guarantees, blaming the tenant, Fair Housing issues, and tenant emails leaking to vendors.
- **`create_work_order`.** **Re-runs all of the above on the server** and refuses to save if:
  - the urgency would be downgraded,
  - the vendor isn't eligible,
  - an emergency tenant message is missing its required safety instruction (e.g. no "shut off" for a leak, no "leave" for gas),
  - either message fails the lint.

  The model fixes the problem and retries, and you can watch that happen in the UI.
- **Human in control.** The agent saves drafts. **Send now** / **Approve & send** / **Mark resolved** are the owner's buttons.

**Persistence (Supabase).** `landlords`, `units`, `vendors`, `requests`, `work_orders`, and `threads`. A thread stores the serialized LangChain messages plus the agent's virtual filesystem and todos, so a request's conversation resumes after a reload or a cold start. History is append-only, which keeps prompt caching effective. RLS is on with no public policies, and all access goes through server routes.

**Streaming.** `/api/chat` streams NDJSON events: tokens, tool calls and results (subagent calls are tagged), todos and file updates. Each tool call renders as an expandable step showing its input and output, so you can see exactly what the harness did.

**Models.** The main agent runs Claude Opus 5.5 at effort `medium`. The history subagent runs Claude Sonnet 5.5 at effort `low`. Both are configurable.

## What it does (user flow)

1. **Today's board** shows open work orders in Emergency / Urgent / Routine columns with respond-by countdowns. The inbox shows untriaged requests first.
2. Open a request and click **Triage with agent**. Watch the plan, the history check, the classification (including the safety net), vendor ranking, message checks and the save.
3. Review the work order: urgency banner, safety steps, why (the rules that fired), vendor and estimate, approval status, scope, and the tenant/vendor drafts ready to copy.
4. Click **Send now** (emergency) or **Approve & send**, then **Mark resolved** later.
5. Follow up in chat: paste the tenant's answer to the agent's questions, ask for a shorter text, or ask "what needs my attention right now?".

## Testing

`npm run smoke` runs a full triage **offline**. It uses the real graph, tools, subagent and repo, with a scripted model standing in for Claude, and unit-tests the rules engine. There are 27 assertions, among them:

- fabricated evidence is rejected,
- the safety net turns an under-called "drip" into an emergency leak,
- non-24/7 vendors are excluded from emergencies,
- a work order without shutoff instructions is refused,
- gas, heat and vague-message rules behave as specified,
- state persists.

I also checked the UI with Playwright at desktop and mobile widths.

## How long it took

_[Fill in your actual time]_. Rough split: scoping and domain rules · harness and tools · Supabase and persistence · UI · deploy, testing and write-up.

## What I'd build next

1. **Real channels.** Receive tenant SMS through Twilio, send the approved messages, and parse the vendor's reply into an ETA.
2. **Photos.** Tenants attach a photo, and a vision model adds evidence (e.g. a water stain spreading on the ceiling).
3. **Human-in-the-loop interrupts** with a Postgres checkpointer, so approval happens mid-run (LangGraph `interruptOn`).
4. **Local rules.** Notice-of-entry hours and habitability timelines per state or city as a skill the owner selects, plus a tenant-facing safety FAQ.
5. **Evals.** A labelled set of tenant messages with expected urgency (especially tricky phrasings of emergencies), tracked across model and prompt changes. Under-triage would be the key metric.
6. **Multi-owner auth** (Supabase Auth + RLS by landlord), vendor portal links, and LangSmith tracing in production.
