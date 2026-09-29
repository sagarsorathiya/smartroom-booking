import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { Clock, X, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';
import { Booking } from '../../types';
import { useApp } from '../../context/AppContext';

interface AdjustEndTimeModalProps {
  booking: Booking;
  onClose: () => void;
}

export const AdjustEndTimeModal: React.FC<AdjustEndTimeModalProps> = ({ booking, onClose }) => {
  const { editBooking, hasConflict, bookings, addNotification } = useApp();

  // Initialise with the current end time (HH:MM format)
  const pad = (n: number) => String(n).padStart(2, '0');
  const toTimeStr = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

  const [timeValue, setTimeValue] = useState(toTimeStr(booking.endTime));
  const [saving, setSaving] = useState(false);

  // Build the candidate end Date from the booking's date + chosen time
  const candidateEnd = (() => {
    const [h, m] = timeValue.split(':').map(Number);
    const d = new Date(booking.startTime);
    d.setHours(h, m, 0, 0);
    return d;
  })();

  const minTime = toTimeStr(new Date(booking.startTime.getTime() + 5 * 60 * 1000)); // at least 5 min after start

  // Real-time conflict detection
  const hasConflictResult = timeValue && candidateEnd > booking.startTime
    ? hasConflict(booking.roomId, booking.startTime, candidateEnd, booking.id)
    : false;

  const isInvalid = !timeValue || candidateEnd <= booking.startTime;
  const isUnchanged = toTimeStr(candidateEnd) === toTimeStr(booking.endTime);

  // Find the next booking on this room to display as a hint
  const nextBooking = bookings
    .filter(b =>
      b.id !== booking.id &&
      b.roomId === booking.roomId &&
      b.startTime >= booking.startTime
    )
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime())[0];

  // Duration label
  const durationMs = candidateEnd.getTime() - booking.startTime.getTime();
  const durationMins = Math.round(durationMs / 60000);
  const durationLabel = durationMins >= 60
    ? `${Math.floor(durationMins / 60)}h ${durationMins % 60 > 0 ? `${durationMins % 60}m` : ''}`.trim()
    : `${durationMins}m`;

  const originalEnd = toTimeStr(booking.endTime);
  const isExtending = timeValue > originalEnd;
  const isShorting = timeValue < originalEnd;

  const handleSave = async () => {
    if (isInvalid || hasConflictResult || isUnchanged) return;
    setSaving(true);
    try {
      await editBooking(booking.id, { endTime: candidateEnd });
      addNotification('success', `Meeting end time updated to ${format(candidateEnd, 'h:mm a')}.`);
      onClose();
    } catch {
      addNotification('error', 'Failed to update end time. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-sm"
        style={{ animation: 'scaleUp 0.18s ease-out' }}
      >
        <style>{`@keyframes scaleUp { from { opacity:0; transform:scale(0.95); } to { opacity:1; transform:scale(1); } }`}</style>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
              <Clock size={16} className="text-indigo-600" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Adjust End Time</h3>
              <p className="text-[11px] text-slate-400 truncate max-w-[180px]">{booking.title}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">

          {/* Current summary */}
          <div className="flex items-center gap-3 text-sm text-slate-600 bg-slate-50 rounded-xl px-4 py-3">
            <span>Started: <strong className="text-slate-800">{format(booking.startTime, 'h:mm a')}</strong></span>
            <span className="text-slate-300">•</span>
            <span>Ends now: <strong className="text-slate-800">{format(booking.endTime, 'h:mm a')}</strong></span>
          </div>

          {/* New end time picker */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
              New End Time
            </label>
            <input
              type="time"
              value={timeValue}
              min={minTime}
              onChange={e => setTimeValue(e.target.value)}
              className={`w-full px-4 py-3 text-lg font-semibold border rounded-xl focus:ring-2 outline-none transition-colors text-slate-800
                ${hasConflictResult ? 'border-red-300 focus:ring-red-400 bg-red-50' :
                  isInvalid ? 'border-amber-300 focus:ring-amber-400 bg-amber-50' :
                  'border-slate-200 focus:ring-indigo-500 bg-white'}`}
              autoFocus
            />
          </div>

          {/* Duration preview */}
          {!isInvalid && (
            <div className={`flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-lg
              ${hasConflictResult ? 'bg-red-50 text-red-600' :
                isExtending ? 'bg-green-50 text-green-700' :
                isShorting ? 'bg-amber-50 text-amber-700' :
                'bg-slate-50 text-slate-500'}`}
            >
              {hasConflictResult
                ? <AlertTriangle size={13} />
                : isExtending
                ? <span>▲</span>
                : isShorting
                ? <span>▼</span>
                : <CheckCircle size={13} />
              }
              {hasConflictResult
                ? 'Conflicts with another booking on this room'
                : isUnchanged
                ? 'Same as current end time'
                : `Total duration: ${durationLabel} · ${isExtending ? 'Extending' : 'Shortening'} by ${
                    (() => {
                      const diffMins = Math.abs(Math.round((candidateEnd.getTime() - booking.endTime.getTime()) / 60000));
                      return diffMins >= 60
                        ? `${Math.floor(diffMins / 60)}h ${diffMins % 60 > 0 ? `${diffMins % 60}m` : ''}`.trim()
                        : `${diffMins}m`;
                    })()
                  }`
              }
            </div>
          )}

          {/* Next booking hint */}
          {nextBooking && (
            <p className="text-[11px] text-slate-400 flex items-center gap-1">
              <Clock size={11} />
              Next booking on this room: <strong className="text-slate-600">{nextBooking.title}</strong> at{' '}
              <strong className="text-slate-600">{format(nextBooking.startTime, 'h:mm a')}</strong>
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 text-sm font-semibold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isInvalid || hasConflictResult || isUnchanged || saving}
            className="flex-1 py-2.5 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-all shadow-sm shadow-indigo-200 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            {saving ? 'Saving…' : 'Update End Time'}
          </button>
        </div>
      </div>
    </div>
  );
};
