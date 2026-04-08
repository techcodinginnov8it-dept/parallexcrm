import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, unauthorizedResponse } from '@/lib/api-utils';
import {
  enrollContactsInSequence,
  SequenceStoreError,
} from '@/lib/sequences-store';

type RouteContext = {
  params: Promise<{
    sequenceId: string;
  }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    const { sequenceId } = await context.params;
    const body = await request.json().catch(() => null);
    const contactIds = Array.isArray(body?.contactIds) ? body.contactIds : [];
    const payload = await enrollContactsInSequence(user.org_id, sequenceId, contactIds, user.id);

    return NextResponse.json({
      data: payload.sequence,
      insertedCount: payload.insertedCount,
      totalRequested: payload.totalRequested,
    });
  } catch (error) {
    console.error('Failed to enroll contacts in sequence:', error);
    if (error instanceof SequenceStoreError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: 'Failed to enroll contacts in sequence.' }, { status: 500 });
  }
}
