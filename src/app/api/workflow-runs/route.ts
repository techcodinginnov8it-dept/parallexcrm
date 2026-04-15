import { NextResponse } from 'next/server';
import { getCurrentUser, unauthorizedResponse } from '@/lib/api-utils';
import { listWorkflowRuns } from '@/lib/workflow-engine';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return unauthorizedResponse();

  try {
    const runs = await listWorkflowRuns(user.org_id);
    return NextResponse.json({ data: runs });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to load workflow runs.' }, { status: 500 });
  }
}
