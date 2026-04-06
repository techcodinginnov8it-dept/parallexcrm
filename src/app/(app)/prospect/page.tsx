'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, MapPin, Globe, Mail, UserPlus, Loader2, RefreshCw } from 'lucide-react';
import { DataTable, ColumnDef } from '@/components/ui/DataTable';

interface ProspectResult {
  source_id?: string;
  name: string;
  website: string | null;
  address: string | null;
  emails: string[];
  status: 'found' | 'enriching' | 'enriched' | 'stored' | 'saved' | 'unavailable';
  category?: string;
  source?: 'google_maps';
  rating?: string | null;
}

interface ProspectSearchContext {
  query: string;
  location: string;
  city: string;
  country: string;
}

interface ProspectSessionSnapshot {
  activeSearch: ProspectSearchContext | null;
  activeQueryTerm: string;
  queryVariantIndex: number;
  searchId: string | null;
  currentPage: number;
  hasMoreResults: boolean;
  lastScrapeSummary: string;
  results: ProspectResult[];
  isSearching: boolean;
  searchError: string;
  updatedAt: number;
}

interface ProspectHistoryEntry {
  key: string;
  searchId: string;
  category: string;
  locationLabel: string;
  updatedAt: string;
  resultCount: number;
}

type ProspectResultSource = 'saved' | 'fresh' | 'mixed';

const SCRAPE_STEPS = [
  'Connecting to Google Maps',
  'Collecting businesses from map results',
  'Visiting business websites for contact emails',
];
const DEFAULT_ITEMS_PER_PAGE = 20;
const ADMIN_ITEMS_PER_PAGE = 100;
const AUTO_ENRICH_CONCURRENCY = 3;
const AUTO_SAVE_CONCURRENCY = 2;
const LOOKING_DOT_COUNT = 4;
const ENRICHMENT_REQUEST_TIMEOUT_MS = 20000;
const RELATED_QUERY_SUFFIXES = ['company', 'business', 'provider', 'consultant', 'solutions'];
const MAX_SEARCH_HISTORY = 8;
const BUSINESS_CATEGORY_SUGGESTIONS = [
  'IT services',
  'Software companies',
  'Marketing agency',
  'Accounting firm',
  'Real estate agency',
  'Construction company',
  'Dental clinic',
  'Medical clinic',
  'Law firm',
  'Logistics company',
  'Recruitment agency',
  'Cleaning services',
];
const COUNTRY_SUGGESTIONS = [
  'United States',
  'Canada',
  'United Kingdom',
  'Australia',
  'New Zealand',
  'Singapore',
  'Philippines',
  'India',
  'United Arab Emirates',
  'Saudi Arabia',
  'Germany',
  'France',
  'Spain',
  'Italy',
  'Netherlands',
  'Sweden',
  'Norway',
  'Denmark',
  'Switzerland',
  'Ireland',
  'South Africa',
  'Nigeria',
  'Kenya',
  'Japan',
  'South Korea',
  'Malaysia',
  'Indonesia',
  'Thailand',
  'Vietnam',
  'Brazil',
  'Mexico',
  'Argentina',
];

function LookingIndicator() {
  return (
    <span className="looking-status" aria-label="Looking for contact info">
      <span>Looking</span>
      <span className="looking-dots" aria-hidden="true">
        {Array.from({ length: LOOKING_DOT_COUNT }, (_, index) => (
          <span
            key={index}
            className="looking-dot"
            style={{ animationDelay: `${index * 0.18}s` }}
          >
            .
          </span>
        ))}
      </span>
    </span>
  );
}

function formatProspectResultSourceLabel(resultSource?: string | null): string {
  if (resultSource === 'saved') return 'Loaded from saved leads';
  if (resultSource === 'fresh') return 'Scraped fresh leads';
  if (resultSource === 'mixed') return 'Loaded from saved leads + Scraped fresh leads';
  return 'Scraped fresh leads';
}

async function readJsonResponseSafely(response: Response) {
  const responseText = await response.text();

  if (!responseText) {
    return null;
  }

  try {
    return JSON.parse(responseText);
  } catch {
    return {
      error: response.ok
        ? 'The server returned an unreadable search response.'
        : `The server returned an invalid error response (${response.status}).`,
    };
  }
}

