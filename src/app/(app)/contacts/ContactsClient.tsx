'use client';

import React, { useState } from 'react';
import useSWR from 'swr';
import { Download, Plus, Search, Upload } from 'lucide-react';
import { DataTable, ColumnDef } from '@/components/ui/DataTable';
import { ImportModal } from '@/components/contacts/ImportModal';

const fetcher = (url: string) => fetch(url).then(res => res.json());

export function ContactsClient() {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [search, setSearch] = useState('');
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  const { data, error, isLoading, mutate } = useSWR(
    `/api/contacts?page=${page}&limit=${limit}&search=${encodeURIComponent(search)}`,
    fetcher,
    { keepPreviousData: true }
  );

  const contacts = data?.data || [];
  const pagination = data?.meta || { page: 1, limit: 25, total: 0, totalPages: 1 };

  const columns: ColumnDef<any>[] = [
    {
      header: 'Name',
      accessorKey: 'first_name',
      sortable: true,
      cell: (row) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ 
            width: '32px', height: '32px', borderRadius: '50%', 
            background: 'var(--primary-color)', color: 'white',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 500, fontSize: '0.875rem'
          }}>
            {row.first_name?.[0]}{row.last_name?.[0]}
          </div>
          <div>
            <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
              {row.first_name} {row.last_name}
            </div>
          </div>
        </div>
      )
    },
    {
      header: 'Title',
      accessorKey: 'title',
      sortable: true,
      cell: (row) => <span style={{ color: 'var(--text-secondary)' }}>{row.title || '-'}</span>
    },
    {
      header: 'Company',
      accessorKey: 'company_id',
      cell: (row) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {row.company?.name || '-'}
        </div>
      )
    },
    {
      header: 'Email',
      accessorKey: 'email',
      cell: (row) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {row.email}
          {row.email && (
            <span style={{ 
              padding: '2px 6px', borderRadius: '4px', fontSize: '0.65rem',
              background: 'rgba(34, 197, 94, 0.1)', color: '#22c55e'
            }}>
              Verified
            </span>
          )}
        </div>
      )
    },
    {
      header: 'Direct Phone',
      accessorKey: 'phone_direct',
      cell: (row) => <span style={{ color: 'var(--text-secondary)' }}>{row.phone_direct || '-'}</span>
    },
    {
      header: 'Stage',
      accessorKey: 'stage',
      cell: (row) => (
        <span style={{ 
          padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 500,
          background: 'var(--bg-elevated)', color: 'var(--text-secondary)', textTransform: 'capitalize' 
        }}>
          {row.stage}
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
            placeholder="Search contacts..." 
            className="input-field" 
            style={{ paddingLeft: '2.5rem', width: '100%' }}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1); // Reset page on search
            }}
          />
        </div>
        
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }} onClick={() => setIsImportModalOpen(true)}>
            <Upload size={16} /> Import
          </button>
          <button className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Download size={16} /> Export
          </button>
          <button className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Plus size={16} /> New Contact
          </button>
        </div>
      </div>

      <DataTable 
        data={contacts} 
        columns={columns} 
        isLoading={isLoading}
        pagination={pagination}
        onPageChange={setPage}
        onLimitChange={(newLimit) => { setLimit(newLimit); setPage(1); }}
        getRowId={(row) => row.id}
        selectedRows={selectedRows}
        onSelectionChange={setSelectedRows}
      />

      <ImportModal 
        isOpen={isImportModalOpen} 
        onClose={() => setIsImportModalOpen(false)} 
        onImportComplete={() => { mutate(); }} 
      />
    </div>
  );
}
