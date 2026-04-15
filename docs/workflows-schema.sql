-- Supabase Workflow Automation Schema
-- Core tables for workflows, steps, runs, queue, and logs.

create table if not exists workflows (
  id uuid primary key,
  user_id uuid not null,
  name text not null,
  trigger_type text not null, -- event | webhook | schedule
  trigger_config jsonb not null default '{}'::jsonb,
  is_active boolean not null default false,
  created_at timestamp with time zone not null default now()
);

create table if not exists workflow_steps (
  id uuid primary key,
  workflow_id uuid not null references workflows(id) on delete cascade,
  step_order integer not null,
  type text not null, -- condition | action | delay
  config jsonb not null default '{}'::jsonb
);

create table if not exists workflow_runs (
  id uuid primary key,
  workflow_id uuid not null references workflows(id) on delete cascade,
  status text not null, -- pending | running | completed | failed
  current_step integer not null default 0,
  context jsonb not null default '{}'::jsonb,
  started_at timestamp with time zone not null default now(),
  finished_at timestamp with time zone
);

create table if not exists workflow_queue (
  id uuid primary key,
  run_id uuid not null references workflow_runs(id) on delete cascade,
  step_index integer not null,
  execute_at timestamp with time zone not null
);

create table if not exists workflow_logs (
  id uuid primary key,
  run_id uuid not null references workflow_runs(id) on delete cascade,
  step_index integer,
  message text not null,
  status text not null,
  created_at timestamp with time zone not null default now()
);
