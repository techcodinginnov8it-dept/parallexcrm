'use client';

import React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ArrowDown, ArrowUp } from 'lucide-react';

export interface ColumnDef<T> {
  header: string;
  accessorKey?: keyof T;
  cell?: (item: T, index: number) => React.ReactNode;
  sortable?: boolean;
}

interface PaginationState {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  isLoading?: boolean;
  maxVisibleRows?: number;
  pagination?: PaginationState;
  onPageChange?: (page: number) => void;
  onLimitChange?: (limit: number) => void;
  sortConfig?: { key: keyof T | null; direction: 'asc' | 'desc' };
  onSort?: (key: keyof T) => void;
  selectedRows?: Set<string>;
  onSelectionChange?: (selected: Set<string>) => void;
  getRowId: (row: T) => string;
}

export function DataTable<T>({
  data,
  columns,
  isLoading = false,
  maxVisibleRows,
  pagination,
  onPageChange,
  onLimitChange,
  sortConfig,
  onSort,
  selectedRows = new Set(),
  onSelectionChange,
  getRowId
}: DataTableProps<T>) {
  
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!onSelectionChange) return;
    if (e.target.checked) {
      const newSet = new Set(selectedRows);
      data.forEach(row => newSet.add(getRowId(row)));
      onSelectionChange(newSet);
    } else {
      const newSet = new Set(selectedRows);
      data.forEach(row => newSet.delete(getRowId(row)));
      onSelectionChange(newSet);
    }
  };

  const handleSelectRow = (rId: string, checked: boolean) => {
    if (!onSelectionChange) return;
    const newSet = new Set(selectedRows);
    if (checked) newSet.add(rId);
    else newSet.delete(rId);
    onSelectionChange(newSet);
  };

  const shouldScroll = Boolean(maxVisibleRows && data.length > maxVisibleRows);
  const estimatedHeaderHeight = 48;
  const estimatedRowHeight = 56;
  const maxTableHeight =
    shouldScroll && maxVisibleRows
      ? `${estimatedHeaderHeight + (maxVisibleRows * estimatedRowHeight)}px`
      : undefined;

  return (
    <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div
        style={{
          overflowX: 'auto',
          overflowY: shouldScroll ? 'auto' : 'visible',
          maxHeight: maxTableHeight,
        }}
      >
        <table className="data-table">
          <thead>
            <tr>
              {onSelectionChange && (
                <th
                  style={{
                    width: '40px',
                    textAlign: 'center',
                    position: shouldScroll ? 'sticky' : 'static',
                    top: 0,
                    zIndex: shouldScroll ? 2 : 'auto',
                    background: shouldScroll ? 'var(--bg-surface)' : undefined,
                  }}
                >
                  <input 
                    type="checkbox" 
                    onChange={handleSelectAll} 
                    checked={data.length > 0 && data.every(r => selectedRows.has(getRowId(r)))} 
                  />
                </th>
              )}
              {columns.map((col, idx) => (
                <th 
                  key={idx} 
                  onClick={() => col.sortable && col.accessorKey && onSort?.(col.accessorKey)}
                  style={{
                    cursor: col.sortable ? 'pointer' : 'default',
                    position: shouldScroll ? 'sticky' : 'static',
                    top: 0,
                    zIndex: shouldScroll ? 2 : 'auto',
                    background: shouldScroll ? 'var(--bg-surface)' : undefined,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {col.header}
                    {col.sortable && sortConfig?.key === col.accessorKey && (
                      sortConfig?.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={columns.length + (onSelectionChange ? 1 : 0)} style={{ textAlign: 'center', padding: '2rem' }}>
                  Loading data...
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (onSelectionChange ? 1 : 0)} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
                  No records found.
                </td>
              </tr>
            ) : (
              data.map((row, rowIdx) => {
                const rId = getRowId(row);
                return (
                  <tr key={rId} className={selectedRows.has(rId) ? 'selected' : ''}>
                    {onSelectionChange && (
                      <td style={{ textAlign: 'center' }}>
                        <input 
                          type="checkbox" 
                          checked={selectedRows.has(rId)} 
                          onChange={(e) => handleSelectRow(rId, e.target.checked)} 
                        />
                      </td>
                    )}
                    {columns.map((col, colIdx) => (
                      <td key={colIdx}>
                        {col.cell ? col.cell(row, rowIdx) : col.accessorKey ? String((row as any)[col.accessorKey] || '') : null}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {pagination && (
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          padding: '1rem 1.5rem',
          borderTop: '1px solid var(--border-color)',
          background: 'rgba(255, 255, 255, 0.02)'
        }}>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            Showing {((pagination.page - 1) * pagination.limit) + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} entries
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <select 
              className="input-field" 
              style={{ width: 'auto', padding: '0.25rem 0.5rem' }}
              value={pagination.limit}
              onChange={(e) => onLimitChange?.(Number(e.target.value))}
            >
              {[10, 25, 50, 100].map(size => (
                <option key={size} value={size}>Show {size}</option>
              ))}
            </select>

            <div style={{ display: 'flex', gap: '0.25rem' }}>
              <button 
                className="btn-secondary" 
                style={{ padding: '0.25rem' }} 
                disabled={pagination.page <= 1}
                onClick={() => onPageChange?.(1)}
              >
                <ChevronsLeft size={16} />
              </button>
              <button 
                className="btn-secondary" 
                style={{ padding: '0.25rem' }} 
                disabled={pagination.page <= 1}
                onClick={() => onPageChange?.(pagination.page - 1)}
              >
                <ChevronLeft size={16} />
              </button>
              <span style={{ padding: '0.25rem 0.75rem', fontSize: '0.875rem', display: 'flex', alignItems: 'center' }}>
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <button 
                className="btn-secondary" 
                style={{ padding: '0.25rem' }} 
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => onPageChange?.(pagination.page + 1)}
              >
                <ChevronRight size={16} />
              </button>
              <button 
                className="btn-secondary" 
                style={{ padding: '0.25rem' }} 
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => onPageChange?.(pagination.totalPages)}
              >
                <ChevronsRight size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
