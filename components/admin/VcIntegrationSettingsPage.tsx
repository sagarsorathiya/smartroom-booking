import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { VcIntegrationSettings, WebexAccountConfig } from '../../types';
import { settingsApi } from '../../services/api';
import { Save, RotateCcw, Wifi, WifiOff, Loader2, Video, Building2, Plus, Trash2 } from 'lucide-react';

export const VcIntegrationSettingsPage: React.FC = () => {
  const { vcIntegrationSettings, updateVcIntegrationSettings, companies } = useApp();
  const [draft, setDraft] = useState<VcIntegrationSettings>(JSON.parse(JSON.stringify(vcIntegrationSettings)));
  const [saved, setSaved] = useState(false);
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string }>>({});
  const [testing, setTesting] = useState<Record<string, boolean>>({});

  const activeCompanies = companies.filter(c => c.active);
  const hasChanges = JSON.stringify(draft) !== JSON.stringify(vcIntegrationSettings);

  const handleSave = () => {
    updateVcIntegrationSettings(draft);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const updateGoogleCompany = (companyId: string, field: string, value: any) => {
    setDraft(prev => ({
      ...prev,
      googleMeet: {
        companies: {
          ...prev.googleMeet.companies,
          [companyId]: {
            enabled: false, serviceAccountEmail: '', privateKey: '', impersonateEmail: '',
            ...prev.googleMeet.companies[companyId],
            [field]: value,
          },
        },
      },
    }));
    setTestResults(prev => ({ ...prev, [`google-${companyId}`]: undefined as any }));
  };

  const testGoogleCompany = async (companyId: string) => {
    const cfg = draft.googleMeet.companies[companyId];
    if (!cfg) return;
    const key = `google-${companyId}`;
    setTesting(prev => ({ ...prev, [key]: true }));
    try {
      const result = await settingsApi.testGoogleMeet({ ...cfg, companyId });
      setTestResults(prev => ({ ...prev, [key]: result }));
    } catch {
      setTestResults(prev => ({ ...prev, [key]: { success: false, message: 'Failed to reach the server.' } }));
    } finally {
      setTesting(prev => ({ ...prev, [key]: false }));
    }
  };

  const addWebexAccount = () => {
    const id = `webex-${Date.now()}`;
    setDraft(prev => ({
      ...prev,
      webex: { ...prev.webex, accounts: [...prev.webex.accounts, { id, label: '', enabled: true, clientId: '', clientSecret: '', refreshToken: '' }] },
    }));
  };

  const updateWebexAccount = (id: string, field: keyof WebexAccountConfig, value: string) => {
    setDraft(prev => ({
      ...prev,
      webex: { ...prev.webex, accounts: prev.webex.accounts.map(a => a.id === id ? { ...a, [field]: value } : a) },
    }));
    setTestResults(prev => ({ ...prev, [`webex-${id}`]: undefined as any }));
  };

  const toggleWebexAccount = (id: string) => {
    setDraft(prev => ({
      ...prev,
      webex: { ...prev.webex, accounts: prev.webex.accounts.map(a => a.id === id ? { ...a, enabled: a.enabled === false } : a) },
    }));
  };

  const removeWebexAccount = (id: string) => {
    setDraft(prev => ({ ...prev, webex: { ...prev.webex, accounts: prev.webex.accounts.filter(a => a.id !== id) } }));
  };

  const toggleWebexCompany = (companyId: string) => {
    setDraft(prev => ({
      ...prev,
      webex: {
        ...prev.webex,
        companies: prev.webex.companies.includes(companyId)
          ? prev.webex.companies.filter(id => id !== companyId)
          : [...prev.webex.companies, companyId],
      },
    }));
  };

  const testWebexAccount = async (id: string) => {
    const account = draft.webex.accounts.find(a => a.id === id);
    if (!account) return;
    const key = `webex-${id}`;
    setTesting(prev => ({ ...prev, [key]: true }));
    try {
      const result = await settingsApi.testWebex(account);
      setTestResults(prev => ({ ...prev, [key]: result }));
      // Webex rotates the refresh token on every use — the token just typed in is now stale.
      // Pull the freshly-issued one into the draft so a subsequent Save persists a working token.
      if (result.success && result.refreshToken) {
        setDraft(prev => ({
          ...prev,
          webex: { ...prev.webex, accounts: prev.webex.accounts.map(a => a.id === id ? { ...a, refreshToken: result.refreshToken } : a) },
        }));
      }
    } catch {
      setTestResults(prev => ({ ...prev, [key]: { success: false, message: 'Failed to reach the server.' } }));
    } finally {
      setTesting(prev => ({ ...prev, [key]: false }));
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">VC Integration</h1>
          <p className="text-slate-500">Configure automatic meeting link generation for Google Meet and Webex</p>
        </div>
        <div className="flex gap-3">
          {hasChanges && (
            <button onClick={() => { setDraft(JSON.parse(JSON.stringify(vcIntegrationSettings))); setSaved(false); }} className="flex items-center gap-2 px-4 py-2 border border-slate-300 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors text-sm font-medium">
              <RotateCcw size={16} /> Discard
            </button>
          )}
          <button onClick={handleSave} disabled={!hasChanges} className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed font-medium">
            <Save size={16} /> {saved ? 'Saved!' : 'Save Changes'}
          </button>
        </div>
      </div>

      <div className="space-y-6">
        {/* Google Meet — per company */}
        <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 bg-slate-50 border-b border-slate-200">
            <h2 className="font-bold text-slate-900 flex items-center gap-2"><Video size={18} className="text-indigo-600" /> Google Meet</h2>
            <p className="text-xs text-slate-500 mt-1">One Google Workspace service account per company. Meetings are created on the impersonated user's calendar to obtain the Meet link.</p>
          </div>
          <div className="divide-y divide-slate-100">
            {activeCompanies.length === 0 && (
              <p className="px-6 py-6 text-sm text-slate-400">No active companies yet — add a company in Company Management first.</p>
            )}
            {activeCompanies.map(company => {
              const cfg = draft.googleMeet.companies[company.id] || { enabled: false, serviceAccountEmail: '', privateKey: '', impersonateEmail: '' };
              const testKey = `google-${company.id}`;
              return (
                <div key={company.id} className="p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-medium text-slate-800">
                      <Building2 size={16} className="text-slate-400" /> {company.name}
                    </div>
                    <button type="button" onClick={() => updateGoogleCompany(company.id, 'enabled', !cfg.enabled)} className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${cfg.enabled ? 'bg-indigo-600' : 'bg-slate-300'}`}>
                      <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${cfg.enabled ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Service Account Email</label>
                      <input type="text" value={cfg.serviceAccountEmail} onChange={e => updateGoogleCompany(company.id, 'serviceAccountEmail', e.target.value)} placeholder="booking-bot@project.iam.gserviceaccount.com" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none font-mono" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Impersonate Email</label>
                      <input type="text" value={cfg.impersonateEmail} onChange={e => updateGoogleCompany(company.id, 'impersonateEmail', e.target.value)} placeholder="bookings@company.com" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Private Key</label>
                    <textarea value={cfg.privateKey} onChange={e => updateGoogleCompany(company.id, 'privateKey', e.target.value)} rows={3} placeholder="-----BEGIN PRIVATE KEY-----&#10;...&#10;-----END PRIVATE KEY-----" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono focus:ring-2 focus:ring-indigo-500 outline-none" />
                    <p className="text-xs text-slate-400 mt-1">The <code>private_key</code> field from the service account's downloaded JSON key.</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <button onClick={() => testGoogleCompany(company.id)} disabled={testing[testKey]} className="flex items-center gap-2 px-4 py-2 border border-teal-300 text-teal-700 rounded-lg hover:bg-teal-50 transition-colors text-sm font-medium disabled:opacity-50">
                      {testing[testKey] ? <Loader2 size={16} className="animate-spin" /> : <Wifi size={16} />} {testing[testKey] ? 'Testing...' : 'Test Connection'}
                    </button>
                    {testResults[testKey] && (
                      <div className={`flex items-center gap-2 text-sm ${testResults[testKey].success ? 'text-green-600' : 'text-red-600'}`}>
                        {testResults[testKey].success ? <Wifi size={16} /> : <WifiOff size={16} />}
                        {testResults[testKey].message}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Webex — shared account pool */}
        <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h2 className="font-bold text-slate-900 flex items-center gap-2"><Video size={18} className="text-teal-600" /> Webex</h2>
              <p className="text-xs text-slate-500 mt-1">Whichever account has no overlapping meeting is used automatically. The account pool is shared, but only the companies selected below can choose Webex at all.</p>
            </div>
            <button type="button" onClick={() => setDraft(prev => ({ ...prev, webex: { ...prev.webex, enabled: !prev.webex.enabled } }))} className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${draft.webex.enabled ? 'bg-teal-600' : 'bg-slate-300'}`}>
              <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${draft.webex.enabled ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>
          <div className="px-6 py-4 border-b border-slate-100">
            <p className="text-sm font-medium text-slate-700 mb-2">Available For Companies</p>
            {activeCompanies.length === 0 ? (
              <p className="text-sm text-slate-400">No active companies yet — add a company in Company Management first.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {activeCompanies.map(company => {
                  const isSelected = draft.webex.companies.includes(company.id);
                  return (
                    <button
                      key={company.id}
                      type="button"
                      onClick={() => toggleWebexCompany(company.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                        isSelected ? 'bg-teal-600 border-teal-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-teal-300 hover:bg-teal-50'
                      }`}
                    >
                      <Building2 size={13} /> {company.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div className="divide-y divide-slate-100">
            {draft.webex.accounts.length === 0 && (
              <p className="px-6 py-6 text-sm text-slate-400">No Webex accounts added yet.</p>
            )}
            {draft.webex.accounts.map(account => {
              const testKey = `webex-${account.id}`;
              return (
                <div key={account.id} className="p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <input type="text" value={account.label} onChange={e => updateWebexAccount(account.id, 'label', e.target.value)} placeholder="Account label (e.g. Front Desk Webex)" className="font-medium text-slate-800 px-2 py-1 border border-transparent hover:border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none flex-1 mr-4" />
                    <button
                      type="button"
                      role="switch"
                      aria-checked={account.enabled !== false}
                      title={account.enabled !== false ? 'Enabled — click to disable' : 'Disabled — click to enable'}
                      onClick={() => toggleWebexAccount(account.id)}
                      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors mr-3 ${account.enabled !== false ? 'bg-teal-600' : 'bg-slate-300'}`}
                    >
                      <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${account.enabled !== false ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                    <button onClick={() => removeWebexAccount(account.id)} className="text-red-500 hover:text-red-700 p-1.5 rounded-lg hover:bg-red-50 transition-colors">
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Client ID</label>
                      <input type="text" value={account.clientId} onChange={e => updateWebexAccount(account.id, 'clientId', e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none font-mono" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Client Secret</label>
                      <input type="password" value={account.clientSecret} onChange={e => updateWebexAccount(account.id, 'clientSecret', e.target.value)} placeholder="••••••••" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Refresh Token</label>
                    <input type="password" value={account.refreshToken} onChange={e => updateWebexAccount(account.id, 'refreshToken', e.target.value)} placeholder="••••••••" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none" />
                    <p className="text-xs text-slate-400 mt-1">Webex issues a new refresh token every time it's used (including by Test Connection) — the old one stops working immediately after. Remember to Save after testing.</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <button onClick={() => testWebexAccount(account.id)} disabled={testing[testKey]} className="flex items-center gap-2 px-4 py-2 border border-teal-300 text-teal-700 rounded-lg hover:bg-teal-50 transition-colors text-sm font-medium disabled:opacity-50">
                      {testing[testKey] ? <Loader2 size={16} className="animate-spin" /> : <Wifi size={16} />} {testing[testKey] ? 'Testing...' : 'Test Connection'}
                    </button>
                    {testResults[testKey] && (
                      <div className={`flex items-center gap-2 text-sm ${testResults[testKey].success ? 'text-green-600' : 'text-red-600'}`}>
                        {testResults[testKey].success ? <Wifi size={16} /> : <WifiOff size={16} />}
                        {testResults[testKey].message}{testResults[testKey].success ? ' (refresh token updated — click Save)' : ''}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            <div className="p-6">
              <button onClick={addWebexAccount} className="flex items-center gap-2 px-4 py-2 border border-dashed border-slate-300 text-slate-500 rounded-lg hover:border-teal-300 hover:text-teal-700 hover:bg-teal-50 transition-colors text-sm font-medium">
                <Plus size={16} /> Add Webex Account
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
