import axios from 'axios';
import * as cheerio from 'cheerio';
import { launchChromiumBrowser } from '@/lib/scrapers/browser-launcher';

export interface BusinessScrapeInput {
  name: string;
  website?: string | null;
  googleMapsUrl?: string | null;
}

export type EmailSource = 'website' | 'google_maps';

export interface BusinessScrapeResult {
  website: string | null;
  emails: string[];
  source: EmailSource[];
}

export type BusinessScrapeOutput = Record<string, BusinessScrapeResult>;

export interface ScrapeOptions {
  concurrency?: number;
  retries?: number;
  timeoutMs?: number;
}

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}/gi;
const CONTACT_KEYWORDS = ['contact', 'contact-us', 'about'];
const IGNORED_PREFIXES = ['noreply@', 'no-reply@', 'example@', 'test@'];
const MIN_DELAY_MS = 1000;
const MAX_DELAY_MS = 2000;
const MAX_WEBSITE_PAGES = 8;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function randomDelay(): Promise<void> {
  const jitter = Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS + 1)) + MIN_DELAY_MS;
  await sleep(jitter);
}

function normalizeUrl(input?: string | null): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString();
    }
  } catch {
    // Try with protocol below.
  }

  try {
    const parsed = new URL(`https://${trimmed}`);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString();
    }
  } catch {
    return null;
  }

  return null;
}

function sameHost(a: string, b: string): boolean {
  try {
    const hostA = new URL(a).hostname.replace(/^www\./i, '').toLowerCase();
    const hostB = new URL(b).hostname.replace(/^www\./i, '').toLowerCase();
    return hostA === hostB;
  } catch {
    return false;
  }
}

function sanitizeEmail(raw: string): string {
  return raw.toLowerCase().replace(/[),.;]+$/g, '').trim();
}

function isAllowedEmail(email: string): boolean {
  if (!email) return false;
  return !IGNORED_PREFIXES.some((prefix) => email.startsWith(prefix));
}

async function retry<T>(
  task: () => Promise<T>,
  retries: number,
  label: string
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        console.warn(`[scraper] Retry ${attempt + 1}/${retries} for ${label}`);
        await randomDelay();
      }
    }
  }
  throw lastError;
}

export async function fetchHTML(url: string, timeoutMs: number = 15000): Promise<string> {
  const response = await axios.get<string>(url, {
    timeout: timeoutMs,
    responseType: 'text',
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    maxRedirects: 5,
    validateStatus: (status) => status >= 200 && status < 400,
  });

  await randomDelay();
  return response.data || '';
}

export function extractContactLinks(html: string, baseUrl: string): string[] {
  const $ = cheerio.load(html);
  const links = new Set<string>();

  $('a[href]').each((_, element) => {
    const href = ($(element).attr('href') || '').trim();
    if (!href) return;

    try {
      const absolute = new URL(href, baseUrl).toString();
      if (!sameHost(baseUrl, absolute)) return;

      const absoluteUrl = new URL(absolute);
      const path = absoluteUrl.pathname.toLowerCase();
      const hrefLower = href.toLowerCase();
      const isContactLike = CONTACT_KEYWORDS.some(
        (keyword) => path.includes(keyword) || hrefLower.includes(keyword)
      );

      if (isContactLike) {
        links.add(absolute);
      }
    } catch {
      // Ignore malformed links.
    }
  });

  return Array.from(links).slice(0, MAX_WEBSITE_PAGES);
}

export function extractEmails(text: string): string[] {
  if (!text) return [];

  const matches = text.match(EMAIL_REGEX) || [];
  const emails = matches.map(sanitizeEmail).filter(isAllowedEmail);
  return Array.from(new Set(emails));
}

export async function scrapeWebsite(
  url?: string | null,
  options: Pick<ScrapeOptions, 'retries' | 'timeoutMs'> = {}
): Promise<string[]> {
  const normalizedUrl = normalizeUrl(url);
  if (!normalizedUrl) return [];

  const retries = options.retries ?? 2;
  const timeoutMs = options.timeoutMs ?? 15000;

  const homepageHtml = await retry(
    () => fetchHTML(normalizedUrl, timeoutMs),
    retries,
    `homepage ${normalizedUrl}`
  );

  const queue: Array<{ url: string; depth: number }> = extractContactLinks(homepageHtml, normalizedUrl).map(
    (contactUrl) => ({ url: contactUrl, depth: 1 })
  );
  const visited = new Set<string>();
  const emailSet = new Set<string>();

  while (queue.length > 0 && visited.size < MAX_WEBSITE_PAGES) {
    const current = queue.shift();
    if (!current) break;
    if (visited.has(current.url)) continue;
    if (current.depth > 2) continue;

    visited.add(current.url);

    try {
      const html = await retry(
        () => fetchHTML(current.url, timeoutMs),
        retries,
        `contact page ${current.url}`
      );
      const $ = cheerio.load(html);
      const bodyText = $('body').text();
      const mailtoText = $('a[href^="mailto:"]')
        .map((_, el) => ($(el).attr('href') || '').replace(/^mailto:/i, ''))
        .get()
        .join(' ');

      extractEmails(`${bodyText}\n${mailtoText}`).forEach((email) => emailSet.add(email));

      if (current.depth < 2) {
        const nestedLinks = extractContactLinks(html, current.url);
        for (const nestedUrl of nestedLinks) {
          if (!visited.has(nestedUrl)) {
            queue.push({ url: nestedUrl, depth: current.depth + 1 });
          }
        }
      }
    } catch (error: any) {
      console.warn(`[scraper] Website scrape failed for ${current.url}: ${error?.message || error}`);
    }
  }

  return Array.from(emailSet);
}

