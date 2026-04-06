import { NextRequest, NextResponse } from 'next/server';
import type { Lead, Prisma } from '@prisma/client';
import { getCurrentUser, isAdminRole, unauthorizedResponse } from '@/lib/api-utils';
import { getPrismaClient } from '@/lib/db';
import { scrapeGoogleMaps } from '@/lib/scrapers/google-maps-scraper';
import {
  buildLeadDedupeCandidates,
  buildLeadDedupeKey,
  inferLeadTags,
  mergeUniqueEmails,
  mergeUniqueStrings,
  normalizeOptionalString,
  normalizeWebsiteForStorage,
} from '@/lib/lead-utils';

type ProspectLeadRow = Pick<
  Lead,
  | 'id'
  | 'name'
  | 'website'
  | 'address'
  | 'emails'
  | 'category'
  | 'rating'
  | 'business_tags'
  | 'general_business_tag'
>;

type ScrapedLeadRow = {
  name?: string;
  website?: string | null;
  address?: string | null;
  emails?: string[];
  category?: string | null;
  rating?: string | null;
};

type ProspectResultSource = 'saved' | 'fresh' | 'mixed';
type ScrapeCollectionResult = {
  rows: ScrapedLeadRow[];
  usedRelatedVariants: boolean;
};
type RankedScrapedLeadRow = {
  row: ScrapedLeadRow;
  score: number;
  strongMatch: boolean;
  sourceOrder: number;
};

const ADMIN_VARIANT_SUFFIXES = [
  'company',
  'companies',
  'services',
  'solutions',
  'agency',
  'consulting',
  'consultant',
  'provider',
];
const ADMIN_VARIANT_LIMIT = 3;
const ADMIN_EXTRA_RESULT_BUFFER = 12;
const ADMIN_DEEP_FILL_TIME_BUDGET_MS = 65000;
const ADMIN_DEEP_FILL_MIN_REMAINING_MS = 30000;
const SCRAPER_BATCH_LIMIT = 110;
const SEARCH_STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'at',
  'for',
  'from',
  'in',
  'near',
  'of',
  'on',
  'the',
  'to',
  'with',
]);
const GENERIC_BUSINESS_TERMS = new Set([
  'agency',
  'business',
  'businesses',
  'companies',
  'company',
  'consultant',
  'consultants',
  'consulting',
  'firm',
  'group',
  'provider',
  'providers',
  'service',
  'services',
  'solution',
  'solutions',
]);
const TAG_KEYWORD_MAP: Record<string, string[]> = {
  'Business Services': ['business', 'consulting', 'consultant', 'outsourcing', 'bpo'],
  Construction: ['builder', 'construction', 'contractor', 'electrical', 'hvac', 'plumbing', 'roofing'],
  Education: ['academy', 'course', 'education', 'school', 'training', 'tutoring'],
  Finance: ['accounting', 'bookkeeping', 'finance', 'financial', 'insurance', 'mortgage', 'tax'],
  Healthcare: ['clinic', 'dental', 'healthcare', 'hospital', 'medical', 'therapy'],
  Hospitality: ['cafe', 'catering', 'hotel', 'restaurant', 'travel'],
  IT: ['cloud', 'cyber', 'developer', 'development', 'digital', 'it', 'managed', 'software', 'tech', 'technology'],
  Legal: ['attorney', 'law', 'lawyer', 'legal'],
  Logistics: ['courier', 'freight', 'logistics', 'shipping', 'trucking', 'warehouse'],
  Marketing: ['advertising', 'branding', 'marketing', 'media', 'ppc', 'seo'],
  'Real Estate': ['brokerage', 'estate', 'property', 'real', 'realty', 'realtor'],
  Recruitment: ['headhunter', 'hr', 'recruitment', 'staffing', 'talent'],
};

function getLeadDelegate(prismaClient: ReturnType<typeof getPrismaClient>) {
  return (prismaClient as typeof prismaClient & { lead?: typeof prismaClient.lead }).lead;
}

