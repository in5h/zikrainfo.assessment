-- ScreenPilot schema. All access goes through the Next.js server using the
-- service-role key, so RLS is enabled with no public policies (anon is denied).

create table if not exists public.jobs (
  id text primary key,
  title text not null,
  company text not null,
  team text not null default '',
  location text not null default '',
  comp_range text not null default '',
  summary text not null default '',
  criteria jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.candidates (
  id text primary key,
  job_id text not null references public.jobs(id) on delete cascade,
  name text not null,
  email text,
  headline text,
  source text,
  resume_text text not null,
  stage text not null default 'new'
    check (stage in ('new', 'screened', 'advance', 'hold', 'reject')),
  created_at timestamptz not null default now()
);
create index if not exists candidates_job_idx on public.candidates(job_id);

create table if not exists public.scorecards (
  id uuid primary key default gen_random_uuid(),
  candidate_id text not null references public.candidates(id) on delete cascade,
  job_id text not null references public.jobs(id) on delete cascade,
  overall_score numeric not null,
  recommendation text not null check (recommendation in ('advance', 'hold', 'reject')),
  summary text not null default '',
  criteria jsonb not null default '[]'::jsonb,
  strengths jsonb not null default '[]'::jsonb,
  concerns jsonb not null default '[]'::jsonb,
  interview_questions jsonb not null default '[]'::jsonb,
  outreach_subject text,
  outreach_body text,
  fairness_notes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists scorecards_candidate_idx on public.scorecards(candidate_id, created_at desc);

-- One agent conversation per candidate (or per job for pipeline questions).
-- messages = serialized LangChain messages, files = the Deep Agent's virtual
-- filesystem, todos = the agent's plan. Persisting these lets a thread resume.
create table if not exists public.threads (
  id text primary key,
  candidate_id text references public.candidates(id) on delete cascade,
  job_id text not null references public.jobs(id) on delete cascade,
  messages jsonb not null default '[]'::jsonb,
  files jsonb not null default '{}'::jsonb,
  todos jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.jobs enable row level security;
alter table public.candidates enable row level security;
alter table public.scorecards enable row level security;
alter table public.threads enable row level security;
