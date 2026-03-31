import { NextRequest, NextResponse } from 'next/server';
import { Role } from '@prisma/client';
import prisma from '@/lib/db';
import {
  forbiddenResponse,
  getCurrentUser,
  isAdminRole,
  unauthorizedResponse,
} from '@/lib/api-utils';

const EDITABLE_ROLES: Role[] = ['admin', 'manager', 'member'];

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return unauthorizedResponse();
  if (!isAdminRole(user.role)) {
    return forbiddenResponse('Only admins can view workspace roles.');
  }

  const users = await prisma.user.findMany({
    where: { org_id: user.org_id },
    orderBy: [
      { first_name: 'asc' },
      { last_name: 'asc' },
      { email: 'asc' },
    ],
    select: {
      id: true,
      first_name: true,
      last_name: true,
      email: true,
      role: true,
      created_at: true,
    },
  });

  return NextResponse.json({
    data: users,
    currentUserId: user.id,
  });
}

export async function PATCH(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return unauthorizedResponse();
  if (!isAdminRole(user.role)) {
    return forbiddenResponse('Only admins can update workspace roles.');
  }

  const body = await request.json().catch(() => null);
  const userId = typeof body?.userId === 'string' ? body.userId : '';
  const nextRole = typeof body?.role === 'string' ? body.role : '';

  if (!userId || !EDITABLE_ROLES.includes(nextRole as Role)) {
    return NextResponse.json(
      { error: 'A valid userId and role are required.' },
      { status: 400 }
    );
  }

  const targetUser = await prisma.user.findFirst({
    where: {
      id: userId,
      org_id: user.org_id,
    },
    select: {
      id: true,
      role: true,
    },
  });

  if (!targetUser) {
    return NextResponse.json({ error: 'User not found.' }, { status: 404 });
  }

  const demotingAdmin = targetUser.role === 'admin' && nextRole !== 'admin';
  if (demotingAdmin) {
    const adminCount = await prisma.user.count({
      where: {
        org_id: user.org_id,
        role: 'admin',
      },
    });

    if (adminCount <= 1) {
      return NextResponse.json(
        { error: 'Your workspace must keep at least one admin.' },
        { status: 400 }
      );
    }
  }

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: { role: nextRole as Role },
    select: {
      id: true,
      first_name: true,
      last_name: true,
      email: true,
      role: true,
      created_at: true,
    },
  });

  return NextResponse.json({
    data: updatedUser,
    message: 'User role updated successfully.',
  });
}
