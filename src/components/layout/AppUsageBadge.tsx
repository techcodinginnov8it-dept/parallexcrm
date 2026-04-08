'use client';

import useSWR from 'swr';

type AppUsagePayload = {
  data: {
    totalUsers: number;
    activeUsersNow: number;
    activeWindowMinutes: number;
    totalVisitors: number;
    liveVisitorsNow: number;
    visitorActiveWindowMinutes: number;
  };
};

const fetcher = async (url: string): Promise<AppUsagePayload> => {
  const response = await fetch(url, { cache: 'no-store' });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload?.error || 'Failed to load app usage.');
  }

  return payload;
};

export default function AppUsageBadge() {
  const { data } = useSWR('/api/app/usage', fetcher, {
    refreshInterval: 60 * 1000,
    revalidateOnFocus: true,
  });

  const activeUsersNow = data?.data.activeUsersNow;
  const totalUsers = data?.data.totalUsers;
  const activeWindowMinutes = data?.data.activeWindowMinutes;
  const totalVisitors = data?.data.totalVisitors;
  const liveVisitorsNow = data?.data.liveVisitorsNow;
  const visitorActiveWindowMinutes = data?.data.visitorActiveWindowMinutes;

  return (
    <span
      title={
        typeof totalUsers === 'number' &&
        typeof totalVisitors === 'number' &&
        typeof liveVisitorsNow === 'number' &&
        typeof activeWindowMinutes === 'number' &&
        typeof visitorActiveWindowMinutes === 'number'
          ? `${totalUsers} total registered users. ${totalVisitors} total visitors. Live users were active in the last ${activeWindowMinutes} minutes, and ${liveVisitorsNow} visitors were active in the last ${visitorActiveWindowMinutes} minutes.`
          : 'Loading app usage...'
      }
      style={{
        padding: '0.3rem 0.7rem',
        borderRadius: '999px',
        border: '1px solid var(--border)',
        color: 'var(--text-secondary)',
        fontSize: '0.75rem',
        letterSpacing: '0.02em',
        whiteSpace: 'nowrap',
      }}
    >
      Live Users: {typeof activeUsersNow === 'number' ? activeUsersNow : '--'} | Visitors:{' '}
      {typeof totalVisitors === 'number' ? totalVisitors : '--'}
    </span>
  );
}
