import React from 'react';
import { CompaniesClient } from './CompaniesClient';

export const metadata = {
  title: 'Companies | Parallex CRM',
  description: 'Manage your company database',
};

export default function CompaniesPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div>
        <h1 style={{ margin: '0 0 0.5rem 0' }}>Companies</h1>
        <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
          Manage your accounts and target organizations.
        </p>
      </div>
      
      <CompaniesClient />
    </div>
  );
}

