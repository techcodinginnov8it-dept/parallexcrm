import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, unauthorizedResponse } from '@/lib/api-utils';
import prisma from '@/lib/db';
import { scrapeGoogleMaps } from '@/lib/scrapers/google-maps-scraper';

/**
 * Searches for businesses via Google Maps scraping only.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('query') || '';
    const location = searchParams.get('location') || '';
    const city = searchParams.get('city') || '';
    const country = searchParams.get('country') || '';
    const searchIdParam = searchParams.get('searchId');
    const pageRaw = parseInt(searchParams.get('page') || '1', 10);
    const limitRaw = parseInt(searchParams.get('limit') || '20', 10);
    const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 50) : 20;
    const offset = (page - 1) * limit;
    const source = 'google_maps';

    if (!query || (!location && !city && !country)) {
      return NextResponse.json({ error: 'Query and at least one location filter are required' }, { status: 400 });
    }

    const displayLocation = city ? `${city}${country ? `, ${country}` : ''}` : location;
    
    console.log(`Searching Google Maps for: ${query} in ${displayLocation}`);
    const fullQuery = `${query} in ${displayLocation}`;
    const startedAt = Date.now();
    const scraped = await scrapeGoogleMaps(fullQuery, limit + 1, offset, 'fast_first');
    const elapsedMs = Date.now() - startedAt;
    const visibleRows = scraped.slice(0, limit);
    console.log(
      `Google Maps scrape completed in ${elapsedMs}ms for "${fullQuery}" (mode=fast_first, rows=${visibleRows.length}, hasMore=${scraped.length > limit})`
    );

    const prospects = visibleRows.map((p, i) => ({
      name: p.name || 'Unknown Business',
      website: p.website || null,
      address: p.address || null,
      emails: Array.isArray(p.emails) ? p.emails : [],
      source_id: `gmaps-${offset + i}-${Date.now()}`,
      source: 'google_maps',
      category: p.category || 'Business',
      rating: p.rating || null,
    }));

    let resolvedSearchId = searchIdParam;
    if (!resolvedSearchId) {
      const searchQuery = await prisma.searchQuery.create({
        data: {
          org_id: user.org_id,
          query,
          location: displayLocation,
          source,
        }
      });
      resolvedSearchId = searchQuery.id;
    }

    return NextResponse.json({
      data: prospects,
      searchId: resolvedSearchId,
      count: prospects.length,
      source,
      page,
      limit,
      hasMore: scraped.length > limit,
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
