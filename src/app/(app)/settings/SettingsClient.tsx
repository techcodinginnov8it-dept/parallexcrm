'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';

type UserRole = 'admin' | 'manager' | 'member';

type SettingsUser = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: UserRole;
  created_at: string;
};

type SettingsClientProps = {
  currentUser: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    role: UserRole;
    organizationName?: string | null;
  };
};

const fetcher = async (url: string) => {
  const res = await fetch(url);
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data?.error || 'Failed to load workspace users.');
  }

  return data;
};

export default function SettingsClient({ currentUser }: SettingsClientProps) {
  const [draftRoles, setDraftRoles] = useState<Record<string, UserRole>>({});
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState('');
  const isAdmin = currentUser.role === 'admin';
  const roleDescription =
    'Admins can manage user roles, managers can collaborate across the workspace, and members have standard workspace access.';

  const { data, error, isLoading, mutate } = useSWR(
    isAdmin ? '/api/admin/users' : null,
    fetcher
  );

  const users: SettingsUser[] = data?.data || [];
  const currentUserId = data?.currentUserId || currentUser.id;

  const orderedUsers = useMemo(
    () =>
      [...users].sort((left, right) => {
        if (left.id === currentUserId) return -1;
        if (right.id === currentUserId) return 1;
        return left.email.localeCompare(right.email);
      }),
    [currentUserId, users]
  );

  const getDraftRole = (user: SettingsUser) => draftRoles[user.id] || user.role;

  const handleRoleChange = (userId: string, role: UserRole) => {
    setDraftRoles((prev) => ({ ...prev, [userId]: role }));
    setStatusMessage('');
  };

  const handleSaveRole = async (user: SettingsUser) => {
    const nextRole = getDraftRole(user);
    if (nextRole === user.role) return;

    setSavingUserId(user.id);
    setStatusMessage('');

    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          role: nextRole,
        }),
      });
      const payload = await res.json();

      if (!res.ok) {
        throw new Error(payload?.error || 'Failed to update role.');
      }

      setDraftRoles((prev) => {
        const next = { ...prev };
        delete next[user.id];
        return next;
      });
      setStatusMessage(`Updated ${user.email} to ${nextRole}.`);
      await mutate();
    } catch (error: any) {
      setStatusMessage(error?.message || 'Failed to update role.');
    } finally {
      setSavingUserId(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <h1 style={{ margin: '0 0 0.5rem 0' }}>Settings</h1>
        <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
          Manage workspace access and user roles.
        </p>
      </div>

      <div
        className="glass-panel"
        style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: '1rem',
            flexWrap: 'wrap',
          }}
        >
          <div>
            <div
              style={{
                fontSize: '0.78rem',
                color: 'var(--text-secondary)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              Current Role
            </div>
            <div style={{ marginTop: '0.25rem', fontSize: '1rem', fontWeight: 600 }}>
              {currentUser.role}
            </div>
          </div>
          <div>
            <div
              style={{
                fontSize: '0.78rem',
                color: 'var(--text-secondary)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              Workspace
            </div>
            <div style={{ marginTop: '0.25rem', fontSize: '1rem', fontWeight: 600 }}>
              {currentUser.organizationName || 'Workspace'}
            </div>
          </div>
        </div>
        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          {roleDescription}
        </div>
      </div>

      {!isAdmin ? (
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <h2 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem' }}>Admin Access Required</h2>
          <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
            Your current role is {currentUser.role}. Ask an existing admin to promote your
            account if you need workspace management access.
          </p>
        </div>
      ) : (
        <div
          className="glass-panel"
          style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{ margin: '0 0 0.35rem 0', fontSize: '1rem' }}>Workspace Users</h2>
              <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
                Update each teammate&apos;s role from here.
              </p>
            </div>
            {!isLoading && (
              <div
                style={{
                  padding: '0.25rem 0.75rem',
                  backgroundColor: 'var(--bg-secondary)',
                  borderRadius: 'var(--radius-full)',
                  fontSize: '0.85rem',
                  fontWeight: 500,
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border)',
                }}
              >
                Workspace Users: {users.length}
              </div>
            )}
          </div>

          {statusMessage && (
            <div
              style={{
                fontSize: '0.85rem',
                color: statusMessage.toLowerCase().includes('failed')
                  ? 'var(--error)'
                  : 'var(--success)',
              }}
            >
              {statusMessage}
            </div>
          )}

          {error && (
            <div style={{ fontSize: '0.85rem', color: 'var(--error)' }}>{error.message}</div>
          )}

          {isLoading ? (
            <div style={{ color: 'var(--text-secondary)' }}>Loading workspace users...</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {orderedUsers.map((user) => {
                const nextRole = getDraftRole(user);
                const roleChanged = nextRole !== user.role;
                const isCurrentUser = user.id === currentUserId;

                return (
                  <div
                    key={user.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'minmax(220px, 1.6fr) minmax(140px, 0.9fr) auto',
                      gap: '1rem',
                      alignItems: 'center',
                      padding: '1rem',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-md)',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600 }}>
                        {user.first_name} {user.last_name}
                        {isCurrentUser ? ' (You)' : ''}
                      </div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        {user.email}
                      </div>
                    </div>
                    <select
                      className="input-field"
                      value={nextRole}
                      onChange={(event) => handleRoleChange(user.id, event.target.value as UserRole)}
                    >
                      <option value="admin">Admin</option>
                      <option value="manager">Manager</option>
                      <option value="member">Member</option>
                    </select>
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={!roleChanged || savingUserId === user.id}
                      onClick={() => handleSaveRole(user)}
                    >
                      {savingUserId === user.id ? 'Saving...' : 'Save Role'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
