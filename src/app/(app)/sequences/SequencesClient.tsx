'use client';

import { useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import useSWR from 'swr';
import {
  Activity,
  Bold,
  CalendarClock,
  ChevronRight,
  CheckCircle2,
  Clock3,
  Code,
  Eye,
  Image,
  Italic,
  LayoutPanelTop,
  Link2,
  ListChecks,
  Mail,
  PauseCircle,
  Paperclip,
  PhoneCall,
  PlayCircle,
  Plus,
  Save,
  Search,
  StopCircle,
  Sparkles,
  Settings2,
  Trash2,
  Underline,
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

type SequenceRunSummary = {
  processedEnrollments: number;
  emailsSent: number;
  emailsSimulated: number;
  tasksCreated: number;
  completedEnrollments: number;
  skippedSteps: number;
};

type ContactOption = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  stage: string | null;
  title?: string | null;
  department?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  phone_direct?: string | null;
  phone_mobile?: string | null;
  phone_hq?: string | null;
  linkedin_url?: string | null;
  lead_score?: number | null;
  tags?: string[] | null;
  company?: {
    name?: string | null;
    domain?: string | null;
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

type SequenceViewTab = 'editor' | 'contacts' | 'activity' | 'settings' | 'logs';

type SequenceTabDescriptor = {
  value: SequenceViewTab;
  label: string;
  icon: ReactNode;
  count?: number;
};

const TIMEZONE_OPTIONS = ['UTC', 'Eastern Time', 'Central Time', 'Pacific Time', 'London', 'Singapore'];
const STEP_TYPES: Array<{ value: SequenceStepType; label: string }> = [
  { value: 'automatic_email', label: 'Automatic Email' },
  { value: 'manual_email', label: 'Manual Email' },
  { value: 'phone_call', label: 'Phone Call' },
  { value: 'task', label: 'Task' },
  { value: 'linkedin_task', label: 'LinkedIn Task' },
];
const CONTACT_VARIABLE_TOKENS = [
  '{{first_name}}',
  '{{last_name}}',
  '{{full_name}}',
  '{{email}}',
  '{{company_name}}',
  '{{company_domain}}',
  '{{title}}',
  '{{department}}',
  '{{stage}}',
  '{{city}}',
  '{{state}}',
  '{{country}}',
  '{{phone}}',
  '{{phone_direct}}',
  '{{phone_mobile}}',
  '{{phone_hq}}',
  '{{linkedin_url}}',
  '{{lead_score}}',
  '{{tags}}',
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

function stepTypeIcon(type: SequenceStepType, size = 16) {
  if (type === 'automatic_email' || type === 'manual_email') return <Mail size={size} />;
  if (type === 'phone_call') return <PhoneCall size={size} />;
  return <ListChecks size={size} />;
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

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function summarizeRunResult(summary?: Partial<SequenceRunSummary> | null) {
  const processedEnrollments = summary?.processedEnrollments ?? 0;
  const emailsSent = summary?.emailsSent ?? 0;
  const emailsSimulated = summary?.emailsSimulated ?? 0;
  const tasksCreated = summary?.tasksCreated ?? 0;
  const completedEnrollments = summary?.completedEnrollments ?? 0;
  const skippedSteps = summary?.skippedSteps ?? 0;

  const outcome = [
    emailsSent > 0 ? `sent ${pluralize(emailsSent, 'email')}` : null,
    emailsSimulated > 0 ? `simulated ${pluralize(emailsSimulated, 'email')}` : null,
    tasksCreated > 0 ? `created ${pluralize(tasksCreated, 'task')}` : null,
    completedEnrollments > 0 ? `completed ${pluralize(completedEnrollments, 'enrollment')}` : null,
    skippedSteps > 0 ? `skipped ${pluralize(skippedSteps, 'step')}` : null,
  ].filter(Boolean);

  if (outcome.length === 0) {
    return `Checked due steps automatically. ${pluralize(processedEnrollments, 'enrollment')} were due, but no new actions were needed.`;
  }

  return `Checked due steps automatically. Processed ${pluralize(processedEnrollments, 'enrollment')} and ${outcome.join(', ')}.`;
}

function buildContactPreviewVariables(contact?: ContactOption | null) {
  const firstName = contact?.first_name?.trim() || 'there';
  const lastName = contact?.last_name?.trim() || '';
  const fullName = `${firstName} ${lastName}`.trim();
  const phone = contact?.phone_direct || contact?.phone_mobile || contact?.phone_hq || '';

  return {
    first_name: firstName,
    last_name: lastName,
    full_name: fullName || firstName,
    email: contact?.email || '',
    company_name: contact?.company?.name || '',
    company_domain: contact?.company?.domain || '',
    title: contact?.title || '',
    department: contact?.department || '',
    stage: contact?.stage || '',
    city: contact?.city || '',
    state: contact?.state || '',
    country: contact?.country || '',
    phone,
    phone_direct: contact?.phone_direct || '',
    phone_mobile: contact?.phone_mobile || '',
    phone_hq: contact?.phone_hq || '',
    linkedin_url: contact?.linkedin_url || '',
    lead_score:
      typeof contact?.lead_score === 'number' && Number.isFinite(contact.lead_score)
        ? String(contact.lead_score)
        : '',
    tags: Array.isArray(contact?.tags) ? contact?.tags.filter(Boolean).join(', ') : '',
  };
}

function renderPreviewTemplate(template: string, variables: Record<string, string>) {
  return template.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (match, token: string) => {
    const key = token.toLowerCase();
    return Object.prototype.hasOwnProperty.call(variables, key) ? variables[key] : match;
  });
}

function formatDelayLabel(delayDays: number) {
  if (delayDays <= 0) return 'Runs immediately';
  if (delayDays === 1) return 'Runs in 1 day';
  return `Runs in ${delayDays} days`;
}

function VariableToolbar({
  onInsert,
  onNotice,
  onFormat,
  onWriteAi,
}: {
  onInsert?: (token: string) => void;
  onNotice?: (label: string) => void;
  onFormat?: (action: 'bold' | 'italic' | 'underline' | 'link' | 'image' | 'code' | 'attach') => void;
  onWriteAi?: () => void;
}) {
  return (
    <div className="sequence-editor-toolbar">
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={() => onWriteAi?.()}
      >
        Write with AI
      </button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => onFormat?.('bold')}>
        <Bold size={14} />
      </button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => onFormat?.('italic')}>
        <Italic size={14} />
      </button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => onFormat?.('underline')}>
        <Underline size={14} />
      </button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => onFormat?.('link')}>
        <Link2 size={14} />
      </button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => onFormat?.('image')}>
        <Image size={14} />
      </button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => onFormat?.('attach')}>
        <Paperclip size={14} />
      </button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => onFormat?.('code')}>
        <Code size={14} />
      </button>
      <select
        className="form-input"
        style={{ maxWidth: '220px' }}
        defaultValue=""
        onChange={(event) => {
          const token = event.target.value;
          if (token) onInsert?.(token);
          event.target.value = '';
        }}
      >
        <option value="">Insert variable</option>
        {CONTACT_VARIABLE_TOKENS.map((token) => (
          <option key={token} value={token}>
            {token}
          </option>
        ))}
      </select>
    </div>
  );
}

