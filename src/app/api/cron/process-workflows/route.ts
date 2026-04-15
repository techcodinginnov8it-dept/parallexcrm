import { NextResponse } from 'next/server';
import { enqueueScheduledWorkflows, processWorkflowQueue } from '@/lib/workflow-engine';

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    const expected = process.env.CRON_SECRET;
    if (expected && authHeader !== `Bearer ${expected}`) {
      return NextResponse.json({ error: 'Unauthorized cron request.' }, { status: 401 });
    }

    const url = new URL(request.url);
    const orgId = url.searchParams.get('orgId');
    if (orgId) {
      await enqueueScheduledWorkflows(orgId);
    }

    const result = await processWorkflowQueue();
    return NextResponse.json({ data: result });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to process workflow queue.' }, { status: 500 });
  }
}
