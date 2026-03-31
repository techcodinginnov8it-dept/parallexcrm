import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getCurrentUser, unauthorizedResponse } from '@/lib/api-utils';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '25');
    const search = searchParams.get('search') || '';
    const skip = (page - 1) * limit;

    const where: any = {
      org_id: user.org_id,
    };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { domain: { contains: search, mode: 'insensitive' } },
        { industry: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [companies, total] = await Promise.all([
      prisma.company.findMany({
        where,
        orderBy: { name: 'asc' },
        skip,
        take: limit,
      }),
      prisma.company.count({ where })
    ]);

    return NextResponse.json({
      data: companies,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Failed to fetch companies:', error);
    return NextResponse.json({ error: 'Failed to fetch companies' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    const body = await request.json();
    
    if (!body.name || !body.domain) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Upsert logic for company (to avoid duplicate domains per org)
    const company = await prisma.company.upsert({
      where: {
        domain_org_id: {
          domain: body.domain,
          org_id: user.org_id,
        }
      },
      update: {
        name: body.name,
        industry: body.industry,
        employee_count: body.employee_count,
        annual_revenue: body.annual_revenue ? BigInt(body.annual_revenue) : null,
        city: body.city,
        state: body.state,
        country: body.country,
        linkedin_url: body.linkedin_url,
        website_url: body.website_url,
      },
      create: {
        org_id: user.org_id,
        name: body.name,
        domain: body.domain,
        industry: body.industry,
        employee_count: body.employee_count,
        annual_revenue: body.annual_revenue ? BigInt(body.annual_revenue) : null,
        city: body.city,
        state: body.state,
        country: body.country,
        linkedin_url: body.linkedin_url,
        website_url: body.website_url,
      }
    });

    // We serialize BigInt before returning
    const serialized = {
      ...company,
      annual_revenue: company.annual_revenue?.toString()
    };

    return NextResponse.json({ data: serialized }, { status: 200 });
  } catch (error) {
    console.error('Failed to save company:', error);
    return NextResponse.json({ error: 'Failed to save company' }, { status: 500 });
  }
}
