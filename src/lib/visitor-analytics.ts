import prisma from '@/lib/db';

export const VISITOR_COOKIE_NAME = 'parallex_visitor_id';
export const VISITOR_ACTIVE_WINDOW_MINUTES = 10;
const VISITOR_ACTIVE_WINDOW_MS = VISITOR_ACTIVE_WINDOW_MINUTES * 60 * 1000;

let visitorTableReady: Promise<void> | null = null;

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  return Number(value || 0);
}

export function getVisitorActiveSince() {
  return new Date(Date.now() - VISITOR_ACTIVE_WINDOW_MS);
}

export async function ensureVisitorTable() {
  if (!visitorTableReady) {
    visitorTableReady = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS app_visitors (
          visitor_id VARCHAR(64) PRIMARY KEY,
          first_seen_at TIMESTAMP(6) NOT NULL DEFAULT NOW(),
          last_seen_at TIMESTAMP(6) NOT NULL DEFAULT NOW(),
          last_path VARCHAR(255),
          user_agent TEXT
        )
      `);

      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS app_visitors_last_seen_idx
        ON app_visitors (last_seen_at)
      `);
    })().catch((error) => {
      visitorTableReady = null;
      throw error;
    });
  }

  await visitorTableReady;
}

export async function recordVisitorVisit(
  visitorId: string,
  path: string | null,
  userAgent: string | null
) {
  await ensureVisitorTable();

  await prisma.$executeRawUnsafe(
    `
      INSERT INTO app_visitors (visitor_id, first_seen_at, last_seen_at, last_path, user_agent)
      VALUES ($1, NOW(), NOW(), $2, $3)
      ON CONFLICT (visitor_id) DO UPDATE
      SET
        last_seen_at = NOW(),
        last_path = EXCLUDED.last_path,
        user_agent = COALESCE(EXCLUDED.user_agent, app_visitors.user_agent)
    `,
    visitorId,
    path,
    userAgent
  );
}

export async function getVisitorTotals() {
  await ensureVisitorTable();

  const activeSince = getVisitorActiveSince();
  const [totalVisitorsResult, liveVisitorsResult] = await Promise.all([
    prisma.$queryRawUnsafe<Array<{ count: bigint | number | string }>>(
      `SELECT COUNT(*) AS count FROM app_visitors`
    ),
    prisma.$queryRawUnsafe<Array<{ count: bigint | number | string }>>(
      `SELECT COUNT(*) AS count FROM app_visitors WHERE last_seen_at >= $1`,
      activeSince
    ),
  ]);

  return {
    totalVisitors: toNumber(totalVisitorsResult[0]?.count),
    liveVisitorsNow: toNumber(liveVisitorsResult[0]?.count),
  };
}
