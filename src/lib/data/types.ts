export type Criterion = {
  id: string;
  label: string;
  /** What "good" looks like, written by the hiring manager. */
  signals: string;
  weight: number;
  must_have: boolean;
};

export type Job = {
  id: string;
  title: string;
  company: string;
  team: string;
  location: string;
  comp_range: string;
  summary: string;
  criteria: Criterion[];
  created_at: string;
};

export const STAGES = ["new", "screened", "advance", "hold", "reject"] as const;
export type Stage = (typeof STAGES)[number];

export type Candidate = {
  id: string;
  job_id: string;
  name: string;
  email: string | null;
  headline: string | null;
  source: string | null;
  resume_text: string;
  stage: Stage;
  created_at: string;
};

export type Recommendation = "advance" | "hold" | "reject";

export type CriterionScore = {
  criterion_id: string;
  label: string;
  score: number;
  weight: number;
  must_have: boolean;
  rationale: string;
  evidence: string[];
};

export type Scorecard = {
  id: string;
  candidate_id: string;
  job_id: string;
  overall_score: number;
  recommendation: Recommendation;
  summary: string;
  criteria: CriterionScore[];
  strengths: string[];
  concerns: string[];
  interview_questions: string[];
  outreach_subject: string | null;
  outreach_body: string | null;
  fairness_notes: string[];
  created_at: string;
};

export type StoredFile = { content: string; mimeType?: string; created_at: string; modified_at: string };

export type Todo = { content: string; status: "pending" | "in_progress" | "completed" };

export type Thread = {
  id: string;
  candidate_id: string | null;
  job_id: string;
  /** LangChain StoredMessage[] — serialized so the agent can resume with full history. */
  messages: unknown[];
  files: Record<string, StoredFile>;
  todos: Todo[];
  updated_at: string;
};
