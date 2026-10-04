import "server-only";
import { tool } from "langchain";
import { z } from "zod";

import { getRepo } from "@/lib/data/repo";
import { fairnessCheck, scoreCandidate } from "./scoring";

const proposedScore = z.object({
  criterion_id: z.string().describe("Criterion id from get_job_requisition"),
  score: z.number().int().min(0).max(4).describe("0–4 per the structured-screening anchors"),
  rationale: z.string().describe("One sentence, job-related, using the candidate's name or 'they'"),
  evidence: z.array(z.string()).describe("Verbatim quotes copied from the resume"),
});

const json = (v: unknown) => JSON.stringify(v, null, 2);

export const getJobRequisition = tool(
  async ({ job_id }) => {
    const job = await getRepo().getJob(job_id);
    if (!job) return `No job with id "${job_id}".`;
    return json(job);
  },
  {
    name: "get_job_requisition",
    description:
      "Fetch a job requisition: title, logistics, comp, and the hiring manager's weighted rubric (criteria with ids, signals, weight, must_have).",
    schema: z.object({ job_id: z.string() }),
  }
);

export const getCandidateProfile = tool(
  async ({ candidate_id }) => {
    const c = await getRepo().getCandidate(candidate_id);
    if (!c) return `No candidate with id "${candidate_id}".`;
    return json({ id: c.id, job_id: c.job_id, name: c.name, headline: c.headline, source: c.source, stage: c.stage, resume_text: c.resume_text });
  },
  {
    name: "get_candidate_profile",
    description: "Fetch a candidate's profile and full resume text.",
    schema: z.object({ candidate_id: z.string() }),
  }
);

export const listPipeline = tool(
  async ({ job_id }) => {
    const repo = getRepo();
    const [candidates, cards] = await Promise.all([repo.listCandidates(job_id), repo.latestScorecardsForJob(job_id)]);
    return json(
      candidates.map((c) => {
        const s = cards[c.id];
        return {
          candidate_id: c.id,
          name: c.name,
          headline: c.headline,
          stage: c.stage,
          scorecard: s
            ? {
                overall_score: s.overall_score,
                recommendation: s.recommendation,
                summary: s.summary,
                criteria: s.criteria.map((x) => ({ id: x.criterion_id, score: x.score })),
                concerns: s.concerns,
              }
            : null,
        };
      })
    );
  },
  {
    name: "list_pipeline",
    description:
      "List every candidate for a job with their stage and latest saved scorecard (score, recommendation, per-criterion scores). Use for comparisons and pipeline questions.",
    schema: z.object({ job_id: z.string() }),
  }
);

export const scoreCandidateTool = tool(
  async ({ candidate_id, scores }) => {
    const repo = getRepo();
    const c = await repo.getCandidate(candidate_id);
    if (!c) return `No candidate with id "${candidate_id}".`;
    const job = await repo.getJob(c.job_id);
    if (!job) return `Job "${c.job_id}" not found.`;
    const r = scoreCandidate(job, c.resume_text, scores);
    return json({
      ok: r.ok,
      overall_score: r.overall_score,
      recommendation: r.recommendation,
      must_have_gaps: r.must_have_gaps,
      problems: r.problems,
      criteria: r.criteria.map((x) => ({
        id: x.criterion_id,
        score: x.score,
        weight: x.weight,
        must_have: x.must_have,
        evidence_checks: x.evidence_checks,
      })),
      next: r.ok
        ? "Scores verified. Continue with interview questions and outreach."
        : "Fix the problems above and call score_candidate again.",
    });
  },
  {
    name: "score_candidate",
    description:
      "Verify and compute a candidate's scorecard. Checks every evidence quote is verbatim in the resume, computes the weighted 0–100 score, and assigns the recommendation band (advance/hold/reject) using the rubric's weights and must-haves. Deterministic — always use this instead of computing scores yourself.",
    schema: z.object({ candidate_id: z.string(), scores: z.array(proposedScore) }),
  }
);

