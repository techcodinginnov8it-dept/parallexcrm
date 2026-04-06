import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { getCurrentUser, unauthorizedResponse } from '@/lib/api-utils';
import { lookupGoogleMapsContactData } from '@/lib/scrapers/google-maps-scraper';
import { getPrismaClient } from '@/lib/db';
import { mergeUniqueEmails, normalizeOptionalString, normalizeWebsiteForStorage } from '@/lib/lead-utils';

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}/gi;
const EMAIL_VALIDATION_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}$/i;
const IGNORED_EMAIL_PREFIXES = ['noreply@', 'no-reply@', 'example@', 'test@'];
const CONTACT_KEYWORDS = ['contact', 'contact-us', 'about', 'about-us', 'team'];
const MAX_EMAILS = 5;
const MAX_SUBPAGES = 6;
const REQUEST_TIMEOUT_MS = 5000;
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function normalizeHost(hostname: string): string {
  return hostname.replace(/^www\./i, '').toLowerCase();
}

function sameHost(a: string, b: string): boolean {
  try {
    return normalizeHost(new URL(a).hostname) === normalizeHost(new URL(b).hostname);
  } catch {
    return false;
  }
}

function shouldKeepEmail(email: string): boolean {
  const value = email.toLowerCase().trim();
  if (!EMAIL_VALIDATION_REGEX.test(value)) return false;
  if (value.endsWith('.png') || value.endsWith('.jpg')) return false;
  if (IGNORED_EMAIL_PREFIXES.some((prefix) => value.startsWith(prefix))) return false;
  return true;
}

function extractEmailsFromText(text: string): string[] {
  const matches = text.match(EMAIL_REGEX) ?? [];
  return Array.from(new Set(matches.map((email) => email.toLowerCase().trim()).filter(shouldKeepEmail)));
}

function decodeCloudflareEmail(encoded: string): string | null {
  if (!encoded || encoded.length < 4) return null;
  try {
    const key = parseInt(encoded.slice(0, 2), 16);
    let decoded = '';

    for (let i = 2; i < encoded.length; i += 2) {
      const code = parseInt(encoded.slice(i, i + 2), 16) ^ key;
      decoded += String.fromCharCode(code);
    }

    return shouldKeepEmail(decoded) ? decoded.toLowerCase() : null;
  } catch {
    return null;
  }
}

