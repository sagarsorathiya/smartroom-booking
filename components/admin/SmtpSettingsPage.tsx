import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { SmtpSettings } from '../../types';
import { Save, Mail, Server, Bell, RotateCcw, Send, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { settingsApi } from '../../services/api';

export const SmtpSettingsPage: React.FC = () => {
  const { smtpSettings, updateSmtpSettings } = useApp();
  const [draft, setDraft] = useState<SmtpSettings>({ ...smtpSettings });
  const [saved, setSaved] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [testEmail, setTestEmail] = useState('');
  const [testing, setTesting] = useState(false);

  const update = <K extends keyof SmtpSettings>(key: K, value: SmtpSettings[K]) => {
    setDraft(prev => ({ ...prev, [key]: value }));
    setSaved(false);
    setTestResult(null);
  };

  const handleSave = () => {
    updateSmtpSettings(draft);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleSendTest = async () => {
    if (!draft.host || !testEmail) {
      setTestResult({ success: false, message: 'SMTP host and test email address are required.' });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const result = await settingsApi.testSmtp(draft, testEmail);
      setTestResult(result);
    } catch (err: any) {
      setTestResult({ success: false, message: err.message || 'Failed to send test email' });
    } finally {
      setTesting(false);
    }
  };

  const hasChanges = JSON.stringify(draft) !== JSON.stringify(smtpSettings);

  const ToggleRow: React.FC<{ label: string; desc: string; checked: boolean; onChange: (v: boolean) => void }> = ({ label, desc, checked, onChange }) => (
    <div className="flex items-center justify-between gap-4 py-2">
      <div>
        <p className="text-sm font-medium text-slate-900">{label}</p>
        <p className="text-xs text-slate-500">{desc}</p>
      </div>
      <button type="button" onClick={() => onChange(!checked)} className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${checked ? 'bg-indigo-600' : 'bg-slate-300'}`}>
        <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
      </button>
    </div>
  );

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">SMTP / Email</h1>
          <p className="text-slate-500">Configure outgoing email server for notifications</p>
        </div>
        <div className="flex gap-3">
          {hasChanges && (
            <button onClick={() => { setDraft({ ...smtpSettings }); setSaved(false); }} className="flex items-center gap-2 px-4 py-2 border border-slate-300 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors text-sm font-medium">
              <RotateCcw size={16} /> Discard
            </button>
          )}
          <button onClick={handleSave} disabled={!hasChanges} className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed font-medium">
            <Save size={16} /> {saved ? 'Saved!' : 'Save Changes'}
          </button>
        </div>
      </div>

      <div className="space-y-6">
        {/* Enable Toggle */}
        <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 bg-slate-50 border-b border-slate-200">
            <h2 className="font-bold text-slate-900 flex items-center gap-2"><Mail size={18} className="text-indigo-600" /> Email Service</h2>
          </div>
          <div className="p-6">
            <ToggleRow label="Enable Email Notifications" desc="Send email notifications for bookings, cancellations, and IT tasks" checked={draft.enabled} onChange={v => update('enabled', v)} />
          </div>
        </section>

        {/* Server Configuration */}
        <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 bg-slate-50 border-b border-slate-200">
            <h2 className="font-bold text-slate-900 flex items-center gap-2"><Server size={18} className="text-teal-600" /> SMTP Server</h2>
          </div>
          <div className="p-6 space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">SMTP Host <span className="text-red-500">*</span></label>
                <input type="text" value={draft.host} onChange={e => update('host', e.target.value)} placeholder="smtp.company.com" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Port</label>
                  <select value={draft.port} onChange={e => update('port', Number(e.target.value))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
                    <option value={25}>25 (SMTP)</option>
                    <option value={465}>465 (SMTPS)</option>
                    <option value={587}>587 (Submission)</option>
                    <option value={2525}>2525 (Alt)</option>
                  </select>
                </div>
                <div className="flex items-end pb-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={draft.useTls} onChange={e => update('useTls', e.target.checked)} className="h-4 w-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500" />
                    <span className="text-sm text-slate-700">Use TLS</span>
                  </label>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Username</label>
                <input type="text" value={draft.username} onChange={e => update('username', e.target.value)} placeholder="smtp-user@company.com" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
                <input type="password" value={draft.password} onChange={e => update('password', e.target.value)} placeholder="••••••••" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
            </div>
          </div>
        </section>

        {/* Sender Info */}
        <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 bg-slate-50 border-b border-slate-200">
            <h2 className="font-bold text-slate-900 flex items-center gap-2"><Send size={18} className="text-purple-600" /> Sender Details</h2>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">From Address <span className="text-red-500">*</span></label>
                <input type="email" value={draft.fromAddress} onChange={e => update('fromAddress', e.target.value)} placeholder="noreply@company.com" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">From Name</label>
                <input type="text" value={draft.fromName} onChange={e => update('fromName', e.target.value)} placeholder="ConferenceHub" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Reply-To Address</label>
                <input type="email" value={draft.replyToAddress} onChange={e => update('replyToAddress', e.target.value)} placeholder="support@company.com" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
            </div>
          </div>
        </section>

        {/* Notification Preferences */}
        <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 bg-slate-50 border-b border-slate-200">
            <h2 className="font-bold text-slate-900 flex items-center gap-2"><Bell size={18} className="text-amber-600" /> Notification Rules</h2>
          </div>
          <div className="p-6 space-y-2">
            <ToggleRow label="Booking Confirmation" desc="Send email when a booking is confirmed" checked={draft.sendBookingConfirmation} onChange={v => update('sendBookingConfirmation', v)} />
            <hr className="border-slate-100" />
            <ToggleRow label="Cancellation Notice" desc="Notify when a booking is cancelled" checked={draft.sendCancellationNotice} onChange={v => update('sendCancellationNotice', v)} />
            <hr className="border-slate-100" />
            <ToggleRow label="IT Task Notification" desc="Alert IT team when VC/AV setup is requested" checked={draft.sendITTaskNotification} onChange={v => update('sendITTaskNotification', v)} />
            <hr className="border-slate-100" />
            <ToggleRow label="Daily Digest" desc="Send daily summary of upcoming bookings to reception" checked={draft.sendDailyDigest} onChange={v => update('sendDailyDigest', v)} />
            <hr className="border-slate-100" />
            <ToggleRow label="CC Reception" desc="Copy reception on all booking notifications" checked={draft.ccReception} onChange={v => update('ccReception', v)} />
          </div>
        </section>

        {/* Test Email */}
        <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 bg-slate-50 border-b border-slate-200">
            <h2 className="font-bold text-slate-900 flex items-center gap-2"><Mail size={18} className="text-green-600" /> Send Test Email</h2>
          </div>
          <div className="p-6">
            <div className="flex gap-4 items-end">
              <div className="flex-1">
                <label className="block text-sm font-medium text-slate-700 mb-1">Recipient Email</label>
                <input type="email" value={testEmail} onChange={e => setTestEmail(e.target.value)} placeholder="your@email.com" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
              <button onClick={handleSendTest} disabled={testing} className="flex items-center gap-2 px-4 py-2 border border-green-300 text-green-700 rounded-lg hover:bg-green-50 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed">
                {testing ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                {testing ? 'Sending...' : 'Send Test'}
              </button>
            </div>
            {testResult && (
              <div className={`mt-3 flex items-center gap-2 text-sm ${testResult.success ? 'text-green-600' : 'text-red-600'}`}>
                {testResult.success ? <CheckCircle size={16} /> : <XCircle size={16} />}
                {testResult.message}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
