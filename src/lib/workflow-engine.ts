import prisma from '@/lib/db';
import { randomUUID } from 'crypto';
import { ensureSequencesTables, enrollContactsInSequence } from '@/lib/sequences-store';

export type WorkflowStatus = 'draft' | 'active' | 'paused';
export type WorkflowTriggerType = 'event' | 'webhook' | 'schedule';
export type WorkflowStepType = 'condition' | 'action' | 'delay';

export type WorkflowRecord = {
  id: string;
  orgId: string;
  userId: string;
  name: string;
  triggerType: WorkflowTriggerType;
  triggerConfig: Record<string, unknown>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type WorkflowStepRecord = {
  id: string;
  workflowId: string;
  stepOrder: number;
  type: WorkflowStepType;
  config: Record<string, unknown>;
};

export type WorkflowRunRecord = {
  id: string;
  workflowId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  currentStep: number;
  context: Record<string, unknown>;
  startedAt: string;
  finishedAt: string | null;
};

export type WorkflowLogRecord = {
  id: string;
  runId: string;
  stepIndex: number | null;
  message: string;
  status: 'info' | 'success' | 'failed';
  createdAt: string;
};

export type WorkflowQueueItem = {
  id: string;
  runId: string;
  stepIndex: number;
  executeAt: string;
};

type WorkflowPayload = {
  name?: unknown;
  trigger_type?: unknown;
  trigger_config?: unknown;
  is_active?: unknown;
  steps?: unknown;
  status?: unknown;
};

type WorkflowStepInput = {
  type: WorkflowStepType;
  config: Record<string, unknown>;
};

class WorkflowEngineError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const TRIGGER_TYPES = new Set<WorkflowTriggerType>(['event', 'webhook', 'schedule']);
const STEP_TYPES = new Set<WorkflowStepType>(['condition', 'action', 'delay']);

function toIso(value: Date | string | null) {
  if (!value) return new Date().toISOString();
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

function normalizeTrigger(value: unknown, fallback: WorkflowTriggerType = 'event') {
  const raw = String(value || fallback).trim() as WorkflowTriggerType;
  return TRIGGER_TYPES.has(raw) ? raw : fallback;
}

function normalizeBoolean(value: unknown, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.toLowerCase() === 'true';
  return fallback;
}

function normalizeName(value: unknown, fallback = 'New workflow') {
  const name = String(value || fallback).trim();
  return name.slice(0, 255) || fallback;
}

function normalizeSteps(value: unknown): WorkflowStepInput[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((step) => step && STEP_TYPES.has(step.type))
    .map((step) => ({
      type: step.type as WorkflowStepType,
      config: (step.config && typeof step.config === 'object') ? step.config : {},
    }));
}

export async function ensureWorkflowEngineTables() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS workflows (
      id UUID PRIMARY KEY,
      org_id UUID NOT NULL,
      user_id UUID NOT NULL,
      name TEXT NOT NULL,
      trigger_type TEXT NOT NULL,
      trigger_config JSONB NOT NULL DEFAULT '{}'::jsonb,
      is_active BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP(6) NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP(6) NOT NULL DEFAULT NOW()
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS workflow_steps (
      id UUID PRIMARY KEY,
      workflow_id UUID NOT NULL,
      step_order INTEGER NOT NULL,
      type TEXT NOT NULL,
      config JSONB NOT NULL DEFAULT '{}'::jsonb
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS workflow_runs (
      id UUID PRIMARY KEY,
      workflow_id UUID NOT NULL,
      status TEXT NOT NULL,
      current_step INTEGER NOT NULL DEFAULT 0,
      context JSONB NOT NULL DEFAULT '{}'::jsonb,
      started_at TIMESTAMP(6) NOT NULL DEFAULT NOW(),
      finished_at TIMESTAMP(6)
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS workflow_queue (
      id UUID PRIMARY KEY,
      run_id UUID NOT NULL,
      step_index INTEGER NOT NULL,
      execute_at TIMESTAMP(6) NOT NULL
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS workflow_logs (
      id UUID PRIMARY KEY,
      run_id UUID NOT NULL,
      step_index INTEGER,
      message TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TIMESTAMP(6) NOT NULL DEFAULT NOW()
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS workflow_queue_execute_idx
    ON workflow_queue (execute_at ASC)
  `);
}

export async function listWorkflows(orgId: string): Promise<WorkflowRecord[]> {
  await ensureWorkflowEngineTables();
  const rows = await prisma.$queryRawUnsafe<Array<any>>(
    `
      SELECT * FROM workflows
      WHERE org_id = $1
      ORDER BY created_at DESC
    `,
    orgId
  );
  return rows.map((row) => ({
    id: row.id,
    orgId: row.org_id,
    userId: row.user_id,
    name: row.name,
    triggerType: normalizeTrigger(row.trigger_type),
    triggerConfig: row.trigger_config || {},
    isActive: Boolean(row.is_active),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  }));
}

export async function listWorkflowSteps(workflowId: string): Promise<WorkflowStepRecord[]> {
  await ensureWorkflowEngineTables();
  const rows = await prisma.$queryRawUnsafe<Array<any>>(
    `
      SELECT * FROM workflow_steps
      WHERE workflow_id = $1
      ORDER BY step_order ASC
    `,
    workflowId
  );
  return rows.map((row) => ({
    id: row.id,
    workflowId: row.workflow_id,
    stepOrder: Number(row.step_order),
    type: row.type as WorkflowStepType,
    config: row.config || {},
  }));
}

export async function getWorkflow(orgId: string, workflowId: string): Promise<WorkflowRecord | null> {
  await ensureWorkflowEngineTables();
  const rows = await prisma.$queryRawUnsafe<Array<any>>(
    `
      SELECT * FROM workflows
      WHERE org_id = $1 AND id = $2
      LIMIT 1
    `,
    orgId,
    workflowId
  );
  if (!rows.length) return null;
  const row = rows[0];
  return {
    id: row.id,
    orgId: row.org_id,
    userId: row.user_id,
    name: row.name,
    triggerType: normalizeTrigger(row.trigger_type),
    triggerConfig: row.trigger_config || {},
    isActive: Boolean(row.is_active),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

export async function createWorkflow(
  orgId: string,
  userId: string,
  payload: WorkflowPayload
): Promise<WorkflowRecord> {
  await ensureWorkflowEngineTables();
  const workflowId = randomUUID();
  const name = normalizeName(payload.name);
  const triggerType = normalizeTrigger(payload.trigger_type || 'event');
  const triggerConfig = (payload.trigger_config && typeof payload.trigger_config === 'object')
    ? payload.trigger_config
    : {};
  const isActive = normalizeBoolean(payload.is_active, false);
  const steps = normalizeSteps(payload.steps);

  await prisma.$executeRawUnsafe(
    `
      INSERT INTO workflows (
        id, org_id, user_id, name, trigger_type, trigger_config, is_active, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, NOW(), NOW())
    `,
    workflowId,
    orgId,
    userId,
    name,
    triggerType,
    JSON.stringify(triggerConfig),
    isActive
  );

  if (steps.length) {
    for (let index = 0; index < steps.length; index += 1) {
      const step = steps[index];
      await prisma.$executeRawUnsafe(
        `
          INSERT INTO workflow_steps (id, workflow_id, step_order, type, config)
          VALUES ($1, $2, $3, $4, $5::jsonb)
        `,
        randomUUID(),
        workflowId,
        index,
        step.type,
        JSON.stringify(step.config || {})
      );
    }
  }

  const workflow = await getWorkflow(orgId, workflowId);
  if (!workflow) {
    throw new WorkflowEngineError('Failed to create workflow.', 500);
  }
  return workflow;
}

export async function updateWorkflow(
  orgId: string,
  workflowId: string,
  payload: WorkflowPayload
): Promise<WorkflowRecord> {
  await ensureWorkflowEngineTables();
  const existing = await getWorkflow(orgId, workflowId);
  if (!existing) throw new WorkflowEngineError('Workflow not found.', 404);

  const name = normalizeName(payload.name, existing.name);
  const triggerType = normalizeTrigger(payload.trigger_type || existing.triggerType);
  const triggerConfig = (payload.trigger_config && typeof payload.trigger_config === 'object')
    ? payload.trigger_config
    : existing.triggerConfig;
  const isActive = payload.is_active !== undefined ? normalizeBoolean(payload.is_active, existing.isActive) : existing.isActive;
  const steps = payload.steps ? normalizeSteps(payload.steps) : null;

  await prisma.$executeRawUnsafe(
    `
      UPDATE workflows
      SET name = $3,
          trigger_type = $4,
          trigger_config = $5::jsonb,
          is_active = $6,
          updated_at = NOW()
      WHERE org_id = $1 AND id = $2
    `,
    orgId,
    workflowId,
    name,
    triggerType,
    JSON.stringify(triggerConfig),
    isActive
  );

  if (steps) {
    await prisma.$executeRawUnsafe(
      `
        DELETE FROM workflow_steps
        WHERE workflow_id = $1
      `,
      workflowId
    );

    for (let index = 0; index < steps.length; index += 1) {
      const step = steps[index];
      await prisma.$executeRawUnsafe(
        `
          INSERT INTO workflow_steps (id, workflow_id, step_order, type, config)
          VALUES ($1, $2, $3, $4, $5::jsonb)
        `,
        randomUUID(),
        workflowId,
        index,
        step.type,
        JSON.stringify(step.config || {})
      );
    }
  }

  const workflow = await getWorkflow(orgId, workflowId);
  if (!workflow) {
    throw new WorkflowEngineError('Failed to update workflow.', 500);
  }
  return workflow;
}

export async function removeWorkflow(orgId: string, workflowId: string) {
  await ensureWorkflowEngineTables();
  await prisma.$executeRawUnsafe(
    `
      DELETE FROM workflow_queue
      WHERE run_id IN (
        SELECT id FROM workflow_runs WHERE workflow_id = $2
      )
    `,
    orgId,
    workflowId
  );
  await prisma.$executeRawUnsafe(
    `
      DELETE FROM workflow_logs
      WHERE run_id IN (
        SELECT id FROM workflow_runs WHERE workflow_id = $2
      )
    `,
    orgId,
    workflowId
  );
  await prisma.$executeRawUnsafe(
    `
      DELETE FROM workflow_runs
      WHERE workflow_id = $2
    `,
    orgId,
    workflowId
  );
  await prisma.$executeRawUnsafe(
    `
      DELETE FROM workflow_steps
      WHERE workflow_id = $2
    `,
    orgId,
    workflowId
  );
  await prisma.$executeRawUnsafe(
    `
      DELETE FROM workflows
      WHERE org_id = $1 AND id = $2
    `,
    orgId,
    workflowId
  );
}

export async function createWorkflowRun(workflowId: string, context: Record<string, unknown>) {
  await ensureWorkflowEngineTables();
  const runId = randomUUID();
  await prisma.$executeRawUnsafe(
    `
      INSERT INTO workflow_runs (id, workflow_id, status, current_step, context, started_at)
      VALUES ($1, $2, 'pending', 0, $3::jsonb, NOW())
    `,
    runId,
    workflowId,
    JSON.stringify(context || {})
  );

  await prisma.$executeRawUnsafe(
    `
      INSERT INTO workflow_queue (id, run_id, step_index, execute_at)
      VALUES ($1, $2, 0, NOW())
    `,
    randomUUID(),
    runId
  );

  return runId;
}

export async function listWorkflowRuns(orgId: string) {
  await ensureWorkflowEngineTables();
  const rows = await prisma.$queryRawUnsafe<Array<any>>(
    `
      SELECT r.*, w.name as workflow_name
      FROM workflow_runs r
      JOIN workflows w ON w.id = r.workflow_id
      WHERE w.org_id = $1
      ORDER BY r.started_at DESC
    `,
    orgId
  );
  return rows.map((row) => ({
    id: row.id,
    workflowId: row.workflow_id,
    workflowName: row.workflow_name,
    status: row.status,
    currentStep: Number(row.current_step),
    context: row.context || {},
    startedAt: toIso(row.started_at),
    finishedAt: row.finished_at ? toIso(row.finished_at) : null,
  }));
}

export async function listWorkflowLogs(
  orgId: string,
  options?: { workflowId?: string | null; runId?: string | null; limit?: number }
) {
  await ensureWorkflowEngineTables();
  const limit = Math.max(1, Math.min(200, Number(options?.limit || 100)));
  const workflowId = options?.workflowId ? String(options.workflowId) : null;
  const runId = options?.runId ? String(options.runId) : null;

  const rows = await prisma.$queryRawUnsafe<Array<any>>(
    `
      SELECT l.*, r.workflow_id, w.name AS workflow_name
      FROM workflow_logs l
      JOIN workflow_runs r ON r.id = l.run_id
      JOIN workflows w ON w.id = r.workflow_id
      WHERE w.org_id = $1
        AND ($2::uuid IS NULL OR r.workflow_id = $2::uuid)
        AND ($3::uuid IS NULL OR l.run_id = $3::uuid)
      ORDER BY l.created_at DESC
      LIMIT $4
    `,
    orgId,
    workflowId,
    runId,
    limit
  );

  return rows.map((row) => ({
    id: row.id,
    runId: row.run_id,
    workflowId: row.workflow_id,
    workflowName: row.workflow_name,
    stepIndex: row.step_index === null ? null : Number(row.step_index),
    message: row.message,
    status: row.status,
    createdAt: toIso(row.created_at),
  }));
}

async function insertLog(runId: string, stepIndex: number | null, message: string, status: 'info' | 'success' | 'failed') {
  await prisma.$executeRawUnsafe(
    `
      INSERT INTO workflow_logs (id, run_id, step_index, message, status, created_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
    `,
    randomUUID(),
    runId,
    stepIndex,
    message,
    status
  );
}

function evaluateCondition(config: Record<string, unknown>, context: Record<string, unknown>) {
  const field = String(config.field || '').toLowerCase();
  const operator = String(config.operator || 'is');
  const value = String(config.value || '').toLowerCase();
  const actual = String(context[field] ?? '').toLowerCase();
  if (!value) return true;
  if (operator === 'is') return actual === value;
  if (operator === 'is_not') return actual !== value;
  if (operator === 'contains') return actual.includes(value);
  return false;
}

function resolveConditionNextStep(
  passed: boolean,
  config: Record<string, unknown>,
  currentStepIndex: number,
  totalSteps: number
) {
  const rawBranch = String(
    passed
      ? (config.on_true ?? config.onTrue ?? 'continue')
      : (config.on_false ?? config.onFalse ?? 'exit')
  ).toLowerCase();

  if (rawBranch === 'exit') {
    return totalSteps;
  }

  return currentStepIndex + 1;
}

function normalizeActionBranch(value: unknown) {
  const raw = String(value || 'always').toLowerCase();
  if (raw === 'true' || raw === 'yes') return 'true';
  if (raw === 'false' || raw === 'no') return 'false';
  return 'always';
}

async function handleAction(
  actionConfig: Record<string, unknown>,
  context: Record<string, unknown>,
  orgId: string,
  userId: string
) {
  const type = String(actionConfig.type || '');
  if (type === 'sendEmail' || type === 'send_email') {
    await ensureSequencesTables();
    await prisma.$executeRawUnsafe(
      `
        INSERT INTO app_tasks (id, org_id, source_type, title, description, status, created_at, updated_at)
        VALUES ($1, $2, 'workflow', $3, $4, 'open', NOW(), NOW())
      `,
      randomUUID(),
      orgId,
      String(actionConfig.subject || 'Send email'),
      String(actionConfig.body || 'Workflow email action')
    );
    return 'Email task created.';
  }

  if (type === 'updateRecord' || type === 'update_stage') {
    const contactId = String(context.contact_id || '');
    const stage = String(actionConfig.stage || actionConfig.value || '');
    if (!contactId || !stage) return;
    await prisma.$executeRawUnsafe(
      `
        UPDATE "Contact"
        SET stage = $2, updated_at = NOW()
        WHERE id = $1
      `,
      contactId,
      stage
    );
    return `Record updated to stage "${stage}".`;
  }

  if (type === 'addTag' || type === 'add_tag') {
    const contactId = String(context.contact_id || '');
    const tag = String(actionConfig.tag || actionConfig.value || '');
    if (!contactId || !tag) return;
    await prisma.$executeRawUnsafe(
      `
        UPDATE "Contact"
        SET tags = array_append(tags, $2), updated_at = NOW()
        WHERE id = $1 AND NOT ($2 = ANY(tags))
      `,
      contactId,
      tag
    );
    return `Tag "${tag}" added.`;
  }

  if (type === 'callWebhook' || type === 'call_webhook') {
    const url = String(actionConfig.url || actionConfig.value || '');
    if (!url) return;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context }),
    });
    return `Webhook called: ${url}`;
  }

  if (type === 'enrollSequence' || type === 'enroll_sequence') {
    const sequenceId = String(actionConfig.sequence_id || actionConfig.value || '');
    const contactId = String(context.contact_id || '');
    if (!sequenceId || !contactId) return;
    await enrollContactsInSequence(orgId, sequenceId, [contactId], userId);
    return `Contact enrolled in sequence ${sequenceId}.`;
  }

  if (type === 'create_task' || type === 'notify_owner') {
    await ensureSequencesTables();
    const title = String(actionConfig.value || (type === 'notify_owner' ? 'Notify owner' : 'Workflow task'));
    const description = String(actionConfig.body || `Workflow action: ${type}`);
    await prisma.$executeRawUnsafe(
      `
        INSERT INTO app_tasks (id, org_id, source_type, contact_id, title, description, status, created_at, updated_at)
        VALUES ($1, $2, 'workflow', $3::uuid, $4, $5, 'open', NOW(), NOW())
      `,
      randomUUID(),
      orgId,
      String(context.contact_id || '') || null,
      title,
      description
    );
    return type === 'notify_owner' ? 'Owner notification task created.' : 'Task created.';
  }

  if (['remove_tag', 'remove_sequence', 'create_deal', 'assign_user', 'add_note', 'send_sms', 'ai_generate', 'update_field'].includes(type)) {
    // Stub implementation to safely acknowledge and log the new GHL/Apollo capabilities 
    return `Action "${type}" successfully logged (execution coming soon). Context: ${JSON.stringify(actionConfig)}`;
  }

  return `Action type "${type}" is not configured.`;
}

export async function executeWorkflowStep(runId: string, stepIndex: number) {
  await ensureWorkflowEngineTables();
  const runRows = await prisma.$queryRawUnsafe<Array<any>>(
    `
      SELECT r.*, w.org_id, w.user_id
      FROM workflow_runs r
      JOIN workflows w ON w.id = r.workflow_id
      WHERE r.id = $1
      LIMIT 1
    `,
    runId
  );
  if (!runRows.length) {
    throw new WorkflowEngineError('Workflow run not found.', 404);
  }

  const run = runRows[0];
  const workflowId = run.workflow_id;
  const orgId = run.org_id;
  const userId = run.user_id;
  const context = run.context || {};

  const steps = await listWorkflowSteps(workflowId);
  const step = steps.find((entry) => entry.stepOrder === stepIndex);

  if (!step) {
    await prisma.$executeRawUnsafe(
      `
        UPDATE workflow_runs
        SET status = 'completed', finished_at = NOW()
        WHERE id = $1
      `,
      runId
    );
    await insertLog(runId, stepIndex, 'Workflow completed.', 'success');
    return;
  }

  await prisma.$executeRawUnsafe(
    `
      UPDATE workflow_runs
      SET status = 'running', current_step = $2
      WHERE id = $1
    `,
    runId,
    stepIndex
  );

  if (step.type === 'condition') {
    const conditionBranch = normalizeActionBranch(step.config.branch);
    const activeBranch = normalizeActionBranch(context.__branch_outcome);
    if (conditionBranch !== 'always' && conditionBranch !== activeBranch) {
      await insertLog(
        runId,
        stepIndex,
        `Skipped condition for branch "${conditionBranch}". Active branch is "${activeBranch}".`,
        'info'
      );
      await prisma.$executeRawUnsafe(
        `
          INSERT INTO workflow_queue (id, run_id, step_index, execute_at)
          VALUES ($1, $2, $3, NOW())
        `,
        randomUUID(),
        runId,
        stepIndex + 1
      );
      return;
    }

    const passed = evaluateCondition(step.config, context);
    const nextIndex = resolveConditionNextStep(passed, step.config, stepIndex, steps.length);
    const branchLabel =
      nextIndex >= steps.length
        ? 'exit'
        : 'continue';
    const nextContext = {
      ...(context || {}),
      __branch_outcome: passed ? 'true' : 'false',
      __last_condition_step: stepIndex,
    };
    await prisma.$executeRawUnsafe(
      `
        UPDATE workflow_runs
        SET context = $2::jsonb
        WHERE id = $1
      `,
      runId,
      JSON.stringify(nextContext)
    );
    await insertLog(
      runId,
      stepIndex,
      passed ? `Condition passed. Branch: ${branchLabel}.` : `Condition failed. Branch: ${branchLabel}.`,
      'info'
    );
    await prisma.$executeRawUnsafe(
      `
        INSERT INTO workflow_queue (id, run_id, step_index, execute_at)
        VALUES ($1, $2, $3, NOW())
      `,
      randomUUID(),
      runId,
      nextIndex
    );
    return;
  }

  if (step.type === 'delay') {
    const delayBranch = normalizeActionBranch(step.config.branch);
    const activeBranch = normalizeActionBranch(context.__branch_outcome);
    if (delayBranch !== 'always' && delayBranch !== activeBranch) {
      await insertLog(runId, stepIndex, `Skipped delay for branch "${delayBranch}". Active branch is "${activeBranch}".`, 'info');
      await prisma.$executeRawUnsafe(
        `
          INSERT INTO workflow_queue (id, run_id, step_index, execute_at)
          VALUES ($1, $2, $3, NOW())
        `,
        randomUUID(),
        runId,
        stepIndex + 1
      );
      return;
    }

    const durationMs = Number(step.config.duration_ms || 0);
    const executeAt = new Date(Date.now() + Math.max(0, durationMs));
    await insertLog(runId, stepIndex, `Delay for ${durationMs}ms.`, 'info');
    await prisma.$executeRawUnsafe(
      `
        INSERT INTO workflow_queue (id, run_id, step_index, execute_at)
        VALUES ($1, $2, $3, $4)
      `,
      randomUUID(),
      runId,
      stepIndex + 1,
      executeAt
    );
    return;
  }

  if (step.type === 'action') {
    const actionBranch = normalizeActionBranch(step.config.branch);
    const activeBranch = normalizeActionBranch(context.__branch_outcome);
    if (actionBranch !== 'always' && actionBranch !== activeBranch) {
      await insertLog(runId, stepIndex, `Skipped action for branch "${actionBranch}". Active branch is "${activeBranch}".`, 'info');
    } else {
      const actionMessage = await handleAction(step.config, context, orgId, userId);
      await insertLog(runId, stepIndex, actionMessage || 'Action executed.', 'success');
    }
    await prisma.$executeRawUnsafe(
      `
        INSERT INTO workflow_queue (id, run_id, step_index, execute_at)
        VALUES ($1, $2, $3, NOW())
      `,
      randomUUID(),
      runId,
      stepIndex + 1
    );
  }
}

export async function processWorkflowQueue(limit = 25) {
  await ensureWorkflowEngineTables();
  const jobs = await prisma.$queryRawUnsafe<Array<any>>(
    `
      SELECT * FROM workflow_queue
      WHERE execute_at <= NOW()
      ORDER BY execute_at ASC
      LIMIT $1
    `,
    limit
  );

  for (const job of jobs) {
    await prisma.$executeRawUnsafe(
      `
        DELETE FROM workflow_queue
        WHERE id = $1
      `,
      job.id
    );
    await executeWorkflowStep(job.run_id, Number(job.step_index));
  }

  return { processed: jobs.length };
}

export async function fireEventTrigger(
  orgId: string,
  eventType: string,
  payload: Record<string, unknown>
) {
  await ensureWorkflowEngineTables();
  const workflows = await prisma.$queryRawUnsafe<Array<any>>(
    `
      SELECT id, trigger_config
      FROM workflows
      WHERE org_id = $1 AND trigger_type = 'event' AND is_active = true
    `,
    orgId
  );

  const matching = workflows.filter((workflow) => {
    const config = workflow.trigger_config || {};
    return String(config.event || '').toLowerCase() === eventType.toLowerCase();
  });

  const runIds: string[] = [];
  for (const workflow of matching) {
    const runId = await createWorkflowRun(workflow.id, payload);
    runIds.push(runId);
  }

  return runIds;
}

export async function fireWebhookTrigger(
  orgId: string,
  workflowId: string,
  payload: Record<string, unknown>
) {
  await ensureWorkflowEngineTables();
  const workflow = await getWorkflow(orgId, workflowId);
  if (!workflow || workflow.triggerType !== 'webhook' || !workflow.isActive) {
    throw new WorkflowEngineError('Workflow is not active for webhook.', 400);
  }
  return createWorkflowRun(workflowId, payload);
}

export async function enqueueScheduledWorkflows(orgId: string) {
  await ensureWorkflowEngineTables();
  const workflows = await prisma.$queryRawUnsafe<Array<any>>(
    `
      SELECT id, trigger_config
      FROM workflows
      WHERE org_id = $1 AND trigger_type = 'schedule' AND is_active = true
    `,
    orgId
  );

  const now = new Date();
  for (const workflow of workflows) {
    const config = workflow.trigger_config || {};
    const nextRunAt = config.next_run_at ? new Date(config.next_run_at) : null;
    const intervalMinutes = Number(config.interval_minutes || 60);
    if (!nextRunAt || nextRunAt <= now) {
      await createWorkflowRun(workflow.id, {});
      const next = new Date(Date.now() + Math.max(1, intervalMinutes) * 60 * 1000);
      await prisma.$executeRawUnsafe(
        `
          UPDATE workflows
          SET trigger_config = jsonb_set(trigger_config, '{next_run_at}', to_jsonb($2::text), true),
              updated_at = NOW()
          WHERE id = $1
        `,
        workflow.id,
        next.toISOString()
      );
    }
  }
}

export { WorkflowEngineError };
