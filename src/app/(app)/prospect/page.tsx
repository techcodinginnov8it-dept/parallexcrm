'use client';

import React, { useEffect, useState } from 'react';
import { Search, MapPin, Globe, Mail, UserPlus, Loader2, RefreshCw } from 'lucide-react';
import { DataTable, ColumnDef } from '@/components/ui/DataTable';

interface ProspectResult {
  source_id?: string;
  name: string;
  website: string | null;
  address: string | null;
  emails: string[];
  status: 'found' | 'enriching' | 'enriched' | 'saved';
  category?: string;
  source?: 'google_maps';
  rating?: string | null;
}

const SCRAPE_STEPS = [
  'Connecting to Google Maps',
  'Collecting businesses from map results',
  'Visiting business websites for contact emails',
];
const ITEMS_PER_PAGE = 20;

export default function ProspectingPage() {
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

  const buildSearchUrl = (page: number, existingSearchId?: string | null) => {
    let url =
      `/api/prospect/search?query=${encodeURIComponent(query)}` +
      `&page=${page}&limit=${ITEMS_PER_PAGE}`;
    if (city) url += `&city=${encodeURIComponent(city)}`;
    if (country) url += `&country=${encodeURIComponent(country)}`;
    if (!city && !country && location) url += `&location=${encodeURIComponent(location)}`;
    if (existingSearchId) url += `&searchId=${encodeURIComponent(existingSearchId)}`;
    return url;
  };

  const normalizeIncomingRows = (incoming: any[]): ProspectResult[] =>
    incoming.map((p: any) => ({
      ...p,
      status: 'found',
      emails: Array.isArray(p.emails) ? p.emails : [],
      source: 'google_maps',
    }));

  const mergeUniqueRows = (prev: ProspectResult[], incoming: ProspectResult[]) => {
    const seen = new Set(
      prev.map((r) => `${r.name}|${r.website || ''}|${r.address || ''}`)
    );
    const merged = [...prev];
    for (const row of incoming) {
      const key = `${row.name}|${row.website || ''}|${row.address || ''}`;
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(row);
      }
    }
    return merged;
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setSearchError('');
    if (!query || (!location && !city && !country)) {
      setSearchError('Enter a business category and at least one location field before scraping.');
      return;
    }

    const startedAt = Date.now();
    setLastScrapeSummary('');
    setScrapeStepIndex(0);
    setCurrentPage(1);
    setHasMoreResults(false);
    setSearchId(null);
    setIsSearching(true);
    try {
      const url = buildSearchUrl(1);
      const res = await fetch(url);
      const data = await res.json();
      
      if (res.ok) {
        const firstBatch = normalizeIncomingRows(data.data || []);
        setResults(firstBatch);
        setSearchId(data.searchId || null);
        setHasMoreResults(Boolean(data.hasMore));
        setCurrentPage(1);
        setLastScrapeSummary(`Scraping complete: ${data.count ?? data.data?.length ?? 0} businesses processed.`);
      } else {
        const errorMsg = data.details ? `${data.error}: ${data.details}` : data.error;
        setSearchError(errorMsg || 'Search failed');
        setLastScrapeSummary('Scraping failed. Please review the error and try again.');
      }
    } catch (err) {
      setSearchError('Network error during search');
      setLastScrapeSummary('Scraping failed due to a network issue.');
    } finally {
      const minVisibleMs = 1200;
      const elapsed = Date.now() - startedAt;
      if (elapsed < minVisibleMs) {
        await new Promise((resolve) => setTimeout(resolve, minVisibleMs - elapsed));
      }
      setIsSearching(false);
    }
  };

  const handleLoadMore = async () => {
    if (isLoadingMore || isSearching || !hasMoreResults) return;

    setIsLoadingMore(true);
    setSearchError('');
    try {
      const nextPage = currentPage + 1;
      const url = buildSearchUrl(nextPage, searchId);
      const res = await fetch(url);
      const data = await res.json();

      if (!res.ok) {
        const errorMsg = data.details ? `${data.error}: ${data.details}` : data.error;
        setSearchError(errorMsg || 'Failed to load more results');
        return;
      }

      const nextRows = normalizeIncomingRows(data.data || []);
      setResults((prev) => mergeUniqueRows(prev, nextRows));
      setCurrentPage(nextPage);
      setHasMoreResults(Boolean(data.hasMore));
      setLastScrapeSummary(
        nextRows.length > 0
          ? `Loaded ${nextRows.length} more businesses.`
          : 'No additional businesses found.'
      );
    } catch {
      setSearchError('Network error while loading more results.');
    } finally {
      setIsLoadingMore(false);
    }
  };

  const handleEnrich = async (prospect: ProspectResult, index: number) => {
    if (!prospect.website) return;

    const newResults = [...results];
    newResults[index].status = 'enriching';
    setResults(newResults);

    try {
      const res = await fetch('/api/prospect/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: prospect.website, name: prospect.name }),
      });
      const data = await res.json();

      if (res.ok) {
        newResults[index].emails = data.emails;
        newResults[index].status = 'enriched';
      } else {
        newResults[index].status = 'found';
      }
      setResults([...newResults]);
    } catch (err) {
      newResults[index].status = 'found';
      setResults([...newResults]);
    }
  };

  const handleSaveToCRM = async (prospect: ProspectResult, index: number) => {
    // Logic to save as both Company and Contact
    try {
      // 1. Save/Upsert Company
      const companyRes = await fetch('/api/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: prospect.name,
          domain: prospect.website ? new URL(prospect.website).hostname : prospect.name.toLowerCase().replace(/\s+/g, '') + '.com',
          website_url: prospect.website,
        }),
      });
      const companyData = await companyRes.json();

      if (!companyRes.ok) throw new Error('Failed to save company');

      // 2. Save Contact (if emails found)
      const email = prospect.emails[0] || 'unknown@' + companyData.data.domain;
      const contactRes = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: prospect.name.split(' ')[0],
          last_name: prospect.name.split(' ').slice(1).join(' ') || 'Lead',
          email,
          company_id: companyData.data.id,
          title: 'Prospect',
        }),
      });

      if (contactRes.ok) {
        const newResults = [...results];
        newResults[index].status = 'saved';
        setResults([...newResults]);
      }
    } catch (err) {
      alert('Failed to save lead to CRM');
    }
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
              <Loader2 size={16} className="animate-spin" /> Scraping...
            </div>
          ) : row.emails.length > 0 ? (
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
              <Mail size={14} style={{ color: 'var(--primary-color)' }} />
              <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>{row.emails[0]}</span>
              {row.emails.length > 1 && <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>+{row.emails.length - 1}</span>}
            </div>
          ) : row.website ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <a href={row.website} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--primary-color)', fontSize: '0.875rem' }}>
                <Globe size={14} /> Website
              </a>
              <button 
                className="btn-secondary" 
                style={{ padding: '2px 6px', fontSize: '0.7rem', height: 'auto' }}
                onClick={() => handleEnrich(row, idx)}
              >
                Find Email
              </button>
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
          onClick={() => handleSaveToCRM(row, idx)}
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
            <div style={{ position: 'relative' }}>
              <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
              <input 
                type="text" 
                placeholder="e.g. Software Companies" 
                className="input-field" 
                style={{ paddingLeft: '2.5rem', width: '100%' }}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
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
            <div style={{ position: 'relative' }}>
              <Globe size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
              <input 
                type="text" 
                placeholder="e.g. USA" 
                className="input-field" 
                style={{ paddingLeft: '2.5rem', width: '100%' }}
                value={country}
                onChange={(e) => setCountry(e.target.value)}
              />
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

          <button type="submit" className="btn-primary" disabled={isSearching} style={{ height: '42px', minWidth: '150px' }}>
            {isSearching ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Loader2 className="animate-spin" size={18} />
                <span>Navigating Maps...</span>
              </div>
            ) : 'Discover Leads'}
          </button>
        </form>
        {searchError && (
          <p style={{ color: 'var(--error)', marginTop: '0.75rem', fontSize: '0.8rem' }}>{searchError}</p>
        )}
        {!isSearching && lastScrapeSummary && (
          <p className="scrape-last-summary">{lastScrapeSummary}</p>
        )}
      </div>

      {isSearching && (
        <div className="scrape-loading-overlay" role="status" aria-live="polite">
          <div className="scrape-loading-card">
            <div className="scrape-status-row">
              <div className="scrape-spinner" aria-hidden="true" />
              <div>
                <p className="scrape-status-title">Scraping Google Maps and business websites...</p>
                <p className="scrape-status-subtitle">{SCRAPE_STEPS[scrapeStepIndex]}</p>
              </div>
            </div>
            <div className="scrape-status-bar">
              <span className="scrape-status-bar-fill" />
            </div>
          </div>
        </div>
      )}

      <DataTable 
        data={results} 
        columns={columns} 
        isLoading={isSearching}
        getRowId={(row) => row.source_id || `${row.name}-${row.website || ''}-${row.address || ''}`}
      />

      {hasMoreResults && !isSearching && (
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <button
            className="btn-secondary"
            onClick={handleLoadMore}
            disabled={isLoadingMore}
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
