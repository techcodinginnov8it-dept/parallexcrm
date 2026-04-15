import prisma from '@/lib/db';
import { randomUUID } from 'crypto';
import { ensureSequencesTables, enrollContactsInSequence } from '@/lib/sequences-store';

export type WorkflowStatus = 'draft' | 'active' | 'paused';
export type WorkflowTrigger =
  | 'new_lead'
  | 'lead_stage_changed'
  | 'sequence_completed'
  | 'task_completed'
  | 'inbound_form';

export type WorkflowCondition = {
  id: string;
  field: 'stage' | 'owner' | 'company_size' | 'country';
  operator: 'is' | 'is_not' | 'contains';
  value: string;
};

export type WorkflowAction = {
  id: string;
  type: 'send_email' | 'create_task' | 'enroll_sequence' | 'update_stage' | 'notify_owner';
  value: string;
};

export type WorkflowRecord = {
  id: string;
  name: string;
  status: WorkflowStatus;
  trigger: WorkflowTrigger;
  delayDays: number;
  conditions: WorkflowCondition[];
  actions: WorkflowAction[];
  createdAt: string;
  updatedAt: string;
};

export type WorkflowPayload = {
  name?: unknown;
  status?: unknown;
  trigger?: unknown;
  delayDays?: unknown;
  conditions?: unknown;
  actions?: unknown;
};

const STATUS_VALUES = new Set<WorkflowStatus>(['draft', 'active', 'paused']);
const TRIGGER_VALUES = new Set<WorkflowTrigger>([
  'new_lead',
  'lead_stage_changed',
  'sequence_completed',
  'task_completed',
  'inbound_form',
]);

class WorkflowStoreError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function toIsoString(value: Date | string | null) {
  if (!value) return new Date().toISOString();
  if (value instanceof Date) return value.toISOString();
  try {
    return new Date(value).toISOString();
  } catch {
    return String(value);
  }
}

function normalizeName(value: unknown, fallback = 'New workflow') {
  const name = String(value || fallback).trim().slice(0, 255);
  if (!name) return fallback;
  return name;
}

function normalizeStatus(value: unknown, fallback: WorkflowStatus = 'draft'): WorkflowStatus {
  const raw = String(value || fallback).trim().toLowerCase() as WorkflowStatus;
  return STATUS_VALUES.has(raw) ? raw : fallback;
}

function normalizeTrigger(value: unknown, fallback: WorkflowTrigger = 'new_lead'): WorkflowTrigger {
  const raw = String(value || fallback).trim() as WorkflowTrigger;
  return TRIGGER_VALUES.has(raw) ? raw : fallback;
}

function normalizeDelay(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(30, Math.round(parsed)));
}

function normalizeList<T>(value: unknown): T[] {
  if (!Array.isArray(value)) return [];
  return value.filter(Boolean) as T[];
}

