import { NextResponse } from 'next/server';
import { forbiddenResponse, getCurrentUser, isAdminRole, unauthorizedResponse } from '@/lib/api-utils';
import { getPrismaClient } from '@/lib/db';

function getLeadDelegate(prismaClient: ReturnType<typeof getPrismaClient>) {
  return (prismaClient as typeof prismaClient & { lead?: typeof prismaClient.lead }).lead;
}

export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();
    if (!isAdminRole(user.role)) {
      return forbiddenResponse('Only admins can clean workspace leads.');
    }

    const prisma = getPrismaClient();
    const leadDelegate = getLeadDelegate(prisma);

    if (!leadDelegate) {
      return NextResponse.json(
        { error: 'Lead management is unavailable in the current runtime. Please restart the dev server.' },
        { status: 503 }
      );
    }

    const result = await leadDelegate.deleteMany({
      where: {
        org_id: user.org_id,
        emails: {
          isEmpty: true,
        },
      },
    });

    return NextResponse.json({
      success: true,
      deletedCount: result.count,
    });
  } catch (error) {
    console.error('Failed to clean no-email leads:', error);
    return NextResponse.json(
      { error: 'Failed to clean no-email leads' },
      { status: 500 }
    );
  }
}
