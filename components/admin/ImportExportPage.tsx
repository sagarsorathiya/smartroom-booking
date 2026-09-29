import React, { useState, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { Download, Upload, CheckCircle, XCircle, FileJson, Clock, User, AlertTriangle } from 'lucide-react';

const ALL_SECTIONS = [
  { key: 'rooms', label: 'Rooms', desc: 'Conference rooms and facilities' },
  { key: 'bookings', label: 'Bookings', desc: 'All booking records' },
  { key: 'users', label: 'Users', desc: 'Managed user accounts' },
  { key: 'companies', label: 'Companies', desc: 'Company records' },
  { key: 'departments', label: 'Departments', desc: 'Department records' },
  { key: 'designations', label: 'Designations', desc: 'Designation records' },
  { key: 'blockedSlots', label: 'Blocked Slots', desc: 'Room block schedules' },
  { key: 'blocks', label: 'Blocks', desc: 'Building block configurations' },
  { key: 'facilities', label: 'Facilities', desc: 'Room facility definitions' },
  { key: 'serviceRequests', label: 'Service Requests', desc: 'Admin service requests for bookings' },
  { key: 'settings', label: 'Portal Settings', desc: 'General configuration' },
  { key: 'ldapSettings', label: 'LDAP Settings', desc: 'Active Directory config' },
  { key: 'smtpSettings', label: 'SMTP Settings', desc: 'Email server config' },
  { key: 'auditLog', label: 'Audit Log', desc: 'Activity history' },
];

export const ImportExportPage: React.FC = () => {
  const { exportData, importData } = useApp();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Export state
  const [exportSections, setExportSections] = useState<string[]>(ALL_SECTIONS.map(s => s.key));

  // Import state
  const [importResult, setImportResult] = useState<{ success: boolean; message: string } | null>(null);
  const [importPreview, setImportPreview] = useState<{ fileName: string; manifest: { version: string; exportedAt: string; exportedBy: string; sections: string[] } } | null>(null);
  const [pendingJson, setPendingJson] = useState<string | null>(null);
  const [confirmImport, setConfirmImport] = useState(false);

  const toggleSection = (key: string) => {
    setExportSections(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };

  const selectAll = () => setExportSections(ALL_SECTIONS.map(s => s.key));
  const selectNone = () => setExportSections([]);

  const handleExport = async () => {
    if (exportSections.length === 0) return;
    const json = await exportData(exportSections);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `conferencehub-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportResult(null);
    setImportPreview(null);
    setPendingJson(null);
    setConfirmImport(false);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      try {
        const data = JSON.parse(text);
        if (!data._manifest) {
          setImportResult({ success: false, message: 'Invalid file: missing export manifest.' });
          return;
        }
        setImportPreview({ fileName: file.name, manifest: data._manifest });
        setPendingJson(text);
      } catch {
        setImportResult({ success: false, message: 'Failed to parse file. Ensure it is valid JSON.' });
      }
    };
    reader.readAsText(file);
    // Reset input so same file can be re-selected
    e.target.value = '';
  };

  const executeImport = async () => {
    if (!pendingJson) return;
    const result = await importData(pendingJson);
    setImportResult(result);
    setImportPreview(null);
    setPendingJson(null);
    setConfirmImport(false);
  };

  const cancelImport = () => {
    setImportPreview(null);
    setPendingJson(null);
    setConfirmImport(false);
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Import & Export</h1>
        <p className="text-slate-500">Backup and restore data and configuration</p>
      </div>

      <div className="space-y-6">
        {/* Export Section */}
        <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <h2 className="font-bold text-slate-900 flex items-center gap-2"><Download size={18} className="text-indigo-600" /> Export Data</h2>
            <div className="flex gap-2">
              <button onClick={selectAll} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">Select All</button>
              <span className="text-slate-300">|</span>
              <button onClick={selectNone} className="text-xs text-slate-500 hover:text-slate-700 font-medium">Clear</button>
            </div>
          </div>
          <div className="p-6">
            <p className="text-sm text-slate-600 mb-4">Select the data sections to include in the export file.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
              {ALL_SECTIONS.map(s => (
                <label key={s.key} className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${exportSections.includes(s.key) ? 'bg-indigo-50 border-indigo-300' : 'bg-white border-slate-200 hover:bg-slate-50'}`}>
                  <input type="checkbox" checked={exportSections.includes(s.key)} onChange={() => toggleSection(s.key)} className="h-4 w-4 mt-0.5 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500" />
                  <div>
                    <p className="text-sm font-medium text-slate-900">{s.label}</p>
                    <p className="text-xs text-slate-500">{s.desc}</p>
                  </div>
                </label>
              ))}
            </div>
            <button onClick={handleExport} disabled={exportSections.length === 0} className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed">
              <Download size={16} /> Export {exportSections.length} Section{exportSections.length !== 1 ? 's' : ''} as JSON
            </button>
          </div>
        </section>

        {/* Import Section */}
        <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 bg-slate-50 border-b border-slate-200">
            <h2 className="font-bold text-slate-900 flex items-center gap-2"><Upload size={18} className="text-teal-600" /> Import Data</h2>
          </div>
          <div className="p-6">
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
              <AlertTriangle size={16} className="text-amber-600 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-amber-700">Importing data will <strong>replace</strong> the current data for each included section. This cannot be undone.</p>
            </div>

            <input ref={fileInputRef} type="file" accept=".json" onChange={handleFileSelect} className="hidden" />
            <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors text-sm font-medium">
              <FileJson size={16} /> Select Backup File (.json)
            </button>

            {/* Preview */}
            {importPreview && (
              <div className="mt-4 p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
                <h3 className="font-semibold text-slate-900 flex items-center gap-2"><FileJson size={16} className="text-indigo-600" /> {importPreview.fileName}</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex items-center gap-2 text-slate-600"><Clock size={14} /> Exported: {new Date(importPreview.manifest.exportedAt).toLocaleString()}</div>
                  <div className="flex items-center gap-2 text-slate-600"><User size={14} /> By: {importPreview.manifest.exportedBy}</div>
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-700 mb-2">Sections included:</p>
                  <div className="flex flex-wrap gap-2">
                    {importPreview.manifest.sections.map(s => {
                      const info = ALL_SECTIONS.find(x => x.key === s);
                      return (
                        <span key={s} className="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded-full font-medium">{info?.label || s}</span>
                      );
                    })}
                  </div>
                </div>
                <div className="flex gap-3 pt-2">
                  <button onClick={cancelImport} className="px-4 py-2 border border-slate-300 text-slate-600 rounded-lg hover:bg-slate-100 text-sm font-medium">Cancel</button>
                  {!confirmImport ? (
                    <button onClick={() => setConfirmImport(true)} className="px-5 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 text-sm font-medium">Import This Backup</button>
                  ) : (
                    <button onClick={executeImport} className="px-5 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium animate-pulse">Confirm — Replace Current Data</button>
                  )}
                </div>
              </div>
            )}

            {/* Result */}
            {importResult && (
              <div className={`mt-4 flex items-center gap-2 text-sm p-3 rounded-lg ${importResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                {importResult.success ? <CheckCircle size={16} /> : <XCircle size={16} />}
                {importResult.message}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
