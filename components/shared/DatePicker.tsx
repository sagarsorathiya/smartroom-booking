import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, addMonths, subMonths, isSameDay, isSameMonth, isBefore } from 'date-fns';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';

interface DatePickerProps {
  value: string; // yyyy-MM-dd
  onChange: (value: string) => void;
  minDate?: Date;
  hasError?: boolean;
  size?: 'sm' | 'md';
}

export const DatePicker: React.FC<DatePickerProps> = ({ value, onChange, minDate, hasError, size = 'md' }) => {
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => {
    if (value) return new Date(value + 'T00:00:00');
    if (minDate) return new Date(minDate);
    return new Date();
  });
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const selected = value ? new Date(value + 'T00:00:00') : null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  useEffect(() => {
    if (!open) return;
    if (value) setViewMonth(new Date(value + 'T00:00:00'));
    else if (minDate) setViewMonth(new Date(minDate));
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node) &&
          btnRef.current && !btnRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const monthStart = startOfMonth(viewMonth);
  const monthEnd = endOfMonth(viewMonth);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const weeks: Date[][] = [];
  let day = calStart;
  while (day <= calEnd) {
    const week: Date[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(day);
      day = addDays(day, 1);
    }
    weeks.push(week);
  }

  const isDisabled = (d: Date) => {
    if (minDate) {
      const min = new Date(minDate);
      min.setHours(0, 0, 0, 0);
      return isBefore(d, min);
    }
    return false;
  };

  const handleSelect = (d: Date) => {
    if (isDisabled(d)) return;
    onChange(format(d, 'yyyy-MM-dd'));
    setOpen(false);
  };

  const rect = btnRef.current?.getBoundingClientRect();
  const panelHeight = 270; // approx calendar panel height
  const showAbove = rect ? rect.bottom + panelHeight + 6 > window.innerHeight : false;
  const py = size === 'sm' ? 'py-2' : 'py-2.5';

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen(!open)}
        className={`w-full px-3 ${py} border rounded-xl text-sm bg-slate-50 hover:bg-white transition-colors outline-none focus:ring-2 focus:ring-indigo-500 flex items-center justify-between gap-2 text-left ${hasError ? 'border-red-300' : 'border-slate-200'}`}
      >
        <span className={`whitespace-nowrap truncate ${selected ? 'font-medium text-slate-800' : 'text-slate-400'}`}>
          {selected ? format(selected, 'MMM d, yyyy') : 'Select date'}
        </span>
        <Calendar size={14} className="text-slate-400 flex-shrink-0" />
      </button>

      {open && createPortal(
        <>
          <div className="fixed inset-0 z-[999]" onClick={() => setOpen(false)} />
          <div
            ref={panelRef}
            className="fixed z-[1000] bg-white border border-slate-200 rounded-2xl shadow-2xl p-3 w-[280px]"
            style={rect ? {
              top: showAbove ? rect.top - panelHeight - 6 : rect.bottom + 6,
              left: Math.min(rect.left, window.innerWidth - 290),
            } : {}}
          >
            {/* Month nav */}
            <div className="flex items-center justify-between mb-2">
              <button type="button" onClick={() => setViewMonth(subMonths(viewMonth, 1))} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
                <ChevronLeft size={16} className="text-slate-500" />
              </button>
              <span className="text-sm font-bold text-slate-800">{format(viewMonth, 'MMMM yyyy')}</span>
              <button type="button" onClick={() => setViewMonth(addMonths(viewMonth, 1))} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
                <ChevronRight size={16} className="text-slate-500" />
              </button>
            </div>

            {/* Day headers */}
            <div className="grid grid-cols-7 mb-1">
              {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(d => (
                <div key={d} className="text-center text-[10px] font-bold text-slate-400 uppercase py-1">{d}</div>
              ))}
            </div>

            {/* Day grid */}
            <div className="grid grid-cols-7">
              {weeks.map((week, wi) =>
                week.map((d, di) => {
                  const isSelected = selected && isSameDay(d, selected);
                  const isToday = isSameDay(d, today);
                  const inMonth = isSameMonth(d, viewMonth);
                  const disabled = isDisabled(d);

                  return (
                    <button
                      key={`${wi}-${di}`}
                      type="button"
                      onClick={() => handleSelect(d)}
                      disabled={disabled}
                      className={`w-9 h-9 mx-auto text-xs font-medium rounded-lg transition-all flex items-center justify-center
                        ${isSelected ? 'bg-indigo-600 text-white font-bold shadow-sm' : ''}
                        ${!isSelected && isToday ? 'bg-indigo-50 text-indigo-700 font-bold ring-1 ring-indigo-200' : ''}
                        ${!isSelected && !isToday && inMonth && !disabled ? 'text-slate-700 hover:bg-slate-100' : ''}
                        ${!inMonth ? 'text-slate-300' : ''}
                        ${disabled ? 'text-slate-200 cursor-not-allowed' : 'cursor-pointer'}
                      `}
                    >
                      {format(d, 'd')}
                    </button>
                  );
                })
              )}
            </div>

            {/* Quick actions */}
            <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => handleSelect(today)}
                className="flex-1 px-2 py-1.5 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => handleSelect(addDays(today, 1))}
                className="flex-1 px-2 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Tomorrow
              </button>
              <button
                type="button"
                onClick={() => { setOpen(false); }}
                className="px-2 py-1.5 text-xs font-semibold text-slate-400 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </>,
        document.body
      )}
    </>
  );
};
