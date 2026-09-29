import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { PortalSettings } from '../../types';
import { Save, Calendar, Shield, Bell, Monitor, AlertTriangle, Building2, RotateCcw } from 'lucide-react';

export const SettingsPage: React.FC = () => {
  const { settings, updateSettings } = useApp();
  const [draft, setDraft] = useState<PortalSettings>({ ...settings });
  const [saved, setSaved] = useState(false);

  const update = <K extends keyof PortalSettings>(key: K, value: PortalSettings[K]) => {
    setDraft(prev => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const handleSave = () => {
    updateSettings(draft);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleReset = () => {
    setDraft({ ...settings });
    setSaved(false);
  };

  const hasChanges = JSON.stringify(draft) !== JSON.stringify(settings);

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
          <p className="text-slate-500">Configure portal behavior and policies</p>
        </div>
        <div className="flex gap-3">
          {hasChanges && (
            <button
              onClick={handleReset}
              className="flex items-center gap-2 px-4 py-2 border border-slate-300 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors text-sm font-medium"
            >
              <RotateCcw size={16} /> Discard
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={!hasChanges}
            className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            <Save size={16} /> {saved ? 'Saved!' : 'Save Changes'}
          </button>
        </div>
      </div>

      <div className="space-y-6">
        {/* General Settings */}
        <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 bg-slate-50 border-b border-slate-200">
            <h2 className="font-bold text-slate-900 flex items-center gap-2"><Building2 size={18} className="text-indigo-600" /> General</h2>
          </div>
          <div className="p-6 space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Portal Name</label>
                <input
                  type="text"
                  value={draft.portalName}
                  onChange={e => update('portalName', e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                />
                <p className="text-xs text-slate-400 mt-1">Displayed in sidebar and login page</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Max Advance Booking (days)</label>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={draft.maxAdvanceBookingDays}
                  onChange={e => update('maxAdvanceBookingDays', Math.max(1, Number(e.target.value)))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                />
                <p className="text-xs text-slate-400 mt-1">How far in advance users can book</p>
              </div>
            </div>
          </div>
        </section>

        {/* Scheduling */}
        <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 bg-slate-50 border-b border-slate-200">
            <h2 className="font-bold text-slate-900 flex items-center gap-2"><Calendar size={18} className="text-teal-600" /> Scheduling</h2>
          </div>
          <div className="p-6 space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Max Booking Duration (hours)</label>
              <input
                type="number"
                min={1}
                max={24}
                value={draft.maxBookingDuration}
                onChange={e => update('maxBookingDuration', Math.max(1, Number(e.target.value)))}
                className="w-full max-w-xs px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>

            <ToggleRow
              label="Allow Weekend Bookings"
              description="Permit room bookings on Saturday and Sunday"
              icon={<Calendar size={16} className="text-teal-500" />}
              checked={draft.allowWeekendBookings}
              onChange={v => update('allowWeekendBookings', v)}
            />
          </div>
        </section>

        {/* Booking Policies */}
        <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 bg-slate-50 border-b border-slate-200">
            <h2 className="font-bold text-slate-900 flex items-center gap-2"><Shield size={18} className="text-amber-600" /> Booking Policies</h2>
          </div>
          <div className="p-6 space-y-5">
            <ToggleRow
              label="Auto-Approve Bookings"
              description="Bookings are confirmed immediately without admin review"
              icon={<Shield size={16} className="text-amber-500" />}
              checked={draft.autoApproveBookings}
              onChange={v => update('autoApproveBookings', v)}
            />

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Require Approval Above Capacity</label>
              <input
                type="number"
                min={0}
                max={100}
                value={draft.requireApprovalAboveCapacity}
                onChange={e => update('requireApprovalAboveCapacity', Math.max(0, Number(e.target.value)))}
                className="w-full max-w-xs px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              />
              <p className="text-xs text-slate-400 mt-1">Set to 0 to disable. Bookings exceeding this participant count need approval.</p>
            </div>
          </div>
        </section>

        {/* Notifications & IT */}
        <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 bg-slate-50 border-b border-slate-200">
            <h2 className="font-bold text-slate-900 flex items-center gap-2"><Bell size={18} className="text-purple-600" /> Notifications & IT</h2>
          </div>
          <div className="p-6 space-y-5">
            <ToggleRow
              label="Email Notifications"
              description="Send booking confirmations and updates via email"
              icon={<Bell size={16} className="text-purple-500" />}
              checked={draft.emailNotifications}
              onChange={v => update('emailNotifications', v)}
            />
            <ToggleRow
              label="IT Auto-Assign"
              description="Automatically assign IT tasks when VC/AV is requested"
              icon={<Monitor size={16} className="text-purple-500" />}
              checked={draft.itAutoAssign}
              onChange={v => update('itAutoAssign', v)}
            />
          </div>
        </section>

        {/* Maintenance Mode */}
        <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 bg-slate-50 border-b border-slate-200">
            <h2 className="font-bold text-slate-900 flex items-center gap-2"><AlertTriangle size={18} className="text-red-500" /> Maintenance</h2>
          </div>
          <div className="p-6 space-y-5">
            <ToggleRow
              label="Maintenance Mode"
              description="Disable all bookings and show maintenance message to users"
              icon={<AlertTriangle size={16} className="text-red-500" />}
              checked={draft.maintenanceMode}
              onChange={v => update('maintenanceMode', v)}
            />
            {draft.maintenanceMode && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Maintenance Message</label>
                <textarea
                  value={draft.maintenanceMessage}
                  onChange={e => update('maintenanceMessage', e.target.value)}
                  rows={3}
                  placeholder="e.g. The portal is under scheduled maintenance. Please try again later."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                />
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

// Reusable toggle row
const ToggleRow: React.FC<{
  label: string;
  description: string;
  icon: React.ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
}> = ({ label, description, icon, checked, onChange }) => (
  <div className="flex items-center justify-between gap-4">
    <div className="flex items-start gap-3">
      <div className="mt-0.5">{icon}</div>
      <div>
        <p className="text-sm font-medium text-slate-900">{label}</p>
        <p className="text-xs text-slate-500">{description}</p>
      </div>
    </div>
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${checked ? 'bg-indigo-600' : 'bg-slate-300'}`}
    >
      <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
    </button>
  </div>
);
