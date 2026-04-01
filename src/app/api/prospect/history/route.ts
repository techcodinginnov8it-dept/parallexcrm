import { NextResponse } from 'next/server';
import { getCurrentUser, unauthorizedResponse } from '@/lib/api-utils';
import { getPrismaClient } from '@/lib/db';

const MAX_HISTORY_ITEMS = 8;

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    const prisma = getPrismaClient();
    const searches = await prisma.searchQuery.findMany({
      where: {
        org_id: user.org_id,
        source: 'google_maps',
      },
      orderBy: {
        created_at: 'desc',
      },
      take: MAX_HISTORY_ITEMS,
      select: {
        id: true,
        query: true,
        location: true,
        created_at: true,
      },
    });

    const resultCounts = await Promise.all(
      searches.map(async (search) => ({
        searchId: search.id,
        resultCount: await prisma.lead.count({
          where: {
            org_id: user.org_id,
            search_id: search.id,
            NOT: {
              emails: {
                isEmpty: true,
              },
            },
          },
        }),
      }))
    );
    const resultCountMap = new Map(
      resultCounts.map((entry) => [entry.searchId, entry.resultCount])
    );

    return NextResponse.json({
      data: searches.map((search) => ({
        key: search.id,
        searchId: search.id,
        category: search.query,
        locationLabel: search.location || 'General location',
        updatedAt: search.created_at.toISOString(),
        resultCount: resultCountMap.get(search.id) ?? 0,
      })),
    });
  } catch (error) {
    console.error('Failed to fetch prospect history:', error);
    return NextResponse.json(
      { error: 'Failed to fetch prospect history' },
      { status: 500 }
    );
  }
}