export async function scrapeGoogleMaps(
  googleMapsUrl?: string | null,
  options: Pick<ScrapeOptions, 'retries' | 'timeoutMs'> = {}
): Promise<{ emails: string[]; website: string | null }> {
  const normalizedMapsUrl = normalizeUrl(googleMapsUrl);
  if (!normalizedMapsUrl) {
    return { emails: [], website: null };
  }

  const timeoutMs = options.timeoutMs ?? 30000;
  const retries = options.retries ?? 2;

  const attempt = async (): Promise<{ emails: string[]; website: string | null }> => {
    const browser = await launchChromiumBrowser();

    try {
      const context = await browser.newContext({ userAgent: USER_AGENT });
      const page = await context.newPage();
      await page.goto(normalizedMapsUrl, {
        waitUntil: 'domcontentloaded',
        timeout: timeoutMs,
      });
      await page.waitForTimeout(1500);

      const visibleData = await page.evaluate(() => {
        const bodyText = document.body ? document.body.innerText : '';
        const links = Array.from(document.querySelectorAll('a[href]')) as HTMLAnchorElement[];
        const websiteCandidates: string[] = [];

        const isElementVisible = (el: Element): boolean => {
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        };

        for (const link of links) {
          if (!isElementVisible(link)) continue;
          const href = link.href || '';
          const text = (link.innerText || '').toLowerCase();
          const aria = (link.getAttribute('aria-label') || '').toLowerCase();
          const dataItem = (link.getAttribute('data-item-id') || '').toLowerCase();

          if (!href.startsWith('http')) continue;
          if (
            text.includes('website') ||
            aria.includes('website') ||
            dataItem.includes('authority')
          ) {
            websiteCandidates.push(href);
          }
        }

        return {
          bodyText,
          websiteCandidates,
        };
      });

      await randomDelay();

      const emails = extractEmails(visibleData.bodyText);
      const website = normalizeUrl(visibleData.websiteCandidates?.[0] || null);

      return { emails, website };
    } finally {
      await browser.close();
    }
  };

  return retry(attempt, retries, `google maps ${normalizedMapsUrl}`);
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const safeLimit = Math.max(1, limit);
  const results: R[] = new Array(items.length);
  let currentIndex = 0;

  const runners = Array.from({ length: Math.min(safeLimit, items.length) }, async () => {
    while (true) {
      const index = currentIndex++;
      if (index >= items.length) break;
      results[index] = await worker(items[index], index);
    }
  });

  await Promise.all(runners);
  return results;
}

async function scrapeSingleBusiness(
  input: BusinessScrapeInput,
  options: Required<ScrapeOptions>
): Promise<[string, BusinessScrapeResult]> {
  const name = input.name?.trim() || 'Unknown Business';
  let resolvedWebsite = normalizeUrl(input.website) || null;

  const emailToSources = new Map<string, Set<EmailSource>>();

  try {
    if (resolvedWebsite) {
      const websiteEmails = await scrapeWebsite(resolvedWebsite, options);
      for (const email of websiteEmails) {
        if (!emailToSources.has(email)) emailToSources.set(email, new Set<EmailSource>());
        emailToSources.get(email)?.add('website');
      }
    }
  } catch (error: any) {
    console.warn(`[scraper] Website scrape failed for "${name}": ${error?.message || error}`);
  }

  try {
    if (input.googleMapsUrl) {
      const mapsData = await scrapeGoogleMaps(input.googleMapsUrl, options);
      if (!resolvedWebsite && mapsData.website) {
        resolvedWebsite = mapsData.website;
      }

      for (const email of mapsData.emails) {
        if (!emailToSources.has(email)) emailToSources.set(email, new Set<EmailSource>());
        emailToSources.get(email)?.add('google_maps');
      }
    }
  } catch (error: any) {
    console.warn(`[scraper] Google Maps scrape failed for "${name}": ${error?.message || error}`);
  }

  const emails = Array.from(emailToSources.keys());
  const sourceSet = new Set<EmailSource>();
  for (const sourceList of Array.from(emailToSources.values())) {
    for (const src of Array.from(sourceList.values())) {
      sourceSet.add(src);
    }
  }

  const result: BusinessScrapeResult = {
    website: resolvedWebsite,
    emails,
    source: Array.from(sourceSet),
  };

  console.info(
    `[scraper] ${name}: ${result.emails.length} emails found from ${result.source.join(', ') || 'no source'}`
  );

  return [name, result];
}

export async function scrapeBusinessEmails(
  input: BusinessScrapeInput[]
): Promise<BusinessScrapeOutput> {
  return scrapeBusinessEmailsWithOptions(input, {});
}

export async function scrapeBusinessEmailsWithOptions(
  input: BusinessScrapeInput[],
  options: ScrapeOptions
): Promise<BusinessScrapeOutput> {
  const safeOptions: Required<ScrapeOptions> = {
    concurrency: Math.min(Math.max(options.concurrency ?? 3, 1), 3),
    retries: Math.max(options.retries ?? 2, 0),
    timeoutMs: Math.max(options.timeoutMs ?? 15000, 3000),
  };

  const entries = await mapWithConcurrency(input, safeOptions.concurrency, (business) =>
    scrapeSingleBusiness(business, safeOptions)
  );

  const output: BusinessScrapeOutput = {};
  for (const [name, result] of entries) {
    output[name] = result;
  }

  return output;
}
