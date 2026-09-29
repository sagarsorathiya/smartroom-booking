import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { LdapSettings } from '../../types';
import { settingsApi } from '../../services/api';
import { Save, Shield, Server, Users, Key, RotateCcw, Wifi, WifiOff, Loader2 } from 'lucide-react';

export const LdapSettingsPage: React.FC = () => {
  const { ldapSettings, updateLdapSettings } = useApp();
  const [draft, setDraft] = useState<LdapSettings>({ ...ldapSettings });
  const [saved, setSaved] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);

  const update = <K extends keyof LdapSettings>(key: K, value: LdapSettings[K]) => {
    setDraft(prev => ({ ...prev, [key]: value }));
    setSaved(false);
    setTestResult(null);
  };

  const handleSave = () => {
    updateLdapSettings(draft);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleTestConnection = async () => {
    if (!draft.serverUrl || !draft.baseDn) {
      setTestResult({ success: false, message: 'Server URL and Base DN are required for testing.' });
      return;
    }
    setTestResult(null);
    setTesting(true);
    try {
      const result = await settingsApi.testLdapConnection(draft);
      setTestResult(result);
    } catch {
      setTestResult({ success: false, message: 'Failed to reach the server.' });
    } finally {
      setTesting(false);
    }
  };

  const hasChanges = JSON.stringify(draft) !== JSON.stringify(ldapSettings);

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">LDAP / Active Directory</h1>
          <p className="text-slate-500">Configure directory service integration for user authentication</p>
        </div>
        <div className="flex gap-3">
          {hasChanges && (
            <button onClick={() => { setDraft({ ...ldapSettings }); setSaved(false); }} className="flex items-center gap-2 px-4 py-2 border border-slate-300 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors text-sm font-medium">
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
            <h2 className="font-bold text-slate-900 flex items-center gap-2"><Shield size={18} className="text-indigo-600" /> LDAP Authentication</h2>
          </div>
          <div className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-900">Enable LDAP Authentication</p>
                <p className="text-xs text-slate-500">When enabled, users authenticate against Active Directory / LDAP server</p>
              </div>
              <button type="button" onClick={() => update('enabled', !draft.enabled)} className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${draft.enabled ? 'bg-indigo-600' : 'bg-slate-300'}`}>
                <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${draft.enabled ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>
          </div>
        </section>

        {/* Server Configuration */}
        <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 bg-slate-50 border-b border-slate-200">
            <h2 className="font-bold text-slate-900 flex items-center gap-2"><Server size={18} className="text-teal-600" /> Server Configuration</h2>
          </div>
          <div className="p-6 space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Server URL <span className="text-red-500">*</span></label>
                <input type="text" value={draft.serverUrl} onChange={e => update('serverUrl', e.target.value)} placeholder="ldap://dc.company.com" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                <p className="text-xs text-slate-400 mt-1">e.g. ldap://dc.company.com or ldaps://dc.company.com</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Port</label>
                  <input type="number" value={draft.port} onChange={e => update('port', Number(e.target.value))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                </div>
                <div className="flex items-end pb-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={draft.useSsl} onChange={e => update('useSsl', e.target.checked)} className="h-4 w-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500" />
                    <span className="text-sm text-slate-700">Use SSL/TLS</span>
                  </label>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Bind DN</label>
                <input type="text" value={draft.bindDn} onChange={e => update('bindDn', e.target.value)} placeholder="CN=svc_ldap,OU=ServiceAccounts,DC=company,DC=com" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Bind Password</label>
                <input type="password" value={draft.bindPassword} onChange={e => update('bindPassword', e.target.value)} placeholder="••••••••" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Base DN <span className="text-red-500">*</span></label>
              <input type="text" value={draft.baseDn} onChange={e => update('baseDn', e.target.value)} placeholder="DC=company,DC=com" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>

            {/* Test Connection */}
            <div className="pt-2 flex items-center gap-4">
              <button onClick={handleTestConnection} disabled={testing} className="flex items-center gap-2 px-4 py-2 border border-teal-300 text-teal-700 rounded-lg hover:bg-teal-50 transition-colors text-sm font-medium disabled:opacity-50">
                {testing ? <Loader2 size={16} className="animate-spin" /> : <Wifi size={16} />} {testing ? 'Testing...' : 'Test Connection'}
              </button>
              {testResult && (
                <div className={`flex items-center gap-2 text-sm ${testResult.success ? 'text-green-600' : 'text-red-600'}`}>
                  {testResult.success ? <Wifi size={16} /> : <WifiOff size={16} />}
                  {testResult.message}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* User Search Settings */}
        <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 bg-slate-50 border-b border-slate-200">
            <h2 className="font-bold text-slate-900 flex items-center gap-2"><Users size={18} className="text-purple-600" /> User & Group Mapping</h2>
          </div>
          <div className="p-6 space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">User Search Filter</label>
                <input type="text" value={draft.userSearchFilter} onChange={e => update('userSearchFilter', e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none font-mono" />
                <p className="text-xs text-slate-400 mt-1">{'{0}'} is replaced with the login username</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Username Attribute</label>
                <input type="text" value={draft.usernameAttribute} onChange={e => update('usernameAttribute', e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none font-mono" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email Attribute</label>
                <input type="text" value={draft.emailAttribute} onChange={e => update('emailAttribute', e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none font-mono" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Display Name Attribute</label>
                <input type="text" value={draft.displayNameAttribute} onChange={e => update('displayNameAttribute', e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none font-mono" />
              </div>
            </div>

            <hr className="border-slate-100" />
            <h4 className="text-sm font-semibold text-slate-700">Role Group Mapping</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Group Search Base</label>
                <input type="text" value={draft.groupSearchBase} onChange={e => update('groupSearchBase', e.target.value)} placeholder="OU=Groups,DC=company,DC=com" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Admin Group DN</label>
                <input type="text" value={draft.adminGroupDn} onChange={e => update('adminGroupDn', e.target.value)} placeholder="CN=ConferenceHub-Admin,OU=Groups,..." className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">IT Group DN</label>
                <input type="text" value={draft.itGroupDn} onChange={e => update('itGroupDn', e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Reception Group DN</label>
                <input type="text" value={draft.receptionGroupDn} onChange={e => update('receptionGroupDn', e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Administration Group DN</label>
                <input type="text" value={draft.administrationGroupDn || ''} onChange={e => update('administrationGroupDn', e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
            </div>
          </div>
        </section>

        {/* Timeouts */}
        <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 bg-slate-50 border-b border-slate-200">
            <h2 className="font-bold text-slate-900 flex items-center gap-2"><Key size={18} className="text-amber-600" /> Timeouts</h2>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Connection Timeout (ms)</label>
                <input type="number" min={1000} max={30000} step={1000} value={draft.connectionTimeout} onChange={e => update('connectionTimeout', Number(e.target.value))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Search Timeout (ms)</label>
                <input type="number" min={1000} max={60000} step={1000} value={draft.searchTimeout} onChange={e => update('searchTimeout', Number(e.target.value))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
