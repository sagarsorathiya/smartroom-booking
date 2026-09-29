import React from 'react';
import { AlertTriangle, HelpCircle, X } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  confirmVariant?: 'danger' | 'primary';
  children?: React.ReactNode;
  confirmDisabled?: boolean;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  confirmVariant = 'danger',
  children,
  confirmDisabled = false,
}) => {
  if (!isOpen) return null;

  const isDanger = confirmVariant === 'danger';
  const btnClass = isDanger
    ? 'bg-red-600 hover:bg-red-700 text-white'
    : 'bg-indigo-600 hover:bg-indigo-700 text-white';
  const IconComponent = isDanger ? AlertTriangle : HelpCircle;
  const iconBgClass = isDanger ? 'bg-red-100' : 'bg-indigo-100';
  const iconColorClass = isDanger ? 'text-red-600' : 'text-indigo-600';

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className={`p-3 ${iconBgClass} rounded-full flex-shrink-0`}>
              <IconComponent size={24} className={iconColorClass} />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-slate-900">{title}</h3>
              <p className="text-sm text-slate-600 mt-2">{message}</p>
              {children}
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
              <X size={20} />
            </button>
          </div>
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 bg-slate-50 border-t border-slate-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={() => { onConfirm(); onClose(); }}
            disabled={confirmDisabled}
            className={`px-4 py-2 text-sm font-medium rounded-lg ${btnClass} disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
