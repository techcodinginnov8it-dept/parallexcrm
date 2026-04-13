'use client';

import { useState } from 'react';

const templateList = [
  {
    id: 'wf-1',
    title: 'Inbound lead follow-up',
    summary: 'Send an email, create a task, then enroll into a sequence if no response.',
    trigger: 'New inbound lead',
  },
  {
    id: 'wf-2',
    title: 'Trial expiration nurture',
    summary: 'Auto-email on day 12, notify owner on day 14, add to save sequence.',
    trigger: 'Trial is expiring',
  },
  {
    id: 'wf-3',
    title: 'No reply after sequence',
    summary: 'Create a call task and add a LinkedIn touch.',
    trigger: 'Sequence completed without reply',
  },
];

export default function PlaysPage() {
  const [notice, setNotice] = useState('');

  const notifyInDev = (label: string) => {
    setNotice(`${label} is still in development.`);
  };

  return (
    <div className="page-container" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div>
          <h1 className="page-title">Workflows</h1>
          <p className="page-subtitle">
            Automate repeatable actions across sequences, contacts, and tasks with Apollo-style workflow logic.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={() => notifyInDev('Templates')}>
            Browse templates
          </button>
          <button className="btn btn-primary" onClick={() => notifyInDev('Create workflow')}>
            Create workflow
          </button>
        </div>
      </div>

      {notice && (
        <div
          className="card"
          style={{
            padding: '0.9rem 1rem',
            borderColor: 'var(--primary)',
            color: 'var(--text-primary)',
          }}
        >
          {notice}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 320px) minmax(0, 1fr)', gap: '1.5rem' }}>
        <div className="card" style={{ height: 'fit-content' }}>
          <div className="card-header">
            <div className="card-title">Workflow Library</div>
          </div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {templateList.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => notifyInDev(item.title)}
                style={{
                  textAlign: 'left',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-elevated)',
                  borderRadius: 'var(--radius-md)',
                  padding: '0.85rem',
                  cursor: 'pointer',
                  color: 'inherit',
                }}
              >
                <div style={{ fontWeight: 600 }}>{item.title}</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                  {item.summary}
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', marginTop: '0.45rem' }}>
                  Trigger: {item.trigger}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Workflow Builder</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                  Drag and connect triggers, conditions, and actions. This builder mirrors Apollo-style workflow steps.
                </div>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={() => notifyInDev('Run test')}>
                Run test
              </button>
            </div>
            <div className="card-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
              {[
                { title: 'Trigger', desc: 'Pick the event that starts the workflow.' },
                { title: 'Conditions', desc: 'Add filters like stage, owner, or status.' },
                { title: 'Actions', desc: 'Send email, create task, or enroll in a sequence.' },
                { title: 'Delay', desc: 'Wait 1-7 days before the next step.' },
              ].map((card) => (
                <div key={card.title} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '0.9rem' }}>
                  <div style={{ fontWeight: 600 }}>{card.title}</div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                    {card.desc}
                  </div>
                  <button className="btn btn-ghost btn-sm" style={{ marginTop: '0.7rem' }} onClick={() => notifyInDev(card.title)}>
                    Configure
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div className="card-title">Workflow Status</div>
            </div>
            <div className="card-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
              {[
                { label: 'Active workflows', value: '0' },
                { label: 'Paused workflows', value: '0' },
                { label: 'Runs in last 7 days', value: '0' },
                { label: 'Failed runs', value: '0' },
              ].map((item) => (
                <div key={item.label} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '0.85rem' }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{item.label}</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 600 }}>{item.value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
