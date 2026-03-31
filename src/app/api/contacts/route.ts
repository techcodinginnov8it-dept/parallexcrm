import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getCurrentUser, unauthorizedResponse } from '@/lib/api-utils';
import { Stage } from '@prisma/client';

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
        { first_name: { contains: search, mode: 'insensitive' } },
        { last_name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { company: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [contacts, total] = await Promise.all([
      prisma.contact.findMany({
        where,
        include: {
          company: { select: { name: true, domain: true } },
          owner: { select: { first_name: true, last_name: true } }
        },
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
      prisma.contact.count({ where })
    ]);

    return NextResponse.json({
      data: contacts,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Failed to fetch contacts:', error);
    return NextResponse.json({ error: 'Failed to fetch contacts' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    const body = await request.json();
    // Basic validation
    if (!body.email || !body.first_name || !body.last_name || !body.company_id) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const contact = await prisma.contact.create({
      data: {
        org_id: user.org_id,
        first_name: body.first_name,
        last_name: body.last_name,
        email: body.email,
        title: body.title,
        seniority: body.seniority,
        department: body.department,
        phone_direct: body.phone_direct,
        linkedin_url: body.linkedin_url,
        company_id: body.company_id,
        owner_id: user.id,
        stage: Stage.cold,
      }
    });

    return NextResponse.json({ data: contact }, { status: 201 });
  } catch (error: any) {
    console.error('Failed to create contact:', error);
    return NextResponse.json({ error: 'Failed to create contact' }, { status: 500 });
  }
}
