import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { settingsApi } from '../../services/api';
import { Database, Server, CheckCircle, XCircle, Loader2, Trash2, AlertTriangle, Filter } from 'lucide-react';
import { format, subDays } from 'date-fns';

type ClearMode = 'all' | 'partial';

const CLEAR_OPTIONS = [
  { key: 'bookings', label: 'Bookings', desc: 'Room bookings and meeting data', supportsPartial: true },
  { key: 'blockedSlots', label: 'Blocked Slots', desc: 'Room blocking schedules', supportsPartial: true },
  { key: 'auditLog', label: 'Audit Log', desc: 'Activity history records', supportsPartial: true },
  { key: 'rooms', label: 'Rooms', desc: 'All rooms (also clears bookings)', supportsPartial: false },
  { key: 'users', label: 'Users', desc: 'All user accounts (also clears bookings)', supportsPartial: false },
] as const;

const BOOKING_STATUSES = [
  { value: 'CONFIRMED', label: 'Confirmed' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'COMPLETED', label: 'Completed' },
];

const QUICK_RANGES = [
  { label: 'Older than 30 days', days: 30 },
  { label: 'Older than 90 days', days: 90 },
  { label: 'Older than 6 months', days: 180 },
  { label: 'Older than 1 year', days: 365 },
];

