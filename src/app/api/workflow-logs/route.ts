import { NextResponse } from 'next/server';
import { getCurrentUser, unauthorizedResponse } from '@/lib/api-utils';
import { listWorkflowLogs } from '@/lib/workflow-engine';

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return unauthorizedResponse();

  try {
    const { searchParams } = new URL(request.url);
    const workflowId = searchParams.get('workflowId');
    const runId = searchParams.get('runId');
    const limit = Number(searchParams.get('limit') || 100);

    const data = await listWorkflowLogs(user.org_id, { workflowId, runId, limit });
    return NextResponse.json({ data });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to load workflow logs.' }, { status: 500 });
  }
}
