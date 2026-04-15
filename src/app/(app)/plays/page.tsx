'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';

type WorkflowStatus = 'draft' | 'active' | 'paused';
type TriggerType = 'new_lead' | 'lead_stage_changed' | 'sequence_completed' | 'task_completed' | 'inbound_form';
type TriggerMode = 'event' | 'webhook' | 'schedule';
type ConditionField = 'stage' | 'owner' | 'company_size' | 'country';
type ConditionOperator = 'is' | 'is_not' | 'contains';
type ActionType = 'send_email' | 'create_task' | 'enroll_sequence' | 'update_stage' | 'notify_owner';
type BranchMode = 'continue' | 'exit';
type ActionBranch = 'always' | 'true' | 'false';

type WorkflowCondition = { id: string; field: ConditionField; operator: ConditionOperator; value: string; onTrue: BranchMode; onFalse: BranchMode; branch: ActionBranch };
type WorkflowDelay = { id: string; days: number; branch: ActionBranch };
type WorkflowAction = { id: string; type: ActionType; value: string; branch: ActionBranch };
type FlowItem =
  | { key: string; kind: 'condition'; condition: WorkflowCondition }
  | { key: string; kind: 'delay'; delay: WorkflowDelay };
type Workflow = {
  id: string;
  name: string;
  status: WorkflowStatus;
  trigger: TriggerType;
  triggerType: TriggerMode;
  eventName: string;
  webhookPath: string;
  intervalMinutes: number;
  nextRunAt: string | null;
  delays: WorkflowDelay[];
  flowOrder: string[];
  conditions: WorkflowCondition[];
  actions: WorkflowAction[];
  createdAt: string;
  updatedAt: string;
};
type WorkflowRun = {
  id: string;
  workflowId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  currentStep: number;
  startedAt: string;
  finishedAt: string | null;
};
type WorkflowLog = {
  id: string;
  runId: string;
  workflowId: string;
  stepIndex: number | null;
  message: string;
  status: 'info' | 'success' | 'failed';
  createdAt: string;
};

const triggerLabels: Record<TriggerType, string> = {
  new_lead: 'New lead created',
  lead_stage_changed: 'Lead stage changed',
  sequence_completed: 'Sequence completed',
  task_completed: 'Task completed',
  inbound_form: 'Inbound form submitted',
};
const triggerModeLabels: Record<TriggerMode, string> = {
  event: 'Event trigger',
  webhook: 'Webhook trigger',
  schedule: 'Schedule trigger',
};
const conditionLabels: Record<ConditionField, string> = {
  stage: 'Stage',
  owner: 'Owner',
  company_size: 'Company size',
  country: 'Country',
};
const conditionOperators: Record<ConditionOperator, string> = {
  is: 'is',
  is_not: 'is not',
  contains: 'contains',
};
const actionLabels: Record<ActionType, string> = {
  send_email: 'Send email',
  create_task: 'Create task',
  enroll_sequence: 'Enroll in sequence',
  update_stage: 'Update stage',
  notify_owner: 'Notify owner',
};

const normalizeBranch = (value: unknown): ActionBranch => {
  const raw = String(value || 'always').toLowerCase();
  if (raw === 'true' || raw === 'yes') return 'true';
  if (raw === 'false' || raw === 'no') return 'false';
  return 'always';
};

const evaluatePreviewCondition = (condition: WorkflowCondition, context: Record<string, unknown>) => {
  const field = String(condition.field || '').toLowerCase();
  const operator = String(condition.operator || 'is');
  const value = String(condition.value || '').toLowerCase();
  const actual = String(context[field] ?? '').toLowerCase();
  if (!value) return true;
  if (operator === 'is') return actual === value;
  if (operator === 'is_not') return actual !== value;
  if (operator === 'contains') return actual.includes(value);
  return false;
};

const templates = [
  {
    name: 'Inbound lead follow-up',
    trigger: 'new_lead' as TriggerType,
    triggerType: 'event' as TriggerMode,
    eventName: 'new_lead',
  delays: [],
  flowOrder: ['cond-1'],
  conditions: [{ id: 'cond-1', field: 'stage' as ConditionField, operator: 'is' as ConditionOperator, value: 'New', onTrue: 'continue' as BranchMode, onFalse: 'exit' as BranchMode, branch: 'always' as ActionBranch }],
    actions: [
      { id: 'action-1', type: 'send_email' as ActionType, value: 'Welcome email', branch: 'always' as ActionBranch },
      { id: 'action-2', type: 'create_task' as ActionType, value: 'Follow up call', branch: 'true' as ActionBranch },
    ],
  },
  {
    name: 'Weekly customer health check',
    trigger: 'task_completed' as TriggerType,
    triggerType: 'schedule' as TriggerMode,
    eventName: 'task_completed',
  delays: [],
  flowOrder: ['cond-2'],
  conditions: [{ id: 'cond-2', field: 'country' as ConditionField, operator: 'contains' as ConditionOperator, value: 'Singapore', onTrue: 'continue' as BranchMode, onFalse: 'exit' as BranchMode, branch: 'always' as ActionBranch }],
    actions: [{ id: 'action-3', type: 'create_task' as ActionType, value: 'Review account health', branch: 'always' as ActionBranch }],
  },
];

const fetcher = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url);
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'Request failed.');
  return payload as T;
};

