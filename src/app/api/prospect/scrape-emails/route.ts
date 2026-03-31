import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, unauthorizedResponse } from '@/lib/api-utils';
import {
  BusinessScrapeInput,
  scrapeBusinessEmailsWithOptions,
} from '@/lib/scrapers/business-email-scraper';

interface ScrapeRequestBody {
  businesses?: BusinessScrapeInput[];
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    const body = (await request.json()) as ScrapeRequestBody | BusinessScrapeInput[];
    const businesses = Array.isArray(body) ? body : body?.businesses;

    if (!Array.isArray(businesses) || businesses.length === 0) {
      return NextResponse.json(
        { error: 'Request must include a non-empty businesses array.' },
        { status: 400 }
      );
    }

    if (businesses.length > 30) {
      return NextResponse.json(
        { error: 'Please send at most 30 businesses per request.' },
        { status: 400 }
      );
    }

    const normalized: BusinessScrapeInput[] = businesses.map((item) => ({
      name: item?.name || 'Unknown Business',
      website: item?.website || null,
      googleMapsUrl: item?.googleMapsUrl || null,
    }));

    const result = await scrapeBusinessEmailsWithOptions(normalized, {
      concurrency: 3,
      retries: 2,
      timeoutMs: 20000,
    });

    return NextResponse.json(result);
  } catch (error: any) {
    const message = error?.message || 'Failed to scrape business emails';
    console.error('[scrape-emails] Failed:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
