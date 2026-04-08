'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { CheckCircle2, Clock3, Search } from 'lucide-react';

type TaskRow = {
  id: string;
  title: string;
  description: string;
  status: 'open' | 'completed';
  dueAt: string | null;
  completedAt: string | null;
  sourceType: string;
  sequenceId: string | null;
  sequenceName: string | null;
  contactName: string | null;
  contactEmail: string | null;
  createdAt: string;
  metadata: Record<string, unknown>;
};

type TasksResponse = {
  data: TaskRow[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  summary: {
    openTasks: number;
    completedTasks: number;
  };
};

const fetcher = async (url: string): Promise<TasksResponse> => {
  const response = await fetch(url);
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'Failed to load tasks.');
  return payload as TasksResponse;
};

function formatDate(value: string | null) {
  if (!value) return 'No date';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

export default function TasksClient() {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [notice, setNotice] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [actingTaskId, setActingTaskId] = useState<string | null>(null);

  const query = useMemo(() => {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
      search,
      status: statusFilter,
    });
    return params.toString();
  }, [limit, page, search, statusFilter]);

  const { data, error, isLoading, mutate } = useSWR(`/api/tasks?${query}`, fetcher, {
    keepPreviousData: true,
    revalidateOnFocus: false,
  });

  const tasks = data?.data || [];
  const summary = data?.summary || { openTasks: 0, completedTasks: 0 };
  const pagination = data?.meta || { total: 0, page: 1, limit: 25, totalPages: 1 };

  const handleTaskAction = async (taskId: string, action: 'complete' | 'reopen') => {
    setActingTaskId(taskId);
    setNotice('');
    setErrorMessage('');

    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'Failed to update task.');

      setNotice(action === 'complete' ? 'Task completed.' : 'Task reopened.');
      await mutate(payload as TasksResponse, false);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to update task.');
    } finally {
      setActingTaskId(null);
    }
  };

  return (
    <div className="page-container" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div className="page-header" style={{ marginBottom: 0, alignItems: 'flex-start' }}>
        <div>
          <h1 className="page-title">Tasks</h1>
          <p className="page-subtitle">
            Sequence-generated manual work like calls, LinkedIn touches, and manual emails lands here.
          </p>
        </div>
      </div>

      <div className="metric-grid" style={{ marginBottom: 0 }}>
        <div className="metric-card">
          <div className="metric-label">Open Tasks</div>
          <div className="metric-value">{summary.openTasks}</div>
          <div className="metric-trend metric-trend-up"><Clock3 size={14} /> Ready to work</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Completed Tasks</div>
          <div className="metric-value">{summary.completedTasks}</div>
          <div className="metric-trend metric-trend-up"><CheckCircle2 size={14} /> Logged by the runner</div>
        </div>
      </div>

      {(notice || errorMessage || error) && (
        <div
          className="card"
          style={{
            padding: '0.9rem 1rem',
            borderColor: errorMessage || error ? 'var(--error)' : 'var(--success)',
            color: errorMessage || error ? 'var(--error)' : 'var(--success)',
          }}
        >
          {errorMessage || error?.message || notice}
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <div className="card-title">Task Queue</div>
        </div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: '1 1 260px' }}>
              <Search size={16} style={{ position: 'absolute', left: '0.8rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                className="form-input"
                style={{ paddingLeft: '2.3rem' }}
                placeholder="Search tasks..."
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
              />
            </div>
            <select
              className="form-input"
              style={{ width: '150px' }}
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value);
                setPage(1);
              }}
            >
              <option value="all">All tasks</option>
              <option value="open">Open</option>
              <option value="completed">Completed</option>
            </select>
          </div>

          {isLoading ? (
            <div style={{ color: 'var(--text-secondary)' }}>Loading tasks...</div>
          ) : tasks.length === 0 ? (
            <div style={{ color: 'var(--text-secondary)' }}>No tasks found for this filter.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {tasks.map((task) => {
                const busy = actingTaskId === task.id;
                return (
                  <div
                    key={task.id}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--bg-elevated)',
                      padding: '1rem',
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: '1rem',
                      flexWrap: 'wrap',
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <div style={{ fontWeight: 600 }}>{task.title}</div>
                        <span className={task.status === 'completed' ? 'badge badge-info' : 'badge badge-warning'}>
                          {task.status}
                        </span>
                      </div>
                      <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', marginTop: '0.25rem' }}>
                        {task.contactName || 'Unknown contact'} {task.contactEmail ? `• ${task.contactEmail}` : ''}
                        {task.sequenceName ? ` • ${task.sequenceName}` : ''}
                      </div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.76rem', marginTop: '0.45rem' }}>
                        Due: {formatDate(task.dueAt)} • Created: {formatDate(task.createdAt)}
                        {task.completedAt ? ` • Completed: ${formatDate(task.completedAt)}` : ''}
                      </div>
                      {task.description && (
                        <div style={{ color: 'var(--text-primary)', fontSize: '0.82rem', marginTop: '0.55rem' }}>
                          {task.description}
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      {task.status === 'open' ? (
                        <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => handleTaskAction(task.id, 'complete')}>
                          <CheckCircle2 size={14} /> Complete
                        </button>
                      ) : (
                        <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => handleTaskAction(task.id, 'reopen')}>
                          Reopen
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
              Page {pagination.page} of {pagination.totalPages}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <select
                className="form-input"
                style={{ width: '110px' }}
                value={limit}
                onChange={(event) => {
                  setLimit(Number(event.target.value));
                  setPage(1);
                }}
              >
                {[10, 25, 50].map((size) => (
                  <option key={size} value={size}>Show {size}</option>
                ))}
              </select>
              <button className="btn btn-secondary btn-sm" disabled={pagination.page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>
                Prev
              </button>
              <button className="btn btn-secondary btn-sm" disabled={pagination.page >= pagination.totalPages} onClick={() => setPage((current) => current + 1)}>
                Next
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
