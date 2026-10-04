import type { CriterionScore, Job, Recommendation } from "@/lib/data/types";

/**
 * Deterministic scoring + grounding. The model proposes per-criterion scores
 * and evidence quotes; this code decides whether each quote really appears in
 * the resume, computes the weighted score, and maps it to a recommendation
 * band. Keeping the arithmetic and thresholds out of the LLM makes every
 * scorecard reproducible and explainable to a hiring manager.
 */

export const SCORE_ANCHORS: Record<number, string> = {
  0: "No evidence in the resume",
  1: "Tangential / adjacent experience only",
  2: "Partial: some direct evidence, gaps in depth or recency",
  3: "Solid: clear, direct, recent evidence",
  4: "Exceptional: deep ownership with measurable impact",
};

export const BANDS = { advance: 75, hold: 55 } as const;

export type ProposedScore = {
  criterion_id: string;
  score: number;
  rationale: string;
  evidence: string[];
};

export type EvidenceCheck = { quote: string; verified: boolean };

export type ScoringResult = {
  ok: boolean;
  overall_score: number;
  recommendation: Recommendation;
  must_have_gaps: string[];
  criteria: (CriterionScore & { evidence_checks: EvidenceCheck[] })[];
  problems: string[];
};

const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/[^a-z0-9$%.,'"\-/+ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** A quote is verified if, after normalisation, it is a substring of the resume. */
export function verifyQuote(resume: string, quote: string): boolean {
  const q = normalize(quote).replace(/^[-•*\s]+/, "").replace(/\.\.\.$/, "");
  if (q.length < 8) return false;
  return normalize(resume).includes(q);
}

export function scoreCandidate(job: Job, resume: string, proposed: ProposedScore[]): ScoringResult {
  const problems: string[] = [];
  const byId = new Map(proposed.map((p) => [p.criterion_id, p]));

  for (const p of proposed) {
    if (!job.criteria.some((c) => c.id === p.criterion_id)) {
      problems.push(`Unknown criterion_id "${p.criterion_id}". Use ids from get_job_requisition.`);
    }
  }

  const criteria = job.criteria.map((c) => {
    const p = byId.get(c.id);
    if (!p) {
      problems.push(`Missing score for criterion "${c.id}" (${c.label}).`);
      return {
        criterion_id: c.id,
        label: c.label,
        weight: c.weight,
        must_have: c.must_have,
        score: 0,
        rationale: "Not scored.",
        evidence: [],
        evidence_checks: [],
      };
    }
    const score = Math.max(0, Math.min(4, Math.round(p.score)));
    const evidence_checks = (p.evidence ?? []).map((quote) => ({ quote, verified: verifyQuote(resume, quote) }));
    const unverified = evidence_checks.filter((e) => !e.verified);
    if (unverified.length) {
      problems.push(
        `Criterion "${c.id}": ${unverified.length} evidence quote(s) not found verbatim in the resume: ${unverified
          .map((u) => JSON.stringify(u.quote))
          .join(", ")}. Quote the resume exactly or lower the score.`
      );
    }
    if (score >= 2 && !evidence_checks.some((e) => e.verified)) {
      problems.push(`Criterion "${c.id}" scored ${score} but has no verified evidence quote.`);
    }
    return {
      criterion_id: c.id,
      label: c.label,
      weight: c.weight,
      must_have: c.must_have,
      score,
      rationale: p.rationale,
      evidence: evidence_checks.filter((e) => e.verified).map((e) => e.quote),
      evidence_checks,
    };
  });

  const max = criteria.reduce((a, c) => a + c.weight * 4, 0) || 1;
  const got = criteria.reduce((a, c) => a + c.weight * c.score, 0);
  const overall_score = Math.round((got / max) * 100);
  const must_have_gaps = criteria.filter((c) => c.must_have && c.score <= 1).map((c) => c.label);

  let recommendation: Recommendation;
  if (must_have_gaps.length >= 2 || overall_score < BANDS.hold) recommendation = "reject";
  else if (must_have_gaps.length === 1 || overall_score < BANDS.advance) recommendation = "hold";
  else recommendation = "advance";

  return { ok: problems.length === 0, overall_score, recommendation, must_have_gaps, criteria, problems };
}

// ------------------------------------------------------------- fairness ----

type FairnessRule = { category: string; pattern: RegExp; guidance: string };

/**
 * Lint for language a screener must not rely on (US EEO protected classes and
 * common proxies). This checks the *agent's own writing* — rationales,
 * summaries and outreach — not the candidate's resume.
 */
const RULES: FairnessRule[] = [
  {
    category: "age",
    pattern: /\b(young|youthful|energetic|digital native|older|overqualified|too senior|recent grad(uate)?|age[ds]?|years? old|graduat(ed|ion) (in|year)|(19|20)\d{2} grad)\b/i,
    guidance: "Do not reference age or age proxies (graduation year, 'energetic', 'overqualified').",
  },
  {
    category: "family / caregiving",
    pattern: /\b(mother|father|mom|dad|parent(ing|hood)?|maternity|paternity|pregnan\w*|children|kids|married|marital|family (obligations|commitments)|childcare)\b/i,
    guidance: "Family or caregiving status is not job-related; remove it from the assessment.",
  },
  {
    category: "career gap",
    pattern: /\b(career break|employment gap|gap in (employment|experience)|time off)\b.*\b(concern|risk|red flag|penal|negative|rusty)\b|\b(concern|risk|red flag|rusty)\b.*\b(career break|gap)\b/i,
    guidance: "A career break is not evidence against a criterion; score only demonstrated skills.",
  },
  {
    category: "gender",
    pattern: /\b(he|she|him|her|his|hers|female|male|woman|women|man|men|girl|guy|ladies)\b/i,
    guidance: "Use the candidate's name or 'they' — avoid gendered language and assumptions.",
  },
  {
    category: "national origin / race",
    pattern: /\b(native (english )?speaker|accent|foreign(?! key)|immigrant|nationality|ethnic\w*|race(?! condition)|racial|citizenship|(work )?visa (status|sponsorship)|h-?1b)\b/i,
    guidance: "Do not reference national origin, race, accent or immigration status.",
  },
  {
    category: "religion / disability / health",
    pattern: /\b(religio\w*|church|mosque|temple|disabilit\w*|disabled|health (issue|condition)|illness|medical leave|mental health)\b/i,
    guidance: "Religion, disability and health are protected; remove the reference.",
  },
  {
    category: "subjective 'fit'",
    pattern: /\b(culture fit|cultural fit|not a fit culturally|gut feel(ing)?|vibe)\b/i,
    guidance: "Replace 'culture fit' / gut feel with a specific, job-related criterion.",
  },
];

export type FairnessFlag = { category: string; match: string; excerpt: string; guidance: string };

export function fairnessCheck(text: string): FairnessFlag[] {
  const flags: FairnessFlag[] = [];
  for (const rule of RULES) {
    const re = new RegExp(rule.pattern.source, "gi");
    for (const m of text.matchAll(re)) {
      const i = m.index ?? 0;
      flags.push({
        category: rule.category,
        match: m[0],
        excerpt: text.slice(Math.max(0, i - 40), i + m[0].length + 40).replace(/\s+/g, " "),
        guidance: rule.guidance,
      });
    }
  }
  return flags;
}
