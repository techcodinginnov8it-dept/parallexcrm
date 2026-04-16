import { randomUUID } from 'crypto';
import nodemailer from 'nodemailer';
import prisma from '@/lib/db';

export type SequenceStatus = 'draft' | 'active' | 'paused' | 'archived';
export type SequenceStepType =
  | 'automatic_email'
  | 'manual_email'
  | 'phone_call'
  | 'task'
  | 'linkedin_task';
export type EnrollmentStatus = 'active' | 'paused' | 'completed' | 'stopped';

export type SequenceStep = {
  id: string;
  type: SequenceStepType;
  title: string;
  delayDays: number;
  subject: string;
  body: string;
  taskType: string;
  isActive: boolean;
};

export type SequenceSettings = {
  timezone: string;
  scheduleName: string;
  useLocalTimezone: boolean;
};

export type SequenceMetrics = {
  enrolledCount: number;
  activeCount: number;
  pausedCount: number;
  completedCount: number;
  stoppedCount: number;
};

export type SequenceListItem = {
  id: string;
  orgId: string;
  ownerUserId: string;
  name: string;
  description: string;
  status: SequenceStatus;
  settings: SequenceSettings;
  steps: SequenceStep[];
  createdAt: string;
  updatedAt: string;
  metrics: SequenceMetrics;
};

export type SequenceEnrollment = {
  id: string;
  sequenceId: string;
  contactId: string;
  status: EnrollmentStatus;
  currentStepIndex: number;
  nextRunAt: string | null;
  pausedUntil: string | null;
  finishedReason: string | null;
  lastActivityAt: string;
  createdAt: string;
  sendFromUserId: string | null;
  contact: {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    stage: string | null;
    companyName: string | null;
  };
};

export type SequenceEvent = {
  id: string;
  eventType: string;
  eventSummary: string;
  createdAt: string;
  contactName: string | null;
};

export type AppTask = {
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

export type SequenceDetail = SequenceListItem & {
  enrollments: SequenceEnrollment[];
  recentEvents: SequenceEvent[];
};

export type SequenceListResponse = {
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

export type TaskListResponse = {
  data: AppTask[];
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

export type SequenceRunSummary = {
  processedEnrollments: number;
  emailsSent: number;
  emailsSimulated: number;
  tasksCreated: number;
  completedEnrollments: number;
  skippedSteps: number;
};

export class SequenceStoreError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const DEFAULT_SETTINGS: SequenceSettings = {
  timezone: 'UTC',
  scheduleName: 'Weekday mornings',
  useLocalTimezone: true,
};

const DEFAULT_STEP: SequenceStep = {
  id: 'step-1',
  type: 'automatic_email',
  title: 'Intro email',
  delayDays: 0,
  subject: 'Quick intro',
  body: 'Hi {{first_name}}, I wanted to reach out because...',
  taskType: '',
  isActive: true,
};

const VALID_SEQUENCE_STATUSES = new Set<SequenceStatus>(['draft', 'active', 'paused', 'archived']);
const VALID_STEP_TYPES = new Set<SequenceStepType>([
  'automatic_email',
  'manual_email',
  'phone_call',
  'task',
  'linkedin_task',
]);
const VALID_ENROLLMENT_STATUSES = new Set<EnrollmentStatus>([
  'active',
  'paused',
  'completed',
  'stopped',
]);

let sequencesTablesReady: Promise<void> | null = null;
let smtpTransporter: nodemailer.Transporter | null = null;

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  return Number(value || 0);
}

function coerceJson<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

function toIsoString(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return new Date(String(value)).toISOString();
}

function sanitizeText(value: unknown, maxLength: number, fallback = ''): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return fallback;
  return text.slice(0, maxLength);
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  const parsed = coerceJson<Record<string, unknown>>(value, {});
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
}

function toTemplateValue(value: unknown): string {
  if (value == null) return '';
  if (Array.isArray(value)) {
    return value
      .map((entry) => sanitizeText(entry, 120))
      .filter(Boolean)
      .join(', ');
  }

  return sanitizeText(value, 255);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + Math.max(0, days));
  return next;
}

function isWithinScheduleWindow(settings: SequenceSettings, now: Date = new Date()): boolean {
  const name = (settings.scheduleName || '').toLowerCase();
  
  if (name.includes('any time') || name.includes('24/7')) {
    return true;
  }

  // Get current hour and day based on timezone (if supported) or fallback to UTC/local
  let hour = now.getUTCHours();
  let day = now.getUTCDay(); // 0 is Sunday, 6 is Saturday
  
  try {
    const timeZone = settings.useLocalTimezone ? Intl.DateTimeFormat().resolvedOptions().timeZone : (settings.timezone || 'UTC');
    const formatterHour = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hourCycle: 'h23' });
    const formatterDay = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' });
    
    hour = parseInt(formatterHour.format(now), 10);
    const dayStr = formatterDay.format(now).toLowerCase();
    const daysMap: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
    if (dayStr in daysMap) {
      day = daysMap[dayStr];
    }
  } catch {
    // Ignore timezone parse errors, use UTC defaults computed above
  }

  const isWeekend = day === 0 || day === 6;

  // Weekdays only
  if (isWeekend) return false;

  // Window logic: Morning vs Afternoon vs standard 9-5
  if (name.includes('morning')) {
    return hour >= 8 && hour < 12; // 8am to 12pm
  }
  if (name.includes('afternoon')) {
    return hour >= 12 && hour < 17; // 12pm to 5pm
  }
  
  // Default general "Weekdays" business hours
  return hour >= 8 && hour < 18; // 8am to 6pm schedule
}

function canSendSequenceEmail() {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const from = process.env.SMTP_FROM?.trim();

  return Boolean(
    host &&
      user &&
      pass &&
      from &&
      user !== 'your-email@gmail.com' &&
      pass !== 'your-app-password' &&
      from !== 'your-email@gmail.com'
  );
}

