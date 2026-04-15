import { NextResponse } from 'next/server';
import { getCurrentUser, unauthorizedResponse } from '@/lib/api-utils';
import { fireEventTrigger } from '@/lib/workflow-engine';

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return unauthorizedResponse();

  try {
    const payload = await request.json().catch(() => ({}));
    const eventType = String(payload?.event || '').trim();
    if (!eventType) {
      return NextResponse.json({ error: 'Event type is required.' }, { status: 400 });
    }

    const runIds = await fireEventTrigger(user.org_id, eventType, payload?.context || {});
    return NextResponse.json({ data: { runIds, matchedWorkflows: runIds.length } });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to process event.' }, { status: 500 });
  }
}
