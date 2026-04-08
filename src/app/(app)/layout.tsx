import { redirect } from 'next/navigation';
import Sidebar from '@/components/layout/Sidebar';
import Topbar from '@/components/layout/Topbar';
import AppPresenceTracker from '@/components/layout/AppPresenceTracker';
import { getCurrentUser } from '@/lib/api-utils';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const profile = {
    first_name: user.first_name || '',
    last_name: user.last_name || '',
    email: user.email || '',
    role: user.role,
  };

  return (
    <div className="app-layout">
      <AppPresenceTracker />
      <Sidebar user={profile} />
      <main className="main-content">
        <Topbar user={profile} />
        {children}
      </main>
    </div>
  );
}