function getSmtpTransporter() {
  if (!smtpTransporter) {
    smtpTransporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT || 587) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  return smtpTransporter;
}

async function sendSequenceEmail(to: string, subject: string, body: string) {
  const from = process.env.SMTP_FROM?.trim();
  if (!from || !canSendSequenceEmail()) {
    return { mode: 'simulated' as const };
  }

  await getSmtpTransporter().sendMail({
    from,
    to,
    subject,
    text: body,
  });

  return { mode: 'sent' as const };
}

function normalizeSettings(value: unknown): SequenceSettings {
  const raw = coerceJson<Partial<SequenceSettings>>(value, {});

  return {
    timezone: sanitizeText(raw.timezone, 50, DEFAULT_SETTINGS.timezone),
    scheduleName: sanitizeText(raw.scheduleName, 120, DEFAULT_SETTINGS.scheduleName),
    useLocalTimezone:
      typeof raw.useLocalTimezone === 'boolean'
        ? raw.useLocalTimezone
        : DEFAULT_SETTINGS.useLocalTimezone,
  };
}

function normalizeSteps(value: unknown): SequenceStep[] {
  const raw = coerceJson<Array<Partial<SequenceStep>>>(value, []);
  const steps = raw
    .map((step, index) => {
      const type = VALID_STEP_TYPES.has(step.type as SequenceStepType)
        ? (step.type as SequenceStepType)
        : DEFAULT_STEP.type;
      const delayDays = Math.max(0, Math.min(30, Number(step.delayDays || 0) || 0));
      const titleFallback =
        type === 'automatic_email'
          ? 'Email step'
          : type === 'manual_email'
            ? 'Manual email'
            : type === 'phone_call'
              ? 'Call step'
              : type === 'linkedin_task'
                ? 'LinkedIn task'
                : 'Task step';

      return {
        id: sanitizeText(step.id, 64, `step-${index + 1}`),
        type,
        title: sanitizeText(step.title, 120, titleFallback),
        delayDays,
        subject: sanitizeText(step.subject, 255),
        body: sanitizeText(step.body, 4000),
        taskType: sanitizeText(step.taskType, 80),
        isActive: typeof step.isActive === 'boolean' ? step.isActive : true,
      };
    })
    .filter((step, index, collection) => collection.findIndex((entry) => entry.id === step.id) === index);

  return steps.length > 0 ? steps : [DEFAULT_STEP];
}

function normalizeStatus(value: unknown, fallback: SequenceStatus = 'draft'): SequenceStatus {
  return VALID_SEQUENCE_STATUSES.has(value as SequenceStatus)
    ? (value as SequenceStatus)
    : fallback;
}

function mapMetrics(row: Record<string, unknown>): SequenceMetrics {
  return {
    enrolledCount: toNumber(row.enrolled_count),
    activeCount: toNumber(row.active_count),
    pausedCount: toNumber(row.paused_count),
    completedCount: toNumber(row.completed_count),
    stoppedCount: toNumber(row.stopped_count),
  };
}

function mapSequenceRow(row: Record<string, unknown>): SequenceListItem {
  return {
    id: String(row.id),
    orgId: String(row.org_id),
    ownerUserId: String(row.owner_user_id),
    name: String(row.name),
    description: String(row.description || ''),
    status: normalizeStatus(row.status),
    settings: normalizeSettings(row.settings),
    steps: normalizeSteps(row.steps),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
    metrics: mapMetrics(row),
  };
}

function mapEnrollmentRow(row: Record<string, unknown>): SequenceEnrollment {
  const status = VALID_ENROLLMENT_STATUSES.has(row.status as EnrollmentStatus)
    ? (row.status as EnrollmentStatus)
    : 'active';

  return {
    id: String(row.id),
    sequenceId: String(row.sequence_id),
    contactId: String(row.contact_id),
    status,
    currentStepIndex: toNumber(row.current_step_index),
    nextRunAt: row.next_run_at ? toIsoString(row.next_run_at) : null,
    pausedUntil: row.paused_until ? toIsoString(row.paused_until) : null,
    finishedReason: row.finished_reason ? String(row.finished_reason) : null,
    lastActivityAt: toIsoString(row.last_activity_at),
    createdAt: toIsoString(row.created_at),
    sendFromUserId: row.send_from_user_id ? String(row.send_from_user_id) : null,
    contact: {
      id: String(row.contact_id),
      firstName: String(row.first_name || ''),
      lastName: String(row.last_name || ''),
      email: row.email ? String(row.email) : null,
      stage: row.stage ? String(row.stage) : null,
      companyName: row.company_name ? String(row.company_name) : null,
    },
  };
}

function mapEventRow(row: Record<string, unknown>): SequenceEvent {
  return {
    id: String(row.id),
    eventType: String(row.event_type),
    eventSummary: String(row.event_summary || ''),
    createdAt: toIsoString(row.created_at),
    contactName: row.contact_name ? String(row.contact_name) : null,
  };
}

function mapTaskRow(row: Record<string, unknown>): AppTask {
  return {
    id: String(row.id),
    title: String(row.title),
    description: String(row.description || ''),
    status: String(row.status) === 'completed' ? 'completed' : 'open',
    dueAt: row.due_at ? toIsoString(row.due_at) : null,
    completedAt: row.completed_at ? toIsoString(row.completed_at) : null,
    sourceType: String(row.source_type || 'sequence'),
    sequenceId: row.sequence_id ? String(row.sequence_id) : null,
    sequenceName: row.sequence_name ? String(row.sequence_name) : null,
    contactName: row.contact_name ? String(row.contact_name) : null,
    contactEmail: row.contact_email ? String(row.contact_email) : null,
    createdAt: toIsoString(row.created_at),
    metadata: parseJsonObject(row.metadata),
  };
}

