import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getCurrentUser, unauthorizedResponse } from '@/lib/api-utils';
import {
  getVisitorTotals,
  VISITOR_ACTIVE_WINDOW_MINUTES,
} from '@/lib/visitor-analytics';

const ACTIVE_WINDOW_MINUTES = 10;
const ACTIVE_WINDOW_MS = ACTIVE_WINDOW_MINUTES * 60 * 1000;

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return unauthorizedResponse();

  const activeSince = new Date(Date.now() - ACTIVE_WINDOW_MS);
  const [totalUsers, activeUsersNow, visitorTotals] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({
      where: {
        last_login_at: {
          gte: activeSince,
        },
      },
    }),
    getVisitorTotals(),
  ]);

  return NextResponse.json({
    data: {
      totalUsers,
      activeUsersNow,
      activeWindowMinutes: ACTIVE_WINDOW_MINUTES,
      totalVisitors: visitorTotals.totalVisitors,
      liveVisitorsNow: visitorTotals.liveVisitorsNow,
      visitorActiveWindowMinutes: VISITOR_ACTIVE_WINDOW_MINUTES,
    },
  });
}
