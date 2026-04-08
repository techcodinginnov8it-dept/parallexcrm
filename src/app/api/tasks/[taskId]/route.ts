import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, unauthorizedResponse } from '@/lib/api-utils';
import { listTasks, SequenceStoreError, updateTaskCompletion } from '@/lib/sequences-store';

type RouteContext = {
  params: Promise<{
    taskId: string;
  }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    const { taskId } = await context.params;
    const body = await request.json().catch(() => null);
    const action = body?.action === 'reopen' ? 'reopen' : 'complete';

    await updateTaskCompletion(user.org_id, taskId, action);
    const tasks = await listTasks(user.org_id, { page: 1, limit: 25, search: '', status: 'all' });

    return NextResponse.json(tasks);
  } catch (error) {
    console.error('Failed to update task:', error);
    if (error instanceof SequenceStoreError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: 'Failed to update task.' }, { status: 500 });
  }
}