function buildSequenceTemplateVariables(row: Record<string, unknown>) {
  const rawFirstName = toTemplateValue(row.first_name);
  const lastName = toTemplateValue(row.last_name);
  const fullName = `${rawFirstName} ${lastName}`.trim();
  const firstName = rawFirstName || fullName || 'there';
  const email = toTemplateValue(row.email);
  const companyName = toTemplateValue(row.company_name);
  const companyDomain = toTemplateValue(row.company_domain);
  const title = toTemplateValue(row.title);
  const department = toTemplateValue(row.department);
  const city = toTemplateValue(row.city);
  const state = toTemplateValue(row.state);
  const country = toTemplateValue(row.country);
  const stage = toTemplateValue(row.stage);
  const phoneDirect = toTemplateValue(row.phone_direct);
  const phoneMobile = toTemplateValue(row.phone_mobile);
  const phoneHq = toTemplateValue(row.phone_hq);
  const phone = phoneDirect || phoneMobile || phoneHq;
  const linkedinUrl = toTemplateValue(row.linkedin_url);
  const leadScore =
    row.lead_score == null || row.lead_score === ''
      ? ''
      : String(toNumber(row.lead_score));
  const tags = toTemplateValue(row.tags);

  return {
    first_name: firstName,
    last_name: lastName,
    full_name: fullName || firstName,
    email,
    company_name: companyName,
    company_domain: companyDomain,
    title,
    department,
    city,
    state,
    country,
    stage,
    phone,
    phone_direct: phoneDirect,
    phone_mobile: phoneMobile,
    phone_hq: phoneHq,
    linkedin_url: linkedinUrl,
    lead_score: leadScore,
    tags,
  };
}

function renderSequenceTemplate(template: string, variables: Record<string, string>) {
  return template.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (match, token: string) => {
    const key = token.toLowerCase();
    return Object.prototype.hasOwnProperty.call(variables, key) ? variables[key] : match;
  });
}

export async function ensureSequencesTables() {
  if (!sequencesTablesReady) {
    sequencesTablesReady = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS app_sequences (
          id UUID PRIMARY KEY,
          org_id UUID NOT NULL,
          owner_user_id UUID NOT NULL,
          name VARCHAR(255) NOT NULL,
          description TEXT,
          status VARCHAR(20) NOT NULL DEFAULT 'draft',
          settings JSONB NOT NULL DEFAULT '{}'::jsonb,
          steps JSONB NOT NULL DEFAULT '[]'::jsonb,
          created_at TIMESTAMP(6) NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP(6) NOT NULL DEFAULT NOW()
        )
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS app_sequences_org_status_idx
        ON app_sequences (org_id, status, updated_at DESC)
      `);
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS app_sequence_enrollments (
          id UUID PRIMARY KEY,
          sequence_id UUID NOT NULL,
          org_id UUID NOT NULL,
          contact_id UUID NOT NULL,
          status VARCHAR(20) NOT NULL DEFAULT 'active',
          current_step_index INTEGER NOT NULL DEFAULT 0,
          next_run_at TIMESTAMP(6),
          paused_until TIMESTAMP(6),
          finished_reason VARCHAR(100),
          last_activity_at TIMESTAMP(6) NOT NULL DEFAULT NOW(),
          send_from_user_id UUID,
          created_at TIMESTAMP(6) NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP(6) NOT NULL DEFAULT NOW(),
          CONSTRAINT app_sequence_enrollments_sequence_contact_unique UNIQUE (sequence_id, contact_id)
        )
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS app_sequence_enrollments_org_status_idx
        ON app_sequence_enrollments (org_id, status, updated_at DESC)
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS app_sequence_enrollments_sequence_idx
        ON app_sequence_enrollments (sequence_id, updated_at DESC)
      `);
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS app_sequence_events (
          id UUID PRIMARY KEY,
          org_id UUID NOT NULL,
          sequence_id UUID NOT NULL,
          enrollment_id UUID,
          contact_id UUID,
          event_type VARCHAR(50) NOT NULL,
          event_summary TEXT NOT NULL,
          payload JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at TIMESTAMP(6) NOT NULL DEFAULT NOW()
        )
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS app_sequence_events_org_created_idx
        ON app_sequence_events (org_id, created_at DESC)
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS app_sequence_events_sequence_idx
        ON app_sequence_events (sequence_id, created_at DESC)
      `);
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS app_tasks (
          id UUID PRIMARY KEY,
          org_id UUID NOT NULL,
          source_type VARCHAR(50) NOT NULL DEFAULT 'sequence',
          sequence_id UUID,
          enrollment_id UUID,
          contact_id UUID,
          title VARCHAR(255) NOT NULL,
          description TEXT,
          status VARCHAR(20) NOT NULL DEFAULT 'open',
          due_at TIMESTAMP(6),
          completed_at TIMESTAMP(6),
          metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at TIMESTAMP(6) NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP(6) NOT NULL DEFAULT NOW()
        )
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS app_tasks_org_status_idx
        ON app_tasks (org_id, status, updated_at DESC)
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS app_tasks_sequence_idx
        ON app_tasks (sequence_id, updated_at DESC)
      `);
    })().catch((error) => {
      sequencesTablesReady = null;
      throw error;
    });
  }

  await sequencesTablesReady;
}

