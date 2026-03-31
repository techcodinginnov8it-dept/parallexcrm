'use client';

import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

interface TopbarProps {
  user?: {
    first_name?: string;
    last_name?: string;
    email?: string;
  } | null;
}

export default function Topbar({ user }: TopbarProps) {
  const router = useRouter();
  const supabase = createClient();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  return (
    <header className="topbar" id="main-topbar">
      <div className="topbar-search" id="global-search">
        <span className="topbar-search-icon">🔍</span>
        <input
          type="text"
          placeholder="Search contacts, companies, sequences..."
          id="global-search-input"
        />
        <span className="topbar-search-kbd">⌘K</span>
      </div>

      <div className="topbar-actions">
        <button className="btn btn-ghost btn-icon" title="Notifications" id="btn-notifications">
          🔔
        </button>
        <button className="btn btn-ghost btn-icon" title="Help" id="btn-help">
          ❓
        </button>
        <div className="topbar-user-menu">
          <button
            className="btn btn-ghost btn-sm"
            onClick={handleLogout}
            id="btn-logout"
          >
            Sign Out
          </button>
        </div>
      </div>
    </header>
  );
}
