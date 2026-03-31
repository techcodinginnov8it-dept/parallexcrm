'use client';

import React, { useRef, useState } from 'react';
import Papa from 'papaparse';
import { Upload, X, AlertCircle } from 'lucide-react';

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: () => void;
}

export function ImportModal({ isOpen, onClose, onImportComplete }: ImportModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<any[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const dropped = e.dataTransfer.files[0];
    if (dropped && dropped.type === 'text/csv') {
      processFile(dropped);
    } else {
      setError('Please upload a valid CSV file.');
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      processFile(e.target.files[0]);
    }
  };

  const processFile = (file: File) => {
    setFile(file);
    setError('');

    // Parse the file for preview
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results: any) => {
        if (results.errors.length > 0) {
          setError('Errors reading CSV: ' + results.errors[0].message);
          return;
        }
        setPreview(results.data.slice(0, 3)); // Preview first 3 rows
      }
    });
  };

  const handleUpload = () => {
    if (!file) return;
    setIsUploading(true);
    
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results: any) => {
        try {
          // Normalize the data (map Common CSV headers to our DB schema)
          const normalizedData = results.data.map((row: any) => {
            const getVal = (keys: string[]) => {
              const key = Object.keys(row).find(k => keys.includes(k.toLowerCase().trim()));
              return key ? row[key] : undefined;
            };

            const email = getVal(['email', 'email address', 'primary email']);
            // If domain is not provided, try to extract it from email
            let domain = getVal(['domain', 'company url', 'website']);
            if (!domain && email) {
              domain = email.split('@')[1];
            }

            return {
              first_name: getVal(['first name', 'firstname', 'first_name']),
              last_name: getVal(['last name', 'lastname', 'last_name']),
              email: email,
              title: getVal(['title', 'job title']),
              domain: domain,
              phone_direct: getVal(['phone', 'mobile', 'direct phone']),
              company_name: getVal(['company', 'company name'])
            };
          });

          const res = await fetch('/api/contacts/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contacts: normalizedData }),
          });

          const data = await res.json();
          if (res.ok) {
            onImportComplete();
            onClose();
          } else {
            setError(data.error || 'Failed to import contacts');
          }
        } catch (e) {
          setError('Network error occurred during import.');
        } finally {
          setIsUploading(false);
        }
      }
    });
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
      backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(5px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
    }}>
      <div className="glass-panel" style={{ width: '100%', maxWidth: '600px', padding: '2rem', position: 'relative' }}>
        <button 
          onClick={onClose}
          style={{ position: 'absolute', top: '1.5rem', right: '1.5rem', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
        >
          <X size={24} />
        </button>
        
        <h2 style={{ marginTop: 0, marginBottom: '0.5rem' }}>Import Contacts</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
          Upload a CSV file containing your contact data. We will automatically map standard column names.
        </p>

        {error && (
          <div style={{ padding: '1rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '0.5rem', color: '#ef4444', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <AlertCircle size={18} />
            {error}
          </div>
        )}

        <div 
          style={{ 
            border: '2px dashed var(--border-color)', borderRadius: '1rem', padding: '3rem', 
            textAlign: 'center', cursor: 'pointer', transition: 'all 0.2s',
            background: file ? 'rgba(79, 70, 229, 0.05)' : 'transparent',
            borderColor: file ? 'var(--primary-color)' : 'var(--border-color)'
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleFileDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input 
            type="file" 
            accept=".csv" 
            ref={fileInputRef} 
            style={{ display: 'none' }} 
            onChange={handleFileSelect}
          />
          <Upload size={40} style={{ color: 'var(--primary-color)', marginBottom: '1rem' }} />
          {file ? (
            <div>
              <h3 style={{ margin: '0 0 0.5rem 0' }}>{file.name}</h3>
              <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                {(file.size / 1024).toFixed(2)} KB
              </p>
            </div>
          ) : (
            <div>
              <h3 style={{ margin: '0 0 0.5rem 0' }}>Click or drag file to this area to upload</h3>
              <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                CSV format supported (Max 5MB)
              </p>
            </div>
          )}
        </div>

        {preview.length > 0 && (
          <div style={{ marginTop: '2rem' }}>
            <h4 style={{ margin: '0 0 1rem 0' }}>Preview</h4>
            <div style={{ overflowX: 'auto', background: 'var(--bg-elevated)', borderRadius: '0.5rem', padding: '1rem' }}>
              <pre style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                {JSON.stringify(preview, null, 2)}
              </pre>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '2rem' }}>
          <button className="btn-secondary" onClick={onClose} disabled={isUploading}>
            Cancel
          </button>
          <button className="btn-primary" onClick={handleUpload} disabled={!file || isUploading}>
            {isUploading ? 'Importing...' : 'Start Import'}
          </button>
        </div>
      </div>
    </div>
  );
}
