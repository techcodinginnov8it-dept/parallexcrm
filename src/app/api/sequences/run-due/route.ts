import { NextResponse } from 'next/server';
import { getCurrentUser, unauthorizedResponse } from '@/lib/api-utils';
import { runDueSequenceSteps, SequenceStoreError } from '@/lib/sequences-store';

export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    const summary = await runDueSequenceSteps(user.org_id, user.id);
    return NextResponse.json({ data: summary });
  } catch (error) {
    console.error('Failed to run due sequence steps:', error);
    if (error instanceof SequenceStoreError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: 'Failed to run due sequence steps.' }, { status: 500 });
  }
}