function mapLeadToProspect(lead: ProspectLeadRow) {
  return {
    name: lead.name || 'Unknown Business',
    website: lead.website || null,
    address: lead.address || null,
    emails: Array.isArray(lead.emails) ? lead.emails : [],
    source_id: lead.id,
    source: 'google_maps' as const,
    category: lead.category || 'Business',
    rating: lead.rating || null,
    business_tags: lead.business_tags,
    general_business_tag: lead.general_business_tag,
  };
}

function mapScrapedLeadToProspect(lead: ScrapedLeadRow) {
  return {
    name: lead.name || 'Unknown Business',
    website: lead.website || null,
    address: lead.address || null,
    emails: Array.isArray(lead.emails) ? lead.emails : [],
    source_id: undefined,
    source: 'google_maps' as const,
    category: lead.category || 'Business',
    rating: lead.rating || null,
    business_tags: [] as string[],
    general_business_tag: null as string | null,
  };
}

function mergeLeadRows(primaryRows: ProspectLeadRow[], secondaryRows: ProspectLeadRow[]) {
  const seen = new Set<string>();
  const merged: ProspectLeadRow[] = [];

  for (const row of [...primaryRows, ...secondaryRows]) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    merged.push(row);
  }

  return merged;
}

function buildLeadRowIdentity(lead: ProspectLeadRow): string {
  return [
    normalizeIdentityPart(lead.name),
    normalizeIdentityPart(lead.website),
    normalizeIdentityPart(lead.address),
  ].join('|');
}