export default function ProspectingPage() {
  const [itemsPerPage, setItemsPerPage] = useState(DEFAULT_ITEMS_PER_PAGE);
  const [hasResolvedRole, setHasResolvedRole] = useState(false);
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [query, setQuery] = useState('');
  const [location, setLocation] = useState(''); // Fallback/General
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMoreResults, setHasMoreResults] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [scrapeStepIndex, setScrapeStepIndex] = useState(0);
  const [searchError, setSearchError] = useState('');
  const [lastScrapeSummary, setLastScrapeSummary] = useState('');
  const [results, setResults] = useState<ProspectResult[]>([]);
  const [searchId, setSearchId] = useState<string | null>(null);
  const [activeSearch, setActiveSearch] = useState<ProspectSearchContext | null>(null);
  const [activeQueryTerm, setActiveQueryTerm] = useState('');
  const [queryVariantIndex, setQueryVariantIndex] = useState(0);
  const [searchHistory, setSearchHistory] = useState<ProspectHistoryEntry[]>([]);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [isSavingSelected, setIsSavingSelected] = useState(false);
  const [showCategorySuggestions, setShowCategorySuggestions] = useState(false);
  const [showCountrySuggestions, setShowCountrySuggestions] = useState(false);
  const autoEnrichQueueRef = useRef<ProspectResult[]>([]);
  const autoSaveQueueRef = useRef<ProspectResult[]>([]);
  const activeEnrichmentsRef = useRef(new Set<string>());
  const queuedEnrichmentsRef = useRef(new Set<string>());
  const activeAutoSavesRef = useRef(new Set<string>());
  const attemptedEnrichmentsRef = useRef(new Set<string>());
  const queuedAutoSavesRef = useRef(new Set<string>());
  const shouldPromoteHistoryRef = useRef(false);
  const isMountedRef = useRef(false);
  const resultsRef = useRef<ProspectResult[]>([]);
  const searchIdRef = useRef<string | null>(null);
  const activeSearchRef = useRef<ProspectSearchContext | null>(null);
  const activeQueryTermRef = useRef('');
  const queryVariantIndexRef = useRef(0);
  const currentPageRef = useRef(1);
  const hasMoreResultsRef = useRef(false);
  const lastScrapeSummaryRef = useRef('');
  const isSearchingRef = useRef(false);
  const searchErrorRef = useRef('');
  const categoryInputRef = useRef<HTMLDivElement | null>(null);
  const countryInputRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const res = await fetch('/api/user/me');
        const data = await res.json().catch(() => null);

        if (!res.ok || cancelled) {
          if (!cancelled) {
            setItemsPerPage(DEFAULT_ITEMS_PER_PAGE);
            setIsAdminUser(false);
            setHasResolvedRole(true);
          }
          return;
        }

        const nextIsAdmin = data?.data?.role === 'admin';

        setIsAdminUser(nextIsAdmin);
        setItemsPerPage(nextIsAdmin ? ADMIN_ITEMS_PER_PAGE : DEFAULT_ITEMS_PER_PAGE);
        setHasResolvedRole(true);
      } catch {
        if (!cancelled) {
          setItemsPerPage(DEFAULT_ITEMS_PER_PAGE);
          setIsAdminUser(false);
          setHasResolvedRole(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isSearching) {
      setScrapeStepIndex(0);
      return;
    }

    const interval = setInterval(() => {
      setScrapeStepIndex((prev) => (prev + 1) % SCRAPE_STEPS.length);
    }, 1300);

    return () => clearInterval(interval);
  }, [isSearching]);

  useEffect(() => {
    resultsRef.current = results;
  }, [results]);

  useEffect(() => {
    searchIdRef.current = searchId;
  }, [searchId]);

  useEffect(() => {
    activeSearchRef.current = activeSearch;
  }, [activeSearch]);

  useEffect(() => {
    activeQueryTermRef.current = activeQueryTerm;
  }, [activeQueryTerm]);

  useEffect(() => {
    queryVariantIndexRef.current = queryVariantIndex;
  }, [queryVariantIndex]);

  useEffect(() => {
    currentPageRef.current = currentPage;
  }, [currentPage]);

  useEffect(() => {
    hasMoreResultsRef.current = hasMoreResults;
  }, [hasMoreResults]);

  useEffect(() => {
    lastScrapeSummaryRef.current = lastScrapeSummary;
  }, [lastScrapeSummary]);

  useEffect(() => {
    isSearchingRef.current = isSearching;
  }, [isSearching]);

  useEffect(() => {
    searchErrorRef.current = searchError;
  }, [searchError]);

  useEffect(() => {
    const validRowKeys = new Set(
      results
        .filter((row) => shouldDisplayProspect(row))
        .map((row) => getRowKey(row))
    );
    setSelectedRows((prev) => {
      const next = new Set(Array.from(prev).filter((rowKey) => validRowKeys.has(rowKey)));
      return next.size === prev.size ? prev : next;
    });
  }, [results]);

  const buildSearchUrl = (
    page: number,
    searchContext: ProspectSearchContext,
    queryOverride?: string,
    existingSearchId?: string | null
  ) => {
    const nextQuery = (queryOverride || searchContext.query).trim();
    let url =
      `/api/prospect/search?query=${encodeURIComponent(nextQuery)}` +
      `&page=${page}&limit=${itemsPerPage}`;
    if (searchContext.city) url += `&city=${encodeURIComponent(searchContext.city)}`;
    if (searchContext.country) url += `&country=${encodeURIComponent(searchContext.country)}`;
    if (!searchContext.city && !searchContext.country && searchContext.location) {
      url += `&location=${encodeURIComponent(searchContext.location)}`;
    }
    if (existingSearchId) url += `&searchId=${encodeURIComponent(existingSearchId)}`;
    return url;
  };

  const createSearchContext = (): ProspectSearchContext => ({
    query: query.trim(),
    location: location.trim(),
    city: city.trim(),
    country: country.trim(),
  });

  const buildRelatedQueries = (baseQuery: string) => {
    const normalizedBase = baseQuery.trim().replace(/\s+/g, ' ');
    if (!normalizedBase) return [];

    const lowerBase = normalizedBase.toLowerCase();
    const seen = new Set<string>();
    const relatedQueries = [normalizedBase];

    for (const suffix of RELATED_QUERY_SUFFIXES) {
      if (lowerBase.includes(suffix)) continue;
      relatedQueries.push(`${normalizedBase} ${suffix}`);
    }

    return relatedQueries.filter((candidate) => {
      const key = candidate.trim().toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const getSearchLocationLabel = (searchContext: ProspectSearchContext) => {
    const cityCountry = [searchContext.city, searchContext.country].filter(Boolean).join(', ');
    return cityCountry || searchContext.location || 'General location';
  };

  const getSearchHistoryKey = (searchContext: ProspectSearchContext | null) =>
    (searchContext?.query || '').trim().toLowerCase();

  const getProspectIdentity = (prospect: Pick<ProspectResult, 'name' | 'website' | 'address'>) =>
    `${(prospect.name || '').trim().toLowerCase()}|${(prospect.website || '').trim().toLowerCase()}|${(prospect.address || '').trim().toLowerCase()}`;

  const getRowKey = (prospect: ProspectResult) =>
    prospect.source_id || `${prospect.name}|${prospect.website || ''}|${prospect.address || ''}`;

  const mergeProspectEmails = (left: string[], right: string[]) =>
    Array.from(new Set([...(left || []), ...(right || [])]));

  const getStatusPriority = (status: ProspectResult['status']) => {
    switch (status) {
      case 'saved':
        return 6;
      case 'stored':
        return 5;
      case 'enriched':
        return 4;
      case 'enriching':
        return 3;
      case 'found':
        return 2;
      case 'unavailable':
        return 1;
      default:
        return 0;
    }
  };

  const mergeProspectRow = (
    existing: ProspectResult,
    incoming: ProspectResult
  ): ProspectResult => {
    const mergedEmails = mergeProspectEmails(existing.emails, incoming.emails);
    const preferredStatus =
      getStatusPriority(incoming.status) > getStatusPriority(existing.status)
        ? incoming.status
        : existing.status;

    return {
      ...existing,
      ...incoming,
      source_id: incoming.source_id || existing.source_id,
      name: incoming.name || existing.name,
      website: incoming.website || existing.website,
      address: incoming.address || existing.address,
      emails: mergedEmails,
      status:
        mergedEmails.length > 0 && preferredStatus !== 'saved' && preferredStatus !== 'stored'
          ? 'enriched'
          : preferredStatus,
      category: incoming.category || existing.category,
      rating: incoming.rating || existing.rating,
    };
  };

  const shouldAutoEnrich = (prospect: ProspectResult) =>
    Boolean(prospect.name) &&
    prospect.emails.length === 0 &&
    prospect.status !== 'saved' &&
    prospect.status !== 'stored' &&
    prospect.status !== 'unavailable';

  const shouldAutoSave = (prospect: ProspectResult) =>
    Boolean(prospect.name) &&
    prospect.emails.length > 0 &&
    prospect.status !== 'saved' &&
    prospect.status !== 'stored';

  const shouldDisplayProspect = (prospect: ProspectResult) =>
    prospect.emails.length > 0 || prospect.status === 'enriching';

  const normalizeStoredStatus = (
    rawStatus: unknown,
    emails: string[]
  ): ProspectResult['status'] => {
    if (rawStatus === 'saved') return 'saved';
    if (rawStatus === 'stored') return 'stored';
    if (rawStatus === 'unavailable') return 'unavailable';
    if (emails.length > 0) return 'enriched';
    if (rawStatus === 'enriching') return 'enriching';
    return 'found';
  };

  const hasPendingEnrichment = (rows: Array<Partial<ProspectResult>>) =>
    rows.some((row) => {
      const emails = Array.isArray(row.emails) ? row.emails : [];
      const status = normalizeStoredStatus(row.status, emails);
      return emails.length === 0 && status !== 'saved' && status !== 'unavailable';
    });

  const dedupeProspectRows = (rows: ProspectResult[]) => {
    const rowsBySourceId = new Map<string, ProspectResult>();
    const rowsByIdentity = new Map<string, ProspectResult>();

    for (const row of rows) {
      const identityKey = getProspectIdentity(row);
      const sourceIdKey = row.source_id?.trim() || null;

      if (sourceIdKey && rowsBySourceId.has(sourceIdKey)) {
        const merged = mergeProspectRow(rowsBySourceId.get(sourceIdKey)!, row);
        rowsBySourceId.set(sourceIdKey, merged);
        if (identityKey) {
          rowsByIdentity.set(identityKey, merged);
        }
        continue;
      }

      if (identityKey && rowsByIdentity.has(identityKey)) {
        const merged = mergeProspectRow(rowsByIdentity.get(identityKey)!, row);
        rowsByIdentity.set(identityKey, merged);
        if (sourceIdKey) {
          rowsBySourceId.set(sourceIdKey, merged);
        }
        continue;
      }

      if (sourceIdKey) {
        rowsBySourceId.set(sourceIdKey, row);
      }

      if (identityKey) {
        rowsByIdentity.set(identityKey, row);
      }
    }

    const dedupedRows: ProspectResult[] = [];
    const seenRowKeys = new Set<string>();

    for (const row of rowsBySourceId.values()) {
      const key = getRowKey(row);
      if (seenRowKeys.has(key)) continue;
      seenRowKeys.add(key);
      dedupedRows.push(row);
    }

    for (const row of rowsByIdentity.values()) {
      const key = getRowKey(row);
      if (seenRowKeys.has(key)) continue;
      seenRowKeys.add(key);
      dedupedRows.push(row);
    }

    return dedupedRows;
  };

  const reviveStoredRows = (incoming: any[]): ProspectResult[] =>
    dedupeProspectRows(
      (Array.isArray(incoming) ? incoming : []).map((row: any) => {
        const emails = Array.isArray(row?.emails) ? row.emails : [];
        return {
          source_id: typeof row?.source_id === 'string' ? row.source_id : undefined,
          name: typeof row?.name === 'string' ? row.name : 'Unknown Business',
          website: typeof row?.website === 'string' ? row.website : null,
          address: typeof row?.address === 'string' ? row.address : null,
          emails,
          status: normalizeStoredStatus(row?.status, emails),
          category: typeof row?.category === 'string' ? row.category : undefined,
          source: 'google_maps' as const,
          rating: typeof row?.rating === 'string' ? row.rating : null,
        };
      })
    );

  const normalizeIncomingRows = (incoming: any[]): ProspectResult[] =>
    dedupeProspectRows(
      incoming.map((p: any) => ({
        ...p,
        emails: Array.isArray(p.emails) ? p.emails : [],
        status: Array.isArray(p.emails) && p.emails.length > 0 ? 'enriched' : 'found',
        source: 'google_maps',
      }))
    );

  const markRowsForAutoEnrichment = (rows: ProspectResult[]) =>
    rows.map((row) =>
      shouldAutoEnrich(row)
        ? { ...row, status: 'enriching' as const }
        : row
    );

  const mergeUniqueRows = (prev: ProspectResult[], incoming: ProspectResult[]) => {
    return dedupeProspectRows([...prev, ...incoming]);
  };

  const dedupeRowsByRowKey = (rows: ProspectResult[]) => {
    const rowsByKey = new Map<string, ProspectResult>();

    for (const row of rows) {
      const rowKey = getRowKey(row);
      if (!rowKey) continue;

      if (rowsByKey.has(rowKey)) {
        rowsByKey.set(rowKey, mergeProspectRow(rowsByKey.get(rowKey)!, row));
        continue;
      }

      rowsByKey.set(rowKey, row);
    }

    return Array.from(rowsByKey.values());
  };

  const countNewRows = (existingRows: ProspectResult[], incomingRows: ProspectResult[]) =>
    mergeUniqueRows(existingRows, incomingRows).length - existingRows.length;

  const parseApiError = (data: any, fallback: string) =>
    data?.details ? `${data.error}: ${data.details}` : data?.error || fallback;

  const areSearchContextsEqual = (
    left: ProspectSearchContext | null,
    right: ProspectSearchContext | null
  ) => {
    if (left === right) return true;
    if (!left || !right) return false;

    return (
      left.query === right.query &&
      left.location === right.location &&
      left.city === right.city &&
      left.country === right.country
    );
  };

  const areProspectRowsEquivalent = (
    left: ProspectResult[],
    right: ProspectResult[]
  ) => {
    if (left === right) return true;
    if (left.length !== right.length) return false;

    return left.every((row, index) => {
      const other = right[index];
      if (!other) return false;

      const sameEmails =
        row.emails.length === other.emails.length &&
        row.emails.every((email, emailIndex) => email === other.emails[emailIndex]);

      return (
        getRowKey(row) === getRowKey(other) &&
        row.name === other.name &&
        row.website === other.website &&
        row.address === other.address &&
        row.status === other.status &&
        row.category === other.category &&
        row.rating === other.rating &&
        sameEmails
      );
    });
  };

  const buildSessionSnapshot = (
    overrides: Partial<ProspectSessionSnapshot> = {}
  ): ProspectSessionSnapshot | null => {
    const resolvedActiveSearch = overrides.activeSearch ?? activeSearchRef.current;
    if (!resolvedActiveSearch) return null;

    return {
      activeSearch: resolvedActiveSearch,
      activeQueryTerm: overrides.activeQueryTerm ?? activeQueryTermRef.current,
      queryVariantIndex: overrides.queryVariantIndex ?? queryVariantIndexRef.current,
      searchId: overrides.searchId ?? searchIdRef.current,
      currentPage: overrides.currentPage ?? currentPageRef.current,
      hasMoreResults: overrides.hasMoreResults ?? hasMoreResultsRef.current,
      lastScrapeSummary: overrides.lastScrapeSummary ?? lastScrapeSummaryRef.current,
      results: overrides.results ?? resultsRef.current,
      isSearching: overrides.isSearching ?? isSearchingRef.current,
      searchError: overrides.searchError ?? searchErrorRef.current,
      updatedAt: Date.now(),
    };
  };

  const fetchSearchHistory = async () => {
    try {
      const response = await fetch('/api/prospect/history', { cache: 'no-store' });
      const data = await response.json().catch(() => null);

      if (!response.ok) return;

      const historyEntries = Array.isArray(data?.data)
        ? data.data.slice(0, MAX_SEARCH_HISTORY)
        : [];

      if (isMountedRef.current) {
        setSearchHistory(historyEntries);
      }
    } catch {
      // Ignore temporary history fetch issues.
    }
  };

  const applySessionSnapshot = (
    snapshot: ProspectSessionSnapshot,
    options?: { resumeQueue?: boolean }
  ) => {
    if (!snapshot.activeSearch) return;
    const nextActiveSearch = snapshot.activeSearch;

    const baseRows = reviveStoredRows(snapshot.results);
    const shouldResumeQueue = Boolean(options?.resumeQueue);
    const restoredRows = shouldResumeQueue
      ? markRowsForAutoEnrichment(baseRows)
      : baseRows;
    const nextActiveQueryTerm = snapshot.activeQueryTerm || nextActiveSearch.query;
    const nextQueryVariantIndex = snapshot.queryVariantIndex || 0;
    const nextSearchId = snapshot.searchId || null;
    const nextCurrentPage = snapshot.currentPage || 1;
    const nextHasMoreResults = Boolean(snapshot.hasMoreResults);
    const nextLastScrapeSummary =
      snapshot.lastScrapeSummary ||
      `Restored saved search for ${nextActiveSearch.query}.`;
    const nextSearchError = snapshot.searchError || '';
    const nextIsSearching = Boolean(snapshot.isSearching);

    const isSameSnapshot =
      areSearchContextsEqual(activeSearchRef.current, nextActiveSearch) &&
      activeQueryTermRef.current === nextActiveQueryTerm &&
      queryVariantIndexRef.current === nextQueryVariantIndex &&
      searchIdRef.current === nextSearchId &&
      currentPageRef.current === nextCurrentPage &&
      hasMoreResultsRef.current === nextHasMoreResults &&
      lastScrapeSummaryRef.current === nextLastScrapeSummary &&
      searchErrorRef.current === nextSearchError &&
      isSearchingRef.current === nextIsSearching &&
      areProspectRowsEquivalent(resultsRef.current, restoredRows);

    if (isSameSnapshot && !shouldResumeQueue) {
      return;
    }

    activeSearchRef.current = nextActiveSearch;
    activeQueryTermRef.current = nextActiveQueryTerm;
    queryVariantIndexRef.current = nextQueryVariantIndex;
    searchIdRef.current = nextSearchId;
    currentPageRef.current = nextCurrentPage;
    hasMoreResultsRef.current = nextHasMoreResults;
    lastScrapeSummaryRef.current = nextLastScrapeSummary;
    resultsRef.current = restoredRows;
    isSearchingRef.current = nextIsSearching;
    searchErrorRef.current = nextSearchError;

    if (isMountedRef.current) {
      setQuery((prev) => (prev === nextActiveSearch.query ? prev : nextActiveSearch.query));
      setLocation((prev) => (prev === nextActiveSearch.location ? prev : nextActiveSearch.location));
      setCity((prev) => (prev === nextActiveSearch.city ? prev : nextActiveSearch.city));
      setCountry((prev) => (prev === nextActiveSearch.country ? prev : nextActiveSearch.country));
      setResults((prev) => (areProspectRowsEquivalent(prev, restoredRows) ? prev : restoredRows));
      setSearchId((prev) => (prev === nextSearchId ? prev : nextSearchId));
      setActiveSearch((prev) => (areSearchContextsEqual(prev, nextActiveSearch) ? prev : nextActiveSearch));
      setActiveQueryTerm((prev) => (prev === nextActiveQueryTerm ? prev : nextActiveQueryTerm));
      setQueryVariantIndex((prev) => (prev === nextQueryVariantIndex ? prev : nextQueryVariantIndex));
      setCurrentPage((prev) => (prev === nextCurrentPage ? prev : nextCurrentPage));
      setHasMoreResults((prev) => (prev === nextHasMoreResults ? prev : nextHasMoreResults));
      setLastScrapeSummary((prev) => (prev === nextLastScrapeSummary ? prev : nextLastScrapeSummary));
      setSearchError((prev) => (prev === nextSearchError ? prev : nextSearchError));
      setIsSearching((prev) => (prev === nextIsSearching ? prev : nextIsSearching));
    }

    if (shouldResumeQueue) {
      queueAutoEnrichment(restoredRows);
    }
  };

  const commitSessionSnapshot = (
    snapshot: ProspectSessionSnapshot,
    options?: { promoteToTop?: boolean; resumeQueue?: boolean }
  ) => {
    applySessionSnapshot(snapshot, { resumeQueue: options?.resumeQueue });
  };

  const restoreSnapshot = (
    snapshot: ProspectSessionSnapshot,
    options?: { resumeQueue?: boolean }
  ) => {
    commitSessionSnapshot(snapshot, {
      promoteToTop: false,
      resumeQueue: Boolean(options?.resumeQueue),
    });
  };

  const syncResultsSnapshot = (
    updater: (rows: ProspectResult[]) => ProspectResult[]
  ) => {
    const nextRows = dedupeProspectRows(updater(resultsRef.current));
    if (areProspectRowsEquivalent(resultsRef.current, nextRows)) {
      return;
    }

    resultsRef.current = nextRows;

    if (isMountedRef.current) {
      setResults(nextRows);
    }
  };

  useEffect(() => {
    void fetchSearchHistory();
  }, []);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (!categoryInputRef.current?.contains(event.target as Node)) {
        setShowCategorySuggestions(false);
      }
      if (!countryInputRef.current?.contains(event.target as Node)) {
        setShowCountrySuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const pumpAutoEnrichmentQueue = () => {
    while (
      activeEnrichmentsRef.current.size < AUTO_ENRICH_CONCURRENCY &&
      autoEnrichQueueRef.current.length > 0
    ) {
      const prospect = autoEnrichQueueRef.current.shift();
      if (!prospect) break;

      const rowKey = getRowKey(prospect);
      queuedEnrichmentsRef.current.delete(rowKey);
      if (activeEnrichmentsRef.current.has(rowKey)) continue;

      activeEnrichmentsRef.current.add(rowKey);

      void (async () => {
        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => controller.abort(), ENRICHMENT_REQUEST_TIMEOUT_MS);

        try {
          const res = await fetch('/api/prospect/enrich', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({
              leadId: prospect.source_id,
              url: prospect.website,
              name: prospect.name,
              address: prospect.address,
            }),
          });
          const data = await res.json().catch(() => null);
          const emails = res.ok && Array.isArray(data.emails) ? data.emails : [];
          const website = res.ok && typeof data.website === 'string' ? data.website : prospect.website;
          const address = res.ok && typeof data.address === 'string' ? data.address : prospect.address;

          syncResultsSnapshot((prev) => {
            if (emails.length === 0) {
              return prev.filter((row) => getRowKey(row) !== rowKey);
            }

            return prev.map((row) =>
              getRowKey(row) === rowKey
                ? {
                    ...row,
                    website,
                    address,
                    emails,
                    status: 'enriched',
                  }
                : row
            );
          });
        } catch {
          syncResultsSnapshot((prev) => prev.filter((row) => getRowKey(row) !== rowKey));
        } finally {
          window.clearTimeout(timeoutId);
          activeEnrichmentsRef.current.delete(rowKey);
          pumpAutoEnrichmentQueue();
        }
      })();
    }
  };

  const saveLeadToDatabase = async (prospect: ProspectResult) => {
    const activeSearchSnapshot = activeSearchRef.current;
    const locationLabel = activeSearchSnapshot
      ? getSearchLocationLabel(activeSearchSnapshot)
      : '';
    const response = await fetch('/api/prospect/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        leadId: prospect.source_id,
        name: prospect.name,
        website: prospect.website,
        address: prospect.address,
        emails: prospect.emails,
        category: prospect.category,
        rating: prospect.rating,
        searchId: searchIdRef.current,
        searchQuery: activeSearchSnapshot?.query || activeQueryTermRef.current,
        locationLabel,
        source: prospect.source || 'google_maps',
      }),
    });
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(data?.error || 'Failed to save lead to database');
    }

    return data;
  };

  const convertProspectToCRM = async (prospect: ProspectResult) => {
    const response = await fetch('/api/leads/convert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        leadId: prospect.source_id,
        name: prospect.name,
        website: prospect.website,
        address: prospect.address,
        emails: prospect.emails,
      }),
    });
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(data?.error || 'Failed to save lead to CRM');
    }

    return data;
  };

  const pumpAutoSaveQueue = () => {
    while (
      activeAutoSavesRef.current.size < AUTO_SAVE_CONCURRENCY &&
      autoSaveQueueRef.current.length > 0
    ) {
      const prospect = autoSaveQueueRef.current.shift();
      if (!prospect) break;

      const rowKey = getRowKey(prospect);
      queuedAutoSavesRef.current.delete(rowKey);

      if (activeAutoSavesRef.current.has(rowKey) || prospect.status === 'saved') {
        continue;
      }

        activeAutoSavesRef.current.add(rowKey);

      void (async () => {
        try {
          const payload = await saveLeadToDatabase(prospect);
          const savedLeadId =
            typeof payload?.data?.lead_id === 'string' ? payload.data.lead_id : prospect.source_id;
          syncResultsSnapshot((prev) =>
            prev.map((row) =>
              getRowKey(row) === rowKey
                ? { ...row, source_id: savedLeadId, status: 'stored' }
                : row
            )
          );
        } catch (err: any) {
          setSearchError(err?.message || 'Failed to save lead to database');
        } finally {
          activeAutoSavesRef.current.delete(rowKey);
          pumpAutoSaveQueue();
        }
      })();
    }
  };

  const queueAutoSave = (rows: ProspectResult[]) => {
    const candidates = rows.filter((row) => {
      if (!shouldAutoSave(row)) return false;
      const rowKey = getRowKey(row);
      if (activeAutoSavesRef.current.has(rowKey) || queuedAutoSavesRef.current.has(rowKey)) {
        return false;
      }

      queuedAutoSavesRef.current.add(rowKey);
      return true;
    });

    if (candidates.length === 0) return;

    autoSaveQueueRef.current.push(...candidates);
    pumpAutoSaveQueue();
  };

  const queueAutoEnrichment = (rows: ProspectResult[]) => {
    const candidateRowKeys = new Set<string>();
    const freshCandidates = rows.filter((row) => {
      if (!shouldAutoEnrich(row)) return false;
      const rowKey = getRowKey(row);
      if (
        attemptedEnrichmentsRef.current.has(rowKey) ||
        activeEnrichmentsRef.current.has(rowKey) ||
        queuedEnrichmentsRef.current.has(rowKey) ||
        candidateRowKeys.has(rowKey)
      ) {
        return false;
      }

      candidateRowKeys.add(rowKey);
      attemptedEnrichmentsRef.current.add(rowKey);
      queuedEnrichmentsRef.current.add(rowKey);
      return true;
    });

    if (freshCandidates.length === 0) return;

    syncResultsSnapshot((prev) =>
      prev.map((row) =>
        candidateRowKeys.has(getRowKey(row)) && row.status !== 'enriching'
          ? { ...row, status: 'enriching' }
          : row
      )
    );
    autoEnrichQueueRef.current.push(...freshCandidates);
    pumpAutoEnrichmentQueue();
  };

  useEffect(() => {
    queueAutoSave(results);
  }, [results]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setSearchError('');

    if (!hasResolvedRole) {
      setSearchError('Loading your account search limit. Please wait a moment, then try again.');
      return;
    }

    const submittedSearch = createSearchContext();
    if (!submittedSearch.query || (!submittedSearch.location && !submittedSearch.city && !submittedSearch.country)) {
      setSearchError('Enter a business category and at least one location field before scraping.');
      return;
    }

    const startedAt = Date.now();
    setScrapeStepIndex(0);
    setSelectedRows(new Set());
    autoEnrichQueueRef.current = [];
    autoSaveQueueRef.current = [];
    activeEnrichmentsRef.current.clear();
    queuedEnrichmentsRef.current.clear();
    activeAutoSavesRef.current.clear();
    attemptedEnrichmentsRef.current.clear();
    queuedAutoSavesRef.current.clear();
    const searchStartSnapshot = buildSessionSnapshot({
      activeSearch: submittedSearch,
      activeQueryTerm: submittedSearch.query,
      queryVariantIndex: 0,
      searchId: null,
      currentPage: 1,
      hasMoreResults: false,
      lastScrapeSummary: '',
      results: resultsRef.current,
      isSearching: true,
      searchError: '',
    });
    if (searchStartSnapshot) {
      commitSessionSnapshot(searchStartSnapshot);
    }
    try {
      const url = buildSearchUrl(1, submittedSearch, submittedSearch.query);
      const res = await fetch(url);
      const data = await readJsonResponseSafely(res);
      
      if (res.ok) {
        const firstBatch = markRowsForAutoEnrichment(normalizeIncomingRows(data.data || []));
        const resultSourceLabel = formatProspectResultSourceLabel(data.resultSource);
        const completedSnapshot = buildSessionSnapshot({
          activeSearch: submittedSearch,
          activeQueryTerm: submittedSearch.query,
          queryVariantIndex: 0,
          searchId: data.searchId || null,
          currentPage: 1,
          hasMoreResults: Boolean(data.hasMore),
          lastScrapeSummary: `${resultSourceLabel}: ${data.count ?? data.data?.length ?? 0} businesses processed. Email lookup is running automatically.`,
          results: firstBatch,
          isSearching: false,
          searchError: '',
        });
        if (completedSnapshot) {
          commitSessionSnapshot(completedSnapshot, { resumeQueue: true });
          void fetchSearchHistory();
        }
      } else {
        const failedSnapshot = buildSessionSnapshot({
          activeSearch: submittedSearch,
          activeQueryTerm: submittedSearch.query,
          queryVariantIndex: 0,
          isSearching: false,
          searchError: parseApiError(data, 'Search failed'),
          lastScrapeSummary: 'Scraping failed. Please review the error and try again.',
        });
        if (failedSnapshot) {
          commitSessionSnapshot(failedSnapshot);
        }
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error && err.message
          ? err.message
          : 'Search request failed before the server could respond.';
      const failedSnapshot = buildSessionSnapshot({
        activeSearch: submittedSearch,
        activeQueryTerm: submittedSearch.query,
        queryVariantIndex: 0,
        isSearching: false,
        searchError: errorMessage,
        lastScrapeSummary: 'Scraping failed before the server returned a usable response.',
      });
      if (failedSnapshot) {
        commitSessionSnapshot(failedSnapshot);
      }
    } finally {
      const minVisibleMs = 1200;
      const elapsed = Date.now() - startedAt;
      if (elapsed < minVisibleMs) {
        await new Promise((resolve) => setTimeout(resolve, minVisibleMs - elapsed));
      }
      const settledSnapshot = buildSessionSnapshot({ isSearching: false });
      if (settledSnapshot) {
        commitSessionSnapshot(settledSnapshot);
      }
    }
  };

  const handleLoadMore = async () => {
    if (isLoadingMore || isSearching || !activeSearch) return;

    setIsLoadingMore(true);
    setSearchError('');
    try {
      const relatedQueries = buildRelatedQueries(activeSearch.query);
      let workingPage = hasMoreResults ? currentPage + 1 : 1;
      let workingQueryIndex = queryVariantIndex;
      let workingQueryTerm = hasMoreResults ? activeQueryTerm : relatedQueries[queryVariantIndex + 1] || activeQueryTerm;
      let workingSearchId = hasMoreResults ? searchId : null;
      let appendedRows: ProspectResult[] = [];
      let lastHasMore = hasMoreResults;
      let responseSearchId = searchId;
      let attempts = 0;
      let switchedQuery = false;

      while (attempts < 8 && workingQueryTerm) {
        attempts++;
        const url = buildSearchUrl(workingPage, activeSearch, workingQueryTerm, workingSearchId);
        const res = await fetch(url);
        const data = await readJsonResponseSafely(res);

        if (!res.ok) {
          setSearchError(parseApiError(data, 'Failed to load more results'));
          return;
        }

        const nextRows = markRowsForAutoEnrichment(normalizeIncomingRows(data.data || []));
        const unseenRows = nextRows.filter((row) =>
          !resultsRef.current.some((existingRow) => getProspectIdentity(existingRow) === getProspectIdentity(row))
        );
        const resultSourceLabel = formatProspectResultSourceLabel(data.resultSource);

        appendedRows = unseenRows;
        lastHasMore = Boolean(data.hasMore);
        responseSearchId = data.searchId || workingSearchId || null;

        if (unseenRows.length > 0) {
          const mergedResults = mergeUniqueRows(resultsRef.current, nextRows);
          const loadMoreSnapshot = buildSessionSnapshot({
            results: mergedResults,
            currentPage: workingPage,
            hasMoreResults: Boolean(data.hasMore),
            searchId: responseSearchId,
            activeQueryTerm: workingQueryTerm,
            queryVariantIndex: workingQueryIndex,
            lastScrapeSummary: switchedQuery
              ? `${resultSourceLabel}: loaded ${unseenRows.length} more businesses from a related Google Maps search for "${workingQueryTerm}". Email lookup is running automatically.`
              : `${resultSourceLabel}: loaded ${unseenRows.length} more businesses. Email lookup is running automatically.`,
            searchError: '',
          });
          if (loadMoreSnapshot) {
            commitSessionSnapshot(loadMoreSnapshot);
            void fetchSearchHistory();
          }
          queueAutoEnrichment(unseenRows);
          return;
        }

        if (data.hasMore) {
          workingPage += 1;
          workingSearchId = responseSearchId;
          continue;
        }

        if (workingQueryIndex < relatedQueries.length - 1) {
          workingQueryIndex += 1;
          workingQueryTerm = relatedQueries[workingQueryIndex];
          workingPage = 1;
          workingSearchId = null;
          switchedQuery = true;
          continue;
        }

        break;
      }

      const exhaustedSnapshot = buildSessionSnapshot({
        hasMoreResults: false,
        searchId: responseSearchId,
        activeQueryTerm: workingQueryTerm || activeQueryTermRef.current,
        queryVariantIndex: workingQueryIndex,
        lastScrapeSummary:
          appendedRows.length > 0
            ? `Loaded ${appendedRows.length} more businesses. Email lookup is running automatically.`
            : `No additional Google Maps businesses were found for "${activeSearch.query}".`,
        searchError: '',
      });
      if (exhaustedSnapshot) {
        commitSessionSnapshot(exhaustedSnapshot);
        void fetchSearchHistory();
      }
    } catch {
      setSearchError('Network error while loading more results.');
    } finally {
      setIsLoadingMore(false);
    }
  };

  const relatedQueries = activeSearch ? buildRelatedQueries(activeSearch.query) : [];
  const hasRelatedQueryFallback = queryVariantIndex < Math.max(relatedQueries.length - 1, 0);
  const canLoadMore = hasMoreResults || hasRelatedQueryFallback;
  const visibleResults = useMemo(
    () => dedupeRowsByRowKey(results.filter((row) => shouldDisplayProspect(row))),
    [results]
  );
  const categorySuggestions = Array.from(
    new Set([
      ...BUSINESS_CATEGORY_SUGGESTIONS,
      ...searchHistory.map((entry) => entry.category),
    ])
  ).slice(0, 12);
  const filteredCategorySuggestions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return categorySuggestions.slice(0, 8);

    const startsWithMatches = categorySuggestions.filter((suggestion) =>
      suggestion.toLowerCase().startsWith(normalizedQuery)
    );
    const containsMatches = categorySuggestions.filter(
      (suggestion) =>
        suggestion.toLowerCase().includes(normalizedQuery) &&
        !startsWithMatches.includes(suggestion)
    );

    return [...startsWithMatches, ...containsMatches].slice(0, 8);
  }, [categorySuggestions, query]);
  const filteredCountrySuggestions = useMemo(() => {
    const normalizedCountry = country.trim().toLowerCase();
    if (!normalizedCountry) return COUNTRY_SUGGESTIONS.slice(0, 10);

    const startsWithMatches = COUNTRY_SUGGESTIONS.filter((suggestion) =>
      suggestion.toLowerCase().startsWith(normalizedCountry)
    );
    const containsMatches = COUNTRY_SUGGESTIONS.filter(
      (suggestion) =>
        suggestion.toLowerCase().includes(normalizedCountry) &&
        !startsWithMatches.includes(suggestion)
    );

    return [...startsWithMatches, ...containsMatches].slice(0, 10);
  }, [country]);

  const handleRestoreHistory = async (entry: ProspectHistoryEntry) => {
    try {
      setSearchError('');
      const response = await fetch(`/api/prospect/history/${encodeURIComponent(entry.searchId)}`, {
        cache: 'no-store',
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setSearchError(parseApiError(data, 'Failed to restore saved search'));
        return;
      }

      const restoredSearch: ProspectSearchContext = {
        query: data?.data?.search?.query || entry.category,
        location: data?.data?.search?.location || entry.locationLabel,
        city: '',
        country: '',
      };
      const restoredRows = reviveStoredRows(data?.data?.leads || []);
      const restoredSnapshot = buildSessionSnapshot({
        activeSearch: restoredSearch,
        activeQueryTerm: restoredSearch.query,
        queryVariantIndex: 0,
        searchId: data?.data?.searchId || entry.searchId,
        currentPage: 1,
        hasMoreResults: false,
        lastScrapeSummary: `Restored ${restoredRows.length} saved leads from Supabase.`,
        results: restoredRows,
        isSearching: false,
        searchError: '',
      });

      if (restoredSnapshot) {
        commitSessionSnapshot(restoredSnapshot);
      }
    } catch {
      setSearchError('Failed to restore saved search from Supabase.');
    }
  };

  const handleCategorySuggestionSelect = (suggestion: string) => {
    setQuery(suggestion);
    setShowCategorySuggestions(false);
  };

  const handleCountrySuggestionSelect = (suggestion: string) => {
    setCountry(suggestion);
    setShowCountrySuggestions(false);
  };

  const markProspectsSaved = (savedRowKeys: string[]) => {
    if (savedRowKeys.length === 0) return;
    const savedRowKeySet = new Set(savedRowKeys);
    syncResultsSnapshot((prev) =>
      prev.map((row) =>
        savedRowKeySet.has(getRowKey(row))
          ? { ...row, status: 'saved' }
          : row
      )
    );
    setSelectedRows((prev) => {
      const next = new Set(prev);
      savedRowKeys.forEach((rowKey) => next.delete(rowKey));
      return next;
    });
  };

  const handleSaveToCRM = async (prospect: ProspectResult) => {
    try {
      const payload = await convertProspectToCRM(prospect);
      const savedContactCount =
        typeof payload?.data?.contactCount === 'number'
          ? payload.data.contactCount
          : prospect.emails.length;
      markProspectsSaved([getRowKey(prospect)]);
      setSearchError('');
      setLastScrapeSummary(
        savedContactCount > 1
          ? `Saved ${prospect.name} to CRM with ${savedContactCount} email contacts.`
          : `Saved ${prospect.name} to CRM.`
      );
    } catch (err: any) {
      setSearchError(err?.message || 'Failed to save lead to CRM');
    }
  };

  const handleSaveSelected = async () => {
    if (isSavingSelected) return;

    const prospectsToSave = results.filter((row) => {
      const rowKey = getRowKey(row);
      return (
        selectedRows.has(rowKey) &&
        row.status !== 'saved' &&
        row.emails.length > 0
      );
    });

    if (prospectsToSave.length === 0) {
      setSearchError('Select at least one generated lead with an email before saving.');
      return;
    }

    setIsSavingSelected(true);
    setSearchError('');

    const savedRowKeys: string[] = [];
    let failedCount = 0;
    let savedContactCount = 0;

    for (const prospect of prospectsToSave) {
      try {
        const payload = await convertProspectToCRM(prospect);
        savedRowKeys.push(getRowKey(prospect));
        savedContactCount +=
          typeof payload?.data?.contactCount === 'number'
            ? payload.data.contactCount
            : prospect.emails.length;
      } catch {
        failedCount++;
      }
    }

    markProspectsSaved(savedRowKeys);
    setLastScrapeSummary(
      failedCount > 0
        ? `Saved ${savedRowKeys.length} selected leads to CRM with ${savedContactCount} email contacts. ${failedCount} could not be saved.`
        : `Saved ${savedRowKeys.length} selected leads to CRM with ${savedContactCount} email contacts.`
    );
    if (failedCount > 0) {
      setSearchError(`${failedCount} selected lead${failedCount === 1 ? '' : 's'} could not be saved.`);
    }

    setIsSavingSelected(false);
  };

  const columns: ColumnDef<ProspectResult>[] = [
    {
      header: 'Business Name',
      accessorKey: 'name',
      cell: (row: ProspectResult) => (
        <div style={{ fontWeight: 500 }}>{row.name}</div>
      )
    },
    {
      header: 'Location',
      accessorKey: 'address',
      cell: (row: ProspectResult) => (
        <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', maxWidth: '250px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {row.address || 'Location unavailable'}
        </div>
      )
    },
    {
      header: 'Source',
      accessorKey: 'source',
      cell: (row: ProspectResult) => (
        <div style={{ 
          fontSize: '0.7rem', 
          fontWeight: 600, 
          textTransform: 'uppercase',
          padding: '2px 6px',
          borderRadius: '4px',
          backgroundColor: 'rgba(66, 133, 244, 0.1)',
          color: '#4285F4',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px'
        }}>
          Google Maps
          {row.rating && <span style={{ color: '#F4B400' }}>{String.fromCharCode(0x2605)} {row.rating}</span>}
        </div>
      )
    },
    {
      header: 'Contact Info',
      cell: (row: ProspectResult, idx: number) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {row.status === 'enriching' ? (
            <LookingIndicator />
          ) : row.emails.length > 0 ? (
            <div
              style={{ display: 'flex', gap: '4px', alignItems: 'center' }}
              title={row.emails.join(', ')}
            >
              <Mail size={14} style={{ color: 'var(--primary-color)' }} />
              <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>{row.emails[0]}</span>
              {row.emails.length > 1 && <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>+{row.emails.length - 1}</span>}
            </div>
          ) : row.website ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <a href={row.website} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--primary-color)', fontSize: '0.875rem' }}>
                <Globe size={14} /> Website
              </a>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                Queued for auto lookup
              </span>
            </div>
          ) : (
            <span style={{ fontSize: '0.875rem', color: 'var(--text-tertiary)' }}>No contact info</span>
          )}
        </div>
      )
    },
    {
      header: 'Action',
      cell: (row: ProspectResult, idx: number) => (
        <button 
          className="btn-primary" 
          style={{ padding: '6px 12px', fontSize: '0.75rem' }}
          disabled={row.status === 'saved' || (row.status !== 'enriched' && row.emails.length === 0)}
          onClick={() => handleSaveToCRM(row)}
        >
          {row.status === 'saved' ? 'Saved' : <><UserPlus size={14} /> Add to CRM</>}
        </button>
      )
    }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div>
        <h1 style={{ margin: '0 0 0.5rem 0' }}>Lead Prospecting</h1>
        <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
          Search Google Maps for businesses, then crawl their websites to find contact emails.
        </p>
      </div>

      <div className="glass-panel" style={{ padding: '2rem' }}>
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: '1.5', display: 'flex', flexDirection: 'column', gap: '0.5rem', minWidth: '240px' }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>BUSINESS CATEGORY</label>
            <div ref={categoryInputRef} style={{ position: 'relative' }}>
              <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
              <input 
                type="text" 
                placeholder="e.g. Software Companies" 
                className="input-field" 
                style={{ paddingLeft: '2.5rem', width: '100%' }}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setShowCategorySuggestions(true);
                }}
                onFocus={() => setShowCategorySuggestions(true)}
              />
              {showCategorySuggestions && filteredCategorySuggestions.length > 0 && (
                <div className="prospect-suggestions-dropdown">
                  {filteredCategorySuggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      className="prospect-suggestion-item"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleCategorySuggestionSelect(suggestion)}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div style={{ flex: '1', display: 'flex', flexDirection: 'column', gap: '0.5rem', minWidth: '150px' }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>CITY</label>
            <div style={{ position: 'relative' }}>
              <MapPin size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
              <input 
                type="text" 
                placeholder="e.g. Miami" 
                className="input-field" 
                style={{ paddingLeft: '2.5rem', width: '100%' }}
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />
            </div>
          </div>

          <div style={{ flex: '1', display: 'flex', flexDirection: 'column', gap: '0.5rem', minWidth: '150px' }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>COUNTRY</label>
            <div ref={countryInputRef} style={{ position: 'relative' }}>
              <Globe size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
              <input 
                type="text" 
                placeholder="e.g. USA" 
                className="input-field" 
                style={{ paddingLeft: '2.5rem', width: '100%' }}
                value={country}
                onChange={(e) => {
                  setCountry(e.target.value);
                  setShowCountrySuggestions(true);
                }}
                onFocus={() => setShowCountrySuggestions(true)}
              />
              {showCountrySuggestions && filteredCountrySuggestions.length > 0 && (
                <div className="prospect-suggestions-dropdown">
                  {filteredCountrySuggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      className="prospect-suggestion-item"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleCountrySuggestionSelect(suggestion)}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {!city && !country && (
            <div style={{ flex: '1.2', display: 'flex', flexDirection: 'column', gap: '0.5rem', minWidth: '180px' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>GENERAL LOCATION</label>
              <div style={{ position: 'relative' }}>
                <RefreshCw size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                <input 
                  type="text" 
                  placeholder="e.g. Southern California" 
                  className="input-field" 
                  style={{ paddingLeft: '2.5rem', width: '100%' }}
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            className="btn-primary"
            disabled={isSearching || !hasResolvedRole}
            style={{ height: '42px', minWidth: '150px' }}
          >
            {isSearching ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <span>Looking</span>
                <span className="looking-dots" aria-hidden="true">
                  {Array.from({ length: LOOKING_DOT_COUNT }, (_, index) => (
                    <span
                      key={index}
                      className="looking-dot"
                      style={{ animationDelay: `${index * 0.18}s` }}
                    >
                      .
                    </span>
                  ))}
                </span>
              </div>
            ) : !hasResolvedRole ? (
              'Loading...'
            ) : 'Discover Leads'}
          </button>
        </form>
        {searchError && (
          <p style={{ color: 'var(--error)', marginTop: '0.75rem', fontSize: '0.8rem' }}>{searchError}</p>
        )}
        {hasResolvedRole && (
          <p className="scrape-last-summary" style={{ marginTop: '0.5rem' }}>
            {isAdminUser
              ? 'Admin mode: up to 100 leads per search.'
              : 'User mode: up to 20 leads per search.'}
          </p>
        )}
        {isSearching && (
          <div className="prospect-inline-status">
            <LookingIndicator />
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              {SCRAPE_STEPS[scrapeStepIndex]}. Search keeps running even if you switch tabs or open another dashboard page.
            </span>
          </div>
        )}
        {!isSearching && lastScrapeSummary && (
          <p className="scrape-last-summary">{lastScrapeSummary}</p>
        )}
        {searchHistory.length > 0 && (
          <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Search History
              </span>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Saved automatically to Supabase for this workspace.
              </span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
              {searchHistory.map((entry) => (
                <button
                  key={entry.key}
                  type="button"
                  className="prospect-history-card"
                  onClick={() => handleRestoreHistory(entry)}
                >
                  <span className="prospect-history-title">{entry.category}</span>
                  <span className="prospect-history-meta">{entry.locationLabel}</span>
                  <span className="prospect-history-meta">
                    {entry.resultCount} saved leads
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {(visibleResults.length > 0 || activeSearch) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            {selectedRows.size > 0
              ? `${selectedRows.size} lead${selectedRows.size === 1 ? '' : 's'} selected`
              : 'Select leads with the checkboxes to save many at once'}
          </span>
          <button
            type="button"
            className="btn-primary"
            onClick={handleSaveSelected}
            disabled={isSavingSelected || selectedRows.size === 0}
            style={{ minWidth: '180px' }}
          >
            {isSavingSelected ? 'Saving Selected...' : 'Save Selected'}
          </button>
        </div>
      )}

      <DataTable 
        data={visibleResults} 
        columns={columns} 
        isLoading={false}
        maxVisibleRows={20}
        scrollViewportBottomOffset={110}
        getRowId={(row) => row.source_id || `${row.name}-${row.website || ''}-${row.address || ''}`}
        selectedRows={selectedRows}
        onSelectionChange={setSelectedRows}
      />

      {(visibleResults.length > 0 || activeSearch) && !isSearching && (
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <button
            className="btn-secondary"
            onClick={handleLoadMore}
            disabled={isLoadingMore || !canLoadMore}
            style={{ minWidth: '180px' }}
          >
            {isLoadingMore ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                <Loader2 size={16} className="animate-spin" />
                Loading More...
              </span>
            ) : (
              'Load More'
            )}
          </button>
        </div>
      )}
    </div>
  );
}
