import { createBrowserClient } from '@supabase/ssr';

function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  return (url.startsWith('http://') || url.startsWith('https://')) && key !== 'your-supabase-anon-key' && key.length > 0;
}

const DEMO_USER = {
  id: 'demo-user-001',
  email: 'demo@parallex-crm.dev',
  user_metadata: {
    first_name: 'Demo',
    last_name: 'User',
    org_name: 'Parallex CRM Demo',
  },
};

export function createClient() {
  if (!isSupabaseConfigured()) {
    // Return a mock client for demo mode
    return {
      auth: {
        getUser: async () => ({ data: { user: DEMO_USER }, error: null }),
        signInWithPassword: async () => ({ data: { user: DEMO_USER, session: null }, error: null }),
        signUp: async () => ({ data: { user: DEMO_USER, session: null }, error: null }),
        signOut: async () => ({ error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      },
    } as any;
  }

  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

