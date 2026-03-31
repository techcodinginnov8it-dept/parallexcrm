import { chromium, Browser, BrowserContext, Page, Locator } from 'playwright-chromium';
import pLimit from 'p-limit';
import axios from 'axios';

export interface GoogleMapResult {
  name: string;
  website: string | null;
  address: string | null;
  emails: string[];
  rating?: string | null;
  reviews?: string | null;
  category?: string | null;
}

export type GoogleMapsScrapeMode = 'fast_first' | 'full';

interface FastFirstCardData {
  name: string;
  website: string | null;
  fullText: string;
}

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}/gi;
const EMAIL_VALIDATION_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}$/i;
const MAX_EMAILS_PER_BUSINESS = 5;
const ENRICHMENT_CONCURRENCY = 15;
const TIMEOUT = 5000;
const MAX_LIMIT = 60;
const IGNORED_EMAIL_PREFIXES = ['noreply@', 'no-reply@', 'example@', 'test@'];
const GOOGLE_OWNED_DOMAINS = [
  'google.com',
  'gstatic.com',
  'googleusercontent.com',
  'googleadservices.com',
];

const MAPS_WEBSITE_SELECTORS = [
  'a[data-item-id="authority"]',
  'a[aria-label*="Website"]',
  'a[aria-label*="website"]',
  'a[data-tooltip*="Website"]',
  'a[data-tooltip*="website"]',
];
const MAPS_CARD_SELECTOR =
  'div[role="feed"] > div:has(a.hfpxzc), div.Nv2PK:has(a.hfpxzc), div[role="article"]:has(a.hfpxzc)';

const MAPS_NAVIGATION_ATTEMPTS = [
  { waitUntil: 'commit' as const, timeout: 12000 },
  { waitUntil: 'domcontentloaded' as const, timeout: 15000 },
];
const MAPS_DETAIL_NAVIGATION_ATTEMPTS = [
  { waitUntil: 'commit' as const, timeout: 3000 },
  { waitUntil: 'domcontentloaded' as const, timeout: 5000 },
];
const MAX_DETAIL_LOOKUPS = 2;
const GENERIC_SINGLE_RESULT_NAMES = new Set([
  'results',
  'search results',
  'google maps',
  'directions',
]);

const limit = pLimit(ENRICHMENT_CONCURRENCY);

function normalizeHost(hostname: string): string {
  return hostname.replace(/^www\./i, '').toLowerCase();
}

function isGoogleOwnedHost(hostname: string): boolean {
  const normalized = normalizeHost(hostname);
  return GOOGLE_OWNED_DOMAINS.some(
    (domain) => normalized === domain || normalized.endsWith(`.${domain}`)
  );
}

function normalizeWebsiteUrl(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const tryParse = (value: string): string | null => {
    try {
      const parsed = new URL(value);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return null;
      }
      return parsed.toString();
    } catch {
      return null;
    }
  };

  return tryParse(trimmed) ?? tryParse(`https://${trimmed}`);
}

function normalizeMapsUrl(raw: string | null): string | null {
  if (!raw) return null;
  try {
    return new URL(raw, 'https://www.google.com').toString();
  } catch {
    return null;
  }
}