export default function SequencesClient() {
  const [activeTab, setActiveTab] = useState<SequenceViewTab>('editor');
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
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [previewContactId, setPreviewContactId] = useState<string | null>(null);
  const [lastFocusedField, setLastFocusedField] = useState<{
    stepId: string;
    field: 'subject' | 'body';
  } | null>(null);
  const lastFocusedInputRef = useRef<{
    element: HTMLInputElement | HTMLTextAreaElement | HTMLDivElement | null;
    stepId: string;
    field: 'subject' | 'body';
  } | null>(null);

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
  const hasPersistedSequence = Boolean(!isCreating && selectedSequenceId);
  const selectedStepIndex = Math.max(
    0,
    draft.steps.findIndex((step) => step.id === selectedStepId)
  );
  const selectedStep = draft.steps[selectedStepIndex] || draft.steps[0];
  const previewContact = contactOptions.find((contact) => contact.id === previewContactId) || contactOptions[0] || null;
  const previewVariables = buildContactPreviewVariables(previewContact);
  const previewSubject = selectedStep
    ? renderPreviewTemplate(selectedStep.subject || selectedStep.title, previewVariables)
    : '';
  const previewBody = selectedStep
    ? renderPreviewTemplate(selectedStep.body || selectedStep.title, previewVariables)
    : '';

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

  useEffect(() => {
    if (!draft.steps.length) {
      setSelectedStepId(null);
      return;
    }

    const stepStillExists = selectedStepId && draft.steps.some((step) => step.id === selectedStepId);
    if (!stepStillExists) {
      setSelectedStepId(draft.steps[0].id);
    }
  }, [draft.steps, selectedStepId]);

  useEffect(() => {
    if (!contactOptions.length) {
      setPreviewContactId(null);
      return;
    }

    const contactStillExists =
      previewContactId && contactOptions.some((contact) => contact.id === previewContactId);
    if (!contactStillExists) {
      setPreviewContactId(contactOptions[0].id);
    }
  }, [contactOptions, previewContactId]);

  const applyStep = <K extends keyof SequenceStep>(stepId: string, key: K, value: SequenceStep[K]) => {
    setDraft((current) => ({
      ...current,
      steps: current.steps.map((step) => (step.id === stepId ? { ...step, [key]: value } : step)),
    }));
  };

  const applyTextEdit = (
    text: string,
    options?: {
      wrap?: { start: string; end: string; placeholder?: string };
      preferReplace?: boolean;
      build?: (selectedText: string) => string;
    }
  ) => {
    const fallbackStepId = lastFocusedField?.stepId || selectedStep?.id;
    const fallbackField = lastFocusedField?.field || 'body';
    const ref = lastFocusedInputRef.current;
    const stepId = ref?.stepId || fallbackStepId;
    const field = ref?.field || fallbackField;
    if (!stepId) return;

    const currentStep = draft.steps.find((step) => step.id === stepId);
    if (!currentStep) return;

    const currentValue = field === 'subject' ? currentStep.subject : currentStep.body;
    const element = ref?.element;
    if (element && element instanceof HTMLDivElement && element.isContentEditable) {
      if (options?.build) {
        const selection = window.getSelection();
        const selectedText = selection?.toString() || '';
        const insertValue = options.build(selectedText);
        document.execCommand('insertHTML', false, insertValue);
      } else {
        document.execCommand('insertText', false, text);
      }
      applyStep(stepId, field, element.innerHTML as SequenceStep[typeof field]);
      return;
    }

    const selectionStart = (element as HTMLInputElement | HTMLTextAreaElement | null)?.selectionStart ?? currentValue.length;
    const selectionEnd = (element as HTMLInputElement | HTMLTextAreaElement | null)?.selectionEnd ?? currentValue.length;
    const selectedText = currentValue.slice(selectionStart, selectionEnd);
    const wrap = options?.wrap;
    const insertValue = options?.build
      ? options.build(selectedText)
      : wrap
        ? `${wrap.start}${selectedText || wrap.placeholder || text}${wrap.end}`
        : text;
    const nextValue =
      options?.preferReplace && !selectedText && !currentValue
        ? insertValue
        : `${currentValue.slice(0, selectionStart)}${insertValue}${currentValue.slice(selectionEnd)}`;

    applyStep(stepId, field, nextValue as SequenceStep[typeof field]);

    if (element && !(element instanceof HTMLDivElement)) {
      requestAnimationFrame(() => {
        element.focus();
        const cursor = selectionStart + insertValue.length;
        element.selectionStart = cursor;
        element.selectionEnd = cursor;
      });
    }
  };

  const insertVariableToken = (token: string) => {
    const element = lastFocusedInputRef.current?.element;
    if (element && element instanceof HTMLDivElement && element.isContentEditable) {
      document.execCommand('insertText', false, token);
      applyStep(lastFocusedInputRef.current?.stepId || selectedStep?.id || '', lastFocusedInputRef.current?.field || 'body', element.innerHTML as SequenceStep['body']);
      return;
    }

    const spacer =
      (element as HTMLInputElement | HTMLTextAreaElement | null)?.selectionStart ||
      !(lastFocusedField?.field === 'subject' || lastFocusedField?.field === 'body')
        ? ''
        : ' ';
    applyTextEdit(`${spacer}${token}`);
  };

  const handleToolbarFormat = (action: 'bold' | 'italic' | 'underline' | 'link' | 'image' | 'code' | 'attach') => {
    const element = lastFocusedInputRef.current?.element;
    if (element && element instanceof HTMLDivElement && element.isContentEditable) {
      if (action === 'bold') return document.execCommand('bold');
      if (action === 'italic') return document.execCommand('italic');
      if (action === 'underline') return document.execCommand('underline');
      if (action === 'code') return applyTextEdit('code', { build: (selectedText) => `<code>${selectedText || 'code'}</code>` });
      if (action === 'link') {
        const url = window.prompt('Enter link URL', 'https://');
        if (!url) return;
        return document.execCommand('createLink', false, url);
      }
      if (action === 'image') {
        const url = window.prompt('Enter image URL', 'https://');
        if (!url) return;
        return document.execCommand('insertImage', false, url);
      }
      if (action === 'attach') return notifyInDev('Attachment');
    }

    if (action === 'bold') return applyTextEdit('bold', { wrap: { start: '**', end: '**', placeholder: 'bold text' } });
    if (action === 'italic') return applyTextEdit('italic', { wrap: { start: '*', end: '*', placeholder: 'italic text' } });
    if (action === 'underline') return applyTextEdit('underline', { wrap: { start: '__', end: '__', placeholder: 'underlined text' } });
    if (action === 'code') return applyTextEdit('code', { wrap: { start: '`', end: '`', placeholder: 'inline code' } });
    if (action === 'link') {
      const url = window.prompt('Enter link URL', 'https://');
      if (!url) return;
      return applyTextEdit('link', { build: (selectedText) => `${selectedText || 'link text'} (${url})` });
    }
    if (action === 'image') return applyTextEdit('image', { build: () => `[image: ${window.prompt('Image URL', 'https://') || ''}]` });
    if (action === 'attach') return notifyInDev('Attachment');
  };

  const handleWriteAi = () => {
    const template =
      lastFocusedField?.field === 'subject'
        ? 'Quick question'
        : 'Hi {{first_name}},\n\nWanted to reach out because...\n\nBest,\n{{full_name}}';
    applyTextEdit(template, { preferReplace: true });
  };

  const resetComposer = () => {
    setIsCreating(true);
    setSelectedSequenceId(null);
    setDraft(createDraft());
    setNotice('');
    setErrorMessage('');
    setSelectedContactIds(new Set());
    setActiveTab('editor');
    setSelectedStepId(null);
    setPreviewContactId(null);
  };

  const addStep = () => {
    const nextStep = createStep(draft.steps.length);
    setDraft((current) => ({
      ...current,
      steps: [...current.steps, nextStep],
    }));
    setSelectedStepId(nextStep.id);
  };

  const removeStep = (stepId: string) => {
    if (draft.steps.length === 1) return;

    const currentIndex = draft.steps.findIndex((step) => step.id === stepId);
    const fallbackStep =
      draft.steps[currentIndex + 1] || draft.steps[currentIndex - 1] || draft.steps[0];

    setDraft((current) => ({
      ...current,
      steps: current.steps.filter((entry) => entry.id !== stepId),
    }));

    if (selectedStepId === stepId) {
      setSelectedStepId(fallbackStep?.id || null);
    }
  };

  const saveSequence = async (nextStatus?: SequenceStatus) => {
    setIsSaving(true);
    setNotice('');
    setErrorMessage('');

    try {
      const shouldCreate = isCreating || !selectedSequenceId;
      const response = await fetch(shouldCreate ? '/api/sequences' : `/api/sequences/${selectedSequenceId}`, {
        method: shouldCreate ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...draft,
          status: nextStatus || draft.status,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'Failed to save sequence.');

      const saved = payload.data as SequenceDetail;
      if (!saved?.id) {
        throw new Error('The backend did not return a saved sequence id.');
      }
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

      const enrolledSequence = payload?.data as SequenceDetail | undefined;
      const insertedCount = Number(payload?.insertedCount || 0);

      setSelectedContactIds(new Set());

      let nextNotice =
        insertedCount > 0
          ? `Enrolled ${pluralize(insertedCount, 'contact')}.`
          : 'Selected contacts were already enrolled.';

      if (insertedCount > 0 && enrolledSequence?.status === 'active') {
        const runResponse = await fetch('/api/sequences/run-due', {
          method: 'POST',
        });
        const runPayload = await runResponse.json().catch(() => null);

        if (runResponse.ok) {
          nextNotice = `${nextNotice} ${summarizeRunResult(runPayload?.data as SequenceRunSummary | undefined)}`;
        } else {
          nextNotice = `${nextNotice} Automatic due-step check could not finish: ${runPayload?.error || 'Unknown error.'}`;
        }

        await Promise.all([list.mutate(), detail.mutate()]);
      } else {
        if (insertedCount > 0 && enrolledSequence?.status !== 'active') {
          nextNotice = `${nextNotice} The contact is saved in the sequence, but this sequence must be active before the first step can run.`;
        }

        await list.mutate();
        await detail.mutate({ data: enrolledSequence as SequenceDetail }, false);
      }

      setNotice(nextNotice);
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

  const notifyInDev = (label: string) => {
    setErrorMessage('');
    setNotice(`${label} is still in development.`);
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

  const sequenceDisplayName =
    draft.name.trim() || (isCreating ? 'Untitled sequence' : selectedSequence?.name || 'Sequence Builder');
  const tabs: SequenceTabDescriptor[] = [
    { value: 'editor', label: 'Editor', icon: <LayoutPanelTop size={14} />, count: draft.steps.length },
    { value: 'contacts', label: 'Contacts', icon: <Users size={14} />, count: selectedSequence?.enrollments.length || 0 },
    { value: 'activity', label: 'Activity', icon: <Activity size={14} />, count: selectedSequence?.recentEvents.length || 0 },
    { value: 'logs', label: 'Logs', icon: <ListChecks size={14} />, count: sequences.length },
    { value: 'settings', label: 'Settings', icon: <Settings2 size={14} /> },
  ];

  return (
    <div className="page-container sequence-studio-page" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div className="page-header" style={{ marginBottom: 0, alignItems: 'flex-start', gap: '1rem' }}>
        <div>
          <h1 className="page-title">Sequences</h1>
          <p className="page-subtitle">
            Build branded outreach cadences with previewable messaging, sequencing logic, and clear enrollment control.
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

      <div className="sequence-studio-hero">
        <div>
          <div className="sequence-studio-hero-label">
            <Sparkles size={14} />
            Parallex Sequences Studio
          </div>
          <h2 className="sequence-studio-hero-title">{sequenceDisplayName}</h2>
          <p className="sequence-studio-hero-copy">
            {isCreating
              ? 'Shape a polished, multi-step sequence that feels guided from the first touch to the final follow-up.'
              : `${selectedSequence?.metrics.enrolledCount ?? 0} enrolled contacts across ${draft.steps.length} steps. Refine copy, preview personalization, and keep every next action visible.`}
          </p>
        </div>
        <div className="sequence-studio-hero-actions">
          <div className="sequence-feed-card">
            <div className="sequence-feed-header">
              <Workflow size={14} />
              Status
            </div>
            <div className="sequence-feed-title" style={{ textTransform: 'capitalize' }}>
              {draft.status}
            </div>
            <div className="sequence-feed-copy">{draft.settings.scheduleName || 'Add a schedule label.'}</div>
          </div>
          <div className="sequence-feed-card">
            <div className="sequence-feed-header">
              <Users size={14} />
              Enrolled
            </div>
            <div className="sequence-feed-title">{selectedSequence?.metrics.enrolledCount ?? 0}</div>
            <div className="sequence-feed-copy">{selectedSequence?.metrics.activeCount ?? 0} currently active</div>
          </div>
          <div className="sequence-feed-card">
            <div className="sequence-feed-header">
              <CalendarClock size={14} />
              Delivery Window
            </div>
            <div className="sequence-feed-title">{draft.settings.timezone}</div>
            <div className="sequence-feed-copy">
              {draft.settings.useLocalTimezone ? 'Uses contact local time when available.' : 'Runs in the sequence timezone.'}
            </div>
          </div>
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
                      setActiveTab('editor');
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
          <div className="sequence-command-card">
            <div className="sequence-command-header">
              <div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <span className={sequenceBadge(draft.status)}>{draft.status}</span>
                  <span className="badge badge-neutral">{draft.steps.length} steps</span>
                  {hasPersistedSequence && (
                    <span className="badge badge-info">{selectedSequence?.metrics.enrolledCount ?? 0} enrolled</span>
                  )}
                </div>
                <div className="card-title" style={{ fontSize: '1.1rem', marginTop: '0.75rem' }}>
                  {sequenceDisplayName}
                </div>
                <div className="sequence-command-summary">
                  {draft.description.trim() || 'Give the team a short description for the playbook, audience, or goal.'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'flex-end' }}>
                {hasPersistedSequence && draft.status !== 'active' && (
                  <button className="btn btn-secondary btn-sm" onClick={() => saveSequence('active')} disabled={isSaving}>
                    <PlayCircle size={14} /> Activate
                  </button>
                )}
                {hasPersistedSequence && draft.status === 'active' && (
                  <button className="btn btn-secondary btn-sm" onClick={() => saveSequence('paused')} disabled={isSaving}>
                    <PauseCircle size={14} /> Pause
                  </button>
                )}
                {hasPersistedSequence && draft.status !== 'archived' && (
                  <button className="btn btn-secondary btn-sm" onClick={() => saveSequence('archived')} disabled={isSaving}>
                    <StopCircle size={14} /> Archive
                  </button>
                )}
                <button className="btn btn-primary" onClick={() => saveSequence()} disabled={isSaving}>
                  <Save size={16} /> {isSaving ? 'Saving...' : isCreating ? 'Create Sequence' : 'Save Changes'}
                </button>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Sequence Name</label>
                <input
                  className="form-input"
                  value={draft.name}
                  onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Status</label>
                <select
                  className="form-input"
                  value={draft.status}
                  onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value as SequenceStatus }))}
                >
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
                <label className="form-label">Description</label>
                <textarea
                  className="form-input"
                  value={draft.description}
                  onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
                />
              </div>
            </div>
          </div>

          <div className="sequence-section-tabs">
            {tabs.map((tab) => (
              <button
                key={tab.value}
                type="button"
                className={`sequence-section-tab ${activeTab === tab.value ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.value)}
              >
                {tab.icon}
                <span>{tab.label}</span>
                {typeof tab.count === 'number' && <span className="sequence-section-tab-count">{tab.count}</span>}
              </button>
            ))}
          </div>

          {activeTab === 'editor' && (
            <div className="card">
              <div className="card-header">
                <div className="card-title">Sequence steps</div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => notifyInDev('Collapse steps')}>
                    Collapse steps
                  </button>
                  <button className="btn btn-primary btn-sm" onClick={() => saveSequence()} disabled={isSaving}>
                    <Save size={14} /> {isSaving ? 'Saving...' : 'Save changes'}
                  </button>
                </div>
              </div>
              <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div className="sequence-step-rail">
                  {draft.steps.map((step, index) => {
                    const active = selectedStep?.id === step.id;
                    return (
                      <button
                        key={step.id}
                        type="button"
                        className={`sequence-step-pill ${active ? 'active' : ''}`}
                        onClick={() => setSelectedStepId(step.id)}
                      >
                        <div className="sequence-step-pill-head">
                          <span className="sequence-step-pill-index">Step {index + 1}</span>
                          <span className="sequence-step-pill-type">{stepLabel(step.type)}</span>
                        </div>
                        <div className="sequence-step-pill-title">
                          <span>{stepTypeIcon(step.type, 14)}</span>
                          <span>{step.title || `Step ${index + 1}`}</span>
                        </div>
                        <div className="sequence-step-pill-meta">{formatDelayLabel(step.delayDays)}</div>
                      </button>
                    );
                  })}
                  <button type="button" className="sequence-step-pill sequence-step-pill-add" onClick={addStep}>
                    <Plus size={16} />
                    <span>Add step</span>
                  </button>
                </div>

                {selectedStep && (
                  <div className="sequence-editor-grid">
                    <div className="sequence-editor-main">
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start' }}>
                        <div>
                          <div className="card-title" style={{ fontSize: '1rem' }}>
                            Step {selectedStepIndex + 1}: {stepLabel(selectedStep.type)}
                          </div>
                          <div className="sequence-preview-note">{formatDelayLabel(selectedStep.delayDays)}</div>
                        </div>
                        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                          <button className="btn btn-secondary btn-sm" onClick={() => notifyInDev('Template')}>
                            Template
                          </button>
                          <button className="btn btn-secondary btn-sm" onClick={() => notifyInDev('Prompt')}>
                            Prompt
                          </button>
                          <button className="btn btn-secondary btn-sm" onClick={() => notifyInDev('Check email')}>
                            Check email
                          </button>
                          <button
                            className="btn btn-ghost btn-sm"
                            disabled={draft.steps.length === 1}
                            onClick={() => removeStep(selectedStep.id)}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label className="form-label">Type</label>
                          <select
                            className="form-input"
                            value={selectedStep.type}
                            onChange={(event) => applyStep(selectedStep.id, 'type', event.target.value as SequenceStepType)}
                          >
                            {STEP_TYPES.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label className="form-label">Title</label>
                          <input
                            className="form-input"
                            value={selectedStep.title}
                            onChange={(event) => applyStep(selectedStep.id, 'title', event.target.value)}
                          />
                        </div>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label className="form-label">Delay Days</label>
                          <input
                            className="form-input"
                            type="number"
                            min={0}
                            max={30}
                            value={selectedStep.delayDays}
                            onChange={(event) =>
                              applyStep(
                                selectedStep.id,
                                'delayDays',
                                Math.max(0, Math.min(30, Number(event.target.value) || 0))
                              )
                            }
                          />
                        </div>
                      </div>

                      {(selectedStep.type === 'automatic_email' || selectedStep.type === 'manual_email') && (
                        <>
                          <div className="form-group" style={{ marginBottom: 0 }}>
                            <label className="form-label">Subject</label>
                            <input
                              className="form-input"
                              value={selectedStep.subject}
                              onChange={(event) => applyStep(selectedStep.id, 'subject', event.target.value)}
                              onFocus={() => setLastFocusedField({ stepId: selectedStep.id, field: 'subject' })}
                              ref={(element) => {
                                if (!element) return;
                                if (lastFocusedField?.stepId === selectedStep.id && lastFocusedField?.field === 'subject') {
                                  lastFocusedInputRef.current = { element, stepId: selectedStep.id, field: 'subject' };
                                }
                              }}
                            />
                          </div>
                          <div className="form-group" style={{ marginBottom: 0 }}>
                            <label className="form-label">Body</label>
                            <div
                              className="sequence-editor-richtext"
                              contentEditable
                              suppressContentEditableWarning
                              data-placeholder="Write your email..."
                              onInput={(event) =>
                                applyStep(
                                  selectedStep.id,
                                  'body',
                                  (event.currentTarget as HTMLDivElement).innerHTML
                                )
                              }
                              onFocus={(event) => {
                                setLastFocusedField({ stepId: selectedStep.id, field: 'body' });
                                lastFocusedInputRef.current = {
                                  element: event.currentTarget,
                                  stepId: selectedStep.id,
                                  field: 'body',
                                };
                              }}
                              dangerouslySetInnerHTML={{ __html: selectedStep.body || '' }}
                            />
                          </div>
                          <VariableToolbar
                            onInsert={insertVariableToken}
                            onNotice={notifyInDev}
                            onFormat={handleToolbarFormat}
                            onWriteAi={handleWriteAi}
                          />
                        </>
                      )}

                      {(selectedStep.type === 'task' ||
                        selectedStep.type === 'linkedin_task' ||
                        selectedStep.type === 'phone_call') && (
                        <>
                          <div className="form-group" style={{ marginBottom: 0 }}>
                            <label className="form-label">Instructions</label>
                            <textarea
                              className="form-input sequence-editor-textarea"
                              value={selectedStep.body}
                              onChange={(event) => applyStep(selectedStep.id, 'body', event.target.value)}
                              onFocus={(event) => {
                                setLastFocusedField({ stepId: selectedStep.id, field: 'body' });
                                lastFocusedInputRef.current = {
                                  element: event.currentTarget,
                                  stepId: selectedStep.id,
                                  field: 'body',
                                };
                              }}
                            />
                          </div>
                          <VariableToolbar
                            onInsert={insertVariableToken}
                            onNotice={notifyInDev}
                            onFormat={handleToolbarFormat}
                            onWriteAi={handleWriteAi}
                          />
                        </>
                      )}
                    </div>

                    <aside className="sequence-editor-preview">
                      <div className="sequence-preview-meta">
                        <div>
                          <div className="card-title" style={{ fontSize: '1rem' }}>
                            Generate preview for contact
                          </div>
                          <div className="sequence-preview-note">
                            Select a contact to see the personalized subject and body.
                          </div>
                        </div>
                        <button className="btn btn-ghost btn-sm" onClick={() => notifyInDev('Refresh preview')}>
                          Refresh
                        </button>
                      </div>

                      {contactOptions.length > 0 ? (
                        <>
                          <div className="form-group" style={{ marginBottom: 0 }}>
                            <label className="form-label">Select contact</label>
                            <select
                              className="form-input"
                              value={previewContactId || ''}
                              onChange={(event) => setPreviewContactId(event.target.value)}
                            >
                              {contactOptions.map((contact) => (
                                <option key={contact.id} value={contact.id}>
                                  {contact.first_name} {contact.last_name}
                                  {contact.company?.name ? ` - ${contact.company.name}` : ''}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="sequence-preview-card">
                            <div className="sequence-preview-label">To</div>
                            <div>
                              {(previewContact?.first_name || '').trim()} {(previewContact?.last_name || '').trim()}
                              {previewContact?.email ? ` <${previewContact.email}>` : ' <no-email>'}
                            </div>

                            {(selectedStep.type === 'automatic_email' || selectedStep.type === 'manual_email') && (
                              <>
                                <div className="sequence-preview-label">Subject</div>
                                <div>{previewSubject || 'No subject yet.'}</div>
                              </>
                            )}

                            <div className="sequence-preview-label">
                              {selectedStep.type === 'automatic_email' || selectedStep.type === 'manual_email'
                                ? 'Body'
                                : 'Instructions'}
                            </div>
                            <div
                              className="sequence-preview-body"
                              dangerouslySetInnerHTML={{
                                __html: previewBody || 'Add content to preview this step.',
                              }}
                            />
                          </div>
                        </>
                      ) : (
                        <div className="sequence-preview-card">
                          <div className="sequence-empty-copy">
                            Add or search contacts to preview placeholder values against real records.
                          </div>
                        </div>
                      )}
                    </aside>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'contacts' && (
          <>
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
          </>
          )}

          {activeTab === 'activity' && (
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
          )}

          {activeTab === 'logs' && (
            <div className="card">
              <div className="card-header">
                <div className="card-title">Sequence Creation Log</div>
              </div>
              <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {list.isLoading ? (
                  <div style={{ color: 'var(--text-secondary)' }}>Loading creation logs...</div>
                ) : sequences.length === 0 ? (
                  <div style={{ color: 'var(--text-secondary)' }}>No sequences have been created yet.</div>
                ) : (
                  sequences.map((sequence) => (
                    <div
                      key={sequence.id}
                      style={{
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-md)',
                        background: 'var(--bg-elevated)',
                        padding: '0.9rem 1rem',
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: '1rem',
                        flexWrap: 'wrap',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600 }}>{sequence.name || 'Untitled sequence'}</div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '0.2rem' }}>
                          {sequence.description || 'No description.'}
                        </div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.76rem', marginTop: '0.4rem' }}>
                          Created {formatDate(sequence.createdAt)} • {sequence.steps.length} steps
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span className={sequenceBadge(sequence.status)}>{sequence.status}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="card">
              <div className="card-header">
                <div>
                  <div className="card-title">Scheduling and Delivery</div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', marginTop: '0.25rem' }}>
                    Configure how the sequence stores timing preferences for enrolled contacts.
                  </div>
                </div>
              </div>
              <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Schedule Label</label>
                    <input
                      className="form-input"
                      value={draft.settings.scheduleName}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          settings: { ...current.settings, scheduleName: event.target.value },
                        }))
                      }
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Timezone</label>
                    <select
                      className="form-input"
                      value={draft.settings.timezone}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          settings: { ...current.settings, timezone: event.target.value },
                        }))
                      }
                    >
                      {TIMEZONE_OPTIONS.map((timezone) => (
                        <option key={timezone} value={timezone}>
                          {timezone}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.65rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                  <input
                    type="checkbox"
                    checked={draft.settings.useLocalTimezone}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        settings: { ...current.settings, useLocalTimezone: event.target.checked },
                      }))
                    }
                  />
                  Use contact local timezone when available.
                </label>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