const normalizeWorkflow = (workflow: any): Workflow => ({
  id: String(workflow?.id || ''),
  name: String(workflow?.name || 'Untitled workflow'),
  status: workflow?.status === 'active' || workflow?.status === 'paused' ? workflow.status : 'draft',
  trigger: triggerLabels[workflow?.trigger as TriggerType] ? workflow.trigger : 'new_lead',
  triggerType: workflow?.triggerType === 'webhook' || workflow?.triggerType === 'schedule' ? workflow.triggerType : 'event',
  eventName: String(workflow?.eventName || workflow?.trigger || 'new_lead'),
  webhookPath: String(workflow?.webhookPath || ''),
  intervalMinutes: Math.max(1, Number(workflow?.intervalMinutes || 60)),
  nextRunAt: workflow?.nextRunAt ? String(workflow.nextRunAt) : null,
  delays: Array.isArray(workflow?.delays)
    ? workflow.delays.map((item: any, index: number) => ({
        id: String(item?.id || `delay-${index + 1}`),
        days: Math.max(0, Number(item?.days || (Number(item?.duration_ms || 0) / 86400000) || 0)),
        branch: item?.branch === 'true' || item?.branch === 'false' ? item.branch : 'always',
      }))
    : Number(workflow?.delayDays || 0) > 0
      ? [{ id: 'delay-1', days: Math.max(0, Number(workflow?.delayDays || 0)), branch: 'always' as ActionBranch }]
      : [],
  flowOrder: Array.isArray(workflow?.flowOrder)
    ? workflow.flowOrder.map((item: unknown) => String(item))
    : [
        ...(Array.isArray(workflow?.conditions) ? workflow.conditions.map((item: any, index: number) => String(item?.id || `cond-${index}`)) : []),
        ...(Array.isArray(workflow?.delays)
          ? workflow.delays.map((item: any, index: number) => String(item?.id || `delay-${index + 1}`))
          : Number(workflow?.delayDays || 0) > 0
            ? ['delay-1']
            : []),
      ],
  conditions: Array.isArray(workflow?.conditions)
    ? workflow.conditions.map((item: any, index: number) => ({
        id: String(item?.id || `cond-${index}`),
        field: conditionLabels[item?.field as ConditionField] ? item.field : 'stage',
        operator: conditionOperators[item?.operator as ConditionOperator] ? item.operator : 'is',
        value: String(item?.value || ''),
        onTrue: item?.on_true === 'exit' || item?.onTrue === 'exit' ? 'exit' : 'continue',
        onFalse: item?.on_false === 'continue' || item?.onFalse === 'continue' ? 'continue' : 'exit',
        branch: item?.branch === 'true' || item?.branch === 'false' ? item.branch : 'always',
      }))
    : [],
  actions: Array.isArray(workflow?.actions)
    ? workflow.actions.map((item: any, index: number) => ({
        id: String(item?.id || `action-${index}`),
        type: actionLabels[item?.type as ActionType] ? item.type : 'send_email',
        value: String(item?.value || item?.sequence_id || item?.stage || ''),
        branch: item?.branch === 'true' || item?.branch === 'false' ? item.branch : 'always',
      }))
    : [],
  createdAt: String(workflow?.createdAt || new Date(0).toISOString()),
  updatedAt: String(workflow?.updatedAt || new Date(0).toISOString()),
});

