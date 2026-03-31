'use client';

import { useState, useEffect } from 'react';

interface DashboardClientProps {
  firstName: string;
}

const kpiData = [
  { label: 'Total Contacts', value: '12,847', trend: '+12.5%', trendUp: true, icon: '👤' },
  { label: 'Emails Sent', value: '3,284', trend: '+8.2%', trendUp: true, icon: '✉️' },
  { label: 'Open Rate', value: '42.3%', trend: '+2.1%', trendUp: true, icon: '📬' },
  { label: 'Reply Rate', value: '8.7%', trend: '-0.3%', trendUp: false, icon: '💬' },
  { label: 'Active Sequences', value: '14', trend: '+3', trendUp: true, icon: '🔄' },
  { label: 'Deals in Pipeline', value: '47', trend: '+5', trendUp: true, icon: '💼' },
];

const recentActivity = [
  { type: 'email_opened', message: 'Sarah Chen opened "Q1 Outreach - Step 2"', time: '2 min ago', icon: '📬' },
  { type: 'email_replied', message: 'James Rodriguez replied to your sequence', time: '15 min ago', icon: '💬' },
  { type: 'contact_created', message: '24 contacts imported from CSV', time: '1 hour ago', icon: '👤' },
  { type: 'deal_created', message: 'New deal "Acme Corp - Enterprise" created', time: '2 hours ago', icon: '💼' },
  { type: 'email_clicked', message: 'Maria Garcia clicked pricing link', time: '3 hours ago', icon: '🔗' },
  { type: 'sequence_finished', message: '"Cold Outreach v3" sequence completed for 89 contacts', time: '5 hours ago', icon: '✅' },
  { type: 'stage_changed', message: 'Tom Wilson moved to "Interested" stage', time: '6 hours ago', icon: '📊' },
  { type: 'email_bounced', message: 'Email to invalid@example.com bounced', time: '8 hours ago', icon: '⚠️' },
];

const topSequences = [
  { name: 'Q1 Enterprise Outreach', enrolled: 450, openRate: 52.1, replyRate: 12.3, status: 'active' },
  { name: 'Cold Outreach v3', enrolled: 280, openRate: 44.8, replyRate: 9.1, status: 'active' },
  { name: 'Re-engagement Campaign', enrolled: 180, openRate: 38.2, replyRate: 6.7, status: 'active' },
  { name: 'Product Launch Notify', enrolled: 620, openRate: 61.3, replyRate: 15.2, status: 'paused' },
  { name: 'Follow-up Warm Leads', enrolled: 95, openRate: 56.8, replyRate: 18.4, status: 'active' },
];