export async function ensureWorkflowsTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS app_workflows (
      id UUID PRIMARY KEY,
      org_id UUID NOT NULL,
      owner_user_id UUID,
      name TEXT NOT NULL,
      status TEXT NOT NULL,
      trigger TEXT NOT NULL,
      delay_days INTEGER NOT NULL DEFAULT 0,
      conditions JSONB NOT NULL DEFAULT '[]',
      actions JSONB NOT NULL DEFAULT '[]',
      created_at TIMESTAMP(6) NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP(6) NOT NULL DEFAULT NOW()
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS app_workflows_org_created_idx
    ON app_workflows (org_id, created_at DESC)
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS app_workflow_runs (
      id UUID PRIMARY KEY,
      workflow_id UUID NOT NULL,
      org_id UUID NOT NULL,
      last_run_at TIMESTAMP(6),
      created_at TIMESTAMP(6) NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP(6) NOT NULL DEFAULT NOW()
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS app_workflow_runs_workflow_idx
    ON app_workflow_runs (workflow_id)
  `);
}

function mapRow(row: any): WorkflowRecord {
  return {
    id: row.id,
    name: row.name,
    status: normalizeStatus(row.status),
    trigger: normalizeTrigger(row.trigger),
    delayDays: Number(row.delay_days || 0),
    conditions: normalizeList<WorkflowCondition>(row.conditions),
    actions: normalizeList<WorkflowAction>(row.actions),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

export async function listWorkflows(orgId: string): Promise<WorkflowRecord[]> {
  await ensureWorkflowsTable();
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `
      SELECT id, name, status, trigger, delay_days, conditions, actions, created_at, updated_at
      FROM app_workflows
      WHERE org_id = $1
      ORDER BY created_at DESC
    `,
    orgId
  );
  return rows.map(mapRow);
}

export async function getWorkflow(orgId: string, workflowId: string): Promise<WorkflowRecord | null> {
  await ensureWorkflowsTable();
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `
      SELECT id, name, status, trigger, delay_days, conditions, actions, created_at, updated_at
      FROM app_workflows
      WHERE org_id = $1 AND id = $2
      LIMIT 1
    `,
    orgId,
    workflowId
  );
  if (!rows?.length) return null;
  return mapRow(rows[0]);
}

export async function createWorkflow(
  orgId: string,
  ownerUserId: string,
  payload: WorkflowPayload
): Promise<WorkflowRecord> {
  await ensureWorkflowsTable();
  const workflowId = randomUUID();
  const name = normalizeName(payload.name);
  const status = normalizeStatus(payload.status);
  const trigger = normalizeTrigger(payload.trigger);
  const delayDays = normalizeDelay(payload.delayDays);
  const conditions = normalizeList<WorkflowCondition>(payload.conditions);
  const actions = normalizeList<WorkflowAction>(payload.actions);

  await prisma.$executeRawUnsafe(
    `
      INSERT INTO app_workflows (
        id,
        org_id,
        owner_user_id,
        name,
        status,
        trigger,
        delay_days,
        conditions,
        actions,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, NOW(), NOW())
    `,
    workflowId,
    orgId,
    ownerUserId,
    name,
    status,
    trigger,
    delayDays,
    JSON.stringify(conditions),
    JSON.stringify(actions)
  );

  const workflow = await getWorkflow(orgId, workflowId);
  if (!workflow) {
    throw new WorkflowStoreError('Failed to create workflow.', 500);
  }
  return workflow;
}

export async function updateWorkflow(
  orgId: string,
  workflowId: string,
  payload: WorkflowPayload
): Promise<WorkflowRecord> {
  await ensureWorkflowsTable();
  const existing = await getWorkflow(orgId, workflowId);
  if (!existing) {
    throw new WorkflowStoreError('Workflow not found.', 404);
  }

  const name = normalizeName(payload.name, existing.name);
  const status = normalizeStatus(payload.status, existing.status);
  const trigger = normalizeTrigger(payload.trigger, existing.trigger);
  const delayDays = normalizeDelay(payload.delayDays, existing.delayDays);
  const conditions = payload.conditions ? normalizeList<WorkflowCondition>(payload.conditions) : existing.conditions;
  const actions = payload.actions ? normalizeList<WorkflowAction>(payload.actions) : existing.actions;

  await prisma.$executeRawUnsafe(
    `
      UPDATE app_workflows
      SET
        name = $3,
        status = $4,
        trigger = $5,
        delay_days = $6,
        conditions = $7::jsonb,
        actions = $8::jsonb,
        updated_at = NOW()
      WHERE org_id = $1 AND id = $2
    `,
    orgId,
    workflowId,
    name,
    status,
    trigger,
    delayDays,
    JSON.stringify(conditions),
    JSON.stringify(actions)
  );

  const workflow = await getWorkflow(orgId, workflowId);
  if (!workflow) {
    throw new WorkflowStoreError('Failed to update workflow.', 500);
  }
  return workflow;
}

export async function removeWorkflow(orgId: string, workflowId: string) {
  await ensureWorkflowsTable();
  await prisma.$executeRawUnsafe(
    `
      DELETE FROM app_workflows
      WHERE org_id = $1 AND id = $2
    `,
    orgId,
    workflowId
  );
}

type WorkflowRunSummary = {
  workflowsProcessed: number;
  itemsMatched: number;
  actionsExecuted: number;
};

async function getLastRunAt(orgId: string, workflowId: string) {
  await ensureWorkflowsTable();
  const rows = await prisma.$queryRawUnsafe<Array<{ last_run_at: Date | null }>>(
    `
      SELECT last_run_at
      FROM app_workflow_runs
      WHERE org_id = $1 AND workflow_id = $2
      LIMIT 1
    `,
    orgId,
    workflowId
  );
  return rows?.[0]?.last_run_at ?? null;
}

async function setLastRunAt(orgId: string, workflowId: string, value: Date) {
  await ensureWorkflowsTable();
  const existing = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `
      SELECT id
      FROM app_workflow_runs
      WHERE org_id = $1 AND workflow_id = $2
      LIMIT 1
    `,
    orgId,
    workflowId
  );
  if (existing?.length) {
    await prisma.$executeRawUnsafe(
      `
        UPDATE app_workflow_runs
        SET last_run_at = $3, updated_at = NOW()
        WHERE org_id = $1 AND workflow_id = $2
      `,
      orgId,
      workflowId,
      value
    );
    return;
  }
  await prisma.$executeRawUnsafe(
    `
      INSERT INTO app_workflow_runs (id, workflow_id, org_id, last_run_at, created_at, updated_at)
      VALUES ($1, $2, $3, $4, NOW(), NOW())
    `,
    randomUUID(),
    workflowId,
    orgId,
    value
  );
}

function matchesCondition(
  condition: WorkflowCondition,
  data: Record<string, unknown>
): boolean {
  const raw = data[condition.field];
  if (raw == null) return false;
  const value = String(raw).toLowerCase();
  const expected = String(condition.value || '').toLowerCase();
  if (!expected) return true;
  if (condition.operator === 'is') return value === expected;
  if (condition.operator === 'is_not') return value !== expected;
  return value.includes(expected);
}

async function createWorkflowTask(
  orgId: string,
  title: string,
  description: string | null,
  contactId?: string | null
) {
  await ensureSequencesTables();
  await prisma.$executeRawUnsafe(
    `
      INSERT INTO app_tasks (
        id,
        org_id,
        source_type,
        contact_id,
        title,
        description,
        status,
        created_at,
        updated_at
      )
      VALUES ($1, $2, 'workflow', $3, $4, $5, 'open', NOW(), NOW())
    `,
    randomUUID(),
    orgId,
    contactId || null,
    title,
    description
  );
}

async function resolveSequenceId(orgId: string, value: string) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `
      SELECT id
      FROM app_sequences
      WHERE org_id = $1 AND (id::text = $2 OR name ILIKE $3)
      LIMIT 1
    `,
    orgId,
    trimmed,
    trimmed
  );
  return rows?.[0]?.id || null;
}

export async function runWorkflows(orgId: string, ownerUserId: string): Promise<WorkflowRunSummary> {
  await ensureWorkflowsTable();
  const workflows = await listWorkflows(orgId);
  const activeWorkflows = workflows.filter((wf) => wf.status === 'active');

  let itemsMatched = 0;
  let actionsExecuted = 0;

  for (const workflow of activeWorkflows) {
    const lastRunAt = await getLastRunAt(orgId, workflow.id);
    const since = lastRunAt || new Date(Date.now() - 24 * 60 * 60 * 1000);
    const candidates: Array<{ contactId?: string; leadId?: string; data: Record<string, unknown> }> = [];

    if (workflow.trigger === 'new_lead') {
      const leads = await prisma.lead.findMany({
        where: { org_id: orgId, created_at: { gt: since } },
        select: { id: true, name: true, status: true, created_at: true },
      });
      leads.forEach((lead) => {
        candidates.push({ leadId: lead.id, data: { stage: lead.status, name: lead.name } });
      });
    }

    if (workflow.trigger === 'lead_stage_changed') {
      const contacts = await prisma.contact.findMany({
        where: { org_id: orgId, updated_at: { gt: since } },
        select: { id: true, stage: true, country: true, owner_id: true, company_id: true },
      });
      for (const contact of contacts) {
        let companySize: number | null = null;
        if (contact.company_id) {
          const company = await prisma.company.findUnique({
            where: { id: contact.company_id },
            select: { employee_count: true },
          });
          companySize = company?.employee_count ?? null;
        }
        candidates.push({
          contactId: contact.id,
          data: {
            stage: contact.stage,
            owner: contact.owner_id,
            country: contact.country,
            company_size: companySize,
          },
        });
      }
    }

    if (workflow.trigger === 'sequence_completed') {
      await ensureSequencesTables();
      const rows = await prisma.$queryRawUnsafe<Array<{ contact_id: string | null }>>(
        `
          SELECT contact_id
          FROM app_sequence_events
          WHERE org_id = $1 AND event_type = 'sequence_completed' AND created_at > $2
        `,
        orgId,
        since
      );
      rows.forEach((row) => {
        if (row.contact_id) {
          candidates.push({ contactId: row.contact_id, data: {} });
        }
      });
    }

    if (workflow.trigger === 'task_completed') {
      await ensureSequencesTables();
      const rows = await prisma.$queryRawUnsafe<Array<{ contact_id: string | null }>>(
        `
          SELECT contact_id
          FROM app_tasks
          WHERE org_id = $1 AND status = 'completed' AND updated_at > $2
        `,
        orgId,
        since
      );
      rows.forEach((row) => {
        if (row.contact_id) {
          candidates.push({ contactId: row.contact_id, data: {} });
        }
      });
    }

    if (workflow.trigger === 'inbound_form') {
      // Placeholder trigger; no data source yet.
    }

    const matches = candidates.filter((candidate) =>
      workflow.conditions.length === 0
        ? true
        : workflow.conditions.every((condition) => matchesCondition(condition, candidate.data))
    );

    itemsMatched += matches.length;

    for (const candidate of matches) {
      for (const action of workflow.actions) {
        if (action.type === 'create_task') {
          await createWorkflowTask(
            orgId,
            action.value || 'Workflow task',
            `Workflow "${workflow.name}" created a task.`,
            candidate.contactId || null
          );
          actionsExecuted += 1;
        }

        if (action.type === 'send_email') {
          await createWorkflowTask(
            orgId,
            `Send email: ${action.value || workflow.name}`,
            'Email send action triggered by workflow.',
            candidate.contactId || null
          );
          actionsExecuted += 1;
        }

        if (action.type === 'notify_owner') {
          await createWorkflowTask(
            orgId,
            `Notify owner: ${action.value || workflow.name}`,
            'Owner notification triggered by workflow.',
            candidate.contactId || null
          );
          actionsExecuted += 1;
        }

        if (action.type === 'update_stage' && candidate.contactId) {
          await prisma.$executeRawUnsafe(
            `
              UPDATE Contact
              SET stage = $2, updated_at = NOW()
              WHERE id = $1
            `,
            candidate.contactId,
            action.value || 'cold'
          );
          actionsExecuted += 1;
        }

        if (action.type === 'enroll_sequence' && candidate.contactId) {
          const sequenceId = await resolveSequenceId(orgId, action.value || '');
          if (sequenceId) {
            await enrollContactsInSequence(orgId, sequenceId, [candidate.contactId], ownerUserId);
            actionsExecuted += 1;
          }
        }
      }
    }

    await setLastRunAt(orgId, workflow.id, new Date());
  }

  return {
    workflowsProcessed: activeWorkflows.length,
    itemsMatched,
    actionsExecuted,
  };
}

export { WorkflowStoreError };
