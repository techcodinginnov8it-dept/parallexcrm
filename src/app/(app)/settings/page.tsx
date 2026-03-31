import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/api-utils';
import SettingsClient from './SettingsClient';

export default async function SettingsPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <SettingsClient
      currentUser={{
        id: user.id,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        role: user.role,
        organizationName: user.organization?.name,
      }}
    />
  );
}
