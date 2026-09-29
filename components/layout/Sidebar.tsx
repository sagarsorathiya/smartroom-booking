import React from 'react';
import { useApp } from '../../context/AppContext';
import { UserRole } from '../../types';
import { LayoutDashboard, MonitorSmartphone, Settings, Clock, LogOut, Users, BarChart3, ClipboardList, X, Sliders, Network, Mail, UserCog, Building2, Database, ArrowLeftRight, Coffee, ChevronsLeft, ChevronsRight, FileBarChart2 } from 'lucide-react';

interface SidebarProps {
  activeView: string;
  setActiveView: (view: string) => void;
  isOpen: boolean;
  onClose: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeView, setActiveView, isOpen, onClose, collapsed = false, onToggleCollapse }) => {
  const { currentUser, logout, settings } = useApp();

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: [UserRole.EMPLOYEE, UserRole.RECEPTION, UserRole.IT, UserRole.ADMINISTRATION, UserRole.ADMIN] },
    { id: 'my-bookings', label: 'My Bookings', icon: Clock, roles: [UserRole.EMPLOYEE, UserRole.RECEPTION, UserRole.IT, UserRole.ADMINISTRATION, UserRole.ADMIN] },
    { id: 'all-bookings', label: 'All Bookings', icon: Users, roles: [UserRole.RECEPTION, UserRole.ADMINISTRATION, UserRole.ADMIN] },
    { id: 'it-tasks', label: 'IT Queue', icon: MonitorSmartphone, roles: [UserRole.IT, UserRole.ADMIN] },
    { id: 'admin-services', label: 'Admin Services', icon: Coffee, roles: [UserRole.RECEPTION, UserRole.ADMINISTRATION, UserRole.ADMIN] },
    { id: 'reports', label: 'Reports', icon: FileBarChart2, roles: [UserRole.ADMINISTRATION, UserRole.RECEPTION, UserRole.IT, UserRole.ADMIN] },
    { id: 'admin', label: 'Admin & Settings', icon: Settings, roles: [UserRole.ADMIN] },
  ];

  const filteredItems = menuItems.filter(item => item.roles.includes(currentUser.role));

  const handleNav = (id: string) => {
    setActiveView(id);
    onClose();
  };

  const handleSignOut = () => {
    logout();
    onClose();
  };

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-30 lg:hidden" onClick={onClose} />
      )}

      <div className={`h-screen bg-white border-r border-slate-200 flex flex-col fixed left-0 top-0 shadow-lg z-40 transition-all duration-300 ${isOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 ${collapsed ? 'lg:w-[72px] w-64' : 'w-64'}`}>
        {/* Brand */}
        <div className={`py-5 border-b border-slate-100 flex justify-between items-center ${collapsed ? 'lg:px-3 lg:justify-center px-5' : 'px-5'}`}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-sm shadow-indigo-200 flex-shrink-0">
              <LayoutDashboard size={18} className="text-white" />
            </div>
            <div className={`${collapsed ? 'lg:hidden' : ''}`}>
              <h1 className="text-lg font-bold text-slate-900 tracking-tight leading-tight">{settings.portalName || 'ConferenceHub'}</h1>
              <p className="text-[10px] text-slate-400 font-medium uppercase tracking-widest">Booking Portal</p>
            </div>
          </div>
          <button onClick={onClose} className="lg:hidden p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Navigation */}
        <nav className={`flex-1 py-4 space-y-0.5 overflow-y-auto ${collapsed ? 'lg:px-2 px-3' : 'px-3'}`}>
          {filteredItems.map(item => {
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNav(item.id)}
                className={`group relative w-full flex items-center gap-3 py-2.5 rounded-xl text-sm transition-all duration-200 ${collapsed ? 'lg:px-0 lg:justify-center px-3' : 'px-3'} ${
                  isActive
                    ? 'bg-indigo-50 text-indigo-700 font-semibold shadow-sm border border-indigo-100'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <div className={`p-1.5 rounded-lg flex-shrink-0 ${isActive ? 'bg-indigo-100' : 'bg-transparent'}`}>
                  <item.icon size={17} className={isActive ? 'text-indigo-600' : 'text-slate-400'} />
                </div>
                <span className={`${collapsed ? 'lg:hidden' : ''}`}>{item.label}</span>
                {isActive && !collapsed && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-indigo-500 lg:block hidden" />}
                {isActive && collapsed && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-indigo-500 lg:hidden" />}
                {/* Custom tooltip for collapsed desktop state */}
                {collapsed && (
                  <span className="hidden lg:group-hover:flex absolute left-full ml-2.5 top-1/2 -translate-y-1/2 px-2.5 py-1 bg-slate-900 text-white text-xs font-medium rounded-lg whitespace-nowrap pointer-events-none shadow-lg z-50 items-center">
                    <span className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-slate-900" />
                    {item.label}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* User profile card */}
        <div className={`px-3 py-2 border-t border-slate-100`}>
          <div className={`flex items-center gap-2.5 px-2.5 py-2 rounded-xl bg-slate-50 ${collapsed ? 'lg:justify-center lg:px-0' : ''}`}>
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center text-white font-bold text-[11px] flex-shrink-0 shadow-sm">
              {currentUser.name.trim().split(/\s+/).slice(0, 2).map((n: string) => n[0] || '').join('').toUpperCase()}
            </div>
            <div className={`min-w-0 flex-1 ${collapsed ? 'lg:hidden' : ''}`}>
              <p className="text-xs font-semibold text-slate-800 truncate leading-tight">{currentUser.name}</p>
              <p className="text-[10px] text-slate-400 leading-tight capitalize">{currentUser.role.toLowerCase().replace('_', ' ')}</p>
            </div>
          </div>
        </div>

        {/* Sign Out — right below profile card */}
        <div className={`py-2 px-3 ${collapsed ? 'lg:px-2' : ''}`}>
          <button
            onClick={handleSignOut}
            title={collapsed ? 'Sign Out' : undefined}
            className={`w-full flex items-center gap-3 py-2.5 rounded-xl text-sm text-slate-500 hover:bg-red-50 hover:text-red-600 cursor-pointer transition-colors ${collapsed ? 'lg:px-0 lg:justify-center px-3' : 'px-3'}`}
          >
            <div className="p-1.5 rounded-lg flex-shrink-0">
              <LogOut size={17} />
            </div>
            <span className={`font-medium ${collapsed ? 'lg:hidden' : ''}`}>Sign Out</span>
          </button>
        </div>

        {/* Collapse toggle (desktop only) */}
        {onToggleCollapse && (
          <div className="hidden lg:block px-3 py-2 border-t border-slate-100">
            <button
              onClick={onToggleCollapse}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className={`w-full flex items-center gap-3 py-2 rounded-xl text-sm text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors ${collapsed ? 'justify-center px-0' : 'px-3'}`}
            >
              <div className="p-1.5 rounded-lg flex-shrink-0">
                {collapsed ? <ChevronsRight size={17} /> : <ChevronsLeft size={17} />}
              </div>
              <span className={`font-medium ${collapsed ? 'hidden' : ''}`}>Collapse</span>
            </button>
          </div>
        )}
      </div>
    </>
  );
};