export async function listSequences(
  orgId: string,
  {
    page = 1,
    limit = 12,
    search = '',
    status = 'all',
  }: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
  }
): Promise<SequenceListResponse> {
  await ensureSequencesTables();

  const safePage = Math.max(1, page);
  const safeLimit = Math.min(Math.max(1, limit), 50);
  const safeSearch = search.trim();
  const safeStatus = status.trim() || 'all';
  const offset = (safePage - 1) * safeLimit;

  const [rows, totalRows, sequenceSummaryRows, enrollmentSummaryRows] = await Promise.all([
    prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `
        SELECT
          s.*,
          COALESCE(stats.enrolled_count, 0) AS enrolled_count,
          COALESCE(stats.active_count, 0) AS active_count,
          COALESCE(stats.paused_count, 0) AS paused_count,
          COALESCE(stats.completed_count, 0) AS completed_count,
          COALESCE(stats.stopped_count, 0) AS stopped_count
        FROM app_sequences s
        LEFT JOIN LATERAL (
          SELECT
            COUNT(*) AS enrolled_count,
            COUNT(*) FILTER (WHERE status = 'active') AS active_count,
            COUNT(*) FILTER (WHERE status = 'paused') AS paused_count,
            COUNT(*) FILTER (WHERE status = 'completed') AS completed_count,
            COUNT(*) FILTER (WHERE status = 'stopped') AS stopped_count
          FROM app_sequence_enrollments e
          WHERE e.sequence_id = s.id
        ) stats ON TRUE
        WHERE
          s.org_id = $1
          AND ($2 = '' OR s.name ILIKE '%' || $2 || '%' OR COALESCE(s.description, '') ILIKE '%' || $2 || '%')
          AND ($3 = 'all' OR s.status = $3)
        ORDER BY
          CASE s.status
            WHEN 'active' THEN 0
            WHEN 'paused' THEN 1
            WHEN 'draft' THEN 2
            ELSE 3
          END,
          s.updated_at DESC
        OFFSET $4
        LIMIT $5
      `,
      orgId,
      safeSearch,
      safeStatus,
      offset,
      safeLimit
    ),
    prisma.$queryRawUnsafe<Array<{ count: bigint | number | string }>>(
      `
        SELECT COUNT(*) AS count
        FROM app_sequences
        WHERE
          org_id = $1
          AND ($2 = '' OR name ILIKE '%' || $2 || '%' OR COALESCE(description, '') ILIKE '%' || $2 || '%')
          AND ($3 = 'all' OR status = $3)
      `,
      orgId,
      safeSearch,
      safeStatus
    ),
    prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `
        SELECT
          COUNT(*) AS total_sequences,
          COUNT(*) FILTER (WHERE status = 'active') AS active_sequences
        FROM app_sequences
        WHERE org_id = $1
      `,
      orgId
    ),
    prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `
        SELECT
          COUNT(*) AS total_enrolled,
          COUNT(*) FILTER (WHERE status = 'active') AS active_enrollments,
          COUNT(*) FILTER (WHERE status = 'paused') AS paused_enrollments,
          COUNT(*) FILTER (WHERE status = 'completed') AS completed_enrollments
        FROM app_sequence_enrollments
        WHERE org_id = $1
      `,
      orgId
    ),
  ]);

  const total = toNumber(totalRows[0]?.count);
  const sequenceSummary = sequenceSummaryRows[0] || {};
  const enrollmentSummary = enrollmentSummaryRows[0] || {};

  return {
    data: rows.map(mapSequenceRow),
    meta: {
      total,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.max(1, Math.ceil(total / safeLimit)),
    },
    summary: {
      totalSequences: toNumber(sequenceSummary.total_sequences),
      activeSequences: toNumber(sequenceSummary.active_sequences),
      totalEnrolled: toNumber(enrollmentSummary.total_enrolled),
      activeEnrollments: toNumber(enrollmentSummary.active_enrollments),
      pausedEnrollments: toNumber(enrollmentSummary.paused_enrollments),
      completedEnrollments: toNumber(enrollmentSummary.completed_enrollments),
    },
  };
}

async function fetchSequenceRow(orgId: string, sequenceId: string) {
  const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `
      SELECT
        s.*,
        COALESCE(stats.enrolled_count, 0) AS enrolled_count,
        COALESCE(stats.active_count, 0) AS active_count,
        COALESCE(stats.paused_count, 0) AS paused_count,
        COALESCE(stats.completed_count, 0) AS completed_count,
        COALESCE(stats.stopped_count, 0) AS stopped_count
      FROM app_sequences s
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) AS enrolled_count,
          COUNT(*) FILTER (WHERE status = 'active') AS active_count,
          COUNT(*) FILTER (WHERE status = 'paused') AS paused_count,
          COUNT(*) FILTER (WHERE status = 'completed') AS completed_count,
          COUNT(*) FILTER (WHERE status = 'stopped') AS stopped_count
        FROM app_sequence_enrollments e
        WHERE e.sequence_id = s.id
      ) stats ON TRUE
      WHERE s.org_id = $1 AND s.id = $2
      LIMIT 1
    `,
    orgId,
    sequenceId
  );

  return rows[0] || null;
}

async function recordSequenceEvent(args: {
  orgId: string;
  sequenceId: string;
  enrollmentId?: string | null;
  contactId?: string | null;
  eventType: string;
  eventSummary: string;
  payload?: Record<string, unknown>;
}) {
  await prisma.$executeRawUnsafe(
    `
      INSERT INTO app_sequence_events (
        id,
        org_id,
        sequence_id,
        enrollment_id,
        contact_id,
        event_type,
        event_summary,
        payload,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, NOW())
    `,
    randomUUID(),
    args.orgId,
    args.sequenceId,
    args.enrollmentId || null,
    args.contactId || null,
    args.eventType,
    args.eventSummary,
    JSON.stringify(args.payload || {})
  );
}

async function createSequenceTask(args: {
  orgId: string;
  sequenceId: string;
  enrollmentId: string;
  contactId: string;
  title: string;
  description: string;
  dueAt?: Date | null;
  metadata?: Record<string, unknown>;
}) {
  const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `
      INSERT INTO app_tasks (
        id,
        org_id,
        source_type,
        sequence_id,
        enrollment_id,
        contact_id,
        title,
        description,
        status,
        due_at,
        metadata,
        created_at,
        updated_at
      )
      VALUES ($1, $2, 'sequence', $3, $4, $5, $6, $7, 'open', $8, $9::jsonb, NOW(), NOW())
      RETURNING id
    `,
    randomUUID(),
    args.orgId,
    args.sequenceId,
    args.enrollmentId,
    args.contactId,
    args.title,
    args.description,
    args.dueAt || null,
    JSON.stringify(args.metadata || {})
  );

  return rows[0]?.id || null;
}

