import React, { useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';

export const ToastContainer: React.FC = () => {
  const { notifications, markNotificationRead } = useApp();

  const unread = notifications.filter(n => !n.read).slice(0, 5);

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
      {unread.map(notification => (
        <ToastItem
          key={notification.id}
          id={notification.id}
          type={notification.type}
          message={notification.message}
          onDismiss={() => markNotificationRead(notification.id)}
        />
      ))}
    </div>
  );
};

interface ToastItemProps {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  onDismiss: () => void;
}

const ToastItem: React.FC<ToastItemProps> = ({ type, message, onDismiss }) => {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 5000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  const config = {
    success: { bg: 'bg-green-50 border-green-200', text: 'text-green-800', Icon: CheckCircle, iconColor: 'text-green-500' },
    error: { bg: 'bg-red-50 border-red-200', text: 'text-red-800', Icon: XCircle, iconColor: 'text-red-500' },
    warning: { bg: 'bg-amber-50 border-amber-200', text: 'text-amber-800', Icon: AlertTriangle, iconColor: 'text-amber-500' },
    info: { bg: 'bg-blue-50 border-blue-200', text: 'text-blue-800', Icon: Info, iconColor: 'text-blue-500' },
  }[type];

  return (
    <div className={`${config.bg} border rounded-lg p-4 shadow-lg flex items-start gap-3 animate-slide-in`}>
      <config.Icon size={20} className={`${config.iconColor} flex-shrink-0 mt-0.5`} />
      <p className={`${config.text} text-sm flex-1`}>{message}</p>
      <button onClick={onDismiss} className="text-slate-400 hover:text-slate-600 flex-shrink-0">
        <X size={16} />
      </button>
    </div>
  );
};
