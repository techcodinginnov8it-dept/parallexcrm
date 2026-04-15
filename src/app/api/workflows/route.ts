import { NextResponse } from 'next/server';
import { getCurrentUser, unauthorizedResponse } from '@/lib/api-utils';
import { createWorkflow, listWorkflowSteps, listWorkflows, WorkflowEngineError } from '@/lib/workflow-engine';

function buildStepsFromPayload(payload: any) {
  const conditions = Array.isArray(payload.conditions) ? payload.conditions : [];
  const actions = Array.isArray(payload.actions) ? payload.actions : [];
  const delays = Array.isArray(payload.delays)
    ? payload.delays
    : Number(payload.delayDays || 0) > 0
      ? [{ id: 'delay-1', days: Number(payload.delayDays || 0), branch: 'always' }]
      : [];
  const flowOrder = Array.isArray(payload.flowOrder) ? payload.flowOrder.map((item: unknown) => String(item)) : [];
  const conditionsById = new Map(conditions.map((config: any, index: number) => [String(config?.id || `cond-${index}`), config]));
  const delaysById = new Map(delays.map((config: any, index: number) => [String(config?.id || `delay-${index + 1}`), config]));
  const ordered: Array<{ type: 'condition' | 'delay' | 'action'; config: Record<string, any> }> = [];
  const usedConditionIds = new Set<string>();
  const usedDelayIds = new Set<string>();

  for (const token of flowOrder) {
    const condition = conditionsById.get(token);
    if (condition) {
      ordered.push({ type: 'condition', config: condition });
      usedConditionIds.add(token);
      continue;
    }

    const delay = (delaysById.get(token) || (token === 'delay' ? delaysById.values().next().value : null)) as any;
    if (delay && !usedDelayIds.has(String(delay.id || token))) {
      ordered.push({
        type: 'delay',
        config: {
          id: String(delay.id || token),
          branch: delay.branch || 'always',
          duration_ms: Number(delay.duration_ms || 0) || Number(delay.days || 0) * 86400000,
        },
      });
      usedDelayIds.add(String(delay.id || token));
    }
  }

  for (const condition of conditions) {
    const conditionId = String(condition?.id || '');
    if (!usedConditionIds.has(conditionId)) {
      ordered.push({ type: 'condition', config: condition });
    }
  }

  for (const delay of delays as any[]) {
    const delayId = String(delay?.id || '');
    if (!usedDelayIds.has(delayId)) {
      ordered.push({
        type: 'delay',
        config: {
          id: delayId,
          branch: delay.branch || 'always',
          duration_ms: Number(delay.duration_ms || 0) || Number(delay.days || 0) * 86400000,
        },
      });
    }
  }

  return [...ordered, ...actions.map((config: any) => ({ type: 'action' as const, config }))];
}

function serializeWorkflow(workflow: any, steps: Array<{ type: string; config: Record<string, any> }>) {
  const conditions = steps.filter((step) => step.type === 'condition').map((step) => step.config);
  const actions = steps.filter((step) => step.type === 'action').map((step) => step.config);
  const delays = steps
    .filter((step) => step.type === 'delay')
    .map((step, index) => ({
      id: String(step.config?.id || `delay-${index + 1}`),
      days: Math.round(Number(step.config?.duration_ms || 0) / 86400000),
      branch: step.config?.branch === 'true' || step.config?.branch === 'false' ? step.config.branch : 'always',
    }));
  const flowOrder = steps
    .filter((step) => step.type === 'condition' || step.type === 'delay')
    .map((step, index) => (step.type === 'delay' ? String(step.config?.id || `delay-${index + 1}`) : String(step.config?.id || 'condition')));
  const sharedDelay = delays.find((delay) => delay.branch === 'always');
  return {
    id: workflow.id,
    name: workflow.name,
    status: workflow.isActive ? 'active' : String(workflow.triggerConfig.status || 'draft'),
    trigger: workflow.triggerType === 'event' ? workflow.triggerConfig.event || 'new_lead' : workflow.triggerType === 'webhook' ? 'inbound_form' : 'task_completed',
    triggerType: workflow.triggerType,
    eventName: String(workflow.triggerConfig.event || 'new_lead'),
    webhookPath: String(workflow.triggerConfig.path || ''),
    intervalMinutes: Number(workflow.triggerConfig.interval_minutes || 60),
    nextRunAt: workflow.triggerConfig.next_run_at || null,
    delayDays: sharedDelay?.days || 0,
    delays,
    flowOrder,
    conditions,
    actions,
    createdAt: workflow.createdAt,
    updatedAt: workflow.updatedAt,
  };
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return unauthorizedResponse();

  try {
    const workflows = await listWorkflows(user.org_id);
    const data = await Promise.all(workflows.map(async (workflow) => serializeWorkflow(workflow, await listWorkflowSteps(workflow.id))));
    return NextResponse.json({ data });
  } catch (error: any) {
    if (error instanceof WorkflowEngineError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: error?.message || 'Failed to load workflows.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return unauthorizedResponse();

  try {
    const payload = await request.json().catch(() => ({}));
    const triggerType = payload.triggerType === 'webhook' || payload.triggerType === 'schedule' ? payload.triggerType : 'event';
    const steps = buildStepsFromPayload(payload);

    const workflow = await createWorkflow(user.org_id, user.id, {
      name: payload.name,
      trigger_type: triggerType,
      trigger_config:
        triggerType === 'event'
          ? { event: payload.eventName || payload.trigger || 'new_lead', status: payload.status || 'draft' }
          : triggerType === 'webhook'
            ? { path: payload.webhookPath || '', status: payload.status || 'draft' }
            : {
                interval_minutes: Number(payload.intervalMinutes || 60),
                next_run_at: payload.nextRunAt || new Date().toISOString(),
                status: payload.status || 'draft',
              },
      is_active: payload.status === 'active',
      steps,
    });

    return NextResponse.json({ data: serializeWorkflow(workflow, await listWorkflowSteps(workflow.id)) }, { status: 201 });
  } catch (error: any) {
    if (error instanceof WorkflowEngineError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: error?.message || 'Failed to create workflow.' }, { status: 500 });
  }
}