function extractMailtoEmails(html: string): string[] {
  const matches = html.match(/href=["']mailto:([^"']+)["']/gi) ?? [];
  const emails = matches
    .map((match) => match.replace(/href=["']mailto:|["']/gi, ''))
    .map((value) => value.split('?')[0]?.trim().toLowerCase() ?? '')
    .filter(shouldKeepEmail);
  return Array.from(new Set(emails));
}

function extractCloudflareEmails(html: string): string[] {
  const matches = html.match(/data-cfemail=["']([^"']+)["']/gi) ?? [];
  const decoded = matches
    .map((match) => match.replace(/data-cfemail=["']|["']/gi, ''))
    .map((encoded) => decodeCloudflareEmail(encoded))
    .filter((email): email is string => Boolean(email));
  return Array.from(new Set(decoded));
}

function mergeEmailSets(...collections: string[][]): string[] {
  const merged = new Set<string>();
  for (const collection of collections) {
    for (const email of collection) {
      if (shouldKeepEmail(email)) {
        merged.add(email.toLowerCase());
      }
    }
  }
  return Array.from(merged).slice(0, MAX_EMAILS);
}

function extractEmailsFromHtml(html: string): string[] {
  return mergeEmailSets(
    extractEmailsFromText(html),
    extractMailtoEmails(html),
    extractCloudflareEmails(html)
  );
}

function buildCandidatePages(baseUrl: string, homepageHtml: string | null): string[] {
  const candidates = new Set<string>();
  let origin = baseUrl;
  try {
    origin = new URL(baseUrl).origin;
  } catch {
    // Keep original url as fallback.
  }

  const fallbackPaths = ['/contact', '/contact-us', '/about', '/about-us', '/team', '/support'];
  for (const path of fallbackPaths) {
    try {
      candidates.add(new URL(path, origin).toString());
    } catch {
      // Ignore invalid url construction.
    }
  }

  if (!homepageHtml) {
    return Array.from(candidates).slice(0, MAX_SUBPAGES);
  }

  const $ = cheerio.load(homepageHtml);
  $('a[href]').each((_, element) => {
    const href = ($(element).attr('href') || '').trim();
    if (!href) return;

    try {
      const absoluteUrl = new URL(href, origin);
      if (!['http:', 'https:'].includes(absoluteUrl.protocol)) return;

      const absolute = absoluteUrl.toString();
      if (!sameHost(origin, absolute)) return;

      const path = absoluteUrl.pathname.toLowerCase();
      const linkText = ($(element).text() || '').toLowerCase();
      const aria = (($(element).attr('aria-label') || '') as string).toLowerCase();
      const isContactLike = CONTACT_KEYWORDS.some(
        (keyword) => path.includes(keyword) || linkText.includes(keyword) || aria.includes(keyword)
      );

      if (isContactLike) {
        absoluteUrl.hash = '';
        candidates.add(absoluteUrl.toString());
      }
    } catch {
      // Ignore malformed links.
    }
  });

  return Array.from(candidates).slice(0, MAX_SUBPAGES);
}

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const response = await axios.get<string>(url, {
      timeout: REQUEST_TIMEOUT_MS,
      responseType: 'text',
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      maxRedirects: 5,
      validateStatus: (status) => status >= 200 && status < 400,
    });
    return typeof response.data === 'string' ? response.data : null;
  } catch {
    return null;
  }
}

async function scrapeEmailsFromWebsite(websiteUrl: string): Promise<string[]> {
  const normalizedUrl = normalizeWebsiteForStorage(websiteUrl, 4000);
  if (!normalizedUrl) return [];

  const homepageHtml = await fetchHtml(normalizedUrl);
  if (homepageHtml) {
    const homepageEmails = extractEmailsFromHtml(homepageHtml);
    if (homepageEmails.length > 0) return homepageEmails;
  }

  const pagesToTry = buildCandidatePages(normalizedUrl, homepageHtml);
  const visited = new Set<string>();
  let foundEmails: string[] = [];

  for (const pageUrl of pagesToTry) {
    if (visited.has(pageUrl)) continue;
    visited.add(pageUrl);

    const html = await fetchHtml(pageUrl);
    if (!html) continue;

    foundEmails = mergeEmailSets(foundEmails, extractEmailsFromHtml(html));
    if (foundEmails.length > 0) break;
  }

  return foundEmails;
}

export async function POST(request: NextRequest) {
  try {
    const prisma = getPrismaClient();
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    const rawBody = await request.text();
    if (!rawBody.trim()) {
      return NextResponse.json(
        { error: 'Missing enrichment payload' },
        { status: 400 }
      );
    }

    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json(
        { error: 'Invalid enrichment payload' },
        { status: 400 }
      );
    }

    const { url, name, address, leadId } = payload;
    let normalizedUrl = normalizeWebsiteForStorage(url, 4000);
    let resolvedAddress = normalizeOptionalString(address, 4000);
    let resultEmails: string[] = [];

    if (!normalizedUrl) {
      if (!name || typeof name !== 'string') {
        return NextResponse.json(
          { error: 'A business name or valid website URL is required for enrichment' },
          { status: 400 }
        );
      }

      console.log(`Enriching business lead via Google Maps detail lookup: ${name}`);
      const googleMapsData = await lookupGoogleMapsContactData(name, resolvedAddress);
      if (googleMapsData) {
        normalizedUrl = normalizeWebsiteForStorage(googleMapsData.website ?? null, 4000);
        resolvedAddress = normalizeOptionalString(googleMapsData.address, 4000) || resolvedAddress;
        resultEmails = Array.isArray(googleMapsData.emails) ? googleMapsData.emails : [];
      }
    }

    if (normalizedUrl && resultEmails.length === 0) {
      console.log(`Enriching business lead via HTTP fetch: ${name} (${normalizedUrl})`);
      resultEmails = await scrapeEmailsFromWebsite(normalizedUrl);
    }

    if (typeof leadId === 'string' && leadId.trim()) {
      const existingLead = await prisma.lead.findFirst({
        where: {
          id: leadId,
          org_id: user.org_id,
        },
        select: {
          id: true,
          emails: true,
          status: true,
        },
      });

      if (existingLead) {
        const mergedEmails = mergeUniqueEmails(existingLead.emails, resultEmails);
        const shouldDeleteNoEmailLead =
          mergedEmails.length === 0 &&
          existingLead.status !== 'saved' &&
          existingLead.status !== 'stored';

        if (shouldDeleteNoEmailLead) {
          await prisma.lead.delete({
            where: { id: existingLead.id },
          });
        } else {
          const nextStatus =
            existingLead.status === 'saved'
              ? 'saved'
              : existingLead.status === 'stored'
                ? 'stored'
                : mergedEmails.length > 0
                  ? 'enriched'
                  : 'unavailable';

          await prisma.lead.update({
            where: { id: existingLead.id },
            data: {
              website: normalizeWebsiteForStorage(normalizedUrl, 255) || undefined,
              address: resolvedAddress || undefined,
              emails: { set: mergedEmails },
              status: nextStatus,
            },
          });
        }
      }
    }

    console.log(`Enrichment complete for ${name}. Found ${resultEmails.length} emails.`);

    return NextResponse.json({
      success: true,
      emails: resultEmails,
      website: normalizedUrl,
      address: resolvedAddress,
    });

  } catch (error: any) {
    const errorMessage = String(error?.message || error || 'Unknown enrichment error');
    if (
      errorMessage.includes('Unexpected end of JSON input') ||
      errorMessage.includes('aborted')
    ) {
      console.warn('Enrichment request was interrupted before completion.');
      return NextResponse.json(
        { error: 'Enrichment request interrupted' },
        { status: 400 }
      );
    }

    console.error('Enrichment failed:', errorMessage);
    return NextResponse.json({ error: 'Failed to extract emails from website' }, { status: 500 });
  }
}
