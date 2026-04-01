import { NextRequest, NextResponse } from 'next/server';
import { getPrismaClient } from '@/lib/db';
import { getCurrentUser, unauthorizedResponse } from '@/lib/api-utils';
import { mergeUniqueEmails, normalizeOptionalString, normalizeWebsiteForStorage } from '@/lib/lead-utils';

function normalizeWebsiteUrl(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const parse = (value: string) => {
    try {
      const parsed = new URL(value);
      if (!['http:', 'https:'].includes(parsed.protocol)) return null;
      return parsed;
    } catch {
      return null;
    }
  };

  const parsed = parse(trimmed) ?? parse(`https://${trimmed}`);
  return parsed?.toString() ?? null;
}

function normalizeEmail(email: string | null | undefined): string | null {
  if (!email || typeof email !== 'string') return null;
  const trimmed = email.trim().toLowerCase();
  return trimmed || null;
}

function getLeadDelegate(prismaClient: ReturnType<typeof getPrismaClient>) {
  return (prismaClient as typeof prismaClient & { lead?: typeof prismaClient.lead }).lead;
}

export async function POST(request: NextRequest) {
  try {
    const prismaClient = getPrismaClient();
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    const body = await request.json();
    const name = normalizeOptionalString(body?.name, 255) || '';
    const leadId = typeof body?.leadId === 'string' ? body.leadId.trim() : '';
    const address = normalizeOptionalString(body?.address, 4000) || '';
    const website = normalizeWebsiteForStorage(normalizeWebsiteUrl(body?.website), 255);
    const emails = Array.isArray(body?.emails) ? mergeUniqueEmails(body.emails) : [];
    const primaryEmail = normalizeEmail(emails[0]);

    if (!name || !primaryEmail || !leadId) {
      return NextResponse.json(
        { error: 'A lead id, lead name, and at least one email are required.' },
        { status: 400 }
      );
    }

    const leadDelegate = getLeadDelegate(prismaClient);
    if (!leadDelegate) {
      return NextResponse.json(
        { error: 'Lead storage is unavailable in the current runtime.' },
        { status: 503 }
      );
    }

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

    if (!existingLead) {
      return NextResponse.json(
        { error: 'Lead not found.' },
        { status: 404 }
      );
    }

    await leadDelegate.update({
      where: { id: existingLead.id },
      data: {
        name,
        website: website || undefined,
        address: address || undefined,
        emails: { set: mergeUniqueEmails(existingLead.emails, emails) },
        status: 'stored',
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        lead_id: existingLead.id,
        status: 'stored',
      },
    });
  } catch (error: any) {
    console.error('Failed to save prospect to database:', error);
    return NextResponse.json(
      { error: 'Failed to save lead to database' },
      { status: 500 }
    );
  }
}