export async function getSequenceDetail(orgId: string, sequenceId: string): Promise<SequenceDetail> {
  await ensureSequencesTables();

  const [sequenceRow, enrollmentRows, eventRows] = await Promise.all([
    fetchSequenceRow(orgId, sequenceId),
    prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `
        SELECT
          e.*,
          c.first_name,
          c.last_name,
          c.email,
          c.stage,
          comp.name AS company_name
        FROM app_sequence_enrollments e
        LEFT JOIN "Contact" c ON c.id = e.contact_id
        LEFT JOIN "Company" comp ON comp.id = c.company_id
        WHERE e.org_id = $1 AND e.sequence_id = $2
        ORDER BY e.updated_at DESC, c.first_name ASC NULLS LAST, c.last_name ASC NULLS LAST
      `,
      orgId,
      sequenceId
    ),
    prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `
        SELECT
          ev.*,
          TRIM(CONCAT(COALESCE(c.first_name, ''), ' ', COALESCE(c.last_name, ''))) AS contact_name
        FROM app_sequence_events ev
        LEFT JOIN "Contact" c ON c.id = ev.contact_id
        WHERE ev.org_id = $1 AND ev.sequence_id = $2
        ORDER BY ev.created_at DESC
        LIMIT 12
      `,
      orgId,
      sequenceId
    ),
  ]);

  if (!sequenceRow) {
    throw new SequenceStoreError('Sequence not found.', 404);
  }

  return {
    ...mapSequenceRow(sequenceRow),
    enrollments: enrollmentRows.map(mapEnrollmentRow),
    recentEvents: eventRows.map(mapEventRow),
  };
}

export async function createSequence(
  orgId: string,
  ownerUserId: string,
  payload: {
    name?: unknown;
    description?: unknown;
    status?: unknown;
    settings?: unknown;
    steps?: unknown;
  }
) {
  await ensureSequencesTables();

  const name = sanitizeText(payload.name, 255);
  if (!name) {
    throw new SequenceStoreError('Sequence name is required.', 400);
  }

  const description = sanitizeText(payload.description, 4000);
  const settings = normalizeSettings(payload.settings);
  const steps = normalizeSteps(payload.steps);
  const status = normalizeStatus(payload.status, 'draft');
  const sequenceId = randomUUID();

  await prisma.$executeRawUnsafe(
    `
      INSERT INTO app_sequences (
        id,
        org_id,
        owner_user_id,
        name,
        description,
        status,
        settings,
        steps,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, NOW(), NOW())
    `,
    sequenceId,
    orgId,
    ownerUserId,
    name,
    description || null,
    status,
    JSON.stringify(settings),
    JSON.stringify(steps)
  );

  await recordSequenceEvent({
    orgId,
    sequenceId,
    eventType: 'sequence_created',
    eventSummary: `Created sequence "${name}".`,
  });

  return getSequenceDetail(orgId, sequenceId);
}

export async function updateSequence(
  orgId: string,
  sequenceId: string,
  payload: {
    name?: unknown;
    description?: unknown;
    status?: unknown;
    settings?: unknown;
    steps?: unknown;
  }
) {
  await ensureSequencesTables();

  const existing = await fetchSequenceRow(orgId, sequenceId);
  if (!existing) {
    throw new SequenceStoreError('Sequence not found.', 404);
  }

  const name = sanitizeText(payload.name, 255, String(existing.name || ''));
  if (!name) {
    throw new SequenceStoreError('Sequence name is required.', 400);
  }

  const description = sanitizeText(payload.description, 4000, String(existing.description || ''));
  const status = normalizeStatus(payload.status, normalizeStatus(existing.status));
  const settings = normalizeSettings(payload.settings ?? existing.settings);
  const steps = normalizeSteps(payload.steps ?? existing.steps);

  await prisma.$executeRawUnsafe(
    `
      UPDATE app_sequences
      SET
        name = $3,
        description = $4,
        status = $5,
        settings = $6::jsonb,
        steps = $7::jsonb,
        updated_at = NOW()
      WHERE org_id = $1 AND id = $2
    `,
    orgId,
    sequenceId,
    name,
    description || null,
    status,
    JSON.stringify(settings),
    JSON.stringify(steps)
  );

  if (status === 'active') {
    await prisma.$executeRawUnsafe(
      `
        UPDATE app_sequence_enrollments
        SET
          next_run_at = COALESCE(next_run_at, NOW()),
          updated_at = NOW()
        WHERE org_id = $1 AND sequence_id = $2 AND status = 'active'
      `,
      orgId,
      sequenceId
    );
  }

  await recordSequenceEvent({
    orgId,
    sequenceId,
    eventType: 'sequence_updated',
    eventSummary: `Updated sequence "${name}" (${status}).`,
    payload: { status, stepCount: steps.length },
  });

  return getSequenceDetail(orgId, sequenceId);
}

