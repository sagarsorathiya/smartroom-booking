import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { Building2, FolderTree, Award, UserCheck } from 'lucide-react';

export const ProfileSetupModal: React.FC = () => {
  const { currentUser, companies, departments, designations, updateMyProfile } = useApp();

  const [companyId, setCompanyId] = useState(currentUser.companyId || '');
  const [departmentId, setDepartmentId] = useState(currentUser.departmentId || '');
  const [designationId, setDesignationId] = useState(currentUser.designationId || '');
  const [saving, setSaving] = useState(false);

  const filteredDepts = useMemo(() =>
    departments.filter(d => companyId && d.companyIds.includes(companyId) && d.active),
    [departments, companyId]
  );

  const filteredDesigs = useMemo(() =>
    designations.filter(d => companyId && d.companyIds.includes(companyId) && d.active),
    [designations, companyId]
  );

  const handleCompanyChange = (id: string) => {
    setCompanyId(id);
    setDepartmentId('');
    setDesignationId('');
  };

  const canSubmit = companyId && departmentId && designationId && !saving;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    await updateMyProfile({ companyId, departmentId, designationId });
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-5 text-white">
          <div className="flex items-center gap-3">
            <div className="bg-white/20 rounded-lg p-2">
              <UserCheck size={24} />
            </div>
            <div>
              <h2 className="text-lg font-bold">Complete Your Profile</h2>
              <p className="text-indigo-100 text-sm">Welcome, {currentUser.name}! Please select your organization details to continue.</p>
            </div>
          </div>
        </div>

        {/* Form */}
        <div className="p-6 space-y-5">
          {/* Company */}
          <div>
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-1.5">
              <Building2 size={14} className="text-indigo-500" /> Company <span className="text-red-500">*</span>
            </label>
            <select
              value={companyId}
              onChange={e => handleCompanyChange(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
            >
              <option value="">— Select Company —</option>
              {companies.filter(c => c.active).map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Department */}
          <div>
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-1.5">
              <FolderTree size={14} className="text-teal-500" /> Department <span className="text-red-500">*</span>
            </label>
            <select
              value={departmentId}
              onChange={e => setDepartmentId(e.target.value)}
              disabled={!companyId}
              className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white disabled:bg-slate-100 disabled:text-slate-400"
            >
              <option value="">— Select Department —</option>
              {filteredDepts.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
            {companyId && filteredDepts.length === 0 && (
              <p className="text-xs text-amber-600 mt-1">No departments available for this company.</p>
            )}
          </div>

          {/* Designation */}
          <div>
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-1.5">
              <Award size={14} className="text-purple-500" /> Designation <span className="text-red-500">*</span>
            </label>
            <select
              value={designationId}
              onChange={e => setDesignationId(e.target.value)}
              disabled={!companyId}
              className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white disabled:bg-slate-100 disabled:text-slate-400"
            >
              <option value="">— Select Designation —</option>
              {filteredDesigs.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
            {companyId && filteredDesigs.length === 0 && (
              <p className="text-xs text-amber-600 mt-1">No designations available for this company.</p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200">
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors text-sm"
          >
            {saving ? 'Saving…' : 'Continue'}
          </button>

        </div>
      </div>
    </div>
  );
};
