import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { env } from './env';

const prismaClientSingleton = () => {
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
};

function hasExpectedDelegates(client: PrismaClient | undefined): client is PrismaClient {
  if (!client) return false;

  return Boolean(
    (client as PrismaClient & { lead?: unknown }).lead &&
    (client as PrismaClient & { searchQuery?: unknown }).searchQuery
  );
}

declare global {
  var prisma: undefined | ReturnType<typeof prismaClientSingleton>;
}

export function getPrismaClient(): PrismaClient {
  if (!hasExpectedDelegates(globalThis.prisma)) {
    globalThis.prisma = prismaClientSingleton();
  }

  return globalThis.prisma;
}

const prisma: PrismaClient = getPrismaClient();

export default prisma;

if (process.env.NODE_ENV !== 'production') globalThis.prisma = prisma;
