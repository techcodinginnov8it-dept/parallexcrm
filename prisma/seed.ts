import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function main() {
  console.log('Seeding Database...');

  // 1. Create Supabase Auth User
  const demoEmail = 'demo@apollonious.dev';
  const demoPassword = 'password123';
  let authUserId = '';

  console.log(`Checking if user ${demoEmail} exists in Supabase...`);
  const { data: { users }, error } = await supabase.auth.admin.listUsers();
  const existingUser = users.find((u) => u.email === demoEmail);

  if (!existingUser) {
    console.log(`Creating user ${demoEmail} in Supabase Auth...`);
    const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
      email: demoEmail,
      password: demoPassword,
      email_confirm: true,
      user_metadata: {
        first_name: 'Demo',
        last_name: 'User',
      },
    });

    if (createError) {
      throw new Error(`Failed to create Auth user: ${createError.message}`);
    }
    authUserId = newUser.user.id;
  } else {
    console.log(`User ${demoEmail} already exists. Using existing ID.`);
    authUserId = existingUser.id;
  }

  // 2. Create Organization
  const orgName = 'Apollonious Demo Org';
  let org = await prisma.organization.findUnique({ where: { domain: 'apollonious.dev' } });

  if (!org) {
    org = await prisma.organization.create({
      data: {
        name: orgName,
        domain: 'apollonious.dev',
        plan: 'professional',
        subscription_status: 'active',
        credits_remaining: 10000,
      },
    });
  }

  // 3. Create Team
  let team = await prisma.team.findFirst({ where: { org_id: org.id } });
  if (!team) {
    team = await prisma.team.create({
      data: {
        name: 'Sales Team',
        org_id: org.id,
      },
    });
  }

  // 4. Create Prisma User mapped to Auth User
  let user = await prisma.user.findUnique({ where: { id: authUserId } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        id: authUserId, // Syncing the ID
        email: demoEmail,
        first_name: 'Demo',
        last_name: 'User',
        role: 'admin',
        org_id: org.id,
        team_id: team.id,
      },
    });
  }

  // 5. Generate 10 Companies
  const industries = ['Software', 'Healthcare', 'Finance', 'Education', 'Manufacturing'];
  const companiesData = Array.from({ length: 10 }).map((_, i) => ({
    org_id: org.id,
    name: `Example Company ${i + 1}`,
    domain: `example${i + 1}.com`,
    industry: industries[i % industries.length],
    employee_count: (i + 1) * 150,
    annual_revenue: BigInt((i + 1) * 1000000),
    city: 'San Francisco',
    state: 'CA',
    country: 'USA',
  }));

  let createdCompanies = [];
  for (const company of companiesData) {
    const existing = await prisma.company.findFirst({ where: { domain: company.domain, org_id: org.id } });
    if (!existing) {
      createdCompanies.push(await prisma.company.create({ data: company }));
    } else {
      createdCompanies.push(existing);
    }
  }

  // 6. Generate 50 Contacts
  const titles = ['Software Engineer', 'VP of Sales', 'CEO', 'Marketing Manager', 'Product Manager'];
  const seniorities: any[] = ['entry', 'vp', 'c_suite', 'manager', 'senior'];
  const emails = ['john.doe', 'jane.smith', 'alex.jones', 'maria.garcia', 'david.lee'];

  for (let i = 0; i < 50; i++) {
    const company = createdCompanies[i % createdCompanies.length];
    const emailPrefix = `${emails[i % 5]}.${i}`;
    
    const existingContact = await prisma.contact.findFirst({
      where: { email: `${emailPrefix}@${company.domain}`, org_id: org.id }
    });

    if (!existingContact) {
      await prisma.contact.create({
        data: {
          org_id: org.id,
          first_name: `Test${i}`,
          last_name: `Contact${i}`,
          email: `${emailPrefix}@${company.domain}`,
          title: titles[i % titles.length],
          seniority: seniorities[i % seniorities.length],
          company_id: company.id,
          stage: 'cold',
          owner_id: user.id,
          phone_direct: `+1-555-01${i.toString().padStart(2, '0')}`,
        },
      });
    }
  }

  console.log('✅ Seeding completed successfully.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
