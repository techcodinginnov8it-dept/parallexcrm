'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

export default function RegisterPage() {
  const router = useRouter();
  const supabase = createClient();
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
    orgName: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const updateField = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);

    try {
      const { error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            first_name: formData.firstName,
            last_name: formData.lastName,
            org_name: formData.orgName,
          },
        },
      });

      if (authError) {
        setError(authError.message);
        return;
      }

      // Auto-sign in after registration
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: formData.email,
        password: formData.password,
      });

      if (signInError) {
        // If email confirmation is required, show a message
        setError('Account created! Please check your email to confirm, then sign in.');
        return;
      }

      router.push('/');
      router.refresh();
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-card">
          <div className="auth-logo">
            <div className="sidebar-logo-icon" style={{ width: 44, height: 44, fontSize: '1.2rem', margin: '0 auto' }}>
              P
            </div>
            <h1>Parallex CRM</h1>
            <p>Create your account</p>
          </div>

          {error && (
            <div
              className={`toast ${error.includes('check your email') ? 'toast-info' : 'toast-error'}`}
              style={{ marginBottom: 'var(--space-4)', minWidth: 'auto' }}
            >
              <span>{error.includes('check your email') ? 'ℹ️' : '⚠️'}</span>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label" htmlFor="register-org">
                Organization Name
              </label>
              <input
                id="register-org"
                type="text"
                className="form-input"
                placeholder="Acme Inc."
                value={formData.orgName}
                onChange={(e) => updateField('orgName', e.target.value)}
                required
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
              <div className="form-group">
                <label className="form-label" htmlFor="register-first-name">
                  First Name
                </label>
                <input
                  id="register-first-name"
                  type="text"
                  className="form-input"
                  placeholder="John"
                  value={formData.firstName}
                  onChange={(e) => updateField('firstName', e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="register-last-name">
                  Last Name
                </label>
                <input
                  id="register-last-name"
                  type="text"
                  className="form-input"
                  placeholder="Doe"
                  value={formData.lastName}
                  onChange={(e) => updateField('lastName', e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="register-email">
                Work Email
              </label>
              <input
                id="register-email"
                type="email"
                className="form-input"
                placeholder="john@company.com"
                value={formData.email}
                onChange={(e) => updateField('email', e.target.value)}
                required
                autoComplete="email"
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="register-password">
                Password
              </label>
              <input
                id="register-password"
                type="password"
                className="form-input"
                placeholder="Min. 6 characters"
                value={formData.password}
                onChange={(e) => updateField('password', e.target.value)}
                required
                autoComplete="new-password"
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="register-confirm-password">
                Confirm Password
              </label>
              <input
                id="register-confirm-password"
                type="password"
                className="form-input"
                placeholder="Re-enter password"
                value={formData.confirmPassword}
                onChange={(e) => updateField('confirmPassword', e.target.value)}
                required
                autoComplete="new-password"
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-lg w-full"
              disabled={loading}
              id="btn-register"
            >
              {loading ? 'Creating Account...' : 'Create Account'}
            </button>
          </form>

          <div className="auth-footer">
            Already have an account?{' '}
            <Link href="/login">Sign in</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

