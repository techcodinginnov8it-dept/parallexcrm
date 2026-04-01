import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { getCurrentUser, unauthorizedResponse } from '@/lib/api-utils';
import { getPrismaClient } from '@/lib/db';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const LEAD_STATUSES = ['found', 'enriching', 'enriched', 'stored', 'saved', 'unavailable'];

function parsePositiveInt(value: string | null, fallback: number) {
  const parsed = Number.parseInt(value || '', 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return parsed;
}

function getLeadDelegate(prismaClient: ReturnType<typeof getPrismaClient>) {
  return (prismaClient as typeof prismaClient & { lead?: typeof prismaClient.lead }).lead;
}

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    const prisma = getPrismaClient();
    const leadDelegate = getLeadDelegate(prisma);

    if (!leadDelegate) {
      return NextResponse.json(
        { error: 'Lead management is unavailable in the current runtime. Please restart the dev server.' },
        { status: 503 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const page = parsePositiveInt(searchParams.get('page'), DEFAULT_PAGE);
    const limit = Math.min(parsePositiveInt(searchParams.get('limit'), DEFAULT_LIMIT), MAX_LIMIT);
    const search = (searchParams.get('search') || '').trim();
    const status = (searchParams.get('status') || 'all').trim();
    const tag = (searchParams.get('tag') || 'all').trim();
    const skip = (page - 1) * limit;

    const where: Prisma.LeadWhereInput = {
      org_id: user.org_id,
      NOT: {
        emails: {
          isEmpty: true,
        },
      },
    };

    if (status && status !== 'all') {
      where.status = status;
    }

    if (tag && tag !== 'all') {
      where.OR = [
        { general_business_tag: { equals: tag, mode: 'insensitive' } },
        { business_tags: { has: tag } },
      ];
    }

    if (search) {
      const searchOrFilters: Prisma.LeadWhereInput[] = [
        { name: { contains: search, mode: 'insensitive' } },
        { website: { contains: search, mode: 'insensitive' } },
        { business_query: { contains: search, mode: 'insensitive' } },
        { general_business_tag: { contains: search, mode: 'insensitive' } },
        { location_label: { contains: search, mode: 'insensitive' } },
        { emails: { has: search.toLowerCase() } },
      ];

      where.AND = [{ OR: searchOrFilters }];
    }

    const [leads, total, tagRows] = await Promise.all([
      leadDelegate.findMany({
        where,
        orderBy: {
          created_at: 'desc',
        },
        skip,
        take: limit,
        select: {
          id: true,
          name: true,
          website: true,
          address: true,
          emails: true,
          status: true,
          category: true,
          source: true,
          rating: true,
          business_query: true,
          business_tags: true,
          general_business_tag: true,
          location_label: true,
          created_at: true,
        },
      }),
      leadDelegate.count({ where }),
      leadDelegate.findMany({
        where: {
          org_id: user.org_id,
          general_business_tag: {
            not: null,
          },
        },
        select: {
          general_business_tag: true,
        },
        distinct: ['general_business_tag'],
        orderBy: {
          general_business_tag: 'asc',
        },
      }),
    ]);

    return NextResponse.json({
      data: leads,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
      filters: {
        availableStatuses: LEAD_STATUSES,
        availableTags: tagRows
          .map((row) => row.general_business_tag)
          .filter((value): value is string => Boolean(value)),
      },
    });
  } catch (error) {
    console.error('Failed to fetch leads:', error);
    return NextResponse.json({ error: 'Failed to fetch leads' }, { status: 500 });
  }
}
