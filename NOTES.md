# Submission note: ScreenPilot

## The problem

A recruiter on a busy technical req reads 100–300 resumes per opening. First-pass screening has three recurring problems:

1. **It's slow.** Each resume takes 5–10 minutes against a rubric, and longer if you also write a note and an email.
2. **It's inconsistent.** Different recruiters, or the same recruiter at 9am and at 6pm, weigh criteria differently. Hiring managers get "seems strong" with no evidence attached.
3. **It's risky.** Generic LLM chat makes this worse. It paraphrases or invents experience ("led a team of 40"), and it happily picks up on age, family status or career gaps.

ScreenPilot does one workflow: **screen one resume against a hiring manager's weighted rubric and produce a scorecard a human can trust.** That means quote-backed scores, a deterministic recommendation, an interview plan aimed at the gaps, and a draft email. The recruiter makes the decision.

## How the harness is designed

It's built on **LangGraph Deep Agents** (`createDeepAgent`, JS), running inside Next.js route handlers on Vercel.

| Harness piece | What it does here | Why |
|---|---|---|
| **Planning** (`write_todos`) | The agent plans the screen, and the plan streams live into the UI | Makes long multi-step runs legible and keeps the model on the workflow |
| **Skills** (`/skills/*/SKILL.md`) | `structured-screening` (0–4 anchors, evidence rules, bands), `fair-hiring` (EEO guardrails), `candidate-outreach` (email playbook) | Domain knowledge is loaded on demand, so the base prompt stays small. Recruiting leads can edit a skill without touching code |
| **Subagent** `evidence-extractor` | Reads the resume against the rubric in an isolated context and returns verbatim quotes per criterion (cheaper model, low effort) | Keeps the main context clean and splits "find evidence" from "judge evidence" |
| **Virtual filesystem** | The agent writes working notes (e.g. `/workspace/<id>/evidence.md`). These persist per thread and show up in the "Agent files" tab | Gives the agent scratch memory and makes its work auditable |
| **Custom tools (6)** | `get_job_requisition`, `get_candidate_profile`, `list_pipeline`, `score_candidate`, `fairness_check`, `save_scorecard` | See below |

The important design choice: **the LLM proposes and code decides.**

- `score_candidate` checks every evidence quote verbatim against the resume (after normalising whitespace, case and dashes). It rejects scores of 2 or more that have no verified quote. It computes the weighted 0–100 score and maps it to *advance / hold / reject* using fixed thresholds and must-have gaps. The model fixes problems and retries; in the UI you see "2 problems — revising" and then a pass.
- `fairness_check` lints the agent's *own* writing for protected characteristics and their proxies (age, graduation year, family status, gender, national origin, health, career-gap penalties, "culture fit"). It avoids domain false positives such as "Visa" the card network, "race condition" and "foreign key".
- `save_scorecard` **re-runs both checks on the server** and refuses to persist if either fails. A prompt injection or a sloppy model run can't save an ungrounded or biased scorecard.
- The agent only *recommends*. It sets the candidate to `screened`. Advance, Hold and Decline are human buttons.

**Persistence (Supabase).** `jobs`, `candidates`, `scorecards`, and `threads`. A thread stores the serialized LangChain messages plus the agent's virtual filesystem and todos, so a conversation picks up where it left off after a reload or a cold start. History is append-only, which preserves prompt caching and thinking blocks. RLS is on with no public policies, and all access goes through server routes.

**Streaming.** `/api/chat` streams NDJSON events: tokens, tool calls and results (subagent calls are tagged), todos and file updates. The UI renders each tool call as an expandable step showing its input and output, so the harness is visible rather than a black box.

**Models.** The main agent runs Claude Opus 5.5 with adaptive thinking at effort `medium`. The subagent runs Claude Sonnet 5.5 at effort `low`. Both are configurable by environment variable.

## What it does (user flow)

1. Pick a job. You see the hiring manager's rubric (weights and must-haves) and a ranked pipeline.
2. Pick a candidate (or paste a new resume) and click **Run AI screen**.
3. Watch the plan, the subagent delegation, quote verification, the fairness lint and the save, all live.
4. Review the scorecard: per-criterion pips with quoted evidence, strengths, gaps, an interview plan and a draft email you can copy.
5. Decide: Advance, Hold or Decline. Follow up in chat ("make the email shorter", "explain the payments score"). Edits are re-linted and re-saved.
6. Ask at the pipeline level: "Who should I interview first?"

## Testing

`npm run smoke` runs a full screening turn **offline**. It uses the real graph, tools, subagent and repo, with a scripted model in place of Claude. It asserts that:

- a fabricated quote is rejected,
- biased text is flagged,
- subagent events stream,
- todos stream,
- the scorecard is persisted with the right band,
- the stage changes,
- the thread state is saved.

I also checked the UI at desktop and mobile widths with Playwright.

## How long it took

_[Fill in your actual time]_. Rough split: scoping and domain design · harness and tools · Supabase and persistence · UI · deploy, testing and write-up.

## What I'd build next

1. **PDF/DOCX resume upload** using Supabase Storage and text extraction, plus an ATS import (Greenhouse/Lever webhooks).
2. **Batch screening.** Fan out across a whole req with async subagents, then a calibration view showing the score distribution and outliers.
3. **Human-in-the-loop approval** on `save_scorecard` and email sending (LangGraph `interruptOn` with a Postgres checkpointer), plus an actual send through Gmail or Outlook.
4. **Rubric builder.** Turn a raw job description into a weighted rubric with a hiring manager review step.
5. **Evals.** A labelled set of resume and rubric pairs with expected bands, scoring drift tracking across model and prompt changes, plus adverse-impact monitoring across the pipeline.
6. **Auth and multi-tenant orgs** (Supabase Auth + RLS by org), an audit log of every agent decision, and LangSmith tracing in production.
