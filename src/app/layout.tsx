import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Parallex CRM — B2B Sales Intelligence Platform',
  description:
    'AI-powered sales intelligence and engagement platform. Prospect, engage, and close deals with unified outreach automation, CRM, and analytics.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

