import { NextResponse } from 'next/server';
import { getCurrentUser, unauthorizedResponse } from '@/lib/api-utils';
import {
  createWorkflowRun,
  enqueueScheduledWorkflows,
  getWorkflow,
  processWorkflowQueue,
  WorkflowEngineError,
} from '@/lib/workflow-engine';

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return unauthorizedResponse();

  try {
    const payload = await request.json().catch(() => ({}));
    const workflowId = String(payload?.workflowId || '').trim();

    if (workflowId) {
      const workflow = await getWorkflow(user.org_id, workflowId);
      if (!workflow) return NextResponse.json({ error: 'Workflow not found.' }, { status: 404 });

      const runId = await createWorkflowRun(workflow.id, payload?.context || {});
      const summary = await processWorkflowQueue();
      return NextResponse.json({ data: { ...summary, runId, workflowId: workflow.id } });
    }

    await enqueueScheduledWorkflows(user.org_id);
    return NextResponse.json({ data: await processWorkflowQueue() });
  } catch (error: any) {
    if (error instanceof WorkflowEngineError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: error?.message || 'Failed to run workflows.' }, { status: 500 });
  }
}
