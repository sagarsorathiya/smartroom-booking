import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Search, X, Plus, Mail, Loader2, User } from 'lucide-react';
import { usersApi } from '../../services/api';
import type { ManagedUser } from '../../types';

interface BlockEmailPickerProps {
  label: string;
  value: string; // comma-separated string stored in RoomBlockConfig
  onChange: (value: string) => void;
  colorClass?: string; // icon accent colour e.g. 'text-blue-500'
}

// Parse comma/semicolon-separated email string → trimmed non-empty array
const parseEmails = (v: string): string[] =>
  v.split(/[,;]/).map(s => s.trim()).filter(Boolean);

const joinEmails = (arr: string[]): string => arr.join(', ');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const BlockEmailPicker: React.FC<BlockEmailPickerProps> = ({
  label,
  value,
  onChange,
  colorClass = 'text-blue-500',
}) => {
  const emails = parseEmails(value);
  const [search, setSearch] = useState('');
  const [dirResults, setDirResults] = useState<ManagedUser[]>([]);
  const [dirLoading, setDirLoading] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [manualInput, setManualInput] = useState('');
  const [manualError, setManualError] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);

  // Debounced LDAP search
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const q = search.trim();
    if (q.length < 2) { setDirResults([]); setDirLoading(false); return; }
    setDirLoading(true);
    timerRef.current = setTimeout(async () => {
      try {
        const results = await usersApi.searchDirectory(q);
        setDirResults(results as ManagedUser[]);
        if ((results as ManagedUser[]).length > 0) setDropdownOpen(true);
      } catch { setDirResults([]); }
      finally { setDirLoading(false); }
    }, 300);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [search]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const addEmail = useCallback((email: string) => {
    const norm = email.trim().toLowerCase();
    if (!norm || emails.includes(norm)) return;
    onChange(joinEmails([...emails, norm]));
  }, [emails, onChange]);

  const removeEmail = useCallback((email: string) => {
    onChange(joinEmails(emails.filter(e => e !== email)));
  }, [emails, onChange]);

  const handleManualAdd = () => {
    const norm = manualInput.trim().toLowerCase();
    if (!norm) return;
    if (!EMAIL_RE.test(norm)) { setManualError('Invalid email'); return; }
    if (emails.includes(norm)) { setManualError('Already added'); return; }
    addEmail(norm);
    setManualInput('');
    setManualError('');
  };

  // Available LDAP results: exclude already-added, show local guide when no search
  const availableUsers = search.trim().length >= 2
    ? dirResults.filter(u => (u as any).active !== false && !emails.includes((u.email || '').toLowerCase()))
    : [];

  return (
    <div>
      <label className="flex text-sm font-medium text-slate-700 mb-1.5 items-center gap-1.5">
        <Mail size={14} className={colorClass} />
        {label}
      </label>

      {/* Selected email chips */}
      {emails.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {emails.map(email => (
            <span key={email} className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-0.5 bg-indigo-50 text-indigo-700 rounded-full text-[11px] font-medium border border-indigo-100">
              {email}
              <button
                type="button"
                onClick={() => removeEmail(email)}
                className="text-indigo-300 hover:text-red-500 transition-colors"
                title="Remove"
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* LDAP search */}
      <div ref={containerRef} className="relative mb-2">
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => { setSearch(e.target.value); setDropdownOpen(true); }}
            onFocus={() => { if (search.trim().length >= 2) setDropdownOpen(true); }}
            placeholder="Search directory (type ≥2 chars)..."
            className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-slate-50"
          />
          {dirLoading && (
            <Loader2 size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 animate-spin" />
          )}
        </div>

        {/* Dropdown */}
        {dropdownOpen && (
          <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
            {dirLoading ? (
              <div className="flex items-center gap-2 px-3 py-3 text-sm text-slate-400">
                <Loader2 size={14} className="animate-spin" /> Searching directory...
              </div>
            ) : availableUsers.length > 0 ? (
              <div className="max-h-48 overflow-y-auto">
                {availableUsers.map(u => (
                  <button
                    key={u.id}
                    type="button"
                    onMouseDown={e => e.preventDefault()} // keep focus in search
                    onClick={() => {
                      if (u.email) {
                        addEmail(u.email);
                        setSearch('');
                        setDropdownOpen(false);
                        setDirResults([]);
                      }
                    }}
                    className="w-full px-3 py-2 text-left flex items-center gap-2.5 transition-colors text-slate-700 hover:bg-indigo-50"
                  >
                    <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                      <User size={13} className="text-indigo-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800 truncate">{u.name}</p>
                      <p className="text-[10px] text-slate-400 truncate">{u.email || u.domainId}</p>
                    </div>
                  </button>
                ))}
              </div>
            ) : search.trim().length >= 2 ? (
              <p className="px-3 py-2.5 text-sm text-slate-400">No matching users found</p>
            ) : null}
          </div>
        )}
      </div>

      {/* Manual entry */}
      <div className="flex gap-2">
        <div className="flex-1">
          <input
            type="email"
            value={manualInput}
            onChange={e => { setManualInput(e.target.value); setManualError(''); }}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleManualAdd(); } }}
            placeholder="Or type email manually..."
            className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-slate-50 ${manualError ? 'border-red-300' : 'border-slate-200'}`}
          />
          {manualError && <p className="text-[10px] text-red-500 mt-0.5">{manualError}</p>}
        </div>
        <button
          type="button"
          onClick={handleManualAdd}
          className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-1 flex-shrink-0"
        >
          <Plus size={13} /> Add
        </button>
      </div>
    </div>
  );
};