export async function enrollContactsInSequence(
  orgId: string,
  sequenceId: string,
  contactIds: string[],
  sendFromUserId?: string | null
) {
  await ensureSequencesTables();

  const uniqueContactIds = Array.from(
    new Set(contactIds.map((value) => value.trim()).filter(Boolean))
  );

  if (uniqueContactIds.length === 0) {
    throw new SequenceStoreError('Select at least one contact to enroll.', 400);
  }

  const sequence = await fetchSequenceRow(orgId, sequenceId);
  if (!sequence) {
    throw new SequenceStoreError('Sequence not found.', 404);
  }

  const contacts = await prisma.contact.findMany({
    where: {
      org_id: orgId,
      id: {
        in: uniqueContactIds,
      },
    },
    select: {
      id: true,
    },
  });

  if (contacts.length === 0) {
    throw new SequenceStoreError('No matching contacts were found for this workspace.', 400);
  }

  const activeSequence = normalizeStatus(sequence.status) === 'active';
  let insertedCount = 0;

  for (const contact of contacts) {
    const inserted = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `
        INSERT INTO app_sequence_enrollments (
          id,
          sequence_id,
          org_id,
          contact_id,
          status,
          current_step_index,
          next_run_at,
          paused_until,
          finished_reason,
          last_activity_at,
          send_from_user_id,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, 'active', 0, $5, NULL, NULL, NOW(), $6, NOW(), NOW())
        ON CONFLICT (sequence_id, contact_id) DO NOTHING
        RETURNING id
      `,
      randomUUID(),
      sequenceId,
      orgId,
      contact.id,
      activeSequence ? new Date() : null,
      sendFromUserId || null
    );

    if (inserted.length > 0) {
      insertedCount += 1;
      await recordSequenceEvent({
        orgId,
        sequenceId,
        enrollmentId: inserted[0].id,
        contactId: contact.id,
        eventType: 'contact_enrolled',
        eventSummary: 'Enrolled contact into the sequence.',
      });
    }
  }

  return {
    insertedCount,
    totalRequested: uniqueContactIds.length,
    sequence: await getSequenceDetail(orgId, sequenceId),
  };
}

export async function updateEnrollmentStatus(
  orgId: string,
  sequenceId: string,
  enrollmentId: string,
  action: string
) {
  await ensureSequencesTables();

  const validAction = action.trim().toLowerCase();
  if (!['pause', 'resume', 'complete', 'stop'].includes(validAction)) {
    throw new SequenceStoreError('Unsupported enrollment action.', 400);
  }

  const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `
      SELECT id, status
      FROM app_sequence_enrollments
      WHERE org_id = $1 AND sequence_id = $2 AND id = $3
      LIMIT 1
    `,
    orgId,
    sequenceId,
    enrollmentId
  );

  const current = rows[0];
  if (!current) {
    throw new SequenceStoreError('Enrollment not found.', 404);
  }

  let nextStatus: EnrollmentStatus = 'active';
  let finishedReason: string | null = null;
  let nextRunAt: Date | null = null;
  let pausedUntil: Date | null = null;
  const actionLabel =
    validAction === 'pause'
      ? 'paused'
      : validAction === 'resume'
        ? 'resumed'
        : validAction === 'complete'
          ? 'completed'
          : 'stopped';

  switch (validAction) {
    case 'pause':
      nextStatus = 'paused';
      pausedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);
      break;
    case 'resume':
      nextStatus = 'active';
      nextRunAt = new Date();
      break;
    case 'complete':
      nextStatus = 'completed';
      finishedReason = 'completed_manually';
      break;
    case 'stop':
      nextStatus = 'stopped';
      finishedReason = 'stopped_manually';
      break;
  }

  await prisma.$executeRawUnsafe(
    `
      UPDATE app_sequence_enrollments
      SET
        status = $4,
        next_run_at = $5,
        paused_until = $6,
        finished_reason = $7,
        last_activity_at = NOW(),
        updated_at = NOW()
      WHERE org_id = $1 AND sequence_id = $2 AND id = $3
    `,
    orgId,
    sequenceId,
    enrollmentId,
    nextStatus,
    nextRunAt,
    pausedUntil,
    finishedReason
  );

  await recordSequenceEvent({
    orgId,
    sequenceId,
    enrollmentId,
    eventType: `enrollment_${validAction}`,
    eventSummary: `Enrollment ${actionLabel}.`,
    payload: { nextStatus },
  });

  return getSequenceDetail(orgId, sequenceId);
}

async function advanceEnrollmentToNextStep(args: {
  orgId: string;
  sequenceId: string;
  enrollmentId: string;
  contactId: string | null;
  sequenceName: string;
  steps: SequenceStep[];
  currentStepIndex: number;
  currentStepTitle: string;
  now: Date;
}) {
  const nextStepIndex = args.currentStepIndex + 1;

  if (nextStepIndex >= args.steps.length) {
    await prisma.$executeRawUnsafe(
      `
        UPDATE app_sequence_enrollments
        SET
          status = 'completed',
          current_step_index = $4,
          next_run_at = NULL,
          paused_until = NULL,
          finished_reason = 'sequence_finished',
          last_activity_at = $5,
          updated_at = NOW()
        WHERE org_id = $1 AND sequence_id = $2 AND id = $3
      `,
      args.orgId,
      args.sequenceId,
      args.enrollmentId,
      args.currentStepIndex,
      args.now
    );

    await recordSequenceEvent({
      orgId: args.orgId,
      sequenceId: args.sequenceId,
      enrollmentId: args.enrollmentId,
      contactId: args.contactId,
      eventType: 'sequence_completed',
      eventSummary: `Finished "${args.sequenceName}" after "${args.currentStepTitle}".`,
    });

    return { completed: true };
  }

  const nextStep = args.steps[nextStepIndex];
  const nextRunAt = addDays(args.now, nextStep.delayDays);

  await prisma.$executeRawUnsafe(
    `
      UPDATE app_sequence_enrollments
      SET
        current_step_index = $4,
        next_run_at = $5,
        paused_until = NULL,
        finished_reason = NULL,
        last_activity_at = $6,
        updated_at = NOW()
      WHERE org_id = $1 AND sequence_id = $2 AND id = $3
    `,
    args.orgId,
    args.sequenceId,
    args.enrollmentId,
    nextStepIndex,
    nextRunAt,
    args.now
  );

  await recordSequenceEvent({
    orgId: args.orgId,
    sequenceId: args.sequenceId,
    enrollmentId: args.enrollmentId,
    contactId: args.contactId,
    eventType: 'step_scheduled',
    eventSummary: `Scheduled "${nextStep.title}" for ${nextRunAt.toLocaleString()}.`,
    payload: { nextStepIndex, nextRunAt: nextRunAt.toISOString() },
  });

  return { completed: false, nextRunAt };
}

