'use client';

import React, { useState } from 'react';
import useSWR from 'swr';
import { Plus, Search, Building2 } from 'lucide-react';
import { DataTable, ColumnDef } from '@/components/ui/DataTable';

const fetcher = (url: string) => fetch(url).then(res => res.json());

export function CompaniesClient() {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [search, setSearch] = useState('');
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());

  const { data, error, isLoading } = useSWR(
    `/api/companies?page=${page}&limit=${limit}&search=${encodeURIComponent(search)}`,
    fetcher,
    { keepPreviousData: true }
  );

  const companies = data?.data || [];
  const pagination = data?.meta || { page: 1, limit: 25, total: 0, totalPages: 1 };

  const columns: ColumnDef<any>[] = [
    {
      header: 'Company Name',
      accessorKey: 'name',
      sortable: true,
      cell: (row) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ 
            width: '32px', height: '32px', borderRadius: '4px', 
            background: 'var(--bg-elevated)', color: 'var(--text-secondary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Building2 size={16} />
          </div>
          <div>
            <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
              {row.name}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              {row.domain}
            </div>
          </div>
        </div>
      )
    },
    {
      header: 'Industry',
      accessorKey: 'industry',
      sortable: true,
      cell: (row) => <span style={{ color: 'var(--text-secondary)' }}>{row.industry || '-'}</span>
    },
    {
      header: 'Employees',
      accessorKey: 'employee_count',
      sortable: true,
      cell: (row) => <span style={{ color: 'var(--text-secondary)' }}>{row.employee_count?.toLocaleString() || '-'}</span>
    },
    {
      header: 'Headquarters',
      accessorKey: 'city',
      cell: (row) => (
        <span style={{ color: 'var(--text-secondary)' }}>
          {row.city ? `${row.city}, ${row.state}` : '-'}
        </span>
      )
    }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ position: 'relative', width: '300px' }}>
          <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
          <input 
            type="text" 
            placeholder="Search companies..." 
            className="input-field" 
            style={{ paddingLeft: '2.5rem', width: '100%' }}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Plus size={16} /> New Company
          </button>
        </div>
      </div>

      <DataTable 
        data={companies} 
        columns={columns} 
        isLoading={isLoading}
        pagination={pagination}
        onPageChange={setPage}
        onLimitChange={(newLimit) => { setLimit(newLimit); setPage(1); }}
        getRowId={(row) => row.id}
        selectedRows={selectedRows}
        onSelectionChange={setSelectedRows}
      />
    </div>
  );
}
