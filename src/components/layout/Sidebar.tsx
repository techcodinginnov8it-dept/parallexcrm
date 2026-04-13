'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface NavItem {
  label: string;
  icon: string;
  href: string;
}

const mainNav: NavItem[] = [
  { label: 'Home', icon: 'H', href: '/' },
  { label: 'Prospecting', icon: 'P', href: '/prospect' },
  { label: 'Sequences', icon: 'S', href: '/sequences' },
  { label: 'Workflows', icon: 'W', href: '/plays' },
];

const manageNav: NavItem[] = [
  { label: 'Contacts', icon: 'C', href: '/contacts' },
  { label: 'Companies', icon: 'O', href: '/companies' },
  { label: 'Leads', icon: 'L', href: '/leads' },
  { label: 'Deals', icon: 'D', href: '/deals' },
  { label: 'Tasks', icon: 'T', href: '/tasks' },
];

const insightsNav: NavItem[] = [
  { label: 'Analytics', icon: 'A', href: '/analytics' },
];

interface SidebarProps {
  user?: {
    first_name?: string;
    last_name?: string;
    email?: string;
    role?: string;
  } | null;
}

export default function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return Boolean(pathname?.startsWith(href));
  };

  const initials = user
    ? `${(user.first_name || '')[0] || ''}${(user.last_name || '')[0] || ''}`.toUpperCase() || 'U'
    : 'U';

  return (
    <aside className="sidebar" id="main-sidebar">
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">P</div>
        <h1>Parallex CRM</h1>
      </div>

      <nav className="sidebar-nav">
        <div className="sidebar-section">
          <div className="sidebar-section-label">Main</div>
          {mainNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              prefetch={false}
              className={`sidebar-item ${isActive(item.href) ? 'active' : ''}`}
              id={`nav-${item.label.toLowerCase()}`}
            >
              <span className="sidebar-item-icon">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </div>

        <div className="sidebar-section">
          <div className="sidebar-section-label">Manage</div>
          {manageNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              prefetch={false}
              className={`sidebar-item ${isActive(item.href) ? 'active' : ''}`}
              id={`nav-${item.label.toLowerCase()}`}
            >
              <span className="sidebar-item-icon">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </div>

        <div className="sidebar-section">
          <div className="sidebar-section-label">Insights</div>
          {insightsNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              prefetch={false}
              className={`sidebar-item ${isActive(item.href) ? 'active' : ''}`}
              id={`nav-${item.label.toLowerCase()}`}
            >
              <span className="sidebar-item-icon">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </div>

        <div className="sidebar-section">
          <div className="sidebar-section-label">System</div>
          <Link
            href="/settings"
            prefetch={false}
            className={`sidebar-item ${isActive('/settings') ? 'active' : ''}`}
            id="nav-settings"
          >
            <span className="sidebar-item-icon">G</span>
            <span>Settings</span>
          </Link>
        </div>
      </nav>

      <div className="sidebar-footer">
        <Link href="/settings" prefetch={false} className="sidebar-user">
          <div className="sidebar-avatar">{initials}</div>
          <div className="sidebar-user-info">
            <div className="sidebar-user-name">
              {user?.first_name || 'User'} {user?.last_name || ''}
            </div>
            <div className="sidebar-user-email">
              {user?.email || ''}
              {user?.role ? ` | ${user.role}` : ''}
            </div>
          </div>
        </Link>
      </div>
    </aside>
  );
}