export const fairnessCheckTool = tool(
  async ({ text }) => {
    const flags = fairnessCheck(text);
    return json(
      flags.length
        ? { clean: false, flags, next: "Rewrite the flagged passages (or document a genuine false positive) and re-run." }
        : { clean: true, flags: [] }
    );
  },
  {
    name: "fairness_check",
    description:
      "Lint text YOU wrote (rationales, summary, concerns, interview questions, outreach) for references to protected characteristics or their proxies (age, family status, gender, national origin, health, career-gap penalties, 'culture fit'). Returns flagged excerpts with guidance.",
    schema: z.object({ text: z.string() }),
  }
);

export const saveScorecard = tool(
  async (input) => {
    const repo = getRepo();
    const c = await repo.getCandidate(input.candidate_id);
    if (!c) return `No candidate with id "${input.candidate_id}".`;
    const job = await repo.getJob(c.job_id);
    if (!job) return `Job "${c.job_id}" not found.`;

    // Re-verify server-side: the model cannot save a score it didn't earn.
    const r = scoreCandidate(job, c.resume_text, input.scores);
    if (!r.ok) return json({ saved: false, problems: r.problems });

    const written = [
      input.summary,
      ...r.criteria.map((x) => x.rationale),
      ...input.strengths,
      ...input.concerns,
      ...input.interview_questions,
      input.outreach_subject,
      input.outreach_body,
    ].join("\n");
    const ack = new Set(input.acknowledged_false_positives.map((s) => s.toLowerCase()));
    const flags = fairnessCheck(written).filter((f) => !ack.has(f.match.toLowerCase()));
    if (flags.length) return json({ saved: false, fairness_flags: flags, next: "Rewrite and call save_scorecard again." });

    const saved = await repo.saveScorecard({
      candidate_id: c.id,
      job_id: job.id,
      overall_score: r.overall_score,
      recommendation: r.recommendation,
      summary: input.summary,
      criteria: r.criteria.map((c) => ({ criterion_id: c.criterion_id, label: c.label, score: c.score, weight: c.weight, must_have: c.must_have, rationale: c.rationale, evidence: c.evidence })),
      strengths: input.strengths,
      concerns: input.concerns,
      interview_questions: input.interview_questions,
      outreach_subject: input.outreach_subject,
      outreach_body: input.outreach_body,
      fairness_notes: input.fairness_notes,
    });
    if (c.stage === "new") await repo.setStage(c.id, "screened");
    return json({
      saved: true,
      scorecard_id: saved.id,
      overall_score: saved.overall_score,
      recommendation: saved.recommendation,
      note: "Saved. Candidate is 'screened'; the recruiter will set the final stage.",
    });
  },
  {
    name: "save_scorecard",
    description:
      "Persist the final scorecard to the database. Re-verifies evidence and fairness server-side and refuses to save if either fails. Call once at the end of a screen, and again after any revision (send the full scorecard).",
    schema: z.object({
      candidate_id: z.string(),
      scores: z.array(proposedScore),
      summary: z.string().describe("2–3 sentence, evidence-based summary"),
      strengths: z.array(z.string()).max(5),
      concerns: z.array(z.string()).max(5).describe("Job-related gaps only"),
      interview_questions: z.array(z.string()).min(3).max(6),
      outreach_subject: z.string(),
      outreach_body: z.string(),
      fairness_notes: z.array(z.string()).describe("Neutral notes on details excluded from scoring; may be empty"),
      acknowledged_false_positives: z
        .array(z.string())
        .describe("Exact flagged words that are genuine false positives (e.g. 'Visa' the card network). Usually empty."),
    }),
  }
);

export const evidenceTools = [getJobRequisition, getCandidateProfile];
export const allTools = [getJobRequisition, getCandidateProfile, listPipeline, scoreCandidateTool, fairnessCheckTool, saveScorecard];