export default function PlaysPage() {
  const [notice, setNotice] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<'Workflow' | 'Settings' | 'Enrollment'>('Workflow');
  const [testContext, setTestContext] = useState('{\n  "contact_id": "",\n  "stage": "new",\n  "owner": "admin"\n}');
  const [dragFlowId, setDragFlowId] = useState<string | null>(null);
  const [dragActionId, setDragActionId] = useState<string | null>(null);
  const [dragBranch, setDragBranch] = useState<ActionBranch | null>(null);

  const workflowsQuery = useSWR<{ data: Workflow[] }>('/api/workflows', fetcher, { revalidateOnFocus: false });
  const runsQuery = useSWR<{ data: WorkflowRun[] }>('/api/workflow-runs', fetcher, { revalidateOnFocus: false });
  const logsQuery = useSWR<{ data: WorkflowLog[] }>(
    selectedId ? `/api/workflow-logs?workflowId=${selectedId}&limit=30` : null,
    fetcher,
    { revalidateOnFocus: false }
  );

  const workflows = (workflowsQuery.data?.data || []).map(normalizeWorkflow);
  const selectedWorkflow = workflows.find((workflow) => workflow.id === selectedId) || workflows[0] || null;
  const selectedRuns = (runsQuery.data?.data || []).filter((run) => run.workflowId === selectedWorkflow?.id).slice(0, 6);
  const selectedLogs = (logsQuery.data?.data || []).slice(0, 10);
  const sharedActions = selectedWorkflow?.actions.filter((action) => action.branch === 'always') || [];
  const trueBranchActions = selectedWorkflow?.actions.filter((action) => action.branch === 'true') || [];
  const falseBranchActions = selectedWorkflow?.actions.filter((action) => action.branch === 'false') || [];
  const branchGroups = [
    { key: 'always', label: 'Shared path', actions: sharedActions, tone: 'shared', helper: 'Runs for every matching contact' },
    { key: 'true', label: 'YES path actions', actions: trueBranchActions, tone: 'yes', helper: 'Runs only when the condition resolves YES' },
    { key: 'false', label: 'NO path actions', actions: falseBranchActions, tone: 'no', helper: 'Runs only when the condition resolves NO' },
  ] as const;
  const conditionMap = new Map((selectedWorkflow?.conditions || []).map((condition) => [condition.id, condition]));
  const delayMap = new Map((selectedWorkflow?.delays || []).map((delay) => [delay.id, delay]));
  const flowItems = ((selectedWorkflow?.flowOrder || []).map((token) =>
    conditionMap.has(token)
      ? { key: token, kind: 'condition' as const, condition: conditionMap.get(token) }
      : delayMap.has(token)
        ? { key: token, kind: 'delay' as const, delay: delayMap.get(token) }
        : token === 'delay' && delayMap.size
          ? { key: Array.from(delayMap.keys())[0], kind: 'delay' as const, delay: Array.from(delayMap.values())[0] }
          : null
  )).filter((item): item is FlowItem => Boolean(item && ((item.kind === 'condition' && item.condition) || (item.kind === 'delay' && item.delay))));
  const branchToneClass = (branch: ActionBranch) => branch === 'true' ? 'yes' : branch === 'false' ? 'no' : 'shared';
  const branchLabel = (branch: ActionBranch) => branch === 'true' ? 'YES path' : branch === 'false' ? 'NO path' : 'Shared path';
  const sharedFlowItems = flowItems.filter((item) => item.kind === 'delay' ? item.delay.branch === 'always' : item.condition.branch === 'always');
  const trueConditionItems = flowItems.filter((item) => item.kind === 'condition' && item.condition.branch === 'true');
  const falseConditionItems = flowItems.filter((item) => item.kind === 'condition' && item.condition.branch === 'false');
  const trueDelayItems = flowItems.filter((item) => item.kind === 'delay' && item.delay.branch === 'true');
  const falseDelayItems = flowItems.filter((item) => item.kind === 'delay' && item.delay.branch === 'false');
  const branchConditionGroups = [
    { key: 'true', label: 'YES path decisions', items: [...trueConditionItems, ...trueDelayItems], helper: 'Conditions and waits that only run after a YES branch.' },
    { key: 'false', label: 'NO path decisions', items: [...falseConditionItems, ...falseDelayItems], helper: 'Conditions and waits that only run after a NO branch.' },
  ] as const;
  const previewResult = useMemo(() => {
    if (!selectedWorkflow) {
      return { error: '', items: [] as Array<{ label: string; detail: string; status: 'run' | 'skip' | 'stop' }>, summary: 'Select a workflow to preview execution.' };
    }

    let parsedContext: Record<string, unknown> = {};
    try {
      parsedContext = JSON.parse(testContext || '{}');
    } catch {
      return { error: 'Test JSON is invalid. Fix the payload to see the execution preview.', items: [] as Array<{ label: string; detail: string; status: 'run' | 'skip' | 'stop' }>, summary: 'Preview unavailable until the JSON parses.' };
    }

    let activeBranch: ActionBranch = normalizeBranch((parsedContext as Record<string, unknown>).__branch_outcome);
    let stopped = false;
    const items: Array<{ label: string; detail: string; status: 'run' | 'skip' | 'stop' }> = [];

    for (const item of flowItems) {
      if (stopped) break;

      if (item.kind === 'condition') {
        const condition = item.condition;
        const conditionBranch = normalizeBranch(condition.branch);
        if (conditionBranch !== 'always' && conditionBranch !== activeBranch) {
          items.push({
            label: `Condition on ${branchLabel(condition.branch)}`,
            detail: `Skipped because the active branch is ${branchLabel(activeBranch)}.`,
            status: 'skip',
          });
          continue;
        }

        const passed = evaluatePreviewCondition(condition, parsedContext);
        activeBranch = passed ? 'true' : 'false';
        const outcome = passed ? condition.onTrue : condition.onFalse;
        items.push({
          label: `${conditionLabels[condition.field]} ${conditionOperators[condition.operator]} ${condition.value || '...'}`,
          detail: passed
            ? `Matched. Following the ${branchLabel(activeBranch)} branch and ${outcome === 'exit' ? 'stopping the workflow.' : 'continuing.'}`
            : `Did not match. Following the ${branchLabel(activeBranch)} branch and ${outcome === 'exit' ? 'stopping the workflow.' : 'continuing.'}`,
          status: outcome === 'exit' ? 'stop' : 'run',
        });
        if (outcome === 'exit') stopped = true;
        continue;
      }

      const delay = item.delay;
      const delayBranch = normalizeBranch(delay.branch);
      if (delayBranch !== 'always' && delayBranch !== activeBranch) {
        items.push({
          label: `Delay on ${branchLabel(delay.branch)}`,
          detail: `Skipped because the active branch is ${branchLabel(activeBranch)}.`,
          status: 'skip',
        });
        continue;
      }

      items.push({
        label: `Delay for ${delay.days} day${delay.days === 1 ? '' : 's'}`,
        detail: `This wait would run on the ${branchLabel(delay.branch)} before moving on.`,
        status: 'run',
      });
    }

    if (!stopped) {
      for (const action of selectedWorkflow.actions) {
        const actionBranch = normalizeBranch(action.branch);
        if (actionBranch !== 'always' && actionBranch !== activeBranch) {
          items.push({
            label: actionLabels[action.type],
            detail: `Skipped because this action is on the ${branchLabel(action.branch)} while the active branch is ${branchLabel(activeBranch)}.`,
            status: 'skip',
          });
          continue;
        }

        items.push({
          label: actionLabels[action.type],
          detail: `${action.value || 'Configured action'} would execute on the ${branchLabel(action.branch)}.`,
          status: 'run',
        });
      }
    }

    const runnableCount = items.filter((item) => item.status === 'run').length;
    const skippedCount = items.filter((item) => item.status === 'skip').length;
    const stoppedCount = items.filter((item) => item.status === 'stop').length;

    return {
      error: '',
      items,
      summary: stopped
        ? `Preview shows ${runnableCount} runnable step(s), ${skippedCount} skipped step(s), and the workflow would stop early.`
        : `Preview shows ${runnableCount} runnable step(s) and ${skippedCount} skipped step(s).`,
    };
  }, [branchLabel, flowItems, selectedWorkflow, testContext]);

  useEffect(() => {
    if (!selectedWorkflow && workflows.length) setSelectedId(workflows[0].id);
  }, [selectedWorkflow, workflows]);

  const workflowSummary = useMemo(() => ({
    active: workflows.filter((wf) => wf.status === 'active').length,
    paused: workflows.filter((wf) => wf.status === 'paused').length,
    draft: workflows.filter((wf) => wf.status === 'draft').length,
  }), [workflows]);

  const updateWorkflow = async (updates: Partial<Workflow>) => {
    if (!selectedWorkflow) return;
    workflowsQuery.mutate((current) => current ? {
      data: current.data.map((wf) => wf.id === selectedWorkflow.id ? { ...wf, ...updates, updatedAt: new Date().toISOString() } : wf),
    } : current, false);
    try {
      const response = await fetch(`/api/workflows/${selectedWorkflow.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'Failed to update workflow.');
      await workflowsQuery.mutate();
    } catch (error: any) {
      setNotice(error?.message || 'Failed to update workflow.');
    }
  };

  const updateDelay = (delayId: string, updates: Partial<WorkflowDelay>) => selectedWorkflow && updateWorkflow({
    delays: selectedWorkflow.delays.map((item) => item.id === delayId ? { ...item, ...updates, days: Math.max(0, Number(updates.days ?? item.days)) } : item),
  });
  const addDelay = (branch: ActionBranch = 'always') => {
    if (!selectedWorkflow) return;
    const delayId = `delay-${Date.now()}`;
    const insertToken = branch === 'always' ? [...selectedWorkflow.flowOrder, delayId] : [
      ...selectedWorkflow.flowOrder,
      delayId,
    ];
    updateWorkflow({
      delays: [...selectedWorkflow.delays, { id: delayId, days: 1, branch }],
      flowOrder: insertToken,
    });
  };
  const removeDelay = (delayId: string) => selectedWorkflow && updateWorkflow({
    delays: selectedWorkflow.delays.filter((item) => item.id !== delayId),
    flowOrder: selectedWorkflow.flowOrder.filter((item) => item !== delayId && !(item === 'delay' && delayId === 'delay-1')),
  });
  const addCondition = (branch: ActionBranch = 'always') => {
    if (!selectedWorkflow) return;
    const conditionId = `cond-${Date.now()}`;
    updateWorkflow({
      conditions: [...selectedWorkflow.conditions, { id: conditionId, field: 'stage', operator: 'is', value: '', onTrue: 'continue', onFalse: 'exit', branch }],
      flowOrder: [...selectedWorkflow.flowOrder, conditionId],
    });
  };
  const addAction = (type: ActionType) => selectedWorkflow && updateWorkflow({
    actions: [...selectedWorkflow.actions, { id: `action-${Date.now()}`, type, value: type === 'update_stage' ? 'qualified' : 'New action', branch: 'always' }],
  });
  const addActionToBranch = (branch: ActionBranch, type: ActionType = 'create_task') => selectedWorkflow && updateWorkflow({
    actions: [
      ...selectedWorkflow.actions,
      {
        id: `action-${Date.now()}`,
        type,
        value: type === 'update_stage' ? 'qualified' : 'New action',
        branch,
      },
    ],
  });
  const updateCondition = (id: string, updates: Partial<WorkflowCondition>) => selectedWorkflow && updateWorkflow({
    conditions: selectedWorkflow.conditions.map((item) => item.id === id ? { ...item, ...updates } : item),
  });
  const updateAction = (id: string, updates: Partial<WorkflowAction>) => selectedWorkflow && updateWorkflow({
    actions: selectedWorkflow.actions.map((item) => item.id === id ? { ...item, ...updates } : item),
  });
  const removeCondition = (id: string) => selectedWorkflow && updateWorkflow({
    conditions: selectedWorkflow.conditions.filter((item) => item.id !== id),
    flowOrder: selectedWorkflow.flowOrder.filter((item) => item !== id),
  });
  const removeAction = (id: string) => selectedWorkflow && updateWorkflow({ actions: selectedWorkflow.actions.filter((item) => item.id !== id) });
  const moveFlowItem = (itemId: string, targetIndex: number | null = null) => {
    if (!selectedWorkflow) return;
    const remaining = selectedWorkflow.flowOrder.filter((item) => item !== itemId);
    const insertIndex = targetIndex === null ? remaining.length : Math.max(0, Math.min(targetIndex, remaining.length));
    const nextFlowOrder = [...remaining];
    nextFlowOrder.splice(insertIndex, 0, itemId);
    updateWorkflow({ flowOrder: nextFlowOrder });
  };
  const moveAction = (actionId: string, branch: ActionBranch, targetIndex: number | null = null) => {
    if (!selectedWorkflow) return;
    const moving = selectedWorkflow.actions.find((item) => item.id === actionId);
    if (!moving) return;

    const remaining = selectedWorkflow.actions.filter((item) => item.id !== actionId);
    const byBranch = {
      always: remaining.filter((item) => item.branch === 'always'),
      true: remaining.filter((item) => item.branch === 'true'),
      false: remaining.filter((item) => item.branch === 'false'),
    };
    const nextBranchItems = [...byBranch[branch]];
    const nextAction = { ...moving, branch };
    const insertIndex = targetIndex === null ? nextBranchItems.length : Math.max(0, Math.min(targetIndex, nextBranchItems.length));
    nextBranchItems.splice(insertIndex, 0, nextAction);
    byBranch[branch] = nextBranchItems;

    updateWorkflow({
      actions: [...byBranch.always, ...byBranch.true, ...byBranch.false],
    });
  };
  const getFlowIndex = (itemKey: string) => flowItems.findIndex((entry) => entry.key === itemKey);
  const getBranchDropIndex = (branch: ActionBranch) => {
    const branchKeys = flowItems
      .filter((item) => item.kind === 'condition' ? item.condition.branch === branch : item.delay.branch === branch)
      .map((item) => item.key);
    if (!branchKeys.length) return flowItems.length;
    const lastKey = branchKeys[branchKeys.length - 1];
    const lastIndex = getFlowIndex(lastKey);
    return lastIndex < 0 ? flowItems.length : lastIndex + 1;
  };
  const renderConditionNode = (condition: WorkflowCondition, itemKey: string, targetIndex: number) => (
    <div
      key={itemKey}
      className={`workflow-flow-block ${dragFlowId === itemKey ? 'is-dragging-condition' : ''}`}
      onDragOver={(event) => {
        event.preventDefault();
      }}
      onDrop={(event) => {
        event.preventDefault();
        if (dragFlowId) moveFlowItem(dragFlowId, targetIndex);
        setDragFlowId(null);
      }}
    >
      <div className="workflow-connector" />
      <div
        className={`workflow-node workflow-node-condition workflow-node-draggable workflow-branch-tone-${branchToneClass(condition.branch)} ${dragFlowId === itemKey ? 'is-dragging' : ''}`}
        draggable
        onDragStart={() => setDragFlowId(itemKey)}
        onDragEnd={() => setDragFlowId(null)}
      >
        <div className="workflow-node-pill">If this matches</div>
        <div className="workflow-node-title">{conditionLabels[condition.field]} {conditionOperators[condition.operator]} {condition.value || '...'}</div>
        <div className="workflow-node-meta">Path: {branchLabel(condition.branch)} | If true: {condition.onTrue} | If false: {condition.onFalse}</div>
        <div className={`workflow-path-badge ${branchToneClass(condition.branch)}`}>{branchLabel(condition.branch)}</div>
        <div className="workflow-branch-preview">
          <div className={`workflow-branch-chip ${condition.onTrue === 'continue' ? 'is-continue' : 'is-exit'}`}>
            <span>YES</span>
            <strong>{condition.onTrue === 'continue' ? 'Continue to next step' : 'Exit workflow'}</strong>
          </div>
          <div className={`workflow-branch-chip ${condition.onFalse === 'continue' ? 'is-continue' : 'is-exit'}`}>
            <span>NO</span>
            <strong>{condition.onFalse === 'continue' ? 'Continue to next step' : 'Exit workflow'}</strong>
          </div>
        </div>
        <div className="workflow-branch-lanes">
          <div className={`workflow-branch-lane ${condition.onTrue === 'continue' ? 'is-continue' : 'is-exit'}`}>
            <div className="workflow-branch-lane-line" />
            <div className="workflow-branch-lane-label">YES</div>
            <div className="workflow-branch-lane-target">{condition.onTrue === 'continue' ? 'Path continues down the workflow' : 'Path exits the workflow here'}</div>
          </div>
          <div className={`workflow-branch-lane ${condition.onFalse === 'continue' ? 'is-continue' : 'is-exit'}`}>
            <div className="workflow-branch-lane-line" />
            <div className="workflow-branch-lane-label">NO</div>
            <div className="workflow-branch-lane-target">{condition.onFalse === 'continue' ? 'Path continues down the workflow' : 'Path exits the workflow here'}</div>
          </div>
        </div>
        <div className="workflow-inline-editor">
          <select className="form-input" value={condition.field} onChange={(e) => updateCondition(condition.id, { field: e.target.value as ConditionField })}>
            {Object.entries(conditionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <select className="form-input" value={condition.operator} onChange={(e) => updateCondition(condition.id, { operator: e.target.value as ConditionOperator })}>
            {Object.entries(conditionOperators).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <input className="form-input" value={condition.value} onChange={(e) => updateCondition(condition.id, { value: e.target.value })} placeholder="Value" />
          <select className="form-input" value={condition.branch} onChange={(e) => updateCondition(condition.id, { branch: e.target.value as ActionBranch })}>
            <option value="always">Shared path</option>
            <option value="true">YES path</option>
            <option value="false">NO path</option>
          </select>
          <select className="form-input" value={condition.onTrue} onChange={(e) => updateCondition(condition.id, { onTrue: e.target.value as BranchMode })}>
            <option value="continue">If true, continue</option>
            <option value="exit">If true, exit workflow</option>
          </select>
          <select className="form-input" value={condition.onFalse} onChange={(e) => updateCondition(condition.id, { onFalse: e.target.value as BranchMode })}>
            <option value="continue">If false, continue</option>
            <option value="exit">If false, exit workflow</option>
          </select>
        </div>
        <button className="workflow-node-config" onClick={() => removeCondition(condition.id)}>Remove condition</button>
      </div>
    </div>
  );
  const renderDelayNode = (delay: WorkflowDelay, itemKey: string, targetIndex: number) => (
    <div
      key={itemKey}
      className={`workflow-flow-block ${dragFlowId === itemKey ? 'is-dragging-condition' : ''}`}
      onDragOver={(event) => {
        event.preventDefault();
      }}
      onDrop={(event) => {
        event.preventDefault();
        if (dragFlowId) moveFlowItem(dragFlowId, targetIndex);
        setDragFlowId(null);
      }}
    >
      <div className="workflow-connector" />
      <div
        className={`workflow-node workflow-node-delay workflow-node-draggable ${dragFlowId === itemKey ? 'is-dragging' : ''}`}
        draggable
        onDragStart={() => setDragFlowId(itemKey)}
        onDragEnd={() => setDragFlowId(null)}
      >
        <div className="workflow-node-pill">Wait</div>
        <div className="workflow-node-title">Delay for {delay.days} day{delay.days === 1 ? '' : 's'}</div>
        <div className="workflow-node-meta">Path: {branchLabel(delay.branch)}</div>
        <div className={`workflow-path-badge ${branchToneClass(delay.branch)}`}>{branchLabel(delay.branch)}</div>
        <div className="workflow-inline-editor">
          <input className="form-input" type="number" min={0} value={delay.days} onChange={(e) => updateDelay(delay.id, { days: Math.max(0, Number(e.target.value || 0)) })} />
          <select className="form-input" value={delay.branch} onChange={(e) => updateDelay(delay.id, { branch: e.target.value as ActionBranch })}>
            <option value="always">Shared path</option>
            <option value="true">YES path</option>
            <option value="false">NO path</option>
          </select>
        </div>
        <button className="workflow-node-config" onClick={() => removeDelay(delay.id)}>Remove delay</button>
      </div>
    </div>
  );

  const createWorkflow = async (payload: Record<string, unknown>) => {
    const response = await fetch('/api/workflows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new Error(result?.error || 'Failed to create workflow.');
    await workflowsQuery.mutate();
    setSelectedId(result.data.id);
  };

  const createNewWorkflow = async () => {
    try {
      await createWorkflow({ name: 'New workflow', triggerType: 'event', eventName: 'new_lead', trigger: 'new_lead' });
      setNotice('New workflow created.');
    } catch (error: any) {
      setNotice(error?.message || 'Failed to create workflow.');
    }
  };

  const createFromTemplate = async (template: typeof templates[number]) => {
    try {
      await createWorkflow({ ...template, status: 'draft', intervalMinutes: 60, nextRunAt: null, webhookPath: '' });
      setNotice(`Template "${template.name}" added.`);
    } catch (error: any) {
      setNotice(error?.message || 'Failed to create workflow.');
    }
  };

  const runWorkflow = async () => {
    if (!selectedWorkflow) return setNotice('Create or select a workflow first.');
    if ((selectedWorkflow.triggerType === 'event' || selectedWorkflow.triggerType === 'webhook') && selectedWorkflow.status !== 'active') {
      return setNotice('Activate this workflow first so the trigger can match it.');
    }
    try {
      const context = JSON.parse(testContext || '{}');
      const response =
        selectedWorkflow.triggerType === 'event'
          ? await fetch('/api/events', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ event: selectedWorkflow.eventName || selectedWorkflow.trigger, context }),
            })
          : selectedWorkflow.triggerType === 'webhook'
            ? await fetch(`/api/webhooks/${selectedWorkflow.id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(context),
              })
            : await fetch('/api/workflows/run', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ workflowId: selectedWorkflow.id, context }),
              });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'Failed to run workflow.');
      const summary =
        selectedWorkflow.triggerType === 'event'
          ? `Matched ${payload?.data?.matchedWorkflows ?? 0} workflow(s).`
          : selectedWorkflow.triggerType === 'webhook'
            ? 'Webhook trigger accepted.'
            : `Processed ${payload?.data?.processed ?? 0} queue jobs.`;
      setNotice(`Workflow launched. ${summary}`);
      await runsQuery.mutate();
      await logsQuery.mutate();
    } catch (error: any) {
      setNotice(error?.message || 'Failed to run workflow.');
    }
  };

  return (
    <div className="workflow-page">
      <div className="workflow-topbar">
        <div className="workflow-crumbs"><span>Workflows</span><span>/</span><span>{selectedWorkflow?.name || 'New workflow'}</span></div>
        <div className="workflow-topbar-actions">
          <button className="btn btn-secondary btn-sm" onClick={() => setNotice('Share is still in development.')}>Share</button>
          <button className="btn btn-primary btn-sm" onClick={runWorkflow}>Launch workflow</button>
        </div>
      </div>

      <div className="workflow-titlebar">
        <div>
          <div className="workflow-title">{selectedWorkflow?.name || 'New workflow'}</div>
          <div className="workflow-subtitle">{selectedWorkflow?.status || 'draft'} · {selectedWorkflow ? triggerModeLabels[selectedWorkflow.triggerType] : 'Event trigger'}</div>
        </div>
        <div className="workflow-tabs">
          {(['Workflow', 'Settings', 'Enrollment'] as const).map((label) => (
            <button key={label} type="button" className={`workflow-tab ${label === activeView ? 'active' : ''}`} onClick={() => setActiveView(label)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {notice && <div className="workflow-notice">{notice}</div>}
      {workflowsQuery.error && <div className="workflow-notice">{workflowsQuery.error.message || 'Failed to load workflows.'}</div>}

      <div className="workflow-body">
        <section className="workflow-canvas">
          <div className="workflow-node workflow-node-trigger">
            <div className="workflow-node-pill">When this happens</div>
            <div className="workflow-node-title">
              {!selectedWorkflow ? 'Select a trigger' : selectedWorkflow.triggerType === 'event' ? triggerLabels[selectedWorkflow.trigger] : selectedWorkflow.triggerType === 'webhook' ? 'Incoming webhook received' : 'Scheduled workflow run'}
            </div>
            <div className="workflow-node-meta">
              {!selectedWorkflow ? 'No trigger selected' : selectedWorkflow.triggerType === 'event' ? `Event key: ${selectedWorkflow.eventName}` : selectedWorkflow.triggerType === 'webhook' ? `/api/webhooks/${selectedWorkflow.id}` : `Runs every ${selectedWorkflow.intervalMinutes} minute${selectedWorkflow.intervalMinutes === 1 ? '' : 's'}`}
            </div>
            <div className="workflow-node-criteria">
              Trigger details
              <span>{selectedWorkflow?.triggerType === 'schedule' ? `Next run ${selectedWorkflow.nextRunAt ? new Date(selectedWorkflow.nextRunAt).toLocaleString() : 'not scheduled'}` : 'Ready to match incoming data'}</span>
            </div>
          </div>

          {activeView === 'Workflow' && sharedFlowItems.length ? (
            <div className="workflow-stage-divider">
              <span className="workflow-stage-label">Shared decision path</span>
            </div>
          ) : null}

          {activeView === 'Workflow' && sharedFlowItems.map((item) => (
            item.kind === 'condition' && item.condition
              ? renderConditionNode(item.condition, item.key, getFlowIndex(item.key))
              : item.kind === 'delay' && item.delay
                ? renderDelayNode(item.delay, item.key, getFlowIndex(item.key))
                : null
          ))}

          {activeView === 'Workflow' && sharedFlowItems.length ? (
            <div
              className={`workflow-flow-block ${dragFlowId ? 'is-dragging-condition' : ''}`}
              onDragOver={(event) => {
                event.preventDefault();
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (dragFlowId) moveFlowItem(dragFlowId, getBranchDropIndex('always'));
                setDragFlowId(null);
              }}
            >
              <div className="workflow-connector" />
              <div className="workflow-node workflow-node-dropzone">
                Drop here to move this step to the end of the shared decision path
              </div>
            </div>
          ) : null}

          {activeView === 'Workflow' && branchConditionGroups.some((group) => group.items.length) ? (
            <div className="workflow-stage-divider">
              <span className="workflow-stage-label">Branch decision lanes</span>
            </div>
          ) : null}

          {activeView === 'Workflow' && branchConditionGroups.some((group) => group.items.length) ? (
            <div className="workflow-flow-block">
              <div className="workflow-connector" />
              <div className="workflow-branch-condition-columns">
                {branchConditionGroups.map((group) => (
                  <div
                    key={group.key}
                    className={`workflow-branch-condition-column ${branchToneClass(group.key as ActionBranch)}`}
                    onDragOver={(event) => {
                      event.preventDefault();
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      if (dragFlowId) moveFlowItem(dragFlowId, getBranchDropIndex(group.key as ActionBranch));
                      setDragFlowId(null);
                    }}
                  >
                    <div className="workflow-branch-column-head">
                      <div className="workflow-branch-column-head-copy">
                        <span>{group.label}</span>
                        <small>{group.helper}</small>
                      </div>
                      <strong>{group.items.length}</strong>
                    </div>
                    <div className="workflow-branch-column-line" />
                    <button className="workflow-branch-column-add" onClick={() => addCondition(group.key as ActionBranch)}>
                      Add condition to this path
                    </button>
                    <button className="workflow-branch-column-add" onClick={() => addDelay(group.key as ActionBranch)}>
                      Add delay to this path
                    </button>
                    {group.items.length ? group.items.map((item) => (
                      item.kind === 'condition' && item.condition
                        ? renderConditionNode(item.condition, item.key, getFlowIndex(item.key))
                        : item.kind === 'delay' && item.delay
                          ? renderDelayNode(item.delay, item.key, getFlowIndex(item.key))
                        : null
                    )) : (
                      <div className="workflow-branch-column-empty">No conditions on this path yet. Use the button above or move one here.</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {activeView === 'Workflow' && (selectedWorkflow?.delays.length || selectedWorkflow?.actions.length) ? (
            <div className="workflow-stage-divider">
              <span className="workflow-stage-label">Execution paths</span>
            </div>
          ) : null}

          {activeView === 'Workflow' && (
            <div className="workflow-flow-block">
              <div className="workflow-connector" />
              <div className="workflow-branch-hub">
                <div className="workflow-branch-hub-line" />
                <div className="workflow-branch-hub-row">
                  {branchGroups.map((group) => (
                    <div key={group.key} className={`workflow-branch-hub-pill ${group.tone}`}>
                      {group.label}
                    </div>
                  ))}
                </div>
              </div>
              <div className="workflow-branch-columns">
                {branchGroups.map((group) => (
                  <div
                    key={group.key}
                    className={`workflow-branch-column ${group.tone} ${dragBranch === group.key ? 'is-drop-target' : ''}`}
                    onDragOver={(event) => {
                      event.preventDefault();
                      setDragBranch(group.key as ActionBranch);
                    }}
                    onDragLeave={() => setDragBranch((current) => current === group.key ? null : current)}
                    onDrop={(event) => {
                      event.preventDefault();
                      if (dragActionId) {
                        moveAction(dragActionId, group.key as ActionBranch, null);
                      }
                      setDragActionId(null);
                      setDragBranch(null);
                    }}
                  >
                    <div className="workflow-branch-column-head">
                      <div className="workflow-branch-column-head-copy">
                        <span>{group.label}</span>
                        <small>{group.helper}</small>
                      </div>
                      <strong>{group.actions.length}</strong>
                    </div>
                    <div className="workflow-branch-column-line" />
                    <button className="workflow-branch-column-add" onClick={() => addActionToBranch(group.key as ActionBranch)}>
                      Add action to this path
                    </button>
                    {group.actions.length ? group.actions.map((action) => (
                      <div
                        key={action.id}
                        className={`workflow-node workflow-node-action workflow-node-compact ${dragActionId === action.id ? 'is-dragging' : ''}`}
                        draggable
                        onDragStart={() => {
                          setDragActionId(action.id);
                          setDragBranch(action.branch);
                        }}
                        onDragEnd={() => {
                          setDragActionId(null);
                          setDragBranch(null);
                        }}
                        onDragOver={(event) => {
                          event.preventDefault();
                          setDragBranch(group.key as ActionBranch);
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          if (dragActionId) {
                            const targetIndex = group.actions.findIndex((item) => item.id === action.id);
                            moveAction(dragActionId, group.key as ActionBranch, targetIndex);
                          }
                          setDragActionId(null);
                          setDragBranch(null);
                        }}
                      >
                        <div className="workflow-node-pill">Then do this</div>
                        <div className="workflow-node-title">{actionLabels[action.type]} - {action.value || 'Configure'}</div>
                        <div className="workflow-node-meta">Branch: {group.label}</div>
                        <div className="workflow-inline-editor">
                          <select className="form-input" value={action.type} onChange={(e) => updateAction(action.id, { type: e.target.value as ActionType })}>
                            {Object.entries(actionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                          </select>
                          <input className="form-input" value={action.value} onChange={(e) => updateAction(action.id, { value: e.target.value })} placeholder="Action value" />
                          <select className="form-input" value={action.branch} onChange={(e) => updateAction(action.id, { branch: e.target.value as ActionBranch })}>
                            <option value="always">Shared path</option>
                            <option value="true">YES path</option>
                            <option value="false">NO path</option>
                          </select>
                        </div>
                        <button className="workflow-node-config" onClick={() => removeAction(action.id)}>Remove action</button>
                      </div>
                    )) : (
                      <div className="workflow-branch-column-empty">No actions on this path yet. Use the button above or drag one here.</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeView === 'Settings' && selectedWorkflow && (
            <div className="workflow-flow-block">
              <div className="workflow-connector" />
              <div className="workflow-node workflow-node-action">
                <div className="workflow-node-pill">Workflow settings</div>
                <div className="workflow-node-title">Configure trigger source and execution cadence</div>
                <div className="workflow-inline-editor">
                  <select className="form-input" value={selectedWorkflow.triggerType} onChange={(e) => updateWorkflow({ triggerType: e.target.value as TriggerMode, trigger: e.target.value === 'webhook' ? 'inbound_form' : selectedWorkflow.trigger })}>
                    <option value="event">Event trigger</option>
                    <option value="webhook">Webhook trigger</option>
                    <option value="schedule">Schedule trigger</option>
                  </select>
                  {selectedWorkflow.triggerType === 'event' && (
                    <>
                      <select className="form-input" value={selectedWorkflow.trigger} onChange={(e) => updateWorkflow({ trigger: e.target.value as TriggerType, eventName: e.target.value })}>
                        {Object.entries(triggerLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                      <input className="form-input" value={selectedWorkflow.eventName} onChange={(e) => updateWorkflow({ eventName: e.target.value })} placeholder="Event key" />
                    </>
                  )}
                  {selectedWorkflow.triggerType === 'webhook' && <input className="form-input" value={selectedWorkflow.webhookPath} onChange={(e) => updateWorkflow({ webhookPath: e.target.value })} placeholder="Webhook path" />}
                  {selectedWorkflow.triggerType === 'schedule' && (
                    <>
                      <input className="form-input" type="number" min={1} value={selectedWorkflow.intervalMinutes} onChange={(e) => updateWorkflow({ intervalMinutes: Math.max(1, Number(e.target.value || 1)) })} placeholder="Interval minutes" />
                      <input className="form-input" type="datetime-local" value={selectedWorkflow.nextRunAt ? new Date(selectedWorkflow.nextRunAt).toISOString().slice(0, 16) : ''} onChange={(e) => updateWorkflow({ nextRunAt: e.target.value ? new Date(e.target.value).toISOString() : null })} />
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeView === 'Enrollment' && (
            <div className="workflow-flow-block">
              <div className="workflow-connector" />
              <div className="workflow-node workflow-node-action">
                <div className="workflow-node-pill">Run history</div>
                <div className="workflow-node-title">Latest workflow executions</div>
                {selectedRuns.length ? (
                  <div className="workflow-run-list">
                    {selectedRuns.map((run) => (
                      <div key={run.id} className="workflow-run-card">
                        <div className="workflow-run-title"><span>{run.status}</span><span>Step {run.currentStep}</span></div>
                        <div className="workflow-run-meta">Started {new Date(run.startedAt).toLocaleString()}</div>
                        <div className="workflow-run-meta">Finished {run.finishedAt ? new Date(run.finishedAt).toLocaleString() : 'Not finished yet'}</div>
                      </div>
                    ))}
                  </div>
                ) : <div className="workflow-panel-empty">No runs yet. Launch the workflow to test it.</div>}
                <div className="workflow-run-list">
                  {selectedLogs.length ? selectedLogs.map((log) => (
                    <div key={log.id} className="workflow-run-card">
                      <div className="workflow-run-title"><span>{log.status}</span><span>{log.stepIndex === null ? 'Workflow' : `Step ${log.stepIndex}`}</span></div>
                      <div className="workflow-run-meta">{log.message}</div>
                      <div className="workflow-run-meta">{new Date(log.createdAt).toLocaleString()}</div>
                    </div>
                  )) : <div className="workflow-panel-empty">No logs yet. Run the workflow to inspect step output.</div>}
                </div>
              </div>
            </div>
          )}

          <div className="workflow-exit">Exit</div>
        </section>

        <aside className="workflow-build-panel">
          <div className="workflow-panel-header">
            <div className="workflow-panel-title">Build</div>
            <div className="workflow-panel-subtitle">Closer to GHL: trigger config, rules, delays, actions, and test runs in one place.</div>
          </div>

          <div className="workflow-panel-section">
            <div className="workflow-panel-section-title">Templates</div>
            {templates.map((template) => <button key={template.name} className="workflow-panel-item" onClick={() => createFromTemplate(template)}>{template.name}</button>)}
          </div>

          <div className="workflow-panel-section">
            <div className="workflow-panel-section-title">Trigger</div>
            {selectedWorkflow ? (
              <div className="workflow-panel-stack">
                <select className="form-input" value={selectedWorkflow.triggerType} onChange={(e) => updateWorkflow({ triggerType: e.target.value as TriggerMode, trigger: e.target.value === 'webhook' ? 'inbound_form' : selectedWorkflow.trigger })}>
                  <option value="event">Event trigger</option>
                  <option value="webhook">Webhook trigger</option>
                  <option value="schedule">Schedule trigger</option>
                </select>
                {selectedWorkflow.triggerType === 'event' && (
                  <>
                    <select className="form-input" value={selectedWorkflow.trigger} onChange={(e) => updateWorkflow({ trigger: e.target.value as TriggerType, eventName: e.target.value })}>
                      {Object.entries(triggerLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                    <input className="form-input" value={selectedWorkflow.eventName} onChange={(e) => updateWorkflow({ eventName: e.target.value })} placeholder="Event key" />
                  </>
                )}
                {selectedWorkflow.triggerType === 'webhook' && <input className="form-input" value={selectedWorkflow.webhookPath} onChange={(e) => updateWorkflow({ webhookPath: e.target.value })} placeholder="Webhook path" />}
                {selectedWorkflow.triggerType === 'schedule' && (
                  <>
                    <input className="form-input" type="number" min={1} value={selectedWorkflow.intervalMinutes} onChange={(e) => updateWorkflow({ intervalMinutes: Math.max(1, Number(e.target.value || 1)) })} placeholder="Interval minutes" />
                    <input className="form-input" type="datetime-local" value={selectedWorkflow.nextRunAt ? new Date(selectedWorkflow.nextRunAt).toISOString().slice(0, 16) : ''} onChange={(e) => updateWorkflow({ nextRunAt: e.target.value ? new Date(e.target.value).toISOString() : null })} />
                  </>
                )}
              </div>
            ) : <div className="workflow-panel-empty">Create a workflow to configure its trigger.</div>}
          </div>

          <div className="workflow-panel-section">
            <div className="workflow-panel-section-title">Rules</div>
            <button className="workflow-panel-item" onClick={() => addCondition('always')}>Add shared condition</button>
            <button className="workflow-panel-item" onClick={() => addCondition('true')}>Add YES path condition</button>
            <button className="workflow-panel-item" onClick={() => addCondition('false')}>Add NO path condition</button>
            <button className="workflow-panel-item" onClick={() => addDelay('always')}>Add shared delay</button>
            <button className="workflow-panel-item" onClick={() => addDelay('true')}>Add YES path delay</button>
            <button className="workflow-panel-item" onClick={() => addDelay('false')}>Add NO path delay</button>
          </div>

          <div className="workflow-panel-section">
            <div className="workflow-panel-section-title">Actions</div>
            {Object.entries(actionLabels).map(([value, label]) => <button key={value} className="workflow-panel-item" onClick={() => addAction(value as ActionType)}>{label}</button>)}
          </div>

          {selectedWorkflow && (
            <div className="workflow-panel-editor">
              <div className="workflow-panel-section-title">Selected workflow</div>
              <input className="form-input" value={selectedWorkflow.name} onChange={(e) => updateWorkflow({ name: e.target.value })} placeholder="Workflow name" />
              <select className="form-input" value={selectedWorkflow.status} onChange={(e) => updateWorkflow({ status: e.target.value as WorkflowStatus })}>
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
              </select>
              <textarea className="form-textarea" rows={8} value={testContext} onChange={(e) => setTestContext(e.target.value)} placeholder="JSON test context" />
              <div className="workflow-panel-hint">Launch workflow uses this JSON payload as the run context, so you can test immediately.</div>
              <div className="workflow-preview-card">
                <div className="workflow-panel-section-title">Execution preview</div>
                <div className="workflow-panel-hint">{previewResult.summary}</div>
                {previewResult.error ? (
                  <div className="workflow-panel-empty">{previewResult.error}</div>
                ) : previewResult.items.length ? (
                  <div className="workflow-preview-list">
                    {previewResult.items.map((item, index) => (
                      <div key={`${item.label}-${index}`} className={`workflow-preview-item is-${item.status}`}>
                        <div className="workflow-preview-item-title">
                          <span>{item.label}</span>
                          <strong>{item.status === 'run' ? 'Will run' : item.status === 'skip' ? 'Skipped' : 'Stops here'}</strong>
                        </div>
                        <div className="workflow-run-meta">{item.detail}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="workflow-panel-empty">No steps to preview yet. Add a condition, delay, or action to see the path.</div>
                )}
              </div>
            </div>
          )}

          <div className="workflow-panel-footer">
            <button className="btn btn-secondary btn-sm" onClick={createNewWorkflow}>New workflow</button>
            <button className="btn btn-primary btn-sm" onClick={() => selectedWorkflow && updateWorkflow({ status: 'active' })}>Activate</button>
          </div>
        </aside>
      </div>

      <div className="workflow-summary-grid">
        <div className="workflow-summary-card"><span>Active workflows</span><strong>{workflowSummary.active}</strong></div>
        <div className="workflow-summary-card"><span>Paused workflows</span><strong>{workflowSummary.paused}</strong></div>
        <div className="workflow-summary-card"><span>Draft workflows</span><strong>{workflowSummary.draft}</strong></div>
      </div>
    </div>
  );
}