const quickActions = [
  { label: 'New Contact', icon: '👤', href: '/contacts', color: 'var(--primary)' },
  { label: 'New Sequence', icon: '✉️', href: '/sequences', color: 'var(--success)' },
  { label: 'Import CSV', icon: '📁', href: '/contacts', color: 'var(--warning)' },
  { label: 'Search Leads', icon: '🔍', href: '/search', color: 'var(--info)' },
];

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function DashboardClient({ firstName }: DashboardClientProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className="page-container" id="dashboard-page">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title" id="dashboard-greeting">
            {getGreeting()}, {firstName} 👋
          </h1>
          <p className="page-subtitle">
            Here&apos;s what&apos;s happening with your sales pipeline today.
          </p>
        </div>
        <div className="flex gap-3">
          <button className="btn btn-secondary" id="btn-export-report">
            📥 Export Report
          </button>
          <button className="btn btn-primary" id="btn-new-sequence">
            ✉️ New Sequence
          </button>
        </div>
      </div>

      {/* KPI Metrics */}
      <div className="metric-grid" id="kpi-metrics">
        {kpiData.map((kpi) => (
          <div
            className={`metric-card ${mounted ? 'metric-card-animate' : ''}`}
            key={kpi.label}
            id={`kpi-${kpi.label.toLowerCase().replace(/\s+/g, '-')}`}
          >
            <div className="flex items-center justify-between">
              <span className="metric-label">{kpi.label}</span>
              <span style={{ fontSize: '1.3rem' }}>{kpi.icon}</span>
            </div>
            <div className="metric-value">{kpi.value}</div>
            <div className={`metric-trend ${kpi.trendUp ? 'metric-trend-up' : 'metric-trend-down'}`}>
              <span>{kpi.trendUp ? '↑' : '↓'}</span>
              <span>{kpi.trend} from last month</span>
            </div>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="card mb-6" id="quick-actions">
        <div className="card-header">
          <h2 className="card-title">Quick Actions</h2>
        </div>
        <div className="card-body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-3)' }}>
            {quickActions.map((action) => (
              <button
                key={action.label}
                className="btn btn-secondary"
                style={{
                  padding: 'var(--space-4)',
                  flexDirection: 'column',
                  gap: 'var(--space-2)',
                  height: 'auto',
                  display: 'flex',
                }}
                id={`quick-${action.label.toLowerCase().replace(/\s+/g, '-')}`}
              >
                <span style={{ fontSize: '1.5rem' }}>{action.icon}</span>
                <span>{action.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Two-column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
        {/* Top Sequences */}
        <div className="card" id="top-sequences">
          <div className="card-header">
            <h2 className="card-title">Top Sequences</h2>
            <button className="btn btn-ghost btn-sm">View All →</button>
          </div>
          <div className="data-table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Sequence</th>
                  <th>Enrolled</th>
                  <th>Open %</th>
                  <th>Reply %</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {topSequences.map((seq) => (
                  <tr key={seq.name}>
                    <td>
                      <span className="font-medium">{seq.name}</span>
                    </td>
                    <td>{seq.enrolled}</td>
                    <td>
                      <span className={seq.openRate > 50 ? 'metric-trend-up' : ''}>{seq.openRate}%</span>
                    </td>
                    <td>
                      <span className={seq.replyRate > 10 ? 'metric-trend-up' : ''}>{seq.replyRate}%</span>
                    </td>
                    <td>
                      <span className={`badge ${seq.status === 'active' ? 'badge-success' : 'badge-warning'}`}>
                        {seq.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="card" id="recent-activity">
          <div className="card-header">
            <h2 className="card-title">Recent Activity</h2>
            <button className="btn btn-ghost btn-sm">View All →</button>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            <div className="activity-feed">
              {recentActivity.map((activity, index) => (
                <div
                  key={index}
                  className="activity-item"
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 'var(--space-3)',
                    padding: 'var(--space-3) var(--space-5)',
                    borderBottom: index < recentActivity.length - 1 ? '1px solid var(--border)' : 'none',
                    transition: 'background var(--transition-fast)',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = 'var(--bg-hover)')
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = 'transparent')
                  }
                >
                  <span style={{ fontSize: '1.1rem', flexShrink: 0, marginTop: '2px' }}>
                    {activity.icon}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-primary)', lineHeight: 1.4 }}>
                      {activity.message}
                    </p>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                      {activity.time}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Pipeline Summary */}
      <div className="card mt-4" id="pipeline-summary">
        <div className="card-header">
          <h2 className="card-title">Pipeline Summary</h2>
          <button className="btn btn-ghost btn-sm">Go to Deals →</button>
        </div>
        <div className="card-body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 'var(--space-3)' }}>
            {[
              { stage: 'Discovery', count: 12, value: '$48,000', color: 'var(--info)' },
              { stage: 'Qualified', count: 8, value: '$124,000', color: 'var(--primary)' },
              { stage: 'Proposal', count: 6, value: '$186,000', color: 'var(--warning)' },
              { stage: 'Negotiation', count: 4, value: '$92,000', color: '#f97316' },
              { stage: 'Won', count: 15, value: '$487,000', color: 'var(--success)' },
              { stage: 'Lost', count: 3, value: '$67,000', color: 'var(--error)' },
            ].map((stage) => (
              <div
                key={stage.stage}
                style={{
                  textAlign: 'center',
                  padding: 'var(--space-4)',
                  background: 'var(--bg-elevated)',
                  borderRadius: 'var(--radius-lg)',
                  borderTop: `3px solid ${stage.color}`,
                }}
              >
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                  {stage.stage}
                </p>
                <p style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: 'var(--space-1)' }}>
                  {stage.count}
                </p>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 'var(--space-1)' }}>
                  {stage.value}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
