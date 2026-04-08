CREATE TABLE IF NOT EXISTS app_sequences (
  id UUID PRIMARY KEY,
  org_id UUID NOT NULL,
  owner_user_id UUID NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP(6) NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP(6) NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS app_sequences_org_status_idx
ON app_sequences (org_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS app_sequence_enrollments (
  id UUID PRIMARY KEY,
  sequence_id UUID NOT NULL,
  org_id UUID NOT NULL,
  contact_id UUID NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  current_step_index INTEGER NOT NULL DEFAULT 0,
  next_run_at TIMESTAMP(6),
  paused_until TIMESTAMP(6),
  finished_reason VARCHAR(100),
  last_activity_at TIMESTAMP(6) NOT NULL DEFAULT NOW(),
  send_from_user_id UUID,
  created_at TIMESTAMP(6) NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP(6) NOT NULL DEFAULT NOW(),
  CONSTRAINT app_sequence_enrollments_sequence_contact_unique UNIQUE (sequence_id, contact_id)
);

CREATE INDEX IF NOT EXISTS app_sequence_enrollments_org_status_idx
ON app_sequence_enrollments (org_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS app_sequence_enrollments_sequence_idx
ON app_sequence_enrollments (sequence_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS app_sequence_events (
  id UUID PRIMARY KEY,
  org_id UUID NOT NULL,
  sequence_id UUID NOT NULL,
  enrollment_id UUID,
  contact_id UUID,
  event_type VARCHAR(50) NOT NULL,
  event_summary TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP(6) NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS app_sequence_events_org_created_idx
ON app_sequence_events (org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS app_sequence_events_sequence_idx
ON app_sequence_events (sequence_id, created_at DESC);

CREATE TABLE IF NOT EXISTS app_tasks (
  id UUID PRIMARY KEY,
  org_id UUID NOT NULL,
  source_type VARCHAR(50) NOT NULL DEFAULT 'sequence',
  sequence_id UUID,
  enrollment_id UUID,
  contact_id UUID,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  due_at TIMESTAMP(6),
  completed_at TIMESTAMP(6),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP(6) NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP(6) NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS app_tasks_org_status_idx
ON app_tasks (org_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS app_tasks_sequence_idx
ON app_tasks (sequence_id, updated_at DESC);
