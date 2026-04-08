'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import {
  CheckCircle2,
  Clock3,
  ListChecks,
  Mail,
  PauseCircle,
  PhoneCall,
  PlayCircle,
  Plus,
  Save,
  Search,
  StopCircle,
  Trash2,
  UserPlus,
  Users,
  Workflow,
} from 'lucide-react';

type SequenceStatus = 'draft' | 'active' | 'paused' | 'archived';
type SequenceStepType =
  | 'automatic_email'
  | 'manual_email'
  | 'phone_call'
  | 'task'
  | 'linkedin_task';
type EnrollmentStatus = 'active' | 'paused' | 'completed' | 'stopped';

type SequenceStep = {
  id: string;
  type: SequenceStepType;
  title: string;
  delayDays: number;
  subject: string;
  body: string;
  taskType: string;
  isActive: boolean;
};

type SequenceSettings = {
  timezone: string;
  scheduleName: string;
  useLocalTimezone: boolean;
};

type SequenceListItem = {
  id: string;
  name: string;
  description: string;
  status: SequenceStatus;
  settings: SequenceSettings;
  steps: SequenceStep[];
  createdAt: string;
  updatedAt: string;
  metrics: {
    enrolledCount: number;
    activeCount: number;
    pausedCount: number;
    completedCount: number;
    stoppedCount: number;
  };
};

type SequenceEnrollment = {
  id: string;
  status: EnrollmentStatus;
  currentStepIndex: number;
  nextRunAt: string | null;
  lastActivityAt: string;
  contact: {
    firstName: string;
    lastName: string;
    email: string | null;
    companyName: string | null;
  };
};

type SequenceDetail = SequenceListItem & {
  enrollments: SequenceEnrollment[];
  recentEvents: Array<{
    id: string;
    eventType: string;
    eventSummary: string;
    createdAt: string;
    contactName: string | null;
  }>;
};

type SequenceListResponse = {
  data: SequenceListItem[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  summary: {
    totalSequences: number;
    activeSequences: number;
    totalEnrolled: number;
    activeEnrollments: number;
    pausedEnrollments: number;
    completedEnrollments: number;
  };
};

type SequenceDetailResponse = {
  data: SequenceDetail;
};

type ContactOption = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  stage: string | null;
  company?: {
    name?: string | null;
  } | null;
};

type ContactsResponse = {
  data: ContactOption[];
};

type SequenceDraft = {
  name: string;
  description: string;
  status: SequenceStatus;
  settings: SequenceSettings;
  steps: SequenceStep[];
};

const TIMEZONE_OPTIONS = ['UTC', 'Eastern Time', 'Central Time', 'Pacific Time', 'London', 'Singapore'];
const STEP_TYPES: Array<{ value: SequenceStepType; label: string }> = [
  { value: 'automatic_email', label: 'Automatic Email' },
  { value: 'manual_email', label: 'Manual Email' },
  { value: 'phone_call', label: 'Phone Call' },
  { value: 'task', label: 'Task' },
  { value: 'linkedin_task', label: 'LinkedIn Task' },
];

const fetcher = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url);
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'Request failed.');
  return payload as T;
};

function createStep(index: number): SequenceStep {
  return {
    id: `step-${Date.now()}-${index}`,
    type: 'automatic_email',
    title: `Step ${index + 1}`,
    delayDays: index === 0 ? 0 : 2,
    subject: index === 0 ? 'Quick introduction' : '',
    body: index === 0 ? 'Hi {{first_name}}, I wanted to reach out because...' : '',
    taskType: '',
    isActive: true,
  };
}

function createDraft(): SequenceDraft {
  return {
    name: '',
    description: '',
    status: 'draft',
    settings: {
      timezone: 'UTC',
      scheduleName: 'Weekday mornings',
      useLocalTimezone: true,
    },
    steps: [createStep(0)],
  };
}

function stepLabel(type: SequenceStepType) {
  return STEP_TYPES.find((option) => option.value === type)?.label || type;
}

