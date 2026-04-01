'use client';

import React, { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { Building2, Globe, Mail, Search, Tag, UserPlus } from 'lucide-react';
import { DataTable, ColumnDef } from '@/components/ui/DataTable';

type LeadRow = {
  id: string;
  name: string;
  website: string | null;
  address: string | null;
  emails: string[];
  status: 'found' | 'enriching' | 'enriched' | 'stored' | 'saved' | 'unavailable';
  category: string | null;
  source: string;
  rating: string | null;
  business_query: string | null;
  business_tags: string[];
  general_business_tag: string | null;
  location_label: string | null;
  created_at: string;
};

type LeadsResponse = {
  data: LeadRow[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  filters: {
    availableStatuses: string[];
    availableTags: string[];
  };
};

const DEFAULT_LIMIT = 25;
const ADMIN_LIMIT = 100;

const fetcher = async (url: string): Promise<LeadsResponse> => {
  const response = await fetch(url);
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.error || 'Failed to fetch leads');
  }

  return data as LeadsResponse;
};

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function getStatusStyles(status: LeadRow['status']) {
  switch (status) {
    case 'saved':
      return {
        background: 'rgba(34, 197, 94, 0.12)',
        color: '#22c55e',
      };
    case 'stored':
      return {
        background: 'rgba(59, 130, 246, 0.12)',
        color: '#60a5fa',
      };
    case 'enriched':
      return {
        background: 'rgba(16, 185, 129, 0.12)',
        color: '#34d399',
      };
    case 'enriching':
      return {
        background: 'rgba(245, 158, 11, 0.12)',
        color: '#fbbf24',
      };
    case 'unavailable':
      return {
        background: 'rgba(239, 68, 68, 0.12)',
        color: '#f87171',
      };
    default:
      return {
        background: 'rgba(148, 163, 184, 0.12)',
        color: 'var(--text-secondary)',
      };
  }
}

