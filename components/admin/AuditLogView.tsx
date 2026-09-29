import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { format } from 'date-fns';
import { Search, ClipboardList, User, Clock, Globe, Filter, Download } from 'lucide-react';
import { Pagination } from '../common/Pagination';
import { AuditAction } from '../../types';

const PAGE_SIZE = 15;

const ACTION_COLORS: Record<string, string> = {
  BOOKING_CREATED: 'bg-green-100 text-green-700',
  BOOKING_EDITED: 'bg-blue-100 text-blue-700',
  BOOKING_CANCELLED: 'bg-red-100 text-red-700',
  BOOKING_APPROVED: 'bg-teal-100 text-teal-700',
  IT_STATUS_CHANGED: 'bg-purple-100 text-purple-700',
  ROOM_CREATED: 'bg-indigo-100 text-indigo-700',
  ROOM_UPDATED: 'bg-indigo-100 text-indigo-700',
  ROOM_DELETED: 'bg-red-100 text-red-700',
  ROOM_BLOCKED: 'bg-amber-100 text-amber-700',
  ROOM_UNBLOCKED: 'bg-amber-100 text-amber-700',
  SETTINGS_UPDATED: 'bg-slate-100 text-slate-700',
  USER_LOGIN: 'bg-cyan-100 text-cyan-700',
  USER_CREATED: 'bg-orange-100 text-orange-700',
  USER_UPDATED: 'bg-sky-100 text-sky-700',
  USER_DELETED: 'bg-rose-100 text-rose-700',
  PASSWORD_CHANGED: 'bg-yellow-100 text-yellow-700',
  PROFILE_UPDATED: 'bg-emerald-100 text-emerald-700',
  COMPANY_CREATED: 'bg-lime-100 text-lime-700',
  COMPANY_UPDATED: 'bg-lime-100 text-lime-700',
  COMPANY_DELETED: 'bg-red-100 text-red-700',
  DEPARTMENT_CREATED: 'bg-fuchsia-100 text-fuchsia-700',
  DEPARTMENT_UPDATED: 'bg-fuchsia-100 text-fuchsia-700',
  DEPARTMENT_DELETED: 'bg-red-100 text-red-700',
  DESIGNATION_CREATED: 'bg-violet-100 text-violet-700',
  DESIGNATION_UPDATED: 'bg-violet-100 text-violet-700',
  DESIGNATION_DELETED: 'bg-red-100 text-red-700',
};

export const AuditLogView: React.FC = () => {
  const { auditLog } = useApp();
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('');
  const [page, setPage] = useState(1);

  const actionOptions = useMemo(() => {
    const actions = new Set(auditLog.map(e => e.action));
    return Array.from(actions).sort();
  }, [auditLog]);

  const filtered = useMemo(() => {
    let list = auditLog;
    if (actionFilter) list = list.filter(e => e.action === actionFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(e =>
        e.userName.toLowerCase().includes(q) ||
        e.action.toLowerCase().includes(q) ||
        e.details.toLowerCase().includes(q) ||
        (e.ipAddress && e.ipAddress.includes(q))
      );
    }
    return list;
  }, [auditLog, search, actionFilter]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const sanitizeCsvField = (val: string): string => {
    const escaped = val.replace(/"/g, '""');
    if (/^[=+\-@\t]/.test(escaped)) return `"'${escaped}"`;
    return `"${escaped}"`;
  };

  const exportCsv = () => {
    const headers = 'Timestamp,User,Action,Details,IP Address';
    const rows = filtered.map(e => [
      sanitizeCsvField(format(new Date(e.timestamp), 'yyyy-MM-dd HH:mm:ss')),
      sanitizeCsvField(e.userName),
      sanitizeCsvField(e.action),
      sanitizeCsvField(e.details),
      sanitizeCsvField(e.ipAddress || ''),
    ].join(','));
    const csv = [headers, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `audit-log-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <ClipboardList size={24} /> Audit Log
          </h1>
          <p className="text-slate-500">Track all system activity.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-400">{filtered.length} entries</span>
          <button
            onClick={exportCsv}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <Download size={14} />
            Export CSV
          </button>
        </div>
      </div>

      <div className="flex gap-4 mb-6">
        <div className="relative max-w-md flex-1">
          <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search by user, action, details, or IP..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
          />
        </div>
        <div className="relative">
          <Filter size={16} className="absolute left-3 top-2.5 text-slate-400" />
          <select
            value={actionFilter}
            onChange={e => { setActionFilter(e.target.value); setPage(1); }}
            className="pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white appearance-none min-w-[200px]"
          >
            <option value="">All Actions</option>
            {actionOptions.map(a => (
              <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </div>
      </div>

      {paginated.length > 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">Time</th>
                <th className="px-4 py-3 text-left">User</th>
                <th className="px-4 py-3 text-left">Action</th>
                <th className="px-4 py-3 text-left">Details</th>
                <th className="px-4 py-3 text-left">IP Address</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginated.map(entry => (
                <tr key={entry.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                    <span className="flex items-center gap-1">
                      <Clock size={12} /> {format(entry.timestamp, 'MMM d, h:mm a')}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-700 whitespace-nowrap">
                    <span className="flex items-center gap-1">
                      <User size={12} className="text-slate-400" /> {entry.userName}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${ACTION_COLORS[entry.action] || 'bg-slate-100 text-slate-600'}`}>
                      {entry.action.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600 max-w-xs truncate" title={entry.details}>{entry.details}</td>
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap font-mono text-xs">
                    {entry.ipAddress ? (
                      <span className="flex items-center gap-1">
                        <Globe size={12} className="text-slate-400" /> {entry.ipAddress}
                      </span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-12 bg-white rounded-xl border border-dashed border-slate-300">
          <p className="text-slate-500">{search ? 'No entries match your search.' : 'No audit log entries yet. Actions will appear here.'}</p>
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-6">
          <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
        </div>
      )}
    </div>
  );
};
