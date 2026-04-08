'use client';

import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import AppUsageBadge from './AppUsageBadge';

interface TopbarProps {
  user?: {
    first_name?: string;
    last_name?: string;
    email?: string;
    role?: string;
  } | null;
}

export default function Topbar({ user }: TopbarProps) {
  const router = useRouter();
  const supabase = createClient();
  const formattedRole = user?.role
    ? user.role.charAt(0).toUpperCase() + user.role.slice(1)
    : null;

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  return (
    <header className="topbar" id="main-topbar">
      <div className="topbar-search" id="global-search">
        <span className="topbar-search-icon">S</span>
        <input
          type="text"
          placeholder="Search contacts, companies, sequences..."
          id="global-search-input"
        />
        <span className="topbar-search-kbd">Ctrl+K</span>
      </div>

      <div className="topbar-actions">
        <AppUsageBadge />
        {formattedRole && (
          <span
            style={{
              padding: '0.3rem 0.7rem',
              borderRadius: '999px',
              border: '1px solid var(--border)',
              color: 'var(--text-secondary)',
              fontSize: '0.75rem',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            {formattedRole}
          </span>
        )}
        <button className="btn btn-ghost btn-icon" title="Notifications" id="btn-notifications">
          N
        </button>
        <button className="btn btn-ghost btn-icon" title="Help" id="btn-help">
          ?
        </button>
        <div className="topbar-user-menu">
          <button className="btn btn-ghost btn-sm" onClick={handleLogout} id="btn-logout">
            Sign Out
          </button>
        </div>
      </div>
    </header>
  );
}
