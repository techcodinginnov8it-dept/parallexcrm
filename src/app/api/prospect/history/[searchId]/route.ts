import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, unauthorizedResponse } from '@/lib/api-utils';
import { getPrismaClient } from '@/lib/db';

const MAX_RESTORED_LEADS = 250;

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ searchId: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    const { searchId } = await context.params;
    if (!searchId) {
      return NextResponse.json({ error: 'Search id is required' }, { status: 400 });
    }

    const prisma = getPrismaClient();
    const search = await prisma.searchQuery.findFirst({
      where: {
        id: searchId,
        org_id: user.org_id,
        source: 'google_maps',
      },
      select: {
        id: true,
        query: true,
        location: true,
      },
    });

    if (!search) {
      return NextResponse.json({ error: 'Search history item not found' }, { status: 404 });
    }

    const leads = await prisma.lead.findMany({
      where: {
        org_id: user.org_id,
        search_id: search.id,
        NOT: {
          emails: {
            isEmpty: true,
          },
        },
      },
      orderBy: {
        created_at: 'desc',
      },
      take: MAX_RESTORED_LEADS,
      select: {
        id: true,
        name: true,
        website: true,
        address: true,
        emails: true,
        status: true,
        category: true,
        rating: true,
      },
    });

    return NextResponse.json({
      data: {
        searchId: search.id,
        search: {
          query: search.query,
          location: search.location || '',
        },
        leads: leads.map((lead) => ({
          source_id: lead.id,
          name: lead.name,
          website: lead.website,
          address: lead.address,
          emails: lead.emails,
          status: lead.status,
          category: lead.category,
          source: 'google_maps',
          rating: lead.rating,
        })),
      },
    });
  } catch (error) {
    console.error('Failed to fetch saved prospect search:', error);
    return NextResponse.json(
      { error: 'Failed to fetch saved prospect search' },
      { status: 500 }
    );
  }
}