function formatDate(value: string | null) {
  if (!value) return 'Not scheduled';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function sequenceBadge(status: SequenceStatus) {
  if (status === 'active') return 'badge badge-success';
  if (status === 'paused') return 'badge badge-warning';
  if (status === 'archived') return 'badge badge-neutral';
  return 'badge badge-info';
}

function enrollmentBadge(status: EnrollmentStatus) {
  if (status === 'active') return 'badge badge-success';
  if (status === 'paused') return 'badge badge-warning';
  if (status === 'completed') return 'badge badge-info';
  return 'badge badge-neutral';
}

function cloneDraft(sequence: SequenceDetail): SequenceDraft {
  return {
    name: sequence.name,
    description: sequence.description,
    status: sequence.status,
    settings: sequence.settings,
    steps: sequence.steps.map((step) => ({ ...step })),
  };
}

export default function SequencesClient() {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(12);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedSequenceId, setSelectedSequenceId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [draft, setDraft] = useState<SequenceDraft>(createDraft());
  const [notice, setNotice] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [contactSearch, setContactSearch] = useState('');
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [actingEnrollmentId, setActingEnrollmentId] = useState<string | null>(null);
  const [isRunningDueSteps, setIsRunningDueSteps] = useState(false);

  const listQuery = useMemo(() => {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
      search,
      status: statusFilter,
    });
    return params.toString();
  }, [limit, page, search, statusFilter]);

  const list = useSWR<SequenceListResponse>(`/api/sequences?${listQuery}`, fetcher, {
    keepPreviousData: true,
    revalidateOnFocus: false,
  });
  const detail = useSWR<SequenceDetailResponse>(
    selectedSequenceId && !isCreating ? `/api/sequences/${selectedSequenceId}` : null,
    fetcher,
    { revalidateOnFocus: false }
  );
  const contacts = useSWR<ContactsResponse>(
    selectedSequenceId
      ? `/api/contacts?page=1&limit=12&search=${encodeURIComponent(contactSearch)}`
      : null,
    fetcher,
    { keepPreviousData: true, revalidateOnFocus: false }
  );

  const sequences = list.data?.data || [];
  const summary = list.data?.summary || {
    totalSequences: 0,
    activeSequences: 0,
    totalEnrolled: 0,
    activeEnrollments: 0,
    pausedEnrollments: 0,
    completedEnrollments: 0,
  };
  const pagination = list.data?.meta || { total: 0, page: 1, limit: 12, totalPages: 1 };
  const selectedSequence = detail.data?.data || null;
  const contactOptions = contacts.data?.data || [];

  useEffect(() => {
    if (isCreating) return;
    if (!selectedSequenceId && sequences.length > 0) setSelectedSequenceId(sequences[0].id);
    if (selectedSequenceId && sequences.length === 0) setSelectedSequenceId(null);
  }, [isCreating, selectedSequenceId, sequences]);

  useEffect(() => {
    if (!isCreating && selectedSequence) {
      setDraft(cloneDraft(selectedSequence));
      setSelectedContactIds(new Set());
    }
  }, [isCreating, selectedSequence]);

  const applyStep = <K extends keyof SequenceStep>(stepId: string, key: K, value: SequenceStep[K]) => {
    setDraft((current) => ({
      ...current,
      steps: current.steps.map((step) => (step.id === stepId ? { ...step, [key]: value } : step)),
    }));
  };

  const resetComposer = () => {
    setIsCreating(true);
    setSelectedSequenceId(null);
    setDraft(createDraft());
    setNotice('');
    setErrorMessage('');
    setSelectedContactIds(new Set());
  };

  const saveSequence = async (nextStatus?: SequenceStatus) => {
    setIsSaving(true);
    setNotice('');
    setErrorMessage('');

    try {
      const response = await fetch(isCreating ? '/api/sequences' : `/api/sequences/${selectedSequenceId}`, {
        method: isCreating ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...draft,
          status: nextStatus || draft.status,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'Failed to save sequence.');

      const saved = payload.data as SequenceDetail;
      setIsCreating(false);
      setSelectedSequenceId(saved.id);
      setDraft(cloneDraft(saved));
      setNotice(nextStatus ? `${saved.name} is now ${nextStatus}.` : `${saved.name} saved.`);
      await list.mutate();
      await detail.mutate({ data: saved }, false);
    } catch (error: any) {
      setErrorMessage(error?.message || 'Failed to save sequence.');
    } finally {
      setIsSaving(false);
    }
  };

  const enrollContacts = async () => {
    if (!selectedSequenceId || selectedContactIds.size === 0) return;

    setIsEnrolling(true);
    setNotice('');
    setErrorMessage('');

    try {
      const response = await fetch(`/api/sequences/${selectedSequenceId}/enroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactIds: Array.from(selectedContactIds) }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'Failed to enroll contacts.');

      setSelectedContactIds(new Set());
      setNotice(
        payload?.insertedCount > 0
          ? `Enrolled ${payload.insertedCount} contact${payload.insertedCount === 1 ? '' : 's'}.`
          : 'Selected contacts were already enrolled.'
      );
      await list.mutate();
      await detail.mutate({ data: payload.data as SequenceDetail }, false);
    } catch (error: any) {
      setErrorMessage(error?.message || 'Failed to enroll contacts.');
    } finally {
      setIsEnrolling(false);
    }
  };

  const runDueSteps = async () => {
    setIsRunningDueSteps(true);
    setNotice('');
    setErrorMessage('');

    try {
      const response = await fetch('/api/sequences/run-due', {
        method: 'POST',
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'Failed to run due steps.');

      setNotice(
        `Processed ${payload?.data?.processedEnrollments ?? 0} enrollments, sent ${payload?.data?.emailsSent ?? 0} emails, simulated ${payload?.data?.emailsSimulated ?? 0}, and created ${payload?.data?.tasksCreated ?? 0} tasks.`
      );
      await list.mutate();
      await detail.mutate();
    } catch (error: any) {
      setErrorMessage(error?.message || 'Failed to run due steps.');
    } finally {
      setIsRunningDueSteps(false);
    }
  };

  const updateEnrollment = async (
    enrollmentId: string,
    action: 'pause' | 'resume' | 'complete' | 'stop'
  ) => {
    if (!selectedSequenceId) return;

    setActingEnrollmentId(enrollmentId);
    setNotice('');
    setErrorMessage('');

    try {
      const response = await fetch(
        `/api/sequences/${selectedSequenceId}/enrollments/${enrollmentId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
        }
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'Failed to update enrollment.');

      await list.mutate();
      await detail.mutate({ data: payload.data as SequenceDetail }, false);
      setNotice(`Enrollment updated: ${action}.`);
    } catch (error: any) {
      setErrorMessage(error?.message || 'Failed to update enrollment.');
    } finally {
      setActingEnrollmentId(null);
    }
  };

  return (
    <div className="page-container" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div className="page-header" style={{ marginBottom: 0, alignItems: 'flex-start' }}>
        <div>
          <h1 className="page-title">Sequences</h1>
          <p className="page-subtitle">
            Build Apollo-style outreach cadences with steps, schedules, and contact enrollment.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={runDueSteps} disabled={isRunningDueSteps}>
            <PlayCircle size={16} /> {isRunningDueSteps ? 'Running...' : 'Run Due Steps'}
          </button>
          <button className="btn btn-primary" onClick={resetComposer}>
            <Plus size={16} /> New Sequence
          </button>
        </div>
      </div>

      <div className="metric-grid" style={{ marginBottom: 0 }}>
        {[
          { label: 'Total Sequences', value: summary.totalSequences, icon: <Workflow size={14} /> },
          { label: 'Active Sequences', value: summary.activeSequences, icon: <PlayCircle size={14} /> },
          { label: 'Total Enrolled', value: summary.totalEnrolled, icon: <Users size={14} /> },
          { label: 'Active Contacts', value: summary.activeEnrollments, icon: <Clock3 size={14} /> },
        ].map((item) => (
          <div key={item.label} className="metric-card">
            <div className="metric-label">{item.label}</div>
            <div className="metric-value">{item.value}</div>
            <div className="metric-trend metric-trend-up">{item.icon}{item.label}</div>
          </div>
        ))}
      </div>

      {(notice || errorMessage || list.error || detail.error) && (
        <div
          className="card"
          style={{
            padding: '0.9rem 1rem',
            borderColor: errorMessage || list.error || detail.error ? 'var(--error)' : 'var(--success)',
            color: errorMessage || list.error || detail.error ? 'var(--error)' : 'var(--success)',
          }}
        >
          {errorMessage || list.error?.message || detail.error?.message || notice}
        </div>
      )}

      <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div className="card" style={{ flex: '1 1 320px', maxWidth: '400px', width: '100%' }}>
          <div className="card-header">
            <div className="card-title">Sequence Library</div>
          </div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ position: 'relative' }}>
              <Search size={16} style={{ position: 'absolute', left: '0.8rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                className="form-input"
                style={{ paddingLeft: '2.3rem' }}
                placeholder="Search sequences..."
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
              />
            </div>
            <select
              className="form-input"
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value);
                setPage(1);
              }}
            >
              <option value="all">All statuses</option>
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="archived">Archived</option>
            </select>

            {list.isLoading ? (
              <div style={{ color: 'var(--text-secondary)' }}>Loading sequences...</div>
            ) : sequences.length === 0 ? (
              <div style={{ color: 'var(--text-secondary)' }}>No sequences found yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {sequences.map((sequence) => (
                  <button
                    key={sequence.id}
                    type="button"
                    onClick={() => {
                      setIsCreating(false);
                      setSelectedSequenceId(sequence.id);
                      setNotice('');
                      setErrorMessage('');
                    }}
                    style={{
                      textAlign: 'left',
                      border: `1px solid ${!isCreating && selectedSequenceId === sequence.id ? 'var(--primary)' : 'var(--border)'}`,
                      background: !isCreating && selectedSequenceId === sequence.id ? 'var(--primary-subtle)' : 'var(--bg-elevated)',
                      borderRadius: 'var(--radius-md)',
                      padding: '0.95rem',
                      cursor: 'pointer',
                      color: 'inherit',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
                      <div>
                        <div style={{ fontWeight: 600 }}>{sequence.name}</div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '0.2rem' }}>
                          {sequence.description || 'No description yet.'}
                        </div>
                      </div>
                      <span className={sequenceBadge(sequence.status)}>{sequence.status}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '1rem', marginTop: '0.8rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      <span>Steps: {sequence.steps.length}</span>
                      <span>Enrolled: {sequence.metrics.enrolledCount}</span>
                      <span>Active: {sequence.metrics.activeCount}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                Page {pagination.page} of {pagination.totalPages}
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
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

        <div style={{ flex: '999 1 760px', minWidth: '320px', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">{isCreating ? 'Create Sequence' : selectedSequence?.name || 'Sequence Builder'}</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                  Configure the sequence, step timing, and schedule.
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {!isCreating && draft.status !== 'active' && (
                  <button className="btn btn-secondary btn-sm" onClick={() => saveSequence('active')} disabled={isSaving}>
                    <PlayCircle size={14} /> Activate
                  </button>
                )}
                {!isCreating && draft.status === 'active' && (
                  <button className="btn btn-secondary btn-sm" onClick={() => saveSequence('paused')} disabled={isSaving}>
                    <PauseCircle size={14} /> Pause
                  </button>
                )}
                {!isCreating && draft.status !== 'archived' && (
                  <button className="btn btn-secondary btn-sm" onClick={() => saveSequence('archived')} disabled={isSaving}>
                    <StopCircle size={14} /> Archive
                  </button>
                )}
                <button className="btn btn-primary" onClick={() => saveSequence()} disabled={isSaving}>
                  <Save size={16} /> {isSaving ? 'Saving...' : isCreating ? 'Create Sequence' : 'Save Changes'}
                </button>
              </div>
            </div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Sequence Name</label>
                  <input className="form-input" value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Status</label>
                  <select className="form-input" value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value as SequenceStatus }))}>
                    <option value="draft">Draft</option>
                    <option value="active">Active</option>
                    <option value="paused">Paused</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Description</label>
                <textarea className="form-input" value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Schedule Label</label>
                  <input className="form-input" value={draft.settings.scheduleName} onChange={(event) => setDraft((current) => ({ ...current, settings: { ...current.settings, scheduleName: event.target.value } }))} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Timezone</label>
                  <select className="form-input" value={draft.settings.timezone} onChange={(event) => setDraft((current) => ({ ...current, settings: { ...current.settings, timezone: event.target.value } }))}>
                    {TIMEZONE_OPTIONS.map((timezone) => (
                      <option key={timezone} value={timezone}>{timezone}</option>
                    ))}
                  </select>
                </div>
              </div>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.65rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                <input type="checkbox" checked={draft.settings.useLocalTimezone} onChange={(event) => setDraft((current) => ({ ...current, settings: { ...current.settings, useLocalTimezone: event.target.checked } }))} />
                Use contact local timezone when available.
              </label>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div className="card-title">Steps</div>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setDraft((current) => ({ ...current, steps: [...current.steps, createStep(current.steps.length)] }))}
              >
                <Plus size={14} /> Add Step
              </button>
            </div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
              {draft.steps.map((step, index) => (
                <div key={step.id} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '1rem', background: 'var(--bg-elevated)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'flex-start', marginBottom: '0.9rem' }}>
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                      <div style={{ width: '34px', height: '34px', borderRadius: 'var(--radius-md)', background: 'var(--primary-subtle)', color: 'var(--primary-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {step.type === 'automatic_email' || step.type === 'manual_email' ? <Mail size={16} /> : step.type === 'phone_call' ? <PhoneCall size={16} /> : <ListChecks size={16} />}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600 }}>Step {index + 1}</div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{stepLabel(step.type)}</div>
                      </div>
                    </div>
                    <button
                      className="btn btn-ghost btn-sm"
                      disabled={draft.steps.length === 1}
                      onClick={() => setDraft((current) => ({ ...current, steps: current.steps.filter((entry) => entry.id !== step.id) }))}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Type</label>
                      <select className="form-input" value={step.type} onChange={(event) => applyStep(step.id, 'type', event.target.value as SequenceStepType)}>
                        {STEP_TYPES.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Title</label>
                      <input className="form-input" value={step.title} onChange={(event) => applyStep(step.id, 'title', event.target.value)} />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Delay Days</label>
                      <input className="form-input" type="number" min={0} max={30} value={step.delayDays} onChange={(event) => applyStep(step.id, 'delayDays', Math.max(0, Math.min(30, Number(event.target.value) || 0)))} />
                    </div>
                  </div>
                  {(step.type === 'automatic_email' || step.type === 'manual_email') && (
                    <>
                      <div className="form-group" style={{ marginTop: '1rem', marginBottom: 0 }}>
                        <label className="form-label">Subject</label>
                        <input className="form-input" value={step.subject} onChange={(event) => applyStep(step.id, 'subject', event.target.value)} />
                      </div>
                      <div className="form-group" style={{ marginTop: '1rem', marginBottom: 0 }}>
                        <label className="form-label">Body</label>
                        <textarea className="form-input" value={step.body} onChange={(event) => applyStep(step.id, 'body', event.target.value)} />
                      </div>
                    </>
                  )}
                  {(step.type === 'task' || step.type === 'linkedin_task' || step.type === 'phone_call') && (
                    <div className="form-group" style={{ marginTop: '1rem', marginBottom: 0 }}>
                      <label className="form-label">Instructions</label>
                      <textarea className="form-input" value={step.body} onChange={(event) => applyStep(step.id, 'body', event.target.value)} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div className="card-title">Enroll Contacts</div>
              <button className="btn btn-primary btn-sm" disabled={!selectedSequenceId || selectedContactIds.size === 0 || isEnrolling || isCreating} onClick={enrollContacts}>
                <UserPlus size={14} /> {isEnrolling ? 'Enrolling...' : `Enroll ${selectedContactIds.size || ''}`.trim()}
              </button>
            </div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {!selectedSequenceId ? (
                <div style={{ color: 'var(--text-secondary)' }}>Create or select a sequence first.</div>
              ) : (
                <>
                  <div style={{ position: 'relative', maxWidth: '360px' }}>
                    <Search size={16} style={{ position: 'absolute', left: '0.8rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input className="form-input" style={{ paddingLeft: '2.3rem' }} placeholder="Search contacts..." value={contactSearch} onChange={(event) => setContactSearch(event.target.value)} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.75rem' }}>
                    {contacts.isLoading ? (
                      <div style={{ color: 'var(--text-secondary)' }}>Loading contacts...</div>
                    ) : contactOptions.length === 0 ? (
                      <div style={{ color: 'var(--text-secondary)' }}>No contacts found.</div>
                    ) : (
                      contactOptions.map((contact) => {
                        const active = selectedContactIds.has(contact.id);
                        return (
                          <label key={contact.id} style={{ display: 'flex', gap: '0.75rem', border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`, background: active ? 'var(--primary-subtle)' : 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', padding: '0.9rem', cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={active}
                              onChange={() =>
                                setSelectedContactIds((current) => {
                                  const next = new Set(current);
                                  if (next.has(contact.id)) next.delete(contact.id);
                                  else next.add(contact.id);
                                  return next;
                                })
                              }
                            />
                            <div>
                              <div style={{ fontWeight: 600 }}>{contact.first_name} {contact.last_name}</div>
                              <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                                {contact.email || 'No email'} {contact.company?.name ? `• ${contact.company.name}` : ''}
                              </div>
                            </div>
                          </label>
                        );
                      })
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div className="card-title">Enrolled Contacts</div>
            </div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {detail.isLoading ? (
                <div style={{ color: 'var(--text-secondary)' }}>Loading sequence detail...</div>
              ) : !selectedSequence ? (
                <div style={{ color: 'var(--text-secondary)' }}>Select a sequence to inspect enrollments.</div>
              ) : selectedSequence.enrollments.length === 0 ? (
                <div style={{ color: 'var(--text-secondary)' }}>No contacts enrolled yet.</div>
              ) : (
                selectedSequence.enrollments.map((enrollment) => {
                  const currentStep = selectedSequence.steps[enrollment.currentStepIndex] || selectedSequence.steps[0];
                  const busy = actingEnrollmentId === enrollment.id;

                  return (
                    <div key={enrollment.id} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '0.95rem', background: 'var(--bg-elevated)', display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
                          <div style={{ fontWeight: 600 }}>{enrollment.contact.firstName} {enrollment.contact.lastName}</div>
                          <span className={enrollmentBadge(enrollment.status)}>{enrollment.status}</span>
                        </div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '0.2rem' }}>
                          {enrollment.contact.email || 'No email'} {enrollment.contact.companyName ? `• ${enrollment.contact.companyName}` : ''}
                        </div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.76rem', marginTop: '0.45rem' }}>
                          Current step: {currentStep?.title || 'Step 1'} • Next run: {formatDate(enrollment.nextRunAt)} • Last activity: {formatDate(enrollment.lastActivityAt)}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        {enrollment.status === 'active' && (
                          <button className="btn btn-secondary btn-sm" onClick={() => updateEnrollment(enrollment.id, 'pause')} disabled={busy}>
                            <PauseCircle size={14} /> Pause
                          </button>
                        )}
                        {enrollment.status === 'paused' && (
                          <button className="btn btn-secondary btn-sm" onClick={() => updateEnrollment(enrollment.id, 'resume')} disabled={busy}>
                            <PlayCircle size={14} /> Resume
                          </button>
                        )}
                        {enrollment.status !== 'completed' && (
                          <button className="btn btn-secondary btn-sm" onClick={() => updateEnrollment(enrollment.id, 'complete')} disabled={busy}>
                            <CheckCircle2 size={14} /> Complete
                          </button>
                        )}
                        {enrollment.status !== 'stopped' && (
                          <button className="btn btn-secondary btn-sm" onClick={() => updateEnrollment(enrollment.id, 'stop')} disabled={busy}>
                            <StopCircle size={14} /> Stop
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div className="card-title">Recent Activity</div>
            </div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {!selectedSequence ? (
                <div style={{ color: 'var(--text-secondary)' }}>Select a sequence to see recent events.</div>
              ) : selectedSequence.recentEvents.length === 0 ? (
                <div style={{ color: 'var(--text-secondary)' }}>No activity has been logged for this sequence yet.</div>
              ) : (
                selectedSequence.recentEvents.map((event) => (
                  <div
                    key={event.id}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--bg-elevated)',
                      padding: '0.9rem 1rem',
                    }}
                  >
                    <div style={{ fontWeight: 600 }}>{event.eventSummary}</div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                      {event.contactName ? `${event.contactName} • ` : ''}
                      {formatDate(event.createdAt)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
