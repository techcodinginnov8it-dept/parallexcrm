import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getCurrentUser, unauthorizedResponse } from '@/lib/api-utils';

const MIN_UPDATE_GAP_MS = 2 * 60 * 1000;

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return unauthorizedResponse();

  const now = new Date();
  const lastSeenAt = user.last_login_at ? new Date(user.last_login_at) : null;

  if (!lastSeenAt || now.getTime() - lastSeenAt.getTime() >= MIN_UPDATE_GAP_MS) {
    await prisma.user.update({
      where: { id: user.id },
      data: { last_login_at: now },
    });
  }

  return NextResponse.json({
    ok: true,
    recordedAt: now.toISOString(),
  });
}
