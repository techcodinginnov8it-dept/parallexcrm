import { NextRequest, NextResponse } from 'next/server';
import { getPrismaClient } from '@/lib/db';
import { getCurrentUser, unauthorizedResponse } from '@/lib/api-utils';
import {
  buildLeadDedupeCandidates,
  buildLeadDedupeKey,
  inferLeadTags,
  mergeUniqueEmails,
  mergeUniqueStrings,
  normalizeOptionalString,
  normalizeWebsiteForStorage,
} from '@/lib/lead-utils';

function normalizeEmail(email: string | null | undefined): string | null {
  if (!email || typeof email !== 'string') return null;
  const trimmed = email.trim().toLowerCase();
  return trimmed || null;
}

function getLeadDelegate(prismaClient: ReturnType<typeof getPrismaClient>) {
  return (prismaClient as typeof prismaClient & { lead?: typeof prismaClient.lead }).lead;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

const LEAD_SELECT = {
  id: true,
  dedupe_key: true,
  emails: true,
  business_tags: true,
  general_business_tag: true,
  status: true,
} as const;

export async function POST(request: NextRequest) {
  try {
    const prismaClient = getPrismaClient();
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    const body = await request.json();
    const name = normalizeOptionalString(body?.name, 255) || '';
    const leadId = typeof body?.leadId === 'string' ? body.leadId.trim() : '';
    const address = normalizeOptionalString(body?.address, 4000) || '';
    const website = normalizeWebsiteForStorage(body?.website, 255);
    const emails = Array.isArray(body?.emails) ? mergeUniqueEmails(body.emails) : [];
    const primaryEmail = normalizeEmail(emails[0]);
    const category = normalizeOptionalString(body?.category, 255) || 'Business';
    const rating = normalizeOptionalString(body?.rating, 50);
    const searchId = typeof body?.searchId === 'string' ? body.searchId.trim() : '';
    const searchQuery = normalizeOptionalString(body?.searchQuery, 255) || '';
    const locationLabel = normalizeOptionalString(body?.locationLabel, 255) || '';
    const source = normalizeOptionalString(body?.source, 100) || 'google_maps';

    if (!name || !primaryEmail) {
      return NextResponse.json(
        { error: 'A lead name and at least one email are required.' },
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

    const dedupeKey = buildLeadDedupeKey({ name, website, address });
    const dedupeCandidates = buildLeadDedupeCandidates({ name, website, address });
    const { businessTags, generalBusinessTag } = inferLeadTags({
      searchQuery,
      category,
    });
    const safeGeneralBusinessTag = normalizeOptionalString(generalBusinessTag, 100);
    const safeSearchId =
      searchId && isUuid(searchId)
        ? (
            await prismaClient.searchQuery.findFirst({
              where: {
                id: searchId,
                org_id: user.org_id,
              },
              select: {
                id: true,
              },
            })
          )?.id || undefined
        : undefined;

    const findLeadByIdentity = async () =>
      leadDelegate.findFirst({
        where: {
          org_id: user.org_id,
          dedupe_key: { in: dedupeCandidates },
        },
        select: LEAD_SELECT,
      });

    const findLeadByCanonicalKey = async () =>
      leadDelegate.findUnique({
        where: {
          lead_org_dedupe_key: {
            org_id: user.org_id,
            dedupe_key: dedupeKey,
          },
        },
        select: LEAD_SELECT,
      });

    let existingLead =
      leadId && isUuid(leadId)
        ? await leadDelegate.findFirst({
            where: {
              id: leadId,
              org_id: user.org_id,
            },
            select: LEAD_SELECT,
          })
        : null;

    if (!existingLead) {
      existingLead = await findLeadByIdentity();
    }

    let savedLeadId: string;

    if (existingLead) {
      const mergedEmails = mergeUniqueEmails(existingLead.emails, emails);
      const mergedTags = mergeUniqueStrings(existingLead.business_tags, businessTags);
      try {
        const updatedLead = await leadDelegate.update({
          where: { id: existingLead.id },
          data: {
            dedupe_key: dedupeKey,
            name,
            search_id: safeSearchId,
            website: website || undefined,
            address: address || undefined,
            emails: { set: mergedEmails },
            status: existingLead.status === 'saved' ? 'saved' : 'stored',
            category,
            source,
            rating: rating || undefined,
            business_query: searchQuery || undefined,
            business_tags: { set: mergedTags },
            general_business_tag:
              existingLead.general_business_tag || safeGeneralBusinessTag,
            location_label: locationLabel || undefined,
          },
          select: {
            id: true,
          },
        });
        savedLeadId = updatedLead.id;
      } catch (error: any) {
        if (error?.code !== 'P2002') {
          throw error;
        }

        const targetLead = (await findLeadByCanonicalKey()) || (await findLeadByIdentity());
        if (!targetLead) {
          throw error;
        }

        const concurrentMergedEmails = mergeUniqueEmails(
          targetLead.emails,
          existingLead.emails,
          emails
        );
        const concurrentMergedTags = mergeUniqueStrings(
          targetLead.business_tags,
          existingLead.business_tags,
          businessTags
        );

        const updatedLead = await leadDelegate.update({
          where: { id: targetLead.id },
          data: {
            name,
            search_id: safeSearchId,
            website: website || undefined,
            address: address || undefined,
            emails: { set: concurrentMergedEmails },
            status:
              targetLead.status === 'saved' || existingLead.status === 'saved'
                ? 'saved'
                : 'stored',
            category,
            source,
            rating: rating || undefined,
            business_query: searchQuery || undefined,
            business_tags: { set: concurrentMergedTags },
            general_business_tag:
              targetLead.general_business_tag ||
              existingLead.general_business_tag ||
              safeGeneralBusinessTag,
            location_label: locationLabel || undefined,
          },
          select: {
            id: true,
          },
        });
        savedLeadId = updatedLead.id;
      }
    } else {
      try {
        const createdLead = await leadDelegate.create({
          data: {
            org_id: user.org_id,
            search_id: safeSearchId,
            dedupe_key: dedupeKey,
            name,
            website,
            address,
            emails,
            status: 'stored',
            category,
            source,
            rating,
            business_query: searchQuery || undefined,
            business_tags: businessTags,
            general_business_tag: safeGeneralBusinessTag,
            location_label: locationLabel || undefined,
          },
          select: {
            id: true,
          },
        });
        savedLeadId = createdLead.id;
      } catch (error: any) {
        if (error?.code !== 'P2002') {
          throw error;
        }

        const targetLead = (await findLeadByCanonicalKey()) || (await findLeadByIdentity());
        if (!targetLead) {
          throw error;
        }

        const concurrentMergedEmails = mergeUniqueEmails(targetLead.emails, emails);
        const concurrentMergedTags = mergeUniqueStrings(
          targetLead.business_tags,
          businessTags
        );

        const updatedLead = await leadDelegate.update({
          where: { id: targetLead.id },
          data: {
            name,
            search_id: safeSearchId,
            website: website || undefined,
            address: address || undefined,
            emails: { set: concurrentMergedEmails },
            status: targetLead.status === 'saved' ? 'saved' : 'stored',
            category,
            source,
            rating: rating || undefined,
            business_query: searchQuery || undefined,
            business_tags: { set: concurrentMergedTags },
            general_business_tag:
              targetLead.general_business_tag || safeGeneralBusinessTag,
            location_label: locationLabel || undefined,
          },
          select: {
            id: true,
          },
        });
        savedLeadId = updatedLead.id;
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        lead_id: savedLeadId,
        status: 'stored',
      },
    });
  } catch (error: any) {
    console.error('Failed to save prospect to database:', {
      code: error?.code,
      message: error?.message,
      meta: error?.meta,
    });
    return NextResponse.json(
      { error: 'Failed to save lead to database' },
      { status: 500 }
    );
  }
}
