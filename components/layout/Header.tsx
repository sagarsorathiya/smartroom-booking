import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { Bell, X, Check, Menu, Sun, Moon } from 'lucide-react';
import { format } from 'date-fns';

interface HeaderProps {
  onToggleSidebar?: () => void;
  darkMode?: boolean;
  onToggleDarkMode?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onToggleSidebar, darkMode, onToggleDarkMode }) => {
  const { currentUser, notifications, markNotificationRead, clearNotifications } = useApp();
  const [showNotifications, setShowNotifications] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const [showAllNotifications, setShowAllNotifications] = useState(false);

  const unreadCount = notifications.filter(n => !n.read).length;

  // Close notification panel on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
    };
    if (showNotifications) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showNotifications]);

  const typeColors: Record<string, string> = {
    success: 'bg-green-100 text-green-700',
    error: 'bg-red-100 text-red-700',
    warning: 'bg-amber-100 text-amber-700',
    info: 'bg-blue-100 text-blue-700',
  };

  return (
    <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 sm:px-8 sticky top-0 z-10">
      <div className="flex items-center gap-4">
        {/* Mobile hamburger */}
        <button onClick={onToggleSidebar} className="lg:hidden p-2 text-slate-500 hover:text-slate-900 rounded-md">
          <Menu size={22} />
        </button>
        {/* Welcome — full on lg+, short on sm–md, first name only on mobile */}
        <h2 className="text-slate-500 font-medium hidden lg:block">
          Welcome back, <span className="text-slate-900 font-semibold">{currentUser.name}</span>
        </h2>
        <span className="text-sm font-semibold text-slate-900 hidden sm:block lg:hidden">
          {currentUser.name.split(' ')[0]}
        </span>
        <span className="text-sm font-semibold text-slate-800 sm:hidden">
          {currentUser.name.split(' ')[0]}
        </span>
      </div>

      <div className="flex items-center gap-4">
        {/* Dark mode toggle */}
        <button
          onClick={onToggleDarkMode}
          title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          className="p-2 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-50 transition-colors"
        >
          {darkMode ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        <div ref={panelRef} className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className={`relative p-2 rounded-lg transition-colors ${showNotifications ? 'bg-indigo-50 text-indigo-600' : 'text-slate-400 hover:text-indigo-600 hover:bg-slate-50'}`}
          >
            <Bell size={20} />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-white">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {showNotifications && (
            <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden z-50 animate-slide-in">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                <h4 className="font-bold text-slate-900 text-sm">Notifications</h4>
                {unreadCount > 0 && (
                  <button onClick={clearNotifications} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">
                    Mark all read
                  </button>
                )}
              </div>
              <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                {notifications.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-8">No notifications</p>
                ) : (
                  (showAllNotifications ? notifications : notifications.slice(0, 10)).map(n => (
                    <div
                      key={n.id}
                      className={`px-4 py-3 flex gap-3 items-start cursor-pointer hover:bg-slate-50 transition-colors ${!n.read ? 'bg-indigo-50/50' : ''}`}
                      onClick={() => markNotificationRead(n.id)}
                    >
                      <span className={`mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${typeColors[n.type]}`}>
                        {n.type}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-700">{n.message}</p>
                        <p className="text-xs text-slate-400 mt-1">{format(n.timestamp, 'h:mm a')}</p>
                      </div>
                      {!n.read && <span className="w-2 h-2 bg-indigo-500 rounded-full mt-2 flex-shrink-0"></span>}
                    </div>
                  ))
                )}
              </div>
              {notifications.length > 10 && !showAllNotifications && (
                <button
                  onClick={() => setShowAllNotifications(true)}
                  className="w-full px-4 py-2.5 text-xs font-medium text-indigo-600 hover:bg-indigo-50 border-t border-slate-200 transition-colors"
                >
                  View all {notifications.length} notifications
                </button>
              )}
            </div>
          )}
        </div>


      </div>
    </header>
  );
};
