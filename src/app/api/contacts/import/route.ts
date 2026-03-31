import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getCurrentUser, unauthorizedResponse } from '@/lib/api-utils';
import { Stage } from '@prisma/client';

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    const { contacts } = await request.json();

    if (!Array.isArray(contacts) || contacts.length === 0) {
      return NextResponse.json({ error: 'No contacts provided' }, { status: 400 });
    }

    // 1. Gather all unique domain names
    const domains = new Set<string>();
    contacts.forEach((c: any) => {
      if (c.domain) domains.add(c.domain.toLowerCase());
    });

    // 2. Upsert Companies to ensure they exist
    // Prisma does not support createMany with nested creates yet generically if we want IDs back.
    // Instead we will upsert domains individually or find them
    const domainArray = Array.from(domains);
    const existingCompanies = await prisma.company.findMany({
      where: {
        org_id: user.org_id,
        domain: { in: domainArray }
      }
    });

    const companyMap = new Map<string, string>();
    existingCompanies.forEach(c => companyMap.set(c.domain, c.id));

    // Find missing companies and create them
    const missingDomains = domainArray.filter(d => !companyMap.has(d));
    if (missingDomains.length > 0) {
      const newCompaniesData = missingDomains.map(d => ({
        org_id: user.org_id,
        name: d, // Fallback name to domain if not provided per row initially
        domain: d,
      }));

      // We need IDs, so we create sequentially or use createManyAndReturn when available
      for (const t of newCompaniesData) {
        const nc = await prisma.company.create({ data: t });
        companyMap.set(nc.domain, nc.id);
      }
    }

    // 3. Prepare Contacts data Payload
    const contactDataToInsert = contacts.map((c: any) => ({
      org_id: user.org_id,
      first_name: c.first_name || '',
      last_name: c.last_name || '',
      email: c.email || '',
      title: c.title,
      phone_direct: c.phone_direct,
      company_id: c.domain ? companyMap.get(c.domain.toLowerCase()) : undefined,
      owner_id: user.id,
      stage: Stage.cold,
    })).filter((c: any) => c.email && c.first_name); // Must have at least email & first name

    if (contactDataToInsert.length === 0) {
      return NextResponse.json({ error: 'No valid contacts could be parsed (Missing email/firstname)' }, { status: 400 });
    }

    // 4. Bulk insert contacts
    const createResult = await prisma.contact.createMany({
      data: contactDataToInsert,
      skipDuplicates: true, // Requires Prisma 4.0+. Will skip on UK constraint (email + org_id)
    });

    return NextResponse.json({ 
      success: true, 
      importedCount: createResult.count,
      totalProcessed: contactDataToInsert.length
    }, { status: 201 });

  } catch (error) {
    console.error('CSV Import Error:', error);
    return NextResponse.json({ error: 'Failed to import contacts' }, { status: 500 });
  }
}
