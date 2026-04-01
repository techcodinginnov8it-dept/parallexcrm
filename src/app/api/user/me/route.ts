import { NextResponse } from 'next/server';
import { getCurrentUser, unauthorizedResponse } from '@/lib/api-utils';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return unauthorizedResponse();

  return NextResponse.json({
    data: {
      id: user.id,
      email: user.email,
      role: user.role,
    },
  });
}
