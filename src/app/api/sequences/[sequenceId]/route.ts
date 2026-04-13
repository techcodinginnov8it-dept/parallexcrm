import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, unauthorizedResponse } from '@/lib/api-utils';
import {
  getSequenceDetail,
  SequenceStoreError,
  updateSequence,
} from '@/lib/sequences-store';

type RouteContext = {
  params: Promise<{
    sequenceId: string;
  }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    const { sequenceId } = await context.params;
    const sequence = await getSequenceDetail(user.org_id, sequenceId);

    return NextResponse.json({ data: sequence });
  } catch (error) {
    console.error('Failed to fetch sequence detail:', error);
    if (error instanceof SequenceStoreError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch sequence detail.' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    const { sequenceId } = await context.params;
    const body = await request.json().catch(() => null);
    const sequence = await updateSequence(user.org_id, sequenceId, {
      name: body?.name,
      description: body?.description,
      status: body?.status,
      settings: body?.settings,
      steps: body?.steps,
    });

    return NextResponse.json({ data: sequence });
  } catch (error) {
    console.error('Failed to update sequence:', error);
    if (error instanceof SequenceStoreError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update sequence.' },
      { status: 500 }
    );
  }
}
