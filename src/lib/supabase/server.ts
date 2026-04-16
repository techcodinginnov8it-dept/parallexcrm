import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { env } from '../env';

function isSupabaseConfigured(): boolean {
  const url = env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  return (url.startsWith('http://') || url.startsWith('https://')) && key !== 'your-supabase-anon-key' && key.length > 0;
}

// Demo user returned when Supabase is not configured
const DEMO_USER = {
  id: 'demo-user-001',
  email: 'demo@parallex-crm.dev',
  user_metadata: {
    first_name: 'Demo',
    last_name: 'User',
    org_name: 'Parallex CRM Demo',
  },
};

export async function createClient() {
  if (!isSupabaseConfigured()) {
    // Return a mock client for demo mode
    return {
      auth: {
        getUser: async () => ({ data: { user: DEMO_USER }, error: null }),
        signInWithPassword: async () => ({ data: { user: DEMO_USER, session: null }, error: null }),
        signUp: async () => ({ data: { user: DEMO_USER, session: null }, error: null }),
        signOut: async () => ({ error: null }),
      },
    } as any;
  }

  const cookieStore = await cookies();

  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from Server Component — ignore
          }
        },
      },
    }
  );
}

export async function createServiceClient() {
  if (!isSupabaseConfigured()) {
    return {
      auth: {
        getUser: async () => ({ data: { user: DEMO_USER }, error: null }),
      },
    } as any;
  }

  const { createClient: createSupabaseClient } = await import('@supabase/supabase-js');
  return createSupabaseClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

