import { NextResponse } from 'next/server';
import { getCurrentUser, unauthorizedResponse } from '@/lib/api-utils';
import { fireWebhookTrigger, WorkflowEngineError } from '@/lib/workflow-engine';

export async function POST(
  request: Request,
  context: { params: Promise<{ workflowId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return unauthorizedResponse();
  const { workflowId } = await context.params;

  try {
    const payload = await request.json().catch(() => ({}));
    const runId = await fireWebhookTrigger(user.org_id, workflowId, payload);
    return NextResponse.json({ data: { runId } }, { status: 201 });
  } catch (error: any) {
    if (error instanceof WorkflowEngineError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: error?.message || 'Failed to trigger webhook workflow.' }, { status: 500 });
  }
}
