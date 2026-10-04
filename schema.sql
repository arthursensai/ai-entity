-- Run this once in your Supabase SQL Editor

create table if not exists thoughts (
  id          bigserial primary key,
  iteration   integer      not null,
  reflection  text         not null,
  memories    text[]       default '{}',
  context     jsonb        default '{}',
  created_at  timestamptz  default now()
);

-- Enable Row Level Security
alter table thoughts enable row level security;

-- Public can read everything (this is an open experiment)
create policy "Public read"
  on thoughts for select
  using (true);

-- Enable real-time so the dashboard updates live
alter publication supabase_realtime add table thoughts;