export function LeadsClient() {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(DEFAULT_LIMIT);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [tagFilter, setTagFilter] = useState('all');
  const [actionError, setActionError] = useState('');
  const [actionNotice, setActionNotice] = useState('');
  const [savingLeadIds, setSavingLeadIds] = useState<Set<string>>(new Set());
  const [isCleaningNoEmailLeads, setIsCleaningNoEmailLeads] = useState(false);
  const [hasResolvedRole, setHasResolvedRole] = useState(false);
  const [isAdminUser, setIsAdminUser] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch('/api/user/me');
        const payload = await response.json().catch(() => null);
        const nextIsAdmin = Boolean(response.ok && payload?.data?.role === 'admin');

        if (cancelled) return;

        setIsAdminUser(nextIsAdmin);
        setLimit(nextIsAdmin ? ADMIN_LIMIT : DEFAULT_LIMIT);
        setHasResolvedRole(true);
      } catch {
        if (cancelled) return;

        setIsAdminUser(false);
        setLimit(DEFAULT_LIMIT);
        setHasResolvedRole(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const queryString = useMemo(() => {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
      search,
      status: statusFilter,
      tag: tagFilter,
    });

    return params.toString();
  }, [limit, page, search, statusFilter, tagFilter]);

  const { data, error, isLoading, mutate } = useSWR(
    hasResolvedRole ? `/api/leads?${queryString}` : null,
    fetcher,
    { keepPreviousData: true }
  );

  const leads = data?.data || [];
  const pagination = data?.meta || { page: 1, limit: 25, total: 0, totalPages: 1 };
  const availableStatuses = data?.filters?.availableStatuses || [];
  const availableTags = data?.filters?.availableTags || [];

  const handleAddToCRM = async (lead: LeadRow) => {
    if (savingLeadIds.has(lead.id) || lead.status === 'saved' || lead.emails.length === 0) {
      return;
    }

    setActionError('');
    setActionNotice('');
    setSavingLeadIds((prev) => new Set(prev).add(lead.id));

    try {
      const response = await fetch('/api/leads/convert', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          leadId: lead.id,
          name: lead.name,
          website: lead.website,
          address: lead.address,
          emails: lead.emails,
        }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to add lead to CRM');
      }

      await mutate();
      const savedContactCount =
        typeof payload?.data?.contactCount === 'number'
          ? payload.data.contactCount
          : lead.emails.length;
      setActionNotice(
        savedContactCount > 1
          ? `${lead.name} was added to CRM with ${savedContactCount} email contacts.`
          : `${lead.name} was added to CRM.`
      );
    } catch (err: any) {
      setActionError(err?.message || 'Failed to add lead to CRM');
    } finally {
      setSavingLeadIds((prev) => {
        const next = new Set(prev);
        next.delete(lead.id);
        return next;
      });
    }
  };

  const handleCleanNoEmailLeads = async () => {
    if (!isAdminUser || isCleaningNoEmailLeads) return;

    const confirmed = window.confirm(
      'Delete old no-email leads from this workspace? This removes low-value leads from Supabase.'
    );
    if (!confirmed) return;

    setActionError('');
    setActionNotice('');
    setIsCleaningNoEmailLeads(true);

    try {
      const response = await fetch('/api/leads/cleanup', {
        method: 'POST',
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to clean no-email leads');
      }

      await mutate();
      setActionNotice(`Removed ${payload?.deletedCount ?? 0} no-email leads from Supabase.`);
    } catch (err: any) {
      setActionError(err?.message || 'Failed to clean no-email leads');
    } finally {
      setIsCleaningNoEmailLeads(false);
    }
  };

  const columns: ColumnDef<LeadRow>[] = [
    {
      header: 'Business Name',
      accessorKey: 'name',
      sortable: true,
      cell: (row) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '4px',
              background: 'var(--bg-elevated)',
              color: 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Building2 size={16} />
          </div>
          <div>
            <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{row.name}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              {row.website || row.category || 'Lead'}
            </div>
          </div>
        </div>
      ),
    },
    {
      header: 'Website',
      accessorKey: 'website',
      cell: (row) =>
        row.website ? (
          <a
            href={row.website}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', color: 'var(--primary-color)' }}
          >
            <Globe size={14} />
            <span style={{ maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {row.website}
            </span>
          </a>
        ) : (
          <span style={{ color: 'var(--text-tertiary)' }}>No website</span>
        ),
    },
    {
      header: 'Location',
      accessorKey: 'location_label',
      cell: (row) => (
        <span style={{ color: 'var(--text-secondary)' }}>
          {row.location_label || row.address || 'General location'}
        </span>
      ),
    },
    {
      header: 'Email / Count',
      cell: (row) =>
        row.emails.length > 0 ? (
          <div
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            title={row.emails.join(', ')}
          >
            <Mail size={14} style={{ color: 'var(--primary-color)' }} />
            <span style={{ fontWeight: 500 }}>{row.emails[0]}</span>
            {row.emails.length > 1 && (
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                +{row.emails.length - 1}
              </span>
            )}
          </div>
        ) : (
          <span style={{ color: 'var(--text-tertiary)' }}>No email found</span>
        ),
    },
    {
      header: 'Status',
      accessorKey: 'status',
      sortable: true,
      cell: (row) => {
        const styles = getStatusStyles(row.status);
        return (
          <span
            style={{
              padding: '4px 8px',
              borderRadius: '999px',
              fontSize: '0.75rem',
              fontWeight: 600,
              textTransform: 'capitalize',
              ...styles,
            }}
          >
            {row.status}
          </span>
        );
      },
    },
    {
      header: 'General Tag',
      accessorKey: 'general_business_tag',
      cell: (row) =>
        row.general_business_tag ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-secondary)' }}>
            <Tag size={14} />
            {row.general_business_tag}
          </span>
        ) : (
          <span style={{ color: 'var(--text-tertiary)' }}>Uncategorized</span>
        ),
    },
    {
      header: 'Search Query',
      accessorKey: 'business_query',
      cell: (row) => <span style={{ color: 'var(--text-secondary)' }}>{row.business_query || '-'}</span>,
    },
    {
      header: 'Created At',
      accessorKey: 'created_at',
      sortable: true,
      cell: (row) => <span style={{ color: 'var(--text-secondary)' }}>{formatDate(row.created_at)}</span>,
    },
    {
      header: 'Action',
      cell: (row) => (
        <button
          className="btn-primary"
          style={{ padding: '6px 12px', fontSize: '0.75rem' }}
          disabled={row.status === 'saved' || row.emails.length === 0 || savingLeadIds.has(row.id)}
          onClick={() => handleAddToCRM(row)}
        >
          {row.status === 'saved' ? 'Saved' : savingLeadIds.has(row.id) ? 'Saving...' : <><UserPlus size={14} /> Add to CRM</>}
        </button>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ position: 'relative', width: '300px' }}>
          <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
          <input
            type="text"
            placeholder="Search leads..."
            className="input-field"
            style={{ paddingLeft: '2.5rem', width: '100%' }}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <select
            className="input-field"
            style={{ minWidth: '160px' }}
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">All statuses</option>
            {availableStatuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>

          <select
            className="input-field"
            style={{ minWidth: '180px' }}
            value={tagFilter}
            onChange={(e) => {
              setTagFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">All tags</option>
            {availableTags.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>

          {isAdminUser && (
            <button
              className="btn-secondary"
              type="button"
              disabled={isCleaningNoEmailLeads}
              onClick={handleCleanNoEmailLeads}
            >
              {isCleaningNoEmailLeads ? 'Cleaning...' : 'Clean No-Email Leads'}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div style={{ color: '#f87171', fontSize: '0.875rem' }}>
          {error.message}
        </div>
      )}

      {actionError && (
        <div style={{ color: '#f87171', fontSize: '0.875rem' }}>
          {actionError}
        </div>
      )}

      {actionNotice && (
        <div style={{ color: '#60a5fa', fontSize: '0.875rem' }}>
          {actionNotice}
        </div>
      )}

      <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
        {isAdminUser
          ? 'Admin mode: showing up to 100 leads per page.'
          : 'User mode: showing up to 25 leads per page.'}
      </div>

      <DataTable
        data={leads}
        columns={columns}
        isLoading={isLoading}
        pagination={pagination}
        onPageChange={setPage}
        onLimitChange={(newLimit) => {
          setLimit(newLimit);
          setPage(1);
        }}
        getRowId={(row) => row.id}
      />
    </div>
  );
}
