import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { format, differenceInMinutes } from 'date-fns';
import { Clock, MapPin, XCircle, Video, Edit2, Eye, Search, Filter, Copy, RefreshCw, Repeat, Clipboard } from 'lucide-react';
import { Booking, BookingStatus} from '../../types';
import { BookingDetail } from './BookingDetail';
import { BookingModal } from '../modals/BookingModal';
import { ConfirmModal } from '../common/ConfirmModal';
import { Pagination } from '../common/Pagination';
import { RescheduleModal } from '../modals/RescheduleModal';
import { AdjustEndTimeModal } from '../common/AdjustEndTimeModal';
import { isValidUrl } from '../../utils/url';

const PAGE_SIZE = 6;

export const MyBookings: React.FC = () => {
  const { bookings, currentUser, rooms, updateBookingStatus, cancelBookingSeries, addNotification } = useApp();

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'upcoming' | 'past' | 'cancelled'>('all');
  const [page, setPage] = useState(1);
  const [detailBooking, setDetailBooking] = useState<Booking | null>(null);
  const [editBooking, setEditBooking] = useState<Booking | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Booking | null>(null);
  const [showSeriesChoice, setShowSeriesChoice] = useState(false);
  const [showCancelReason, setShowCancelReason] = useState(false);
  const [cancellationReason, setCancellationReason] = useState('');
  const pendingCancelFnRef = React.useRef<((reason: string) => void) | null>(null);
  const [cloneTarget, setCloneTarget] = useState<Booking | null>(null);
  const [cloneStartTime, setCloneStartTime] = useState<Date>(new Date());
  const [rescheduleTarget, setRescheduleTarget] = useState<Booking | null>(null);
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);
  const [adjustEndBooking, setAdjustEndBooking] = useState<Booking | null>(null);

  const getRoom = (id: string) => rooms.find(r => r.id === id);

  const requestCancelWithReason = (booking: Booking, cancelFn: (reason: string) => void) => {
    if (booking.notifyEmails && booking.notifyEmails.length > 0) {
      setCancellationReason('');
      pendingCancelFnRef.current = cancelFn;
      setShowCancelReason(true);
    } else {
      cancelFn('');
    }
  };

  const now = new Date();

  const copyVcLink = (bookingId: string, link: string) => {
    navigator.clipboard.writeText(link).catch(() => {});
    setCopiedLinkId(bookingId);
    setTimeout(() => setCopiedLinkId(null), 2000);
  };

  const filtered = useMemo(() => {
    let list = bookings
      .filter(b => b.userId === currentUser.id)
      .sort((a, b) => b.startTime.getTime() - a.startTime.getTime());

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(b => {
        const room = getRoom(b.roomId);
        return b.title.toLowerCase().includes(q) || b.company.toLowerCase().includes(q) || room?.name.toLowerCase().includes(q);
      });
    }

    if (filterStatus === 'upcoming') list = list.filter(b => b.startTime > now && b.status !== BookingStatus.CANCELLED);
    else if (filterStatus === 'past') list = list.filter(b => b.endTime <= now && b.status !== BookingStatus.CANCELLED);
    else if (filterStatus === 'cancelled') list = list.filter(b => b.status === BookingStatus.CANCELLED);

    return list;
  }, [bookings, currentUser.id, search, filterStatus]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const statusTabs: { key: typeof filterStatus; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'upcoming', label: 'Upcoming' },
    { key: 'past', label: 'Past' },
    { key: 'cancelled', label: 'Cancelled' },
  ];

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <div className="w-1 h-8 bg-indigo-500 rounded-full flex-shrink-0" />
          <h1 className="text-2xl font-bold text-slate-900">My Bookings</h1>
        </div>
        <p className="text-sm text-slate-500 mt-1">View and manage your room reservations.</p>
      </div>

      {/* Search + Tabs */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search bookings..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
          />
        </div>
        <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
          {statusTabs.map(t => (
            <button
              key={t.key}
              onClick={() => { setFilterStatus(t.key); setPage(1); }}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${filterStatus === t.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        {paginated.map(booking => {
          const room = getRoom(booking.roomId);
          const isUpcoming = booking.startTime > now && booking.status !== BookingStatus.CANCELLED;
          const isLive = booking.startTime <= now && booking.endTime > now && booking.status !== BookingStatus.CANCELLED;
          const generatedLink = booking.itRequirements.generatedLink;
          const linkSafe = generatedLink && isValidUrl(generatedLink);

          return (
            <div
              key={booking.id}
              className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => setDetailBooking(booking)}
            >
              <div className="p-5 flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
                <div className="flex items-start gap-4">
                  <div className={`w-14 h-14 rounded-xl flex flex-col items-center justify-center text-white font-bold flex-shrink-0
                    ${booking.status === BookingStatus.CANCELLED ? 'bg-slate-300' : 'bg-indigo-600'}
                  `}>
                    <span className="text-xs opacity-80 uppercase">{format(booking.startTime, 'MMM')}</span>
                    <span className="text-xl">{format(booking.startTime, 'd')}</span>
                  </div>

                  <div>
                    <h3 className={`font-bold text-base flex items-center gap-1.5 ${booking.status === BookingStatus.CANCELLED ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
                      {booking.recurrenceId && <span title="Recurring booking"><Repeat size={13} className="text-indigo-400 flex-shrink-0" /></span>}
                      {booking.title}
                    </h3>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
                      <span className="flex items-center gap-1 text-xs font-semibold text-indigo-600">
                        <MapPin size={12} className="text-indigo-400" />
                        {room?.name}
                        {room?.block && <span className="text-slate-400 font-normal">· {room.block}</span>}
                      </span>
                      <span className="flex items-center gap-1 text-xs text-slate-500">
                        <Clock size={12} />
                        {format(booking.startTime, 'h:mm a')} – {format(booking.endTime, 'h:mm a')}
                      </span>
                    </div>

                    {linkSafe && (
                      <div className="mt-3 bg-indigo-50 text-indigo-700 px-3 py-2 rounded-md text-sm border border-indigo-100 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Video size={16} />
                          <span className="font-semibold">Meeting Link Ready:</span>
                          <a href={generatedLink} target="_blank" rel="noopener noreferrer" className="underline truncate max-w-[200px]" onClick={e => e.stopPropagation()}>{generatedLink}</a>
                          <button
                            onClick={e => { e.stopPropagation(); copyVcLink(booking.id, generatedLink!); }}
                            className="p-1 text-indigo-400 hover:text-indigo-700 transition-colors flex-shrink-0"
                            title="Copy link"
                          >
                            {copiedLinkId === booking.id ? <span className="text-xs font-medium text-green-600">Copied!</span> : <Clipboard size={13} />}
                          </button>
                        </div>
                        {(booking.itRequirements.meetingNumber || booking.itRequirements.meetingPassword) && (
                          <div className="flex gap-4 text-xs text-indigo-600">
                            {booking.itRequirements.meetingNumber && (
                              <span>Meeting #: <span className="font-bold">{booking.itRequirements.meetingNumber}</span></span>
                            )}
                            {booking.itRequirements.meetingPassword && (
                              <span>Password: <span className="font-bold">{booking.itRequirements.meetingPassword}</span></span>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                    {booking.editedAt && (
                      <p className="text-xs text-slate-400 mt-1">Edited {format(booking.editedAt, 'MMM d, h:mm a')}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto justify-end" onClick={e => e.stopPropagation()}>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide
                    ${booking.status === BookingStatus.CONFIRMED ? 'bg-green-100 text-green-700' : ''}
                    ${booking.status === BookingStatus.CANCELLED ? 'bg-red-100 text-red-600' : ''}
                    ${booking.status === BookingStatus.PENDING ? 'bg-amber-100 text-amber-700' : ''}
                    ${booking.status === BookingStatus.COMPLETED ? 'bg-slate-100 text-slate-600' : ''}
                  `}>
                    {booking.status}
                  </span>

                  {/* Adjust End Time — only for live (active right now) bookings */}
                  {isLive && (
                    <button
                      onClick={() => setAdjustEndBooking(booking)}
                      className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-colors"
                      title="Adjust End Time"
                    >
                      <Clock size={16} />
                    </button>
                  )}

                  {/* Clone — all non-cancelled bookings */}
                  {booking.status !== BookingStatus.CANCELLED && (
                    <button
                      onClick={() => { setCloneTarget(booking); setCloneStartTime(new Date(Date.now() + 60 * 60 * 1000)); }}
                      className="p-2 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-full transition-colors"
                      title="Clone Booking"
                    >
                      <Copy size={16} />
                    </button>
                  )}

                  {/* Reschedule — upcoming bookings only */}
                  {isUpcoming && (
                    <button
                      onClick={() => setRescheduleTarget(booking)}
                      className="p-2 text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded-full transition-colors"
                      title="Reschedule"
                    >
                      <RefreshCw size={16} />
                    </button>
                  )}

                  {booking.status !== BookingStatus.CANCELLED && (
                    <button
                      onClick={() => setEditBooking(booking)}
                      className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-colors"
                      title="Edit Booking"
                    >
                      <Edit2 size={18} />
                    </button>
                  )}
                  {isUpcoming && (
                    <button
                      onClick={() => {
                        setCancelTarget(booking);
                        setShowSeriesChoice(!!booking.recurrenceId);
                      }}
                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors"
                      title="Cancel Booking"
                    >
                      <XCircle size={18} />
                    </button>
                  )}

                  {/* Cancel remaining series — shown for completed/past recurring bookings */}
                  {!isUpcoming && !isLive && booking.recurrenceId && booking.status !== BookingStatus.CANCELLED && (
                    <button
                      onClick={() => {
                        setCancelTarget(booking);
                        setShowSeriesChoice(true);
                      }}
                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors"
                      title="Cancel remaining series"
                    >
                      <XCircle size={18} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="text-center py-16 bg-white rounded-xl border border-dashed border-slate-200">
            <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Clock size={24} className="text-slate-400" />
            </div>
            <h3 className="text-base font-semibold text-slate-700 mb-1">
              {search ? 'No matching bookings' : filterStatus === 'cancelled' ? 'No cancelled bookings' : filterStatus === 'upcoming' ? 'No upcoming bookings' : filterStatus === 'past' ? 'No past bookings' : 'No bookings yet'}
            </h3>
            <p className="text-sm text-slate-400">
              {search ? 'Try adjusting your search query.' : 'Your room bookings will appear here.'}
            </p>
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="mt-6">
          <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
        </div>
      )}

      {/* Detail Modal */}
      {detailBooking && (
        <BookingDetail isOpen={!!detailBooking} booking={detailBooking} onClose={() => setDetailBooking(null)} />
      )}

      {/* Adjust End Time Modal */}
      {adjustEndBooking && (
        <AdjustEndTimeModal
          booking={adjustEndBooking}
          onClose={() => setAdjustEndBooking(null)}
        />
      )}

      {/* Edit Modal */}
      {editBooking && (
        <BookingModal
          isOpen={true}
          onClose={() => setEditBooking(null)}
          preSelectedRoom={getRoom(editBooking.roomId)!}
          preSelectedTime={editBooking.startTime}
          existingBooking={editBooking}
        />
      )}

      {/* Clone Modal */}
      {cloneTarget && (
        <BookingModal
          isOpen={true}
          onClose={() => setCloneTarget(null)}
          preSelectedRoom={getRoom(cloneTarget.roomId)!}
          preSelectedTime={cloneStartTime}
          cloneFrom={cloneTarget}
        />
      )}

      {/* Reschedule Modal */}
      {rescheduleTarget && (
        <RescheduleModal
          isOpen={true}
          onClose={() => setRescheduleTarget(null)}
          booking={rescheduleTarget}
        />
      )}

      {/* Cancel Confirmation — for non-recurring bookings */}
      <ConfirmModal
        isOpen={!!cancelTarget && !showSeriesChoice}
        onClose={() => setCancelTarget(null)}
        onConfirm={() => {
          if (cancelTarget) {
            requestCancelWithReason(cancelTarget, (reason) => {
              updateBookingStatus(cancelTarget.id, BookingStatus.CANCELLED, reason || undefined);
            });
          }
          setCancelTarget(null);
        }}
        title="Cancel Booking"
        message={`Are you sure you want to cancel "${cancelTarget?.title}"? This cannot be undone.`}
        confirmLabel="Cancel Booking"
        confirmVariant="danger"
      />

      {/* Cancel Series Choice — for recurring bookings */}
      {cancelTarget && showSeriesChoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md mx-4 p-6">
            <h2 className="text-lg font-bold text-slate-900 mb-1">Cancel Recurring Booking</h2>
            <p className="text-sm text-slate-500 mb-5">
              <strong>"{cancelTarget.title}"</strong> is part of a recurring series. What would you like to cancel?
            </p>
            <div className="flex flex-col gap-3">
              {/* Only show "this occurrence" option if it's an upcoming booking */}
              {cancelTarget.startTime > new Date() && cancelTarget.status !== BookingStatus.CANCELLED && (
                <button
                  onClick={() => {
                    setShowSeriesChoice(false);
                    requestCancelWithReason(cancelTarget, (reason) => {
                      updateBookingStatus(cancelTarget.id, BookingStatus.CANCELLED, reason || undefined);
                    });
                    setCancelTarget(null);
                  }}
                  className="w-full flex items-start gap-3 p-4 rounded-xl border-2 border-slate-200 hover:border-indigo-400 hover:bg-indigo-50 text-left transition-colors"
                >
                  <div className="mt-0.5 w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                    <span className="text-indigo-600 text-base">1</span>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-800 text-sm">Only this occurrence</p>
                    <p className="text-xs text-slate-500 mt-0.5">Cancel just this date. Other bookings in the series remain active.</p>
                  </div>
                </button>
              )}
              <button
                onClick={() => {
                  setShowSeriesChoice(false);
                  requestCancelWithReason(cancelTarget, (reason) => {
                    if (cancelTarget.recurrenceId) cancelBookingSeries(cancelTarget.recurrenceId, true, reason || undefined);
                  });
                  setCancelTarget(null);
                }}
                className="w-full flex items-start gap-3 p-4 rounded-xl border-2 border-slate-200 hover:border-amber-400 hover:bg-amber-50 text-left transition-colors"
              >
                <div className="mt-0.5 w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-amber-600 text-base font-bold">&rsaquo;&rsaquo;</span>
                </div>
                <div>
                  <p className="font-semibold text-slate-800 text-sm">All remaining (future) occurrences</p>
                  <p className="text-xs text-slate-500 mt-0.5">Cancel upcoming bookings in this series. Past/completed ones are kept.</p>
                </div>
              </button>
              <button
                onClick={() => {
                  setShowSeriesChoice(false);
                  requestCancelWithReason(cancelTarget, (reason) => {
                    if (cancelTarget.recurrenceId) cancelBookingSeries(cancelTarget.recurrenceId, false, reason || undefined);
                  });
                  setCancelTarget(null);
                }}
                className="w-full flex items-start gap-3 p-4 rounded-xl border-2 border-slate-200 hover:border-red-400 hover:bg-red-50 text-left transition-colors"
              >
                <div className="mt-0.5 w-8 h-8 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-red-600 text-base">∞</span>
                </div>
                <div>
                  <p className="font-semibold text-slate-800 text-sm">All occurrences (entire series)</p>
                  <p className="text-xs text-slate-500 mt-0.5">Cancel every booking in this recurring series, including past ones.</p>
                </div>
              </button>
            </div>
            <button
              onClick={() => { setShowSeriesChoice(false); setCancelTarget(null); }}
              className="mt-4 w-full py-2 text-sm text-slate-500 hover:text-slate-700 transition-colors"
            >
              Keep booking
            </button>
          </div>
        </div>
      )}

      {/* Cancellation Reason Modal — shown when booking has invitees */}
      {showCancelReason && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md mx-4 p-6">
            <h2 className="text-lg font-bold text-slate-900 mb-1">Reason for Cancellation</h2>
            <p className="text-sm text-slate-500 mb-4">
              This meeting has invitees. Please provide a reason so they can be notified.
            </p>
            <textarea
              value={cancellationReason}
              onChange={e => setCancellationReason(e.target.value)}
              placeholder="e.g. Meeting rescheduled, room no longer available…"
              rows={4}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent resize-none"
              autoFocus
            />
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => {
                  if (pendingCancelFnRef.current) pendingCancelFnRef.current(cancellationReason);
                  setShowCancelReason(false);
                  pendingCancelFnRef.current = null;
                  setCancellationReason('');
                }}
                disabled={!cancellationReason.trim()}
                className="flex-1 py-2 px-4 bg-red-600 hover:bg-red-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
              >
                Confirm Cancellation
              </button>
              <button
                onClick={() => {
                  setShowCancelReason(false);
                  pendingCancelFnRef.current = null;
                  setCancellationReason('');
                }}
                className="flex-1 py-2 px-4 border border-slate-300 text-slate-600 text-sm font-semibold rounded-lg hover:bg-slate-50 transition-colors"
              >
                Keep Booking
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