export async function runDueSequenceSteps(
  orgId: string,
  actorUserId: string
): Promise<SequenceRunSummary> {
  await ensureSequencesTables();

  const summary: SequenceRunSummary = {
    processedEnrollments: 0,
    emailsSent: 0,
    emailsSimulated: 0,
    tasksCreated: 0,
    completedEnrollments: 0,
    skippedSteps: 0,
  };

  const dueRows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `
      SELECT
        e.*,
        s.name AS sequence_name,
        s.settings,
        s.steps,
        c.first_name,
        c.last_name,
        c.email,
        c.title,
        c.department,
        c.linkedin_url,
        c.city,
        c.state,
        c.country,
        c.stage,
        c.phone_direct,
        c.phone_mobile,
        c.phone_hq,
        c.lead_score,
        c.tags,
        comp.name AS company_name,
        comp.domain AS company_domain
      FROM app_sequence_enrollments e
      INNER JOIN app_sequences s
        ON s.id = e.sequence_id
       AND s.org_id = e.org_id
      LEFT JOIN "Contact" c
        ON c.id = e.contact_id
      LEFT JOIN "Company" comp
        ON comp.id = c.company_id
      WHERE
        e.org_id = $1
        AND s.status = 'active'
        AND e.status = 'active'
        AND e.next_run_at IS NOT NULL
        AND e.next_run_at <= NOW()
      ORDER BY e.next_run_at ASC
      LIMIT 100
    `,
    orgId
  );

  for (const row of dueRows) {
    const now = new Date();
    const settings = normalizeSettings(row.settings);
    
    if (!isWithinScheduleWindow(settings, now)) {
      continue; // Skip processing this enrollment until we are within the schedule window
    }

    const steps = normalizeSteps(row.steps);
    const currentStepIndex = toNumber(row.current_step_index);
    const step = steps[currentStepIndex];
    const sequenceId = String(row.sequence_id);
    const enrollmentId = String(row.id);
    const contactId = row.contact_id ? String(row.contact_id) : null;
    const sequenceName = String(row.sequence_name || 'Sequence');
    const contactName = `${String(row.first_name || '').trim()} ${String(row.last_name || '').trim()}`.trim() || 'this contact';
    const contactEmail = row.email ? String(row.email) : null;
    const templateVariables = buildSequenceTemplateVariables(row);
    const renderedStepTitle = renderSequenceTemplate(step?.title || 'Step', templateVariables).trim() || step?.title || 'Step';

    summary.processedEnrollments += 1;

    if (!step) {
      await advanceEnrollmentToNextStep({
        orgId,
        sequenceId,
        enrollmentId,
        contactId,
        sequenceName,
        steps,
        currentStepIndex,
        currentStepTitle: 'Final step',
        now,
      });
      summary.completedEnrollments += 1;
      continue;
    }

    if (step.type === 'automatic_email') {
      if (!contactEmail) {
        summary.skippedSteps += 1;
        await recordSequenceEvent({
          orgId,
          sequenceId,
          enrollmentId,
          contactId,
          eventType: 'email_skipped',
          eventSummary: `Skipped "${renderedStepTitle}" because the contact has no email address.`,
        });
      } else {
        const renderedSubject =
          renderSequenceTemplate(step.subject || step.title, templateVariables).trim() ||
          step.subject ||
          step.title;
        const renderedBody =
          renderSequenceTemplate(step.body || step.title, templateVariables).trim() ||
          step.body ||
          step.title;
        const result = await sendSequenceEmail(
          contactEmail,
          renderedSubject,
          renderedBody
        );

        if (result.mode === 'sent') {
          summary.emailsSent += 1;
        } else {
          summary.emailsSimulated += 1;
        }

        await recordSequenceEvent({
          orgId,
          sequenceId,
          enrollmentId,
          contactId,
          eventType: result.mode === 'sent' ? 'email_sent' : 'email_simulated',
          eventSummary: `${result.mode === 'sent' ? 'Sent' : 'Simulated'} "${renderedStepTitle}" to ${contactName}.`,
          payload: {
            to: contactEmail,
            subject: renderedSubject,
            actorUserId,
          },
        });
      }

      const advance = await advanceEnrollmentToNextStep({
        orgId,
        sequenceId,
        enrollmentId,
        contactId,
        sequenceName,
        steps,
        currentStepIndex,
        currentStepTitle: renderedStepTitle,
        now,
      });
      if (advance.completed) summary.completedEnrollments += 1;
      continue;
    }

    const existingTaskRows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `
        SELECT id
        FROM app_tasks
        WHERE
          org_id = $1
          AND enrollment_id = $2
          AND status = 'open'
          AND metadata->>'stepIndex' = $3
        LIMIT 1
      `,
      orgId,
      enrollmentId,
      String(currentStepIndex)
    );

    if (!contactId) {
      summary.skippedSteps += 1;
      await recordSequenceEvent({
        orgId,
        sequenceId,
        enrollmentId,
        eventType: 'task_skipped',
        eventSummary: `Skipped "${renderedStepTitle}" because the enrollment is missing a contact.`,
      });
      continue;
    }

    if (existingTaskRows.length === 0) {
      const renderedTaskTitle =
        renderSequenceTemplate(step.title || `Task for ${contactName}`, templateVariables).trim() ||
        step.title ||
        `Task for ${contactName}`;
      const renderedSubject =
        renderSequenceTemplate(step.subject || '', templateVariables).trim();
      const renderedDescription =
        renderSequenceTemplate(step.body || step.subject || step.title, templateVariables).trim() ||
        step.body ||
        step.subject ||
        step.title;
      const taskTitle =
        step.type === 'manual_email'
          ? `Send manual email to ${contactName}`
          : step.type === 'phone_call'
            ? `Call ${contactName}`
            : step.type === 'linkedin_task'
              ? `LinkedIn touch for ${contactName}`
              : renderedTaskTitle;

      const taskDescription =
        step.type === 'manual_email' && renderedSubject
          ? `Subject: ${renderedSubject}\n\n${renderedDescription}`
          : renderedDescription;

      await createSequenceTask({
        orgId,
        sequenceId,
        enrollmentId,
        contactId,
        title: taskTitle,
        description: taskDescription,
        dueAt: now,
        metadata: {
          stepIndex: currentStepIndex,
          stepType: step.type,
          stepTitle: step.title,
        },
      });
      summary.tasksCreated += 1;

      await recordSequenceEvent({
        orgId,
        sequenceId,
        enrollmentId,
        contactId,
        eventType: 'task_created',
        eventSummary: `Created a ${step.type.replace('_', ' ')} task for ${contactName} from "${renderedStepTitle}".`,
        payload: { stepIndex: currentStepIndex, stepType: step.type },
      });
    }

    await prisma.$executeRawUnsafe(
      `
        UPDATE app_sequence_enrollments
        SET
          next_run_at = NULL,
          last_activity_at = $4,
          updated_at = NOW()
        WHERE org_id = $1 AND sequence_id = $2 AND id = $3
      `,
      orgId,
      sequenceId,
      enrollmentId,
      now
    );
  }

  return summary;
}

