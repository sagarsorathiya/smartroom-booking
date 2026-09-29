import React, { useState, useEffect } from 'react';
import { X, Calendar, AlertTriangle } from 'lucide-react';
import { format, differenceInMinutes } from 'date-fns';
import { Booking } from '../../types';
import { useApp } from '../../context/AppContext';
import { DatePicker } from '../shared/DatePicker';

interface RescheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  booking: Booking;
}

export const RescheduleModal: React.FC<RescheduleModalProps> = ({ isOpen, onClose, booking }) => {
  const { editBooking, hasConflict } = useApp();

  const [dateStr, setDateStr] = useState('');
  const [hour, setHour] = useState('09');
  const [minute, setMinute] = useState('00');
  const [ampm, setAmpm] = useState<'AM' | 'PM'>('AM');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Pre-populate from the existing booking whenever it changes or modal opens
  useEffect(() => {
    if (isOpen && booking) {
      const d = booking.startTime;
      setDateStr(format(d, 'yyyy-MM-dd'));
      const h = d.getHours();
      setAmpm(h >= 12 ? 'PM' : 'AM');
      const h12 = h % 12 === 0 ? 12 : h % 12;
      setHour(String(h12).padStart(2, '0'));
      setMinute(String(d.getMinutes()).padStart(2, '0'));
      setError('');
    }
  }, [isOpen, booking]);

  if (!isOpen) return null;

  const durationMs = booking.endTime.getTime() - booking.startTime.getTime();

  const buildTimes = (): { startTime: Date; endTime: Date } | null => {
    if (!dateStr) return null;
    let h = parseInt(hour, 10);
    const m = parseInt(minute, 10);
    if (ampm === 'PM' && h !== 12) h += 12;
    if (ampm === 'AM' && h === 12) h = 0;
    const startTime = new Date(`${dateStr}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`);
    const endTime = new Date(startTime.getTime() + durationMs);
    return { startTime, endTime };
  };

  const handleSubmit = async () => {
    setError('');
    const times = buildTimes();
    if (!times) { setError('Please select a valid date and time.'); return; }
    const { startTime, endTime } = times;
    if (startTime <= new Date()) { setError('New start time must be in the future.'); return; }
    if (hasConflict(booking.roomId, startTime, endTime, booking.id)) {
      setError('This time slot conflicts with another booking for the same room.');
      return;
    }
    setLoading(true);
    const ok = await editBooking(booking.id, { startTime, endTime });
    setLoading(false);
    if (ok) {
      onClose();
    } else {
      setError('Failed to reschedule. Please try again.');
    }
  };

  const durationLabel = (() => {
    const mins = Math.round(durationMs / 60000);
    if (mins < 60) return `${mins}m`;
    const h = Math.floor(mins / 60), m = mins % 60;
    return m === 0 ? `${h}h` : `${h}h ${m}m`;
  })();

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2 text-slate-800">
            <Calendar className="w-5 h-5 text-indigo-600" />
            <h2 className="font-semibold text-base">Reschedule Booking</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Booking title */}
          <p className="text-sm text-slate-600">
            <span className="font-medium text-slate-800">{booking.title}</span>
            {' '}— duration: <span className="font-medium">{durationLabel}</span>
          </p>

          {/* Recurring occurrence notice */}
          {booking.recurrenceId && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <span>Only <strong>this occurrence</strong> will be rescheduled. Other bookings in this series won&apos;t be affected.</span>
            </div>
          )}

          {/* Date */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">New Date</label>
            <DatePicker
              value={dateStr}
              onChange={setDateStr}
              minDate={new Date()}
            />
          </div>

          {/* Time */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">New Start Time</label>
            <div className="flex items-center gap-2">
              <select
                value={hour}
                onChange={e => setHour(e.target.value)}
                className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              >
                {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')).map(h => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
              <span className="text-slate-500 font-semibold">:</span>
              <select
                value={minute}
                onChange={e => setMinute(e.target.value)}
                className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              >
                {['00', '15', '30', '45'].map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              <div className="flex border border-slate-300 rounded-lg overflow-hidden text-sm">
                {(['AM', 'PM'] as const).map(p => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setAmpm(p)}
                    className={`px-3 py-2 transition-colors ${ampm === p ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-5 py-4 border-t border-slate-200">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex-1 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? 'Saving…' : 'Reschedule'}
          </button>
        </div>
      </div>
    </div>
  );
};
