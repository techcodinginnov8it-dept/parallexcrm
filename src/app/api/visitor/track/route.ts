import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import {
  recordVisitorVisit,
  VISITOR_COOKIE_NAME,
} from '@/lib/visitor-analytics';

const VISITOR_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export async function POST(request: NextRequest) {
  const existingVisitorId = request.cookies.get(VISITOR_COOKIE_NAME)?.value?.trim();
  const visitorId = existingVisitorId || randomUUID();
  const body = await request.json().catch(() => null);
  const rawPath = typeof body?.path === 'string' ? body.path : '';
  const path = rawPath.slice(0, 255) || null;
  const userAgent = request.headers.get('user-agent');

  await recordVisitorVisit(visitorId, path, userAgent);

  const response = NextResponse.json({
    ok: true,
    visitorId,
  });

  if (!existingVisitorId) {
    response.cookies.set({
      name: VISITOR_COOKIE_NAME,
      value: visitorId,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: VISITOR_COOKIE_MAX_AGE_SECONDS,
    });
  }

  return response;
}
