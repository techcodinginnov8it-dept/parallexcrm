import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, unauthorizedResponse } from '@/lib/api-utils';
import {
  createSequence,
  listSequences,
  SequenceStoreError,
} from '@/lib/sequences-store';

function parsePositiveInt(value: string | null, fallback: number) {
  const parsed = Number.parseInt(value || '', 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return parsed;
}

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    const searchParams = request.nextUrl.searchParams;
    const page = parsePositiveInt(searchParams.get('page'), 1);
    const limit = parsePositiveInt(searchParams.get('limit'), 12);
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') || 'all';

    const payload = await listSequences(user.org_id, {
      page,
      limit,
      search,
      status,
    });

    return NextResponse.json(payload);
  } catch (error) {
    console.error('Failed to fetch sequences:', error);
    if (error instanceof SequenceStoreError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch sequences.' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    const body = await request.json().catch(() => null);
    const sequence = await createSequence(user.org_id, user.id, {
      name: body?.name,
      description: body?.description,
      status: body?.status,
      settings: body?.settings,
      steps: body?.steps,
    });

    return NextResponse.json({ data: sequence }, { status: 201 });
  } catch (error) {
    console.error('Failed to create sequence:', error);
    if (error instanceof SequenceStoreError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create sequence.' },
      { status: 500 }
    );
  }
}
