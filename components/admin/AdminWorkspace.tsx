import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { UserRole } from '../../types';
import { AdminPanel } from './AdminPanel';
import { SettingsPage } from './SettingsPage';
import { LdapSettingsPage } from './LdapSettingsPage';
import { SmtpSettingsPage } from './SmtpSettingsPage';
import { VcIntegrationSettingsPage } from './VcIntegrationSettingsPage';
import { UserManagement } from './UserManagement';
import { CompanyDeptManagement } from './CompanyDeptManagement';
import { DatabaseSettingsPage } from './DatabaseSettingsPage';
import { ImportExportPage } from './ImportExportPage';
import { AuditLogView } from './AuditLogView';
import { Reports } from '../reports/Reports';
import { Building2, Users, Monitor, Sliders, Network, Mail, Database, ArrowLeftRight, ClipboardList, BarChart3, Video } from 'lucide-react';

type AdminTab = 'rooms' | 'users' | 'company' | 'settings' | 'ldap' | 'smtp' | 'vc-integration' | 'database' | 'import-export' | 'audit' | 'reports';

export const AdminWorkspace: React.FC = () => {
  const { currentUser } = useApp();
  const [activeTab, setActiveTab] = useState<AdminTab>('rooms');

  const navGroups = [
    {
      title: 'Organization',
      items: [
        { id: 'users', label: 'Users', icon: Users, roles: [UserRole.ADMIN] },
        { id: 'company', label: 'Company & Dept', icon: Building2, roles: [UserRole.ADMIN] },
      ]
    },
    {
      title: 'Infrastructure',
      items: [
        { id: 'rooms', label: 'Rooms & Blocks', icon: Monitor, roles: [UserRole.RECEPTION, UserRole.ADMIN] },
      ]
    },
    {
      title: 'System Settings',
      items: [
        { id: 'settings', label: 'General Portal', icon: Sliders, roles: [UserRole.ADMIN] },
        { id: 'ldap', label: 'LDAP / SSO', icon: Network, roles: [UserRole.ADMIN] },
        { id: 'smtp', label: 'SMTP / Email', icon: Mail, roles: [UserRole.ADMIN] },
        { id: 'vc-integration', label: 'VC Integration', icon: Video, roles: [UserRole.ADMIN] },
        { id: 'database', label: 'Database', icon: Database, roles: [UserRole.ADMIN] },
        { id: 'import-export', label: 'Import / Export', icon: ArrowLeftRight, roles: [UserRole.ADMIN] },
      ]
    },
    {
      title: 'Insights',
      items: [
        { id: 'reports', label: 'Reports', icon: BarChart3, roles: [UserRole.ADMIN] },
        { id: 'audit', label: 'Audit Log', icon: ClipboardList, roles: [UserRole.ADMIN] },
      ]
    }
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'rooms': return <AdminPanel />;
      case 'users': return <UserManagement />;
      case 'company': return <CompanyDeptManagement />;
      case 'settings': return <SettingsPage />;
      case 'ldap': return <LdapSettingsPage />;
      case 'smtp': return <SmtpSettingsPage />;
      case 'vc-integration': return <VcIntegrationSettingsPage />;
      case 'database': return <DatabaseSettingsPage />;
      case 'import-export': return <ImportExportPage />;
      case 'audit': return <AuditLogView />;
      case 'reports': return <Reports />;
      default: return <AdminPanel />;
    }
  };

  return (
    <div className="flex h-full bg-slate-50">
      {/* Secondary Sidebar */}
      <div className="w-64 bg-white border-r border-slate-200 flex flex-col overflow-y-auto">
        <div className="p-6 pb-2">
          <h2 className="text-lg font-bold text-slate-900">Admin Workspace</h2>
          <p className="text-xs text-slate-500 mt-1">Manage portal settings</p>
        </div>
        
        <div className="flex-1 px-4 py-4 space-y-6">
          {navGroups.map((group, idx) => {
            const visibleItems = group.items.filter(item => item.roles.includes(currentUser.role));
            if (visibleItems.length === 0) return null;
            
            return (
              <div key={idx}>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 px-2">{group.title}</h3>
                <div className="space-y-1">
                  {visibleItems.map(item => {
                    const isActive = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => setActiveTab(item.id as AdminTab)}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                          isActive 
                            ? 'bg-indigo-50 text-indigo-700' 
                            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                        }`}
                      >
                        <item.icon size={16} className={isActive ? 'text-indigo-600' : 'text-slate-400'} />
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto">
        {renderContent()}
      </div>
    </div>
  );
};
