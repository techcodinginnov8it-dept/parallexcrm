import React from 'react';
import { ContactsClient } from './ContactsClient';

export const metadata = {
  title: 'Contacts | Parallex CRM',
  description: 'Manage your contacts and leads',
};

export default function ContactsPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div>
        <h1 style={{ margin: '0 0 0.5rem 0' }}>Contacts</h1>
        <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
          Manage your contact database, organization, and outreach.
        </p>
      </div>
      
      <ContactsClient />
    </div>
  );
}

