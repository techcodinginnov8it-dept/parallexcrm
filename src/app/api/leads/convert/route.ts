import { NextRequest, NextResponse } from 'next/server';
import { Stage } from '@prisma/client';
import { getCurrentUser, unauthorizedResponse } from '@/lib/api-utils';
import { getPrismaClient } from '@/lib/db';
import {
  mergeUniqueEmails,
  normalizeOptionalString,
  normalizeWebsiteForStorage,
} from '@/lib/lead-utils';

function normalizeEmail(email: string | null | undefined): string | null {
  if (!email || typeof email !== 'string') return null;
  const trimmed = email.trim().toLowerCase();
  return trimmed || null;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function extractDomain(website: string | null, fallbackEmail: string | null, leadName: string): string {
  if (website) {
    try {
      return new URL(website).hostname.replace(/^www\./i, '').toLowerCase();
    } catch {
      // Ignore and use fallbacks below.
    }
  }

  if (fallbackEmail) {
    const [, emailDomain] = fallbackEmail.split('@');
    if (emailDomain) return emailDomain.toLowerCase();
  }

  return `${slugify(leadName) || 'lead'}.local`;
}

function getLeadDelegate(prismaClient: ReturnType<typeof getPrismaClient>) {
  return (prismaClient as typeof prismaClient & { lead?: typeof prismaClient.lead }).lead;
}

export async function POST(request: NextRequest) {
  try {
    const prisma = getPrismaClient();
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    const body = await request.json();
    const leadId = typeof body?.leadId === 'string' ? body.leadId.trim() : '';
    const name = normalizeOptionalString(body?.name, 255) || '';
    const address = normalizeOptionalString(body?.address, 4000) || '';
    const website = normalizeWebsiteForStorage(body?.website, 255);
    const emails = Array.isArray(body?.emails) ? mergeUniqueEmails(body.emails) : [];
    const primaryEmail = normalizeEmail(emails[0]);
    const contactFirstName = normalizeOptionalString(name, 100) || name.slice(0, 100);

    if (!name || !primaryEmail || emails.length === 0) {
      return NextResponse.json(
        { error: 'A business name and at least one email are required to add this lead to CRM.' },
        { status: 400 }
      );
    }

    const domain = extractDomain(website, primaryEmail, name);
    const leadDelegate = getLeadDelegate(prisma);

    const company = await prisma.company.upsert({
      where: {
        domain_org_id: {
          domain,
          org_id: user.org_id,
        },
      },
      update: {
        name,
        address: address || undefined,
        website_url: website || undefined,
      },
      create: {
        org_id: user.org_id,
        name,
        domain,
        address: address || undefined,
        website_url: website || undefined,
      },
    });

    const contacts = await Promise.all(
      emails.map((email) =>
        prisma.contact.upsert({
          where: {
            email_org_id: {
              email,
              org_id: user.org_id,
            },
          },
          update: {
            company_id: company.id,
            first_name: contactFirstName,
            last_name: 'Lead',
            source: 'prospect_lead',
            owner_id: user.id,
          },
          create: {
            org_id: user.org_id,
            company_id: company.id,
            first_name: contactFirstName,
            last_name: 'Lead',
            email,
            title: 'Business Lead',
            owner_id: user.id,
            stage: Stage.cold,
            source: 'prospect_lead',
          },
        })
      )
    );

    let updatedLeadId: string | null = null;
    if (leadId && leadDelegate) {
      const existingLead = await leadDelegate.findFirst({
        where: {
          id: leadId,
          org_id: user.org_id,
        },
        select: {
          id: true,
          emails: true,
        },
      });

      if (existingLead) {
        const mergedEmails = mergeUniqueEmails(existingLead.emails, emails);
        const updatedLead = await leadDelegate.update({
          where: { id: existingLead.id },
          data: {
            name,
            website: website || undefined,
            address: address || undefined,
            emails: { set: mergedEmails },
            status: 'saved',
          },
          select: {
            id: true,
          },
        });
        updatedLeadId = updatedLead.id;
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        companyId: company.id,
        contactId: contacts[0]?.id ?? null,
        contactIds: contacts.map((contact) => contact.id),
        contactCount: contacts.length,
        leadId: updatedLeadId,
      },
    });
  } catch (error) {
    console.error('Failed to convert lead to CRM:', error);
    return NextResponse.json({ error: 'Failed to add lead to CRM' }, { status: 500 });
  }
}