export async function listTasks(
  orgId: string,
  {
    page = 1,
    limit = 25,
    search = '',
    status = 'all',
  }: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
  }
): Promise<TaskListResponse> {
  await ensureSequencesTables();

  const safePage = Math.max(1, page);
  const safeLimit = Math.min(Math.max(1, limit), 100);
  const safeSearch = search.trim();
  const safeStatus = status.trim() || 'all';
  const offset = (safePage - 1) * safeLimit;

  const [rows, totalRows, summaryRows] = await Promise.all([
    prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `
        SELECT
          t.*,
          s.name AS sequence_name,
          TRIM(CONCAT(COALESCE(c.first_name, ''), ' ', COALESCE(c.last_name, ''))) AS contact_name,
          c.email AS contact_email
        FROM app_tasks t
        LEFT JOIN app_sequences s ON s.id = t.sequence_id
        LEFT JOIN "Contact" c ON c.id = t.contact_id
        WHERE
          t.org_id = $1
          AND ($2 = 'all' OR t.status = $2)
          AND (
            $3 = ''
            OR t.title ILIKE '%' || $3 || '%'
            OR COALESCE(t.description, '') ILIKE '%' || $3 || '%'
            OR COALESCE(s.name, '') ILIKE '%' || $3 || '%'
            OR COALESCE(c.email, '') ILIKE '%' || $3 || '%'
          )
        ORDER BY
          CASE t.status WHEN 'open' THEN 0 ELSE 1 END,
          t.due_at ASC NULLS LAST,
          t.created_at DESC
        OFFSET $4
        LIMIT $5
      `,
      orgId,
      safeStatus,
      safeSearch,
      offset,
      safeLimit
    ),
    prisma.$queryRawUnsafe<Array<{ count: bigint | number | string }>>(
      `
        SELECT COUNT(*) AS count
        FROM app_tasks
        WHERE
          org_id = $1
          AND ($2 = 'all' OR status = $2)
          AND (
            $3 = ''
            OR title ILIKE '%' || $3 || '%'
            OR COALESCE(description, '') ILIKE '%' || $3 || '%'
          )
      `,
      orgId,
      safeStatus,
      safeSearch
    ),
    prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `
        SELECT
          COUNT(*) FILTER (WHERE status = 'open') AS open_tasks,
          COUNT(*) FILTER (WHERE status = 'completed') AS completed_tasks
        FROM app_tasks
        WHERE org_id = $1
      `,
      orgId
    ),
  ]);

  const total = toNumber(totalRows[0]?.count);
  const summary = summaryRows[0] || {};

  return {
    data: rows.map(mapTaskRow),
    meta: {
      total,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.max(1, Math.ceil(total / safeLimit)),
    },
    summary: {
      openTasks: toNumber(summary.open_tasks),
      completedTasks: toNumber(summary.completed_tasks),
    },
  };
}

export async function updateTaskCompletion(
  orgId: string,
  taskId: string,
  action: 'complete' | 'reopen'
) {
  await ensureSequencesTables();

  const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `
      SELECT *
      FROM app_tasks
      WHERE org_id = $1 AND id = $2
      LIMIT 1
    `,
    orgId,
    taskId
  );

  const task = rows[0];
  if (!task) {
    throw new SequenceStoreError('Task not found.', 404);
  }

  const nextStatus = action === 'complete' ? 'completed' : 'open';
  const completedAt = action === 'complete' ? new Date() : null;

  await prisma.$executeRawUnsafe(
    `
      UPDATE app_tasks
      SET
        status = $3,
        completed_at = $4,
        updated_at = NOW()
      WHERE org_id = $1 AND id = $2
    `,
    orgId,
    taskId,
    nextStatus,
    completedAt
  );

  if (action === 'complete' && task.sequence_id && task.enrollment_id) {
    const metadata = parseJsonObject(task.metadata);
    const stepIndex = Number(metadata.stepIndex ?? -1);
    const sequenceId = String(task.sequence_id);
    const enrollmentId = String(task.enrollment_id);
    const detail = await getSequenceDetail(orgId, sequenceId);
    const enrollment = detail.enrollments.find((item) => item.id === enrollmentId);

    if (enrollment && enrollment.currentStepIndex === stepIndex) {
      const now = new Date();
      const currentStep = detail.steps[stepIndex] || detail.steps[0];

      await recordSequenceEvent({
        orgId,
        sequenceId,
        enrollmentId,
        contactId: enrollment.contactId,
        eventType: 'task_completed',
        eventSummary: `Completed task "${task.title}".`,
      });

      await advanceEnrollmentToNextStep({
        orgId,
        sequenceId,
        enrollmentId,
        contactId: enrollment.contactId,
        sequenceName: detail.name,
        steps: detail.steps,
        currentStepIndex: stepIndex,
        currentStepTitle: currentStep?.title || 'Task step',
        now,
      });
    }
  }
}
