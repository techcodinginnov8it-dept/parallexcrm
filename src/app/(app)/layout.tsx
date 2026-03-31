import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Sidebar from '@/components/layout/Sidebar';
import Topbar from '@/components/layout/Topbar';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const profile = {
    first_name: (user.user_metadata?.first_name as string) || '',
    last_name: (user.user_metadata?.last_name as string) || '',
    email: user.email || '',
  };

  return (
    <div className="app-layout">
      <Sidebar user={profile} />
      <main className="main-content">
        <Topbar user={profile} />
        {children}
      </main>
    </div>
  );
}
