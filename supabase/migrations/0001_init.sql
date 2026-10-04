-- FixDesk schema. All access goes through the Next.js server using the
-- service-role key, so RLS is enabled with no public policies (anon is denied).

create table if not exists public.landlords (
  id text primary key,
  name text not null,
  contact_name text not null default '',
  approval_limit numeric not null default 400
);

create table if not exists public.units (
  id text primary key,
  property_name text not null,
  address text not null,
  unit_label text not null,
  tenant_name text not null,
  tenant_phone text not null default '',
  tenant_email text not null default '',
  appliances jsonb not null default '[]'::jsonb,
  shutoffs text not null default '',
  access_notes text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.vendors (
  id text primary key,
  name text not null,
  trades text[] not null,
  phone text not null default '',
  emergency_available boolean not null default false,
  callout_fee numeric not null default 0,
  hourly_rate numeric not null default 0,
  rating numeric not null default 0,
  preferred boolean not null default false,
  service_area text[] not null default '{}',
  notes text not null default ''
);

create table if not exists public.requests (
  id text primary key,
  unit_id text not null references public.units(id) on delete cascade,
  channel text not null default 'portal' check (channel in ('sms', 'email', 'portal')),
  message text not null,
  received_at timestamptz not null default now(),
  status text not null default 'new'
    check (status in ('new', 'triaged', 'awaiting_tenant', 'needs_approval', 'dispatched', 'resolved'))
);
create index if not exists requests_received_idx on public.requests(received_at desc);

create table if not exists public.work_orders (
  id text primary key,
  -- Not a foreign key: seeded history rows reference requests that predate the app.
  request_id text not null,
  unit_id text not null references public.units(id) on delete cascade,
  vendor_id text references public.vendors(id),
  category text not null,
  trade text not null,
  urgency text not null check (urgency in ('emergency', 'urgent', 'routine')),
  respond_within_hours numeric not null,
  respond_by timestamptz not null,
  hazards jsonb not null default '[]'::jsonb,
  rationale text not null default '',
  safety_steps jsonb not null default '[]'::jsonb,
  scope text not null default '',
  followup_questions jsonb not null default '[]'::jsonb,
  estimate_low numeric not null default 0,
  estimate_high numeric not null default 0,
  needs_approval boolean not null default false,
  tenant_message text not null default '',
  vendor_message text,
  status text not null default 'ready'
    check (status in ('ready', 'awaiting_tenant', 'needs_approval', 'dispatched', 'resolved')),
  created_at timestamptz not null default now()
);
create index if not exists work_orders_request_idx on public.work_orders(request_id);
create index if not exists work_orders_unit_idx on public.work_orders(unit_id, created_at desc);

-- One agent conversation per request (or one for the whole inbox).
-- messages = serialized LangChain messages, files = the Deep Agent's virtual
-- filesystem, todos = the agent's plan. Persisting these lets a thread resume.
create table if not exists public.threads (
  id text primary key,
  request_id text,
  messages jsonb not null default '[]'::jsonb,
  files jsonb not null default '{}'::jsonb,
  todos jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.landlords enable row level security;
alter table public.units enable row level security;
alter table public.vendors enable row level security;
alter table public.requests enable row level security;
alter table public.work_orders enable row level security;
alter table public.threads enable row level security;
