import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, unauthorizedResponse } from '@/lib/api-utils';
import {
  SequenceStoreError,
  updateEnrollmentStatus,
} from '@/lib/sequences-store';

type RouteContext = {
  params: Promise<{
    sequenceId: string;
    enrollmentId: string;
  }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    const { sequenceId, enrollmentId } = await context.params;
    const body = await request.json().catch(() => null);
    const action = typeof body?.action === 'string' ? body.action : '';
    const sequence = await updateEnrollmentStatus(
      user.org_id,
      sequenceId,
      enrollmentId,
      action
    );

    return NextResponse.json({ data: sequence });
  } catch (error) {
    console.error('Failed to update sequence enrollment:', error);
    if (error instanceof SequenceStoreError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: 'Failed to update sequence enrollment.' }, { status: 500 });
  }
}
