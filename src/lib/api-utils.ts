import { createClient } from '@/lib/supabase/server';
import prisma from '@/lib/db';
import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';

const USER_INCLUDE = { organization: true, team: true } as const;
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PUBLIC_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'yahoo.com',
  'hotmail.com',
  'outlook.com',
  'icloud.com',
  'proton.me',
  'protonmail.com',
  'aol.com',
  'live.com',
  'msn.com',
]);

type AuthLikeUser = {
  id?: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

function isUuid(value: string): boolean {
  return UUID_REGEX.test(value);
}

function sanitizeName(value: string, fallback: string): string {
  const cleaned = value.trim().replace(/\s+/g, ' ');
  if (!cleaned) return fallback;
  return cleaned.slice(0, 100);
}

function sanitizeOrgName(value: string): string {
  const cleaned = value.trim().replace(/\s+/g, ' ');
  if (!cleaned) return 'Workspace';
  return cleaned.slice(0, 255);
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function addDomainSuffix(domain: string, suffix: number): string {
  const dotIndex = domain.indexOf('.');
  if (dotIndex <= 0) return `${domain}-${suffix}`;
  const host = domain.slice(0, dotIndex);
  const tld = domain.slice(dotIndex + 1);
  return `${host}-${suffix}.${tld}`;
}

async function resolveAuthUser(supabase: any): Promise<AuthLikeUser | null> {
  if (typeof supabase?.auth?.getUser === 'function') {
    const { data } = await supabase.auth.getUser();
    if (data?.user) return data.user as AuthLikeUser;
  }

  if (typeof supabase?.auth?.getSession === 'function') {
    const { data } = await supabase.auth.getSession();
    if (data?.session?.user) return data.session.user as AuthLikeUser;
  }

  return null;
}

async function getOrCreateOrganizationId(
  preferredDomain: string,
  orgName: string
): Promise<string | null> {
  const existing = await prisma.organization.findUnique({
    where: { domain: preferredDomain },
    select: { id: true },
  });
  if (existing) return existing.id;

  for (let attempt = 0; attempt < 5; attempt++) {
    const domainCandidate = attempt === 0 ? preferredDomain : addDomainSuffix(preferredDomain, attempt + 1);
    try {
      const created = await prisma.organization.create({
        data: {
          name: orgName,
          domain: domainCandidate,
        },
        select: { id: true },
      });
      return created.id;
    } catch (error: any) {
      if (error?.code !== 'P2002') {
        throw error;
      }
    }
  }

  return null;
}

export async function getCurrentUser() {
  const supabase = await createClient();
  const authUser = await resolveAuthUser(supabase);
  const authUserId = authUser?.id?.trim();
  const authEmail = authUser?.email?.trim().toLowerCase();

  if (!authUserId || !authEmail) return null;

  if (isUuid(authUserId)) {
    const byId = await prisma.user.findUnique({
      where: { id: authUserId },
      include: USER_INCLUDE,
    });
    if (byId) return byId;
  }

  const byEmail = await prisma.user.findUnique({
    where: { email: authEmail },
    include: USER_INCLUDE,
  });
  if (byEmail) return byEmail;

  const userMetadata = (authUser?.user_metadata || {}) as Record<string, unknown>;
  const rawFirstName = String(userMetadata.first_name || '').trim();
  const rawLastName = String(userMetadata.last_name || '').trim();
  const rawOrgName = String(userMetadata.org_name || '').trim();

  const [emailLocal = 'user', emailDomain = 'workspace.local'] = authEmail.split('@');
  const firstName = sanitizeName(rawFirstName, emailLocal.slice(0, 100) || 'User');
  const lastName = sanitizeName(rawLastName, 'User');
  const orgName = sanitizeOrgName(rawOrgName || `${firstName}'s Workspace`);

  const slugBase = slugify(rawOrgName || emailLocal || 'workspace') || `workspace-${authUserId.slice(0, 8)}`;
  const preferredDomain =
    emailDomain && !PUBLIC_EMAIL_DOMAINS.has(emailDomain)
      ? emailDomain
      : `${slugBase}.local`;

  try {
    const organizationId = await getOrCreateOrganizationId(preferredDomain, orgName);
    if (!organizationId) return null;

    const created = await prisma.user.create({
      data: {
        id: isUuid(authUserId) ? authUserId : randomUUID(),
        email: authEmail,
        first_name: firstName,
        last_name: lastName,
        org_id: organizationId,
        role: 'admin',
      },
      include: USER_INCLUDE,
    });

    return created;
  } catch (error: any) {
    if (error?.code === 'P2002') {
      const existing = await prisma.user.findUnique({
        where: { email: authEmail },
        include: USER_INCLUDE,
      });
      if (existing) return existing;
    }
    console.error('[auth] Failed to resolve current user:', error?.message || error);
    return null;
  }
}

export function unauthorizedResponse() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
