-- Wayfarer schema. All access goes through the Next.js server using the
-- service-role key, so RLS is enabled with no public policies (anon is denied).

create table if not exists public.cities (
  id text primary key,
  name text not null,
  country text not null,
  center double precision[] not null,
  tagline text not null default '',
  transit_cost numeric not null default 2
);

create table if not exists public.places (
  id text primary key,
  city_id text not null references public.cities(id) on delete cascade,
  name text not null,
  category text not null,
  interests text[] not null default '{}',
  lat double precision not null,
  lng double precision not null,
  neighborhood text not null default '',
  hours jsonb not null,
  duration_min integer not null,
  cost numeric not null default 0,
  rating numeric not null default 0,
  meals text[],
  blurb text not null default ''
);
create index if not exists places_city_idx on public.places(city_id);

create table if not exists public.trips (
  id text primary key,
  city_id text not null references public.cities(id),
  title text not null,
  start_date date not null,
  days_count integer not null check (days_count between 1 and 5),
  budget numeric not null,
  interests text[] not null default '{}',
  pace text not null check (pace in ('relaxed', 'balanced', 'packed')),
  notes text not null default '',
  status text not null default 'draft' check (status in ('draft', 'planned')),
  days jsonb not null default '[]'::jsonb,
  summary text not null default '',
  tips jsonb not null default '[]'::jsonb,
  total_cost numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One agent conversation per trip. messages = serialized LangChain messages,
-- files = the Deep Agent's virtual filesystem, todos = the agent's plan.
create table if not exists public.threads (
  id text primary key,
  trip_id text,
  messages jsonb not null default '[]'::jsonb,
  files jsonb not null default '{}'::jsonb,
  todos jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.cities enable row level security;
alter table public.places enable row level security;
alter table public.trips enable row level security;
alter table public.threads enable row level security;
