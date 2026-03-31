import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Role } from '@prisma/client';

type SeedAccount = {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: Role;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const databaseUrl = process.env.DATABASE_URL;

if (!supabaseUrl || !serviceRoleKey || !databaseUrl) {
  throw new Error('Missing required Supabase or database environment variables.');
}

const pool = new Pool({ connectionString: databaseUrl });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const workspaceName = process.env.DEFAULT_WORKSPACE_NAME || 'Parallex CRM Workspace';
const workspaceDomain = process.env.DEFAULT_WORKSPACE_DOMAIN || 'parallexcrm.dev';
const teamName = process.env.DEFAULT_TEAM_NAME || 'Core Team';

const accounts: SeedAccount[] = [
  {
    email: process.env.DEFAULT_ADMIN_EMAIL || 'admin@parallexcrm.dev',
    password: process.env.DEFAULT_ADMIN_PASSWORD || 'ParallexAdmin123!',
    firstName: 'Admin',
    lastName: 'User',
    role: 'admin',
  },
  {
    email: process.env.DEFAULT_USER_EMAIL || 'user@parallexcrm.dev',
    password: process.env.DEFAULT_USER_PASSWORD || 'ParallexUser123!',
    firstName: 'Standard',
    lastName: 'User',
    role: 'member',
  },
];

async function ensureAuthUser(account: SeedAccount) {
  const { data, error } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

  if (error) {
    throw new Error(`Failed to list Supabase users: ${error.message}`);
  }

  const existingUser = data.users.find(
    (user) => user.email?.toLowerCase() === account.email.toLowerCase()
  );

  if (!existingUser) {
    const { data: created, error: createError } =
      await supabase.auth.admin.createUser({
        email: account.email,
        password: account.password,
        email_confirm: true,
        user_metadata: {
          first_name: account.firstName,
          last_name: account.lastName,
          org_name: workspaceName,
        },
      });

    if (createError || !created.user) {
      throw new Error(
        `Failed to create Supabase user ${account.email}: ${createError?.message || 'Unknown error'}`
      );
    }

    return created.user;
  }

  const { data: updated, error: updateError } =
    await supabase.auth.admin.updateUserById(existingUser.id, {
      email: account.email,
      password: account.password,
      email_confirm: true,
      user_metadata: {
        first_name: account.firstName,
        last_name: account.lastName,
        org_name: workspaceName,
      },
    });

  if (updateError || !updated.user) {
    throw new Error(
      `Failed to update Supabase user ${account.email}: ${updateError?.message || 'Unknown error'}`
    );
  }

  return updated.user;
}

async function ensureWorkspace() {
  const organization = await prisma.organization.upsert({
    where: { domain: workspaceDomain },
    update: {
      name: workspaceName,
    },
    create: {
      name: workspaceName,
      domain: workspaceDomain,
      plan: 'professional',
      subscription_status: 'active',
      credits_remaining: 10000,
    },
  });

  const existingTeam = await prisma.team.findFirst({
    where: { org_id: organization.id, name: teamName },
  });

  const team =
    existingTeam ||
    (await prisma.team.create({
      data: {
        name: teamName,
        org_id: organization.id,
      },
    }));

  return { organization, team };
}

async function ensurePrismaUser(
  authUserId: string,
  account: SeedAccount,
  orgId: string,
  teamId: string
) {
  await prisma.user.upsert({
    where: { email: account.email },
    update: {
      first_name: account.firstName,
      last_name: account.lastName,
      role: account.role,
      org_id: orgId,
      team_id: teamId,
    },
    create: {
      id: authUserId,
      email: account.email,
      first_name: account.firstName,
      last_name: account.lastName,
      role: account.role,
      org_id: orgId,
      team_id: teamId,
    },
  });
}

async function main() {
  console.log('Seeding default Parallex CRM accounts...');

  const { organization, team } = await ensureWorkspace();

  for (const account of accounts) {
    const authUser = await ensureAuthUser(account);
    await ensurePrismaUser(authUser.id, account, organization.id, team.id);
    console.log(`Ready: ${account.role} account ${account.email}`);
  }

  console.log('');
  console.log('Default accounts are ready:');
  console.log(`Admin: ${accounts[0].email} / ${accounts[0].password}`);
  console.log(`User: ${accounts[1].email} / ${accounts[1].password}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