export const DatabaseSettingsPage: React.FC = () => {
  const { databaseSettings, refreshData } = useApp();
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [selectedTables, setSelectedTables] = useState<string[]>([]);
  const [clearMode, setClearMode] = useState<ClearMode>('all');
  const [beforeDate, setBeforeDate] = useState('');
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [clearing, setClearing] = useState(false);
  const [clearResult, setClearResult] = useState<{ success: boolean; message: string } | null>(null);
  const [confirmText, setConfirmText] = useState('');

  const handleTestConnection = async () => {
    setTestResult(null);
    setTesting(true);
    try {
      const result = await settingsApi.testDatabaseConnection();
      setTestResult(result);
    } catch {
      setTestResult({ success: false, message: 'Failed to reach the server.' });
    } finally {
      setTesting(false);
    }
  };

  const toggleTable = (key: string) => {
    setSelectedTables(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
    setClearResult(null);
    setConfirmText('');
  };

  const toggleStatus = (status: string) => {
    setSelectedStatuses(prev => prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]);
    setConfirmText('');
  };

  const applyQuickRange = (days: number) => {
    setBeforeDate(format(subDays(new Date(), days), 'yyyy-MM-dd'));
    setConfirmText('');
  };

  // In partial mode, only tables supporting partial clear are valid
  const hasPartialTables = clearMode === 'partial' && selectedTables.some(t => CLEAR_OPTIONS.find(o => o.key === t)?.supportsPartial);
  const hasFilters = beforeDate || selectedStatuses.length > 0;
  const needsFilters = clearMode === 'partial' && hasPartialTables && !hasFilters;

  const handleClear = async () => {
    if (confirmText !== 'CLEAR') return;
    setClearing(true);
    setClearResult(null);
    try {
      const filters = clearMode === 'partial' ? {
        beforeDate: beforeDate || undefined,
        statuses: selectedStatuses.length > 0 ? selectedStatuses : undefined,
      } : undefined;
      const result = await settingsApi.clearDatabaseTables(selectedTables, filters);
      setClearResult(result);
      setSelectedTables([]);
      setConfirmText('');
      setBeforeDate('');
      setSelectedStatuses([]);
      refreshData();
    } catch {
      setClearResult({ success: false, message: 'Failed to clear data.' });
    } finally {
      setClearing(false);
    }
  };

  const getSummary = () => {
    const parts: string[] = [];
    const tables = selectedTables.map(t => CLEAR_OPTIONS.find(o => o.key === t)?.label).filter(Boolean);
    parts.push(tables.join(', '));
    if (clearMode === 'partial') {
      if (beforeDate) parts.push(`before ${format(new Date(beforeDate + 'T00:00:00'), 'MMM d, yyyy')}`);
      if (selectedStatuses.length > 0) parts.push(`status: ${selectedStatuses.join(', ')}`);
    }
    return parts.join(' — ');
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Database Settings</h1>
        <p className="text-slate-500">PostgreSQL connection information</p>
      </div>

      <div className="space-y-6">
        {/* Enable Toggle */}
        <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 bg-slate-50 border-b border-slate-200">
            <h2 className="font-bold text-slate-900 flex items-center gap-2"><Database size={18} className="text-indigo-600" /> PostgreSQL Database</h2>
          </div>
          <div className="p-6">
            <div className="flex items-center gap-2 py-2">
              <div className="h-2.5 w-2.5 rounded-full bg-green-500 animate-pulse" />
              <span className="text-sm font-medium text-green-700">Connected — PostgreSQL backend active</span>
            </div>
            <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
              Connection credentials are managed via server environment variables. Pool and SSL settings can be configured below.
            </div>
          </div>
        </section>

        {/* Connection */}
        <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 bg-slate-50 border-b border-slate-200">
            <h2 className="font-bold text-slate-900 flex items-center gap-2"><Server size={18} className="text-teal-600" /> Connection</h2>
          </div>
          <div className="p-6 space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">Host</label>
                <input type="text" value={databaseSettings.host} readOnly className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 text-slate-600 cursor-not-allowed" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Port</label>
                <input type="number" value={databaseSettings.port} readOnly className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 text-slate-600 cursor-not-allowed" />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Database Name</label>
                <input type="text" value={databaseSettings.database} readOnly className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 text-slate-600 cursor-not-allowed" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Username</label>
                <input type="text" value={databaseSettings.username} readOnly className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 text-slate-600 cursor-not-allowed" />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
                <input type="password" value={databaseSettings.password} readOnly className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 text-slate-600 cursor-not-allowed" />
              </div>
            </div>
            {/* Connection string preview */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Connection String Preview</label>
              <div className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-mono text-xs text-slate-600 break-all">
                postgresql://{databaseSettings.username || '<user>'}:****@{databaseSettings.host || '<host>'}:{databaseSettings.port}/{databaseSettings.database || '<db>'}
              </div>
            </div>
          </div>
        </section>

        {/* Test Connection */}
        <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 bg-slate-50 border-b border-slate-200">
            <h2 className="font-bold text-slate-900 flex items-center gap-2"><Database size={18} className="text-green-600" /> Test Connection</h2>
          </div>
          <div className="p-6">
            <button onClick={handleTestConnection} disabled={testing} className="flex items-center gap-2 px-4 py-2 border border-green-300 text-green-700 rounded-lg hover:bg-green-50 transition-colors text-sm font-medium disabled:opacity-50">
              {testing ? <Loader2 size={16} className="animate-spin" /> : <Database size={16} />} {testing ? 'Testing...' : 'Test PostgreSQL Connection'}
            </button>
            {testResult && (
              <div className={`mt-3 flex items-center gap-2 text-sm ${testResult.success ? 'text-green-600' : 'text-red-600'}`}>
                {testResult.success ? <CheckCircle size={16} /> : <XCircle size={16} />}
                {testResult.message}
              </div>
            )}
          </div>
        </section>

        {/* Clear Data */}
        <section className="bg-white rounded-xl shadow-sm border border-red-200 overflow-hidden">
          <div className="px-6 py-4 bg-red-50 border-b border-red-200">
            <h2 className="font-bold text-red-900 flex items-center gap-2"><Trash2 size={18} className="text-red-600" /> Clear Data</h2>
            <p className="text-xs text-red-600 mt-1">Permanently delete records. This action cannot be undone.</p>
          </div>
          <div className="p-6 space-y-5">
            {/* Mode Toggle */}
            <div className="flex gap-2">
              <button onClick={() => { setClearMode('all'); setBeforeDate(''); setSelectedStatuses([]); setConfirmText(''); }} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${clearMode === 'all' ? 'bg-red-600 text-white border-red-600' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'}`}>
                <Trash2 size={14} /> Clear All
              </button>
              <button onClick={() => { setClearMode('partial'); setConfirmText(''); }} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${clearMode === 'partial' ? 'bg-amber-600 text-white border-amber-600' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'}`}>
                <Filter size={14} /> Partial Clear
              </button>
            </div>

            {/* Table Selection */}
            <div className="space-y-2">
              {CLEAR_OPTIONS.map(opt => {
                const disabled = clearMode === 'partial' && !opt.supportsPartial;
                return (
                  <label key={opt.key} className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${disabled ? 'opacity-50 cursor-not-allowed border-slate-100 bg-slate-50' : selectedTables.includes(opt.key) ? 'border-red-300 bg-red-50 cursor-pointer' : 'border-slate-200 hover:bg-slate-50 cursor-pointer'}`}>
                    <input type="checkbox" checked={selectedTables.includes(opt.key)} onChange={() => !disabled && toggleTable(opt.key)} disabled={disabled} className="h-4 w-4 text-red-600 rounded border-slate-300 focus:ring-red-500" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-900">{opt.label}</p>
                      <p className="text-xs text-slate-500">{opt.desc}</p>
                    </div>
                    {clearMode === 'partial' && !opt.supportsPartial && (
                      <span className="text-xs text-slate-400 italic">Full clear only</span>
                    )}
                  </label>
                );
              })}
            </div>

            {/* Partial Filters */}
            {clearMode === 'partial' && hasPartialTables && (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg space-y-4">
                <h3 className="text-sm font-bold text-amber-900 flex items-center gap-2"><Filter size={14} /> Filter Criteria</h3>

                {/* Date filter */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Delete records before date</label>
                  <div className="flex items-center gap-3 flex-wrap">
                    <input type="date" value={beforeDate} onChange={e => { setBeforeDate(e.target.value); setConfirmText(''); }} className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 outline-none" />
                    <div className="flex gap-2 flex-wrap">
                      {QUICK_RANGES.map(r => (
                        <button key={r.days} onClick={() => applyQuickRange(r.days)} className="px-3 py-1.5 text-xs font-medium border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors text-slate-600">
                          {r.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Status filter (for bookings) */}
                {selectedTables.includes('bookings') && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Filter by booking status</label>
                    <div className="flex gap-2 flex-wrap">
                      {BOOKING_STATUSES.map(s => (
                        <button key={s.value} onClick={() => toggleStatus(s.value)} className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${selectedStatuses.includes(s.value) ? 'bg-amber-600 text-white border-amber-600' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'}`}>
                          {s.label}
                        </button>
                      ))}
                    </div>
                    {selectedStatuses.length === 0 && <p className="text-xs text-slate-400 mt-1">No status filter = all statuses</p>}
                  </div>
                )}

                {needsFilters && (
                  <p className="text-xs text-amber-700">Select at least one filter (date or status) for partial clear.</p>
                )}
              </div>
            )}

            {/* Confirm & Execute */}
            {selectedTables.length > 0 && !(clearMode === 'partial' && hasPartialTables && !hasFilters) && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg space-y-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={16} className="text-red-600 mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-red-800">
                    <p className="font-medium">You are about to permanently delete:</p>
                    <p className="mt-1">{getSummary()}</p>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Type <span className="font-bold text-red-600">CLEAR</span> to confirm</label>
                  <input type="text" value={confirmText} onChange={e => setConfirmText(e.target.value)} placeholder="CLEAR" className="w-48 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500 outline-none" />
                </div>
                <button onClick={handleClear} disabled={confirmText !== 'CLEAR' || clearing} className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed">
                  {clearing ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />} {clearing ? 'Clearing...' : clearMode === 'partial' ? 'Clear Filtered Data' : 'Clear All Selected Data'}
                </button>
              </div>
            )}

            {clearResult && (
              <div className={`flex items-center gap-2 text-sm ${clearResult.success ? 'text-green-600' : 'text-red-600'}`}>
                {clearResult.success ? <CheckCircle size={16} /> : <XCircle size={16} />}
                {clearResult.message}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