function normalizeIdentityPart(value: string | null | undefined): string {
  return (value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function buildScrapedRowIdentity(row: ScrapedLeadRow): string {
  return [
    normalizeIdentityPart(row.name),
    normalizeIdentityPart(row.website),
    normalizeIdentityPart(row.address),
  ].join('|');
}

function dedupeScrapedRows(rows: ScrapedLeadRow[]): ScrapedLeadRow[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = buildScrapedRowIdentity(row);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeSearchText(value: string | null | undefined): string {
  return (value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeSearchTerms(value: string | null | undefined): string[] {
  const normalized = normalizeSearchText(value);
  if (!normalized) return [];

  return normalized
    .split(' ')
    .filter(Boolean)
    .filter((term) => !SEARCH_STOP_WORDS.has(term));
}

function buildTokenSet(value: string | null | undefined): Set<string> {
  return new Set(tokenizeSearchTerms(value));
}

function scoreScrapedLeadRow(
  row: ScrapedLeadRow,
  query: string,
  displayLocation: string
): Omit<RankedScrapedLeadRow, 'row' | 'sourceOrder'> {
  const normalizedQuery = normalizeSearchText(query);
  const normalizedName = normalizeSearchText(row.name);
  const normalizedCategory = normalizeSearchText(row.category);
  const normalizedAddress = normalizeSearchText(row.address);
  const normalizedWebsite = normalizeSearchText(row.website);
  const queryTerms = tokenizeSearchTerms(query);
  const specificTerms = queryTerms.filter((term) => !GENERIC_BUSINESS_TERMS.has(term));
  const genericTerms = queryTerms.filter((term) => GENERIC_BUSINESS_TERMS.has(term));
  const locationTerms = tokenizeSearchTerms(displayLocation);
  const nameTokens = buildTokenSet(row.name);
  const categoryTokens = buildTokenSet(row.category);
  const addressTokens = buildTokenSet(row.address);
  const websiteTokens = buildTokenSet(
    row.website
      ? row.website.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/[./_-]+/g, ' ')
      : ''
  );
  const { generalBusinessTag } = inferLeadTags({
    searchQuery: query,
    category: row.category,
  });
  const tagKeywords = TAG_KEYWORD_MAP[generalBusinessTag] || [];
  const tagKeywordMatches = tagKeywords.filter(
    (keyword) => nameTokens.has(keyword) || categoryTokens.has(keyword)
  ).length;
  const queryPhraseMatch =
    (normalizedQuery && normalizedName.includes(normalizedQuery)) ||
    (normalizedQuery && normalizedCategory.includes(normalizedQuery));

  let score = 0;
  let specificMatchCount = 0;

  if (queryPhraseMatch) {
    score += 18;
  }

  for (const term of specificTerms) {
    if (nameTokens.has(term)) {
      score += 7;
      specificMatchCount++;
      continue;
    }

    if (categoryTokens.has(term)) {
      score += 6;
      specificMatchCount++;
      continue;
    }

    if (websiteTokens.has(term)) {
      score += 3;
      specificMatchCount++;
    }
  }

  for (const term of genericTerms) {
    if (categoryTokens.has(term)) {
      score += 2;
      continue;
    }

    if (nameTokens.has(term)) {
      score += 1;
    }
  }

  for (const term of locationTerms) {
    if (addressTokens.has(term)) {
      score += 2;
      continue;
    }

    if (nameTokens.has(term)) {
      score += 1;
    }
  }

  if (tagKeywordMatches > 0) {
    score += Math.min(tagKeywordMatches, 3) * 3;
  }

  if (row.category) score += 1;
  if (row.address) score += 1;
  if (row.website) score += 1;

  if (!queryPhraseMatch && specificMatchCount === 0 && tagKeywordMatches === 0) {
    score -= 6;
  }

  if (
    normalizedCategory &&
    !normalizedCategory.includes(normalizedQuery) &&
    specificTerms.length > 0 &&
    specificTerms.every((term) => !categoryTokens.has(term) && !nameTokens.has(term))
  ) {
    score -= 2;
  }

  return {
    score,
    strongMatch: queryPhraseMatch || specificMatchCount > 0 || tagKeywordMatches > 0,
  };
}

function rankScrapedLeadRows(
  rows: ScrapedLeadRow[],
  query: string,
  displayLocation: string,
  targetCount: number
): ScrapedLeadRow[] {
  const rankedRows = rows
    .map((row, sourceOrder) => ({
      row,
      sourceOrder,
      ...scoreScrapedLeadRow(row, query, displayLocation),
    }))
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      if (right.strongMatch !== left.strongMatch) return Number(right.strongMatch) - Number(left.strongMatch);
      return left.sourceOrder - right.sourceOrder;
    });

  const strongMatches = rankedRows.filter((row) => row.strongMatch);
  const minimumStrongMatchTarget = Math.min(targetCount, 12);
  const chosenRows =
    strongMatches.length >= minimumStrongMatchTarget ? strongMatches : rankedRows;

  console.log(
    `Google Maps relevance ranking kept ${Math.min(
      chosenRows.length,
      targetCount
    )} prioritized rows (${strongMatches.length} strong matches out of ${rows.length} candidates).`
  );

  return chosenRows.map((entry) => entry.row);
}

function buildAdminQueryVariants(query: string): string[] {
  const normalizedBase = query.trim().replace(/\s+/g, ' ');
  if (!normalizedBase) return [];

  const lowerBase = normalizedBase.toLowerCase();
  const seen = new Set<string>();
  const variants = [normalizedBase];

  for (const suffix of ADMIN_VARIANT_SUFFIXES) {
    if (lowerBase.includes(suffix)) continue;
    variants.push(`${normalizedBase} ${suffix}`);
  }

  return variants.filter((variant) => {
    const key = variant.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, ADMIN_VARIANT_LIMIT);
}

async function collectScrapedLeadRows(params: {
  query: string;
  displayLocation: string;
  offset: number;
  limit: number;
  enableAdminDeepFill: boolean;
}): Promise<ScrapeCollectionResult> {
  const { query, displayLocation, offset, limit, enableAdminDeepFill } = params;
  const targetCount = offset + limit + 1;
  const scrapeTarget = enableAdminDeepFill
    ? Math.min(targetCount + ADMIN_EXTRA_RESULT_BUFFER, SCRAPER_BATCH_LIMIT)
    : Math.min(targetCount, SCRAPER_BATCH_LIMIT);
  const queryVariants = enableAdminDeepFill ? buildAdminQueryVariants(query) : [query];
  const collectionStartedAt = Date.now();

  let aggregatedRows: ScrapedLeadRow[] = [];
  let usedRelatedVariants = false;

  for (let index = 0; index < queryVariants.length; index++) {
    const elapsedBeforeVariantMs = Date.now() - collectionStartedAt;
    const remainingBudgetMs = ADMIN_DEEP_FILL_TIME_BUDGET_MS - elapsedBeforeVariantMs;

    if (
      enableAdminDeepFill &&
      index > 0 &&
      remainingBudgetMs < ADMIN_DEEP_FILL_MIN_REMAINING_MS
    ) {
      console.log(
        `Admin deep fill stopped early for "${query}" in ${displayLocation} to avoid an overlong request (elapsed=${elapsedBeforeVariantMs}ms, rows=${aggregatedRows.length}).`
      );
      break;
    }

    const variantQuery = queryVariants[index];
    const fullQuery = `${variantQuery} in ${displayLocation}`;
    const startedAt = Date.now();
    const scraped = await scrapeGoogleMaps(fullQuery, scrapeTarget, 0, 'fast_first');
    const elapsedMs = Date.now() - startedAt;

    console.log(
      `Google Maps scrape completed in ${elapsedMs}ms for "${fullQuery}" (mode=fast_first, rows=${scraped.length})`
    );

    aggregatedRows = dedupeScrapedRows([...aggregatedRows, ...scraped]);
    if (index > 0) {
      usedRelatedVariants = true;
    }

    if (aggregatedRows.length >= targetCount) {
      break;
    }
  }

  const rankedRows = rankScrapedLeadRows(
    aggregatedRows,
    query,
    displayLocation,
    targetCount
  );

  return {
    rows: rankedRows,
    usedRelatedVariants,
  };
}

function buildLeadCacheWhere(
  orgId: string,
  query: string,
  displayLocation: string,
  source: string
): Prisma.LeadWhereInput {
  const normalizedQuery = normalizeOptionalString(query, 255) || query;
  const normalizedLocation = normalizeOptionalString(displayLocation, 255) || displayLocation;
  const { generalBusinessTag } = inferLeadTags({
    searchQuery: normalizedQuery,
    category: null,
  });

  const businessFilters: Prisma.LeadWhereInput[] = [
    {
      business_query: {
        equals: normalizedQuery,
        mode: 'insensitive',
      },
    },
  ];

  if (generalBusinessTag) {
    businessFilters.push({
      general_business_tag: generalBusinessTag,
    });
  }

  return {
    org_id: orgId,
    source,
    NOT: {
      emails: {
        isEmpty: true,
      },
    },
    location_label: {
      equals: normalizedLocation,
      mode: 'insensitive',
    },
    OR: businessFilters,
  };
}

function resolveLeadStatus(
  existingStatus: string | null | undefined,
  hasEmails: boolean
) {
  if (existingStatus === 'saved') return 'saved';
  if (existingStatus === 'stored') return 'stored';
  return hasEmails ? 'enriched' : 'found';
}

async function resolveSearchId(
  prismaClient: ReturnType<typeof getPrismaClient>,
  orgId: string,
  query: string,
  displayLocation: string,
  source: string,
  searchIdParam: string | null
) {
  if (searchIdParam) {
    return searchIdParam;
  }

  const normalizedLocation = normalizeOptionalString(displayLocation, 255) || displayLocation;

  const existingSearch = await prismaClient.searchQuery.findFirst({
    where: {
      org_id: orgId,
      query: {
        equals: query,
        mode: 'insensitive',
      },
      location: {
        equals: normalizedLocation,
        mode: 'insensitive',
      },
      source,
    },
    orderBy: {
      created_at: 'desc',
    },
    select: {
      id: true,
    },
  });

  if (existingSearch) {
    return existingSearch.id;
  }

  const createdSearch = await prismaClient.searchQuery.create({
    data: {
      org_id: orgId,
      query,
      location: normalizedLocation,
      source,
    },
    select: {
      id: true,
    },
  });

  return createdSearch.id;
}

async function persistScrapedLeads(params: {
  prismaClient: ReturnType<typeof getPrismaClient>;
  user: Awaited<ReturnType<typeof getCurrentUser>>;
  visibleRows: ScrapedLeadRow[];
  query: string;
  displayLocation: string;
  source: string;
  resolvedSearchId: string;
}): Promise<ProspectLeadRow[]> {
  const { prismaClient, user, visibleRows, query, displayLocation, source, resolvedSearchId } = params;

  if (!user) {
    return [];
  }

  const leadDelegate = getLeadDelegate(prismaClient);
  if (!leadDelegate) {
    return [];
  }

  return Promise.all(
    visibleRows.map(async (lead) => {
      const name = normalizeOptionalString(lead.name, 255) || 'Unknown Business';
      const website = normalizeWebsiteForStorage(lead.website, 255);
      const address = normalizeOptionalString(lead.address, 4000);
      const emails = Array.isArray(lead.emails) ? lead.emails : [];
      const category = normalizeOptionalString(lead.category, 255) || 'Business';
      const rating = normalizeOptionalString(lead.rating, 50);
      const normalizedQuery = normalizeOptionalString(query, 255) || query.slice(0, 255);
      const normalizedLocationLabel =
        normalizeOptionalString(displayLocation, 255) || displayLocation.slice(0, 255);
      const normalizedSource = normalizeOptionalString(source, 100) || 'google_maps';
      const dedupeKey = buildLeadDedupeKey({ name, website, address });
      const dedupeCandidates = buildLeadDedupeCandidates({ name, website, address });
      const { businessTags, generalBusinessTag } = inferLeadTags({
        searchQuery: normalizedQuery,
        category,
      });
      const safeGeneralBusinessTag = normalizeOptionalString(generalBusinessTag, 100);
      const normalizedEmails = mergeUniqueEmails(emails);

      const existingLead = await leadDelegate.findFirst({
        where: {
          org_id: user.org_id,
          dedupe_key: { in: dedupeCandidates },
        },
        select: {
          id: true,
          dedupe_key: true,
          emails: true,
          business_tags: true,
          general_business_tag: true,
          status: true,
        },
      });

      const mergedEmails = mergeUniqueEmails(existingLead?.emails, emails);
      const mergedTags = mergeUniqueStrings(existingLead?.business_tags, businessTags);
      const nextStatus = resolveLeadStatus(existingLead?.status, mergedEmails.length > 0);

      if (existingLead) {
        return leadDelegate.update({
          where: { id: existingLead.id },
          data: {
            dedupe_key: dedupeKey,
            name,
            search_id: resolvedSearchId,
            website: website || undefined,
            address: address || undefined,
            emails: { set: mergedEmails },
            status: nextStatus,
            category,
            source: normalizedSource,
            rating: rating || undefined,
            business_query: normalizedQuery,
            business_tags: { set: mergedTags },
            general_business_tag:
              existingLead.general_business_tag || safeGeneralBusinessTag,
            location_label: normalizedLocationLabel,
          },
          select: {
            id: true,
            name: true,
            website: true,
            address: true,
            emails: true,
            category: true,
            rating: true,
            business_tags: true,
            general_business_tag: true,
          },
        });
      }

      try {
        return await leadDelegate.create({
          data: {
            org_id: user.org_id,
            search_id: resolvedSearchId,
            dedupe_key: dedupeKey,
            name,
            website,
            address,
            emails: normalizedEmails,
            status: normalizedEmails.length > 0 ? 'enriched' : 'found',
            category,
            source: normalizedSource,
            rating,
            business_query: normalizedQuery,
            business_tags: businessTags,
            general_business_tag: safeGeneralBusinessTag,
            location_label: normalizedLocationLabel,
          },
          select: {
            id: true,
            name: true,
            website: true,
            address: true,
            emails: true,
            category: true,
            rating: true,
            business_tags: true,
            general_business_tag: true,
          },
        });
      } catch (error: any) {
        if (error?.code !== 'P2002') {
          throw error;
        }

        const concurrentLead = await leadDelegate.findUnique({
          where: {
            lead_org_dedupe_key: {
              org_id: user.org_id,
              dedupe_key: dedupeKey,
            },
          },
          select: {
            id: true,
            emails: true,
            business_tags: true,
            general_business_tag: true,
            status: true,
          },
        });

        if (!concurrentLead) {
          throw error;
        }

        const concurrentMergedEmails = mergeUniqueEmails(
          concurrentLead.emails,
          normalizedEmails
        );
        const concurrentMergedTags = mergeUniqueStrings(
          concurrentLead.business_tags,
          businessTags
        );

        return leadDelegate.update({
          where: { id: concurrentLead.id },
          data: {
            name,
            search_id: resolvedSearchId,
            website: website || undefined,
            address: address || undefined,
            emails: { set: concurrentMergedEmails },
            status: resolveLeadStatus(
              concurrentLead.status,
              concurrentMergedEmails.length > 0
            ),
            category,
            source: normalizedSource,
            rating: rating || undefined,
            business_query: normalizedQuery,
            business_tags: { set: concurrentMergedTags },
            general_business_tag:
              concurrentLead.general_business_tag || safeGeneralBusinessTag,
            location_label: normalizedLocationLabel,
          },
          select: {
            id: true,
            name: true,
            website: true,
            address: true,
            emails: true,
            category: true,
            rating: true,
            business_tags: true,
            general_business_tag: true,
          },
        });
      }
    })
  );
}

/**
 * Searches for businesses via Google Maps scraping only.
 */
export async function GET(request: NextRequest) {
  try {
    const prismaClient = getPrismaClient();
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('query') || '';
    const location = searchParams.get('location') || '';
    const city = searchParams.get('city') || '';
    const country = searchParams.get('country') || '';
    const searchIdParam = searchParams.get('searchId');
    const pageRaw = parseInt(searchParams.get('page') || '1', 10);
    const maxLimit = isAdminRole(user.role) ? 100 : 20;
    const limitRaw = parseInt(searchParams.get('limit') || String(maxLimit), 10);
    const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
    const limit = Number.isFinite(limitRaw)
      ? Math.min(Math.max(limitRaw, 1), maxLimit)
      : maxLimit;
    const offset = (page - 1) * limit;
    const source = 'google_maps';
    const enableAdminDeepFill = isAdminRole(user.role) && page === 1;

    if (!query || (!location && !city && !country)) {
      return NextResponse.json({ error: 'Query and at least one location filter are required' }, { status: 400 });
    }

    const displayLocation = city ? `${city}${country ? `, ${country}` : ''}` : location;
    const leadDelegate = getLeadDelegate(prismaClient);
    const canUseLeadCache = Boolean(leadDelegate);
    const resolvedSearchId = await resolveSearchId(
      prismaClient,
      user.org_id,
      query,
      displayLocation,
      source,
      searchIdParam
    );
    const leadCacheWhere = buildLeadCacheWhere(
      user.org_id,
      query,
      displayLocation,
      source
    );
    const cachedTotal = canUseLeadCache
      ? await leadDelegate!.count({
          where: leadCacheWhere,
        })
      : 0;
    const cachedRows =
      canUseLeadCache && cachedTotal > offset
        ? await leadDelegate!.findMany({
            where: leadCacheWhere,
            orderBy: {
              created_at: 'desc',
            },
            skip: offset,
            take: limit,
            select: {
              id: true,
              name: true,
              website: true,
              address: true,
              emails: true,
              category: true,
              rating: true,
              business_tags: true,
              general_business_tag: true,
            },
          })
        : [];

    if (cachedRows.length === limit) {
      console.log(
        `Prospect cache hit for "${query}" in ${displayLocation}. Returning ${cachedRows.length} saved leads.`
      );
      console.log(
        `Lead table already contains ${cachedRows.length} leads for this page in ${displayLocation}.`
      );
      const prospects = cachedRows.map(mapLeadToProspect);
      return NextResponse.json({
        data: prospects,
        searchId: resolvedSearchId,
        count: prospects.length,
        source,
        resultSource: 'saved' satisfies ProspectResultSource,
        page,
        limit,
        hasMore: cachedTotal > offset + limit,
      });
    }

    if (cachedRows.length > 0) {
      console.log(
        `Prospect cache partial hit for "${query}" in ${displayLocation}. Reusing ${cachedRows.length} saved leads and scraping more.`
      );
    } else if (!canUseLeadCache) {
      console.warn(
        'Lead cache unavailable in current runtime. Falling back to fresh scraping without DB lead reuse.'
      );
    } else {
      console.log(`Prospect cache miss for "${query}" in ${displayLocation}. Scraping fresh leads.`);
    }

    console.log(`Searching Google Maps for: ${query} in ${displayLocation}`);
    const scrapedCollection = await collectScrapedLeadRows({
      query,
      displayLocation,
      offset,
      limit,
      enableAdminDeepFill,
    });
    const scrapedVisibleRows = scrapedCollection.rows.slice(offset, offset + limit);
    const prospects = canUseLeadCache
      ? (() => {
          const cachedProspects = cachedRows.map(mapLeadToProspect);
          const seenIdentities = new Set(cachedRows.map(buildLeadRowIdentity));
          const freshProspects = scrapedVisibleRows
            .filter((row) => {
              const identity = buildScrapedRowIdentity(row);
              if (!identity || seenIdentities.has(identity)) return false;
              seenIdentities.add(identity);
              return true;
            })
            .map(mapScrapedLeadToProspect);

          return [...cachedProspects, ...freshProspects].slice(0, limit);
        })()
      : scrapedVisibleRows.map(mapScrapedLeadToProspect);

    const resultSource: ProspectResultSource =
      cachedRows.length > 0
        ? 'mixed'
        : 'fresh';

    console.log(
      `Deferred lead persistence until email enrichment completes for "${query}" in ${displayLocation}.`
    );
    if (scrapedCollection.usedRelatedVariants) {
      console.log(
        `Admin deep fill used related Google Maps query variants for "${query}" in ${displayLocation}.`
      );
    }

    return NextResponse.json({
      data: prospects,
      searchId: resolvedSearchId,
      count: prospects.length,
      source,
      resultSource,
      page,
      limit,
      hasMore:
        cachedTotal > offset + cachedRows.length ||
        scrapedCollection.rows.length > offset + limit,
    });

  } catch (error: any) {
    console.error('Prospect search failed:', error.message);
    let message = 'Failed to search for prospects from Google Maps';
    const errorText = (error?.message || '').toLowerCase();

    if (errorText.includes('navigation timed out')) {
      message = 'Google Maps took too long to load. Please retry in a few seconds.';
    }
    if (errorText.includes('blocked automated access')) {
      message = 'Google Maps temporarily blocked scraping access. Please retry later.';
    }

    if (error.code === 'ECONNABORTED') message = 'The search request timed out. These free servers are currently busy, please try again.';
    
    if (error.response?.status) {
      console.error('Response data:', error.response.data);
      if (error.response.status === 429) message = 'Google Maps source returned a temporary limit. Please wait and try again.';
      if (error.response.status === 504) message = 'Google Maps scraping timed out. Please retry.';
    }

    return NextResponse.json({ 
      error: message,
      details: error.message 
    }, { status: 500 });
  }
}
