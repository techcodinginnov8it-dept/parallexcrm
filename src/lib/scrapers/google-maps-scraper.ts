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

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}/gi;
const EMAIL_VALIDATION_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}$/i;
const MAX_EMAILS_PER_BUSINESS = 5;
const ENRICHMENT_CONCURRENCY = 15;
const TIMEOUT = 5000;
const MAX_LIMIT = 50;
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

const MAPS_NAVIGATION_ATTEMPTS = [
  { waitUntil: 'domcontentloaded' as const, timeout: 18000 },
  { waitUntil: 'load' as const, timeout: 25000 },
];
const MAPS_DETAIL_NAVIGATION_ATTEMPTS = [
  { waitUntil: 'domcontentloaded' as const, timeout: 6000 },
  { waitUntil: 'load' as const, timeout: 9000 },
];
const MAX_DETAIL_LOOKUPS = 4;
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
  attempts: ReadonlyArray<{ waitUntil: 'domcontentloaded' | 'load'; timeout: number }> = MAPS_NAVIGATION_ATTEMPTS
): Promise<void> {
  let lastError: unknown;

  for (let i = 0; i < attempts.length; i++) {
    const attempt = attempts[i];
    try {
      await page.goto(url, { waitUntil: attempt.waitUntil, timeout: attempt.timeout });
      await page.waitForTimeout(2000);
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

export async function scrapeGoogleMaps(
  query: string,
  maxResults: number = 20,
  offset: number = 0
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
    detailPage = await context.newPage();

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
    await detailPage.route('**/*', routeHandler);

    const url = `https://www.google.com/maps/search/${encodeURIComponent(query)}?hl=en`;
    console.log(`Navigating to Google Maps: ${url}`);
    await navigateToGoogleMaps(page, url);

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

      if (feedCount > 0 || cardCount > 0) {
        hasListResults = true;
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
        const fullPageContent = await page.content().catch(() => '');
        const fullPageText = await page.locator('body').innerText().catch(() => '');
        const mailtoEmails = await extractMailtoEmails(page);
        const protectedEmails = await extractCloudflareEmails(page);
        const emails = mergeEmailSets(
          extractEmails(fullPageContent),
          extractEmails(fullPageText),
          mailtoEmails,
          protectedEmails
        );

        const cleanName = name.trim();
        const hasUsefulContactData = Boolean(website || address || emails.length > 0);

      if (cleanName && startAt === 0 && isLikelyBusinessName(cleanName) && hasUsefulContactData) {
          return [{ name, website, address, emails }];
        }
      }
      return [];
    }

    const cards = page.locator(
      'div[role="feed"] > div:has(a.hfpxzc), div.Nv2PK:has(a.hfpxzc), div[role="article"]:has(a.hfpxzc)'
    );
    let prevCount = 0;
    let retries = 0;

    while (prevCount < targetCount && retries < 6) {
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

      await page.waitForTimeout(1500);
    }

    const count = await cards.count();
    const results: GoogleMapResult[] = [];
    const endAt = Math.min(count, startAt + safeLimit);
    let detailLookups = 0;

    for (let i = startAt; i < endAt; i++) {
      const card = cards.nth(i);

      let name = await card.locator('a.hfpxzc').getAttribute('aria-label').catch(() => '');
      if (!name) continue;

      const placeHref = await card.locator('a.hfpxzc').first().getAttribute('href').catch(() => null);
      const mapsPlaceUrl = normalizeMapsUrl(placeHref);
      let website = await extractWebsiteFromMapsCard(card);

      const fullText = await card.innerText().catch(() => '');
      const lines = fullText.split('\n').filter((line) => line.trim().length > 0);
      let emails = extractEmails(fullText).slice(0, MAX_EMAILS_PER_BUSINESS);

      let address: string | null = null;
      let category: string | null = null;

      const detailSeparatorRegex = /[\u00B7\u2022]|\u00C2\u00B7/;
      const detailLine = lines.find((line) => detailSeparatorRegex.test(line));
      if (detailLine) {
        const parts = detailLine.split(detailSeparatorRegex).map((part) => part.trim());
        category = parts[0] || null;
        address = parts[1] || null;
      } else if (lines.length > 2) {
        address = lines[2];
      }

      // Some map cards do not expose website/email directly, so fetch place details as fallback.
      if (
        detailPage &&
        mapsPlaceUrl &&
        detailLookups < MAX_DETAIL_LOOKUPS &&
        (!website || !address)
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

    return enrichResultsWithEmails(results);
  } catch (error) {
    console.error('Google Maps scraping failed:', error);
    throw error;
  } finally {
    if (detailPage) await detailPage.close().catch(() => undefined);
    if (browser) await browser.close();
  }
}
