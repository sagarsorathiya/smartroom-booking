import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { format } from 'date-fns';
import { Clock, MapPin, Search, XCircle, Eye, Edit2, Repeat, Calendar } from 'lucide-react';
import { BookingStatus, Booking, UserRole } from '../../types';
import { BookingDetail } from './BookingDetail';
import { BookingModal } from '../modals/BookingModal';
import { Pagination } from '../common/Pagination';
import { ConfirmModal } from '../common/ConfirmModal';
import { AdjustEndTimeModal } from '../common/AdjustEndTimeModal';

const ITEMS_PER_PAGE = 8;

export const AllBookings: React.FC = () => {
  const { bookings, rooms, currentUser, updateBookingStatus, editBooking: contextEditBooking, hasConflict, addNotification } = useApp();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<BookingStatus | 'ALL'>('ALL');
  const [page, setPage] = useState(1);
  const [detailBooking, setDetailBooking] = useState<Booking | null>(null);
  const [editBooking, setEditBooking] = useState<Booking | null>(null);
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);
  const [adjustEndBooking, setAdjustEndBooking] = useState<Booking | null>(null);

  const canEdit = [UserRole.IT, UserRole.RECEPTION, UserRole.ADMINISTRATION, UserRole.ADMIN].includes(currentUser.role);
  const getRoom = (id: string) => rooms.find(r => r.id === id);
  const now = new Date();

  const filtered = bookings
    .filter(b => {
      if (statusFilter !== 'ALL' && b.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const room = getRoom(b.roomId);
        return (
          b.title.toLowerCase().includes(q) ||
          b.userName.toLowerCase().includes(q) ||
          b.company.toLowerCase().includes(q) ||
          b.department.toLowerCase().includes(q) ||
          b.chairPerson.toLowerCase().includes(q) ||
          (room?.name.toLowerCase().includes(q) ?? false)
        );
      }
      return true;
    })
    .sort((a, b) => b.startTime.getTime() - a.startTime.getTime());

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paged = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  const statusTabs: { key: BookingStatus | 'ALL'; label: string }[] = [
    { key: 'ALL', label: 'All' },
    { key: BookingStatus.CONFIRMED, label: 'Confirmed' },
    { key: BookingStatus.PENDING, label: 'Pending' },
    { key: BookingStatus.CANCELLED, label: 'Cancelled' },
    { key: BookingStatus.COMPLETED, label: 'Completed' },
  ];

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-1 h-8 bg-indigo-500 rounded-full flex-shrink-0" />
            <h1 className="text-2xl font-bold text-slate-900">All Bookings</h1>
          </div>
          <p className="text-sm text-slate-500 mt-1">Manage all room bookings across the organization.</p>
        </div>
        <div className="text-sm text-slate-500 bg-white px-3 py-1.5 rounded-lg border border-slate-200 self-start sm:self-auto">
          Total: <span className="font-bold text-slate-900">{filtered.length}</span>
        </div>
      </div>

      {/* Search + Tabs */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search by title, user, company, room..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
          />
        </div>
        <div className="flex gap-1 bg-slate-100 p-1 rounded-lg flex-wrap">
          {statusTabs.map(t => (
            <button
              key={t.key}
              onClick={() => { setStatusFilter(t.key); setPage(1); }}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${statusFilter === t.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Cards */}
      <div className="space-y-4">
        {paged.map(booking => {
          const room = getRoom(booking.roomId);
          const isUpcoming = booking.startTime > now && booking.status !== BookingStatus.CANCELLED;
          const isLive = booking.startTime <= now && booking.endTime > now && booking.status !== BookingStatus.CANCELLED;

          return (
            <div
              key={booking.id}
              className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => setDetailBooking(booking)}
            >
              <div className="p-5 flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
                <div className="flex items-start gap-4">
                  {/* Date badge */}
                  <div className={`w-14 h-14 rounded-xl flex flex-col items-center justify-center text-white font-bold flex-shrink-0
                    ${booking.status === BookingStatus.CANCELLED ? 'bg-slate-300' : isLive ? 'bg-green-600' : 'bg-indigo-600'}
                  `}>
                    <span className="text-xs opacity-80 uppercase">{format(booking.startTime, 'MMM')}</span>
                    <span className="text-xl">{format(booking.startTime, 'd')}</span>
                  </div>

                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {isLive && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold rounded-full uppercase tracking-wide">
                          <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                          Live
                        </span>
                      )}
                      <h3 className={`font-bold text-base flex items-center gap-1.5 ${booking.status === BookingStatus.CANCELLED ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
                        {booking.recurrenceId && <span title="Recurring"><Repeat size={13} className="text-indigo-400 flex-shrink-0" /></span>}
                        {booking.title}
                      </h3>
                    </div>

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

                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                      <p className="text-xs text-slate-400">
                        Booked by <span className="font-medium text-slate-600">{booking.userName}</span>
                      </p>
                      {booking.company && (
                        <p className="text-xs text-slate-400">{booking.company}{booking.department ? ` · ${booking.department}` : ''}</p>
                      )}
                    </div>

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

                  <button
                    onClick={() => setDetailBooking(booking)}
                    className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-colors"
                    title="View Details"
                  >
                    <Eye size={16} />
                  </button>

                  {isLive && canEdit && (
                    <button
                      onClick={() => setAdjustEndBooking(booking)}
                      className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-colors"
                      title="Adjust End Time"
                    >
                      <Clock size={16} />
                    </button>
                  )}

                  {booking.status !== BookingStatus.CANCELLED && canEdit && (
                    <button
                      onClick={() => setEditBooking(booking)}
                      className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-colors"
                      title="Edit Booking"
                    >
                      <Edit2 size={16} />
                    </button>
                  )}

                  {isUpcoming && (
                    <button
                      onClick={() => setCancelTarget(booking.id)}
                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors"
                      title="Cancel Booking"
                    >
                      <XCircle size={16} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {paged.length === 0 && (
          <div className="text-center py-16 bg-white rounded-xl border border-dashed border-slate-200">
            <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Calendar size={24} className="text-slate-400" />
            </div>
            <h3 className="text-base font-semibold text-slate-700 mb-1">No bookings found</h3>
            <p className="text-sm text-slate-400">Try adjusting your search or filter criteria.</p>
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="mt-6">
          <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
        </div>
      )}

      <BookingDetail isOpen={!!detailBooking} onClose={() => setDetailBooking(null)} booking={detailBooking} />

      {adjustEndBooking && (
        <AdjustEndTimeModal booking={adjustEndBooking} onClose={() => setAdjustEndBooking(null)} />
      )}

      {editBooking && (
        <BookingModal
          isOpen={true}
          onClose={() => setEditBooking(null)}
          preSelectedRoom={getRoom(editBooking.roomId)!}
          preSelectedTime={editBooking.startTime}
          existingBooking={editBooking}
        />
      )}

      <ConfirmModal
        isOpen={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        onConfirm={() => { if (cancelTarget) updateBookingStatus(cancelTarget, BookingStatus.CANCELLED); }}
        title="Cancel Booking"
        message="Are you sure you want to cancel this booking? This action cannot be undone."
        confirmLabel="Cancel Booking"
        confirmVariant="danger"
      />
    </div>
  );
};
