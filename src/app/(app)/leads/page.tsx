import React from 'react';
import { LeadsClient } from './LeadsClient';

export const metadata = {
  title: 'Leads | Parallex CRM',
  description: 'Manage prospect leads saved in your workspace',
};

export default function LeadsPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div>
        <h1 style={{ margin: '0 0 0.5rem 0' }}>Leads</h1>
        <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
          Review workspace leads saved from Prospecting and decide which ones to convert into CRM records.
        </p>
      </div>

      <LeadsClient />
    </div>
  );
}