function normalizeIdentityPart(value: string | null | undefined): string {
  return (value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function buildResultIdentity(result: Pick<GoogleMapResult, 'name' | 'website' | 'address'>): string {
  return [
    normalizeIdentityPart(result.name),
    normalizeIdentityPart(result.website),
    normalizeIdentityPart(result.address),
  ].join('|');
}

function buildBusinessLookupQuery(name: string, address?: string | null): string {
  return [name.trim(), (address || '').trim()].filter(Boolean).join(' ');
}

function scoreLookupCandidate(
  candidate: Pick<GoogleMapResult, 'name' | 'website' | 'address' | 'emails'>,
  targetName: string,
  targetAddress?: string | null
): number {
  const normalizedTargetName = normalizeIdentityPart(targetName);
  const normalizedCandidateName = normalizeIdentityPart(candidate.name);
  const normalizedTargetAddress = normalizeIdentityPart(targetAddress);
  const normalizedCandidateAddress = normalizeIdentityPart(candidate.address);

  let score = 0;

  if (normalizedCandidateName === normalizedTargetName) {
    score += 12;
  } else if (
    normalizedCandidateName.includes(normalizedTargetName) ||
    normalizedTargetName.includes(normalizedCandidateName)
  ) {
    score += 8;
  }

  const targetNameTokens = normalizedTargetName.split(' ').filter(Boolean);
  const overlappingNameTokens = targetNameTokens.filter((token) =>
    normalizedCandidateName.includes(token)
  );
  score += overlappingNameTokens.length;

  if (normalizedTargetAddress && normalizedCandidateAddress) {
    if (normalizedCandidateAddress === normalizedTargetAddress) {
      score += 6;
    } else if (
      normalizedCandidateAddress.includes(normalizedTargetAddress) ||
      normalizedTargetAddress.includes(normalizedCandidateAddress)
    ) {
      score += 4;
    }
  }

  if (candidate.website) score += 2;
  if (candidate.emails.length > 0) score += 3;

  return score;
}

function dedupeGoogleMapResults(results: GoogleMapResult[]): GoogleMapResult[] {
  const seen = new Set<string>();
  return results.filter((result) => {
    const key = buildResultIdentity(result);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildGoogleMapsSearchUrls(query: string): string[] {
  const encodedQuery = encodeURIComponent(query);
  return [
    `https://www.google.com/maps/search/?api=1&query=${encodedQuery}&hl=en`,
    `https://www.google.com/maps/search/${encodedQuery}?hl=en`,
  ];
}

function shouldKeepEmail(email: string): boolean {
  const lower = email.toLowerCase().trim();
  if (!EMAIL_VALIDATION_REGEX.test(lower)) return false;
  if (lower.endsWith('.png') || lower.endsWith('.jpg')) return false;
  if (IGNORED_EMAIL_PREFIXES.some((prefix) => lower.startsWith(prefix))) return false;
  return true;
}

function extractEmails(text: string): string[] {
  const matches = text.match(EMAIL_REGEX) ?? [];
  return Array.from(
    new Set(
      matches
        .map((email) => email.toLowerCase().trim())
        .filter(shouldKeepEmail)
    )
  );
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

function mergeEmailSets(...emailCollections: string[][]): string[] {
  const merged = new Set<string>();
  for (const collection of emailCollections) {
    for (const email of collection) {
      if (shouldKeepEmail(email)) {
        merged.add(email.toLowerCase());
      }
    }
  }
  return Array.from(merged).slice(0, MAX_EMAILS_PER_BUSINESS);
}

async function extractMailtoEmails(page: Page): Promise<string[]> {
  const rawMailto = await page.$$eval('a[href^="mailto:"]', (anchors) =>
    anchors
      .map((anchor) => anchor.getAttribute('href') || '')
      .filter(Boolean)
      .map((href) => href.replace(/^mailto:/i, '').split('?')[0].trim())
  );
  return Array.from(new Set(rawMailto.filter(shouldKeepEmail).map((email) => email.toLowerCase())));
}

async function extractCloudflareEmails(page: Page): Promise<string[]> {
  const encodedEmails = await page.$$eval('[data-cfemail]', (nodes) =>
    nodes
      .map((node) => node.getAttribute('data-cfemail') || '')
      .filter(Boolean)
  );
  return Array.from(
    new Set(
      encodedEmails
        .map((encoded) => decodeCloudflareEmail(encoded))
        .filter((email): email is string => Boolean(email))
    )
  );
}

async function extractWebsiteFromMapsCard(card: Locator): Promise<string | null> {
  for (const selector of MAPS_WEBSITE_SELECTORS) {
    const href = await card.locator(selector).first().getAttribute('href').catch(() => null);
    const normalized = normalizeWebsiteUrl(href);
    if (!normalized) continue;

    try {
      const host = new URL(normalized).hostname;
      if (!isGoogleOwnedHost(host)) return normalized;
    } catch {
      continue;
    }
  }

  return null;
}

function parseMapsCardText(fullText: string): { address: string | null; category: string | null } {
  const lines = fullText.split('\n').filter((line) => line.trim().length > 0);
  const detailSeparatorRegex = /[\u00B7\u2022]|\u00C2\u00B7/;
  const detailLine = lines.find((line) => detailSeparatorRegex.test(line));

  if (detailLine) {
    const parts = detailLine.split(detailSeparatorRegex).map((part) => part.trim());
    return {
      category: parts[0] || null,
      address: parts[1] || null,
    };
  }

  return {
    category: null,
    address: lines.length > 2 ? lines[2] : null,
  };
}

async function extractFastFirstCardData(page: Page): Promise<FastFirstCardData[]> {
  const extracted = await page.$$eval(
    MAPS_CARD_SELECTOR,
    (elements, payload) => {
      const normalizeHost = (hostname: string) => hostname.replace(/^www\./i, '').toLowerCase();
      const isGoogleOwned = (url: string) => {
        try {
          const host = normalizeHost(new URL(url).hostname);
          return payload.googleOwnedDomains.some(
            (domain) => host === domain || host.endsWith(`.${domain}`)
          );
        } catch {
          return true;
        }
      };

      const normalizeWebsite = (raw: string | null) => {
        if (!raw) return null;
        const trimmed = raw.trim();
        if (!trimmed) return null;

        const tryParse = (value: string) => {
          try {
            const parsed = new URL(value);
            if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
            return parsed.toString();
          } catch {
            return null;
          }
        };

        return tryParse(trimmed) ?? tryParse(`https://${trimmed}`);
      };

      return elements.map((element) => {
        const card = element as HTMLElement;
        const businessLink = card.querySelector('a.hfpxzc');
        const name =
          businessLink?.getAttribute('aria-label')?.trim() ||
          businessLink?.textContent?.trim() ||
          '';

        let website: string | null = null;
        for (const selector of payload.websiteSelectors) {
          const href = card.querySelector(selector)?.getAttribute('href') || null;
          const normalized = normalizeWebsite(href);
          if (normalized && !isGoogleOwned(normalized)) {
            website = normalized;
            break;
          }
        }

        return {
          name,
          website,
          fullText: card.innerText || card.textContent || '',
        };
      });
    },
    {
      websiteSelectors: MAPS_WEBSITE_SELECTORS,
      googleOwnedDomains: GOOGLE_OWNED_DOMAINS,
    }
  );

  const seen = new Set<string>();
  return extracted.filter((card) => {
    const key = [
      normalizeIdentityPart(card.name),
      normalizeIdentityPart(card.website),
      normalizeIdentityPart(card.fullText),
    ].join('|');
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function extractWebsiteFromMapsPlacePage(page: Page): Promise<string | null> {
  for (const selector of MAPS_WEBSITE_SELECTORS) {
    const href = await page.locator(selector).first().getAttribute('href').catch(() => null);
    const normalized = normalizeWebsiteUrl(href);
    if (!normalized) continue;

    try {
      const host = new URL(normalized).hostname;
      if (!isGoogleOwnedHost(host)) return normalized;
    } catch {
      continue;
    }
  }

  const fallbackLinks = await page.$$eval('a[href^="http"]', (anchors) =>
    anchors
      .map((anchor) => ({
        href: anchor.getAttribute('href') || '',
        text: (anchor.textContent || '').toLowerCase(),
        aria: (anchor.getAttribute('aria-label') || '').toLowerCase(),
        tooltip: (anchor.getAttribute('data-tooltip') || '').toLowerCase(),
      }))
      .filter((item) => Boolean(item.href))
  );

  for (const link of fallbackLinks) {
    const label = `${link.text} ${link.aria} ${link.tooltip}`.trim();
    const looksLikeWebsiteLink =
      label.includes('website') || label.includes('official site') || label.includes('visit site');
    if (!looksLikeWebsiteLink) continue;

    const normalized = normalizeWebsiteUrl(link.href);
    if (!normalized) continue;

    try {
      const host = new URL(normalized).hostname;
      if (!isGoogleOwnedHost(host)) return normalized;
    } catch {
      continue;
    }
  }

  return null;
}

function isLikelyBusinessName(name: string): boolean {
  const normalized = name.toLowerCase().trim();
  if (!normalized) return false;
  if (normalized.length < 3) return false;
  if (GENERIC_SINGLE_RESULT_NAMES.has(normalized)) return false;
  if (normalized.startsWith('results for')) return false;
  return true;
}

async function extractAddressFromMapsPlacePage(page: Page): Promise<string | null> {
  const byDataItem = await page
    .locator('button[data-item-id="address"]')
    .first()
    .innerText()
    .catch(() => null);

  if (byDataItem?.trim()) return byDataItem.trim();

  const byAria = await page
    .locator('button[aria-label*="Address"], button[aria-label*="address"]')
    .first()
    .innerText()
    .catch(() => null);

  if (byAria?.trim()) return byAria.trim();

  return null;
}

async function scrapeMapsPlaceDetails(detailPage: Page, mapsUrl: string): Promise<Partial<GoogleMapResult>> {
  try {
    await navigateToGoogleMaps(detailPage, mapsUrl, MAPS_DETAIL_NAVIGATION_ATTEMPTS);
  } catch {
    return {};
  }

  const currentUrl = detailPage.url();
  if (currentUrl.includes('consent.google.com') || currentUrl.includes('/sorry/')) {
    return {};
  }

  const [name, website, address, html, bodyText, mailtoEmails, protectedEmails] = await Promise.all([
    detailPage.locator('h1').first().innerText().catch(() => ''),
    extractWebsiteFromMapsPlacePage(detailPage),
    extractAddressFromMapsPlacePage(detailPage),
    detailPage.content().catch(() => ''),
    detailPage.locator('body').innerText().catch(() => ''),
    extractMailtoEmails(detailPage),
    extractCloudflareEmails(detailPage),
  ]);

  const emails = mergeEmailSets(
    extractEmails(html),
    extractEmails(bodyText),
    mailtoEmails,
    protectedEmails
  );

  return {
    name: name?.trim() || undefined,
    website: website || null,
    address: address || null,
    emails,
  };
}

async function fetchHTML(url: string): Promise<string | null> {
  try {
    const res = await axios.get(url, {
      timeout: TIMEOUT,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });
    return typeof res.data === 'string' ? res.data : null;
  } catch {
    return null;
  }
}

async function scrapeEmailsFromWebsite(websiteUrl: string): Promise<string[]> {
  const emails = new Set<string>();

  let origin = websiteUrl;
  try {
    const base = new URL(websiteUrl);
    origin = base.origin;
  } catch {}

  const pages = [
    websiteUrl,
    `${origin}/contact`,
    `${origin}/contact-us`,
    `${origin}/about`,
    `${origin}/about-us`
  ];

  for (const url of pages) {
    const html = await fetchHTML(url);
    if (!html) continue;

    const newEmails = extractEmails(html);
    
    const cfMatches = html.match(/data-cfemail="([^"]+)"/gi);
    if (cfMatches) {
       for (const match of cfMatches) {
         const encoded = match.replace(/data-cfemail="|"/gi, '');
         const decoded = decodeCloudflareEmail(encoded);
         if (decoded) newEmails.push(decoded);
       }
    }

    const mailtoMatches = html.match(/href="mailto:([^"]+)"/gi);
    if (mailtoMatches) {
       for (const match of mailtoMatches) {
         const raw = match.replace(/href="mailto:|"/gi, '').split('?')[0].trim();
         if (shouldKeepEmail(raw)) newEmails.push(raw.toLowerCase());
       }
    }

    mergeEmailSets(newEmails).forEach(e => emails.add(e));

    if (emails.size > 0) break; // ⚡ early exit logic
  }

  return Array.from(emails).slice(0, MAX_EMAILS_PER_BUSINESS);
}

async function enrichResultsWithEmails(results: GoogleMapResult[]): Promise<GoogleMapResult[]> {
  const enriched: GoogleMapResult[] = [];

  await Promise.all(
    results.map((result) =>
      limit(async () => {
        if (result.emails.length > 0 || !result.website) {
          enriched.push(result);
          return;
        }

        try {
          const foundEmails = await scrapeEmailsFromWebsite(result.website);
          enriched.push({ ...result, emails: foundEmails });
        } catch {
          enriched.push(result);
        }
      })
    )
  );

  return enriched;
}

async function navigateToGoogleMaps(
  page: Page,
  url: string,
  attempts: ReadonlyArray<{ waitUntil: 'commit' | 'domcontentloaded' | 'load'; timeout: number }> = MAPS_NAVIGATION_ATTEMPTS
): Promise<void> {
  let lastError: unknown;

  for (let i = 0; i < attempts.length; i++) {
    const attempt = attempts[i];
    try {
      console.log(
        `Google Maps navigation attempt ${i + 1}/${attempts.length} (${attempt.waitUntil}, ${attempt.timeout}ms)`
      );
      await page.goto(url, { waitUntil: attempt.waitUntil, timeout: attempt.timeout });
      await page.waitForTimeout(700);
      console.log(`Google Maps navigation succeeded on attempt ${i + 1}/${attempts.length}`);
      return;
    } catch (error) {
      lastError = error;
      console.warn(
        `Google Maps navigation attempt ${i + 1}/${attempts.length} failed: ${
          (error as any)?.message || error
        }`
      );
      await page.waitForTimeout(1200);
    }
  }

  const details = (lastError as any)?.message || 'unknown navigation error';
  throw new Error(`Google Maps navigation timed out after retries: ${details}`);
}

export async function lookupGoogleMapsContactData(
  name: string,
  address?: string | null
): Promise<Partial<GoogleMapResult> | null> {
  const normalizedName = name.trim();
  if (!normalizedName) return null;

  const lookupQuery = buildBusinessLookupQuery(normalizedName, address);
  const candidates = await scrapeGoogleMaps(lookupQuery, 5, 0, 'full');
  if (candidates.length === 0) return null;

  const rankedCandidates = candidates
    .map((candidate) => ({
      candidate,
      score: scoreLookupCandidate(candidate, normalizedName, address),
    }))
    .sort((left, right) => right.score - left.score);

  const bestMatch = rankedCandidates[0]?.candidate;
  if (!bestMatch) return null;

  return {
    name: bestMatch.name || normalizedName,
    website: bestMatch.website || null,
    address: bestMatch.address || address || null,
    emails: Array.isArray(bestMatch.emails) ? bestMatch.emails : [],
    category: bestMatch.category || null,
    rating: bestMatch.rating || null,
    reviews: bestMatch.reviews || null,
  };
}

export async function scrapeGoogleMaps(
  query: string,
  maxResults: number = 20,
  offset: number = 0,
  mode: GoogleMapsScrapeMode = 'fast_first'
): Promise<GoogleMapResult[]> {
  let browser: Browser | null = null;
  let detailPage: Page | null = null;
  try {
    const safeLimit = Math.min(Math.max(maxResults, 1), MAX_LIMIT);
    const startAt = Math.max(offset, 0);
    const targetCount = startAt + safeLimit;

    browser = await chromium.launch({
      headless: true,
      args: ['--disable-setuid-sandbox', '--no-sandbox']
    });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    const page: Page = await context.newPage();
    if (mode === 'full') {
      detailPage = await context.newPage();
    }

    // Block heavy resources for faster Maps Scraping
    const routeHandler = (route: any) => {
      const type = route.request().resourceType();
      if (['image', 'stylesheet', 'font', 'media'].includes(type)) {
        route.abort();
      } else {
        route.continue();
      }
    };
    
    await page.route('**/*', routeHandler);
    if (detailPage) {
      await detailPage.route('**/*', routeHandler);
    }

    const candidateUrls = buildGoogleMapsSearchUrls(query);
    let navigated = false;
    let lastNavigationError: unknown = null;

    for (const url of candidateUrls) {
      try {
        console.log(`Navigating to Google Maps: ${url}`);
        await navigateToGoogleMaps(page, url);
        navigated = true;
        break;
      } catch (error) {
        lastNavigationError = error;
        console.warn(`Google Maps primary URL failed, trying next fallback...`);
      }
    }

    if (!navigated) {
      throw (lastNavigationError as Error) || new Error('Google Maps navigation failed.');
    }

    const currentUrl = page.url();
    if (currentUrl.includes('consent.google.com') || currentUrl.includes('/sorry/')) {
      throw new Error('Google Maps blocked automated access (consent/challenge page).');
    }

    let hasListResults = false;
    for (let attempt = 0; attempt < 20; attempt++) {
      const [feedCount, cardCount] = await Promise.all([
        page.locator('div[role="feed"]').count(),
        page.locator('a.hfpxzc').count(),
      ]);

      if (attempt === 0 || attempt === 4 || attempt === 9 || attempt === 14 || attempt === 19) {
        console.log(
          `Polling Google Maps results ${attempt + 1}/20 (feed=${feedCount}, cards=${cardCount})`
        );
      }

      if (feedCount > 0 || cardCount > 0) {
        hasListResults = true;
        console.log(`Detected Google Maps results list (feed=${feedCount}, cards=${cardCount})`);
        break;
      }

      await page.waitForTimeout(500);
    }

    if (!hasListResults) {
      console.log('Results feed not found, checking for single result layout...');
      const fallbackUrl = page.url();
      const isPlacePage = fallbackUrl.includes('/place/');
      const title = await page.title();
      if (title.includes('Google Maps') && isPlacePage) {
        const name = await page.locator('h1').first().innerText().catch(() => '');
        const website = await extractWebsiteFromMapsPlacePage(page);
        const address = await extractAddressFromMapsPlacePage(page);
        const emails =
          mode === 'full'
            ? mergeEmailSets(
                extractEmails(await page.content().catch(() => '')),
                extractEmails(await page.locator('body').innerText().catch(() => '')),
                await extractMailtoEmails(page),
                await extractCloudflareEmails(page)
              )
            : [];

        const cleanName = name.trim();
        const hasUsefulContactData = Boolean(website || address || (mode === 'full' && emails.length > 0));

        if (cleanName && startAt === 0 && isLikelyBusinessName(cleanName) && hasUsefulContactData) {
          return [{ name, website, address, emails }];
        }
      }
      return [];
    }

    const cards = page.locator(MAPS_CARD_SELECTOR);
    let prevCount = 0;
    let retries = 0;

    while (prevCount < targetCount && retries < 4) {
      const currentCards = await cards.count();
      if (currentCards >= targetCount || currentCards === prevCount) {
        retries++;
      } else {
        retries = 0;
      }
      prevCount = currentCards;

      const feedHandle = await page.locator('div[role="feed"]').first().elementHandle().catch(() => null);
      if (feedHandle) {
        await page.evaluate((el) => {
          if (el) el.scrollBy(0, 2000);
        }, feedHandle);
      } else {
        await page.mouse.wheel(0, 2400).catch(() => undefined);
      }

      await page.waitForTimeout(900);
    }

    const count = await cards.count();
    const endAt = Math.min(count, startAt + safeLimit);

    console.log(
      `Preparing fast-first result slice (cards=${count}, start=${startAt}, end=${endAt}, limit=${safeLimit})`
    );

    if (mode === 'fast_first') {
      let extractedCards = await extractFastFirstCardData(page);
      let lastUniqueCount = extractedCards.length;
      let uniqueRetries = 0;

      while (extractedCards.length < startAt + safeLimit && uniqueRetries < 4) {
        const feedHandle = await page.locator('div[role="feed"]').first().elementHandle().catch(() => null);
        if (feedHandle) {
          await page.evaluate((el) => {
            if (el) el.scrollBy(0, 2000);
          }, feedHandle);
        } else {
          await page.mouse.wheel(0, 2400).catch(() => undefined);
        }

        await page.waitForTimeout(900);
        extractedCards = await extractFastFirstCardData(page);
        if (extractedCards.length <= lastUniqueCount) {
          uniqueRetries++;
        } else {
          uniqueRetries = 0;
        }
        lastUniqueCount = extractedCards.length;
      }

      console.log(`Fast-first card extraction completed (uniqueCards=${extractedCards.length})`);

      const fastFirstResults = extractedCards
        .slice(startAt, startAt + safeLimit)
        .map((card) => {
          const parsed = parseMapsCardText(card.fullText);
          return {
            name: card.name || 'Unknown Business',
            website: card.website || null,
            address: parsed.address || null,
            emails: [],
            category: parsed.category || null,
          } satisfies GoogleMapResult;
        })
        .filter((result) => isLikelyBusinessName(result.name));

      const dedupedFastFirstResults = dedupeGoogleMapResults(fastFirstResults);
      console.log(`Returning fast-first rows=${dedupedFastFirstResults.length}`);
      return dedupedFastFirstResults;
    }
    const results: GoogleMapResult[] = [];
    let detailLookups = 0;

    for (let i = startAt; i < endAt; i++) {
      const card = cards.nth(i);

      let name = await card.locator('a.hfpxzc').getAttribute('aria-label').catch(() => '');
      if (!name) continue;

      const placeHref = await card.locator('a.hfpxzc').first().getAttribute('href').catch(() => null);
      const mapsPlaceUrl = normalizeMapsUrl(placeHref);
      let website = await extractWebsiteFromMapsCard(card);

      const fullText = await card.innerText().catch(() => '');
      let emails: string[] = extractEmails(fullText).slice(0, MAX_EMAILS_PER_BUSINESS);
      const parsedCard = parseMapsCardText(fullText);
      let address: string | null = parsedCard.address;
      let category: string | null = parsedCard.category;

      // Some map cards do not expose website/email directly, so fetch place details as fallback.
      if (
        mode === 'full' &&
        detailPage &&
        mapsPlaceUrl &&
        detailLookups < MAX_DETAIL_LOOKUPS &&
        !website
      ) {
        detailLookups++;
        const detail = await scrapeMapsPlaceDetails(detailPage, mapsPlaceUrl);
        if (!website && detail.website) website = detail.website;
        if (!address && detail.address) address = detail.address;
        if ((!name || !name.trim()) && detail.name) name = detail.name;
        if (Array.isArray(detail.emails) && detail.emails.length > 0) {
          emails = mergeEmailSets(emails, detail.emails);
        }
      }

      results.push({
        name,
        website: website || null,
        address: address || null,
        emails,
        category: category || null
      });
    }

    return dedupeGoogleMapResults(await enrichResultsWithEmails(results));
  } catch (error) {
    console.error('Google Maps scraping failed:', error);
    throw error;
  } finally {
    if (detailPage) await detailPage.close().catch(() => undefined);
    if (browser) await browser.close();
  }
}
