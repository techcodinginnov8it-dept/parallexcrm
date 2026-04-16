export function validateEnv() {
  const isClient = typeof window !== 'undefined';
  const missingVar = (name: string) => {
    throw new Error(`Missing required environment variable: ${name}`);
  };

  const check = (name: string, val: string | undefined, required: boolean = true) => {
    // Server-only variables shouldn't block the client from compiling/running
    if (required && !val && (!isClient || name.startsWith('NEXT_PUBLIC_'))) {
      if (process.env.NODE_ENV === 'development' && !isClient) {
        console.error(`Missing required environment variable: ${name}`);
      }
      missingVar(name);
    }
    return val as string;
  };

  // Next.js requires explicit process.env.VAR_NAME literals for the webpack replacement to work on the client
  return {
    DATABASE_URL: check('DATABASE_URL', process.env.DATABASE_URL),
    NEXT_PUBLIC_SUPABASE_URL: check('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: check('NEXT_PUBLIC_SUPABASE_ANON_KEY', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    SUPABASE_SERVICE_ROLE_KEY: check('SUPABASE_SERVICE_ROLE_KEY', process.env.SUPABASE_SERVICE_ROLE_KEY, false),
    NEXT_PUBLIC_APP_URL: check('NEXT_PUBLIC_APP_URL', process.env.NEXT_PUBLIC_APP_URL, false) ?? 'http://localhost:3000',
    NEXT_PUBLIC_APP_NAME: check('NEXT_PUBLIC_APP_NAME', process.env.NEXT_PUBLIC_APP_NAME, false) ?? 'Apollonious',
    
    // Optional SMTP
    SMTP_HOST: check('SMTP_HOST', process.env.SMTP_HOST, false),
    SMTP_PORT: check('SMTP_PORT', process.env.SMTP_PORT, false),
    SMTP_USER: check('SMTP_USER', process.env.SMTP_USER, false),
    SMTP_PASS: check('SMTP_PASS', process.env.SMTP_PASS, false),
    SMTP_FROM: check('SMTP_FROM', process.env.SMTP_FROM, false),
  };
}

export const env = validateEnv();
