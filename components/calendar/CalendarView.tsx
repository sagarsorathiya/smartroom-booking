import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../../context/AppContext';
import { Room, Booking, BookingStatus, UserRole } from '../../types';
import { format, addDays, isSameDay, getHours, startOfWeek } from 'date-fns';
import { ChevronLeft, ChevronRight, MapPin, Users, Monitor, Search, CalendarDays, LayoutList, Clock, Wifi, Tv, Coffee, Eye, EyeOff } from 'lucide-react';
import { BookingModal } from '../modals/BookingModal';
import { BookingDetail } from '../bookings/BookingDetail';

type ViewMode = 'day' | 'week';

const FACILITY_ICONS: Record<string, React.FC<{ size?: number; className?: string }>> = {
  'Video Conf': Monitor,
  'WiFi': Wifi,
  'Display': Tv,
  'Coffee': Coffee,
};

const SLOT_HEIGHT_DAY = 64;
const SLOT_HEIGHT_WEEK = 44;
const DEFAULT_START_HOUR = 10;
const DEFAULT_END_HOUR = 19;

/**
 * Isolated component that manages its own 1-minute timer.
 * Only this component re-renders on each tick instead of the whole CalendarView.
 */
const CurrentTimeLine: React.FC<{ startHour: number; slotHeight: number }> = React.memo(({ startHour, slotHeight }) => {
  const [minutes, setMinutes] = useState(() => {
    const n = new Date();
    return n.getHours() * 60 + n.getMinutes();
  });

  useEffect(() => {
    const interval = setInterval(() => {
      const n = new Date();
      setMinutes(n.getHours() * 60 + n.getMinutes());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const hourFrac = minutes / 60;
  if (hourFrac < startHour || hourFrac > DEFAULT_END_HOUR + 2) return null;
  const top = (hourFrac - startHour) * slotHeight;
  const now = new Date();
  return (
    <div className="absolute left-0 right-0 z-10 pointer-events-none" style={{ top: `${top}px` }}>
      <div className="flex items-center">
        <div className="w-16 flex justify-end pr-1">
          <span className="text-[9px] font-bold text-red-500 bg-red-50 px-1 rounded">{format(now, 'h:mm')}</span>
        </div>
        <div className="flex-1 h-[2px] bg-red-500 relative">
          <div className="absolute -left-1 -top-[3px] w-2 h-2 bg-red-500 rounded-full" />
        </div>
      </div>
    </div>
  );
});
CurrentTimeLine.displayName = 'CurrentTimeLine';

export const CalendarView: React.FC = () => {
  const { rooms, bookings, viewDate, setViewDate, currentUser, blockedSlots, roomBlocks, settings } = useApp();
  const [selectedBlock, setSelectedBlock] = useState<string>('ALL');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<{room: Room, time: Date} | null>(null);
  const [hoveredSlot, setHoveredSlot] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('day');
  const [detailBooking, setDetailBooking] = useState<Booking | null>(null);
  const [editBooking, setEditBooking] = useState<Booking | null>(null);
  const [showAllHours, setShowAllHours] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const didAutoScroll = useRef(false);

  // Auto-scroll to current hour on mount
  useEffect(() => {
    if (didAutoScroll.current || !gridRef.current) return;
    const now = new Date();
    const currentHour = now.getHours();
    const slotHeight = viewMode === 'week' ? SLOT_HEIGHT_WEEK : SLOT_HEIGHT_DAY;
    const startHour = showAllHours ? 0 : DEFAULT_START_HOUR;
    const scrollTo = Math.max(0, (currentHour - startHour - 1)) * slotHeight;
    gridRef.current.scrollTop = scrollTo;
    didAutoScroll.current = true;
  }, [viewMode, showAllHours]);

  const filteredRooms = rooms.filter(r => {
    // Hide restricted rooms the current user cannot book
    const isPrivileged = [UserRole.ADMIN, UserRole.RECEPTION, UserRole.IT].includes(currentUser.role);
    if (r.restricted && !isPrivileged && !r.allowedUserIds?.includes(currentUser.id)) return false;
    if (selectedBlock !== 'ALL' && r.block !== selectedBlock) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return r.name.toLowerCase().includes(q) ||
        r.type.toLowerCase().includes(q) ||
        r.block.toLowerCase().includes(q) ||
        r.facilities.some(f => f.toLowerCase().includes(q)) ||
        r.capacity.toString().includes(q);
    }
    return true;
  });

  const timeSlots = showAllHours
    ? Array.from({ length: 24 }, (_, i) => i)
    : Array.from({ length: DEFAULT_END_HOUR - DEFAULT_START_HOUR }, (_, i) => i + DEFAULT_START_HOUR);

  const setDateHours = (date: Date, hours: number) => {
    const newDate = new Date(date);
    newDate.setHours(hours, 0, 0, 0);
    return newDate;
  };

  const getBookingForSlot = (room: Room, hour: number, date: Date): Booking | undefined => {
    const slotStart = setDateHours(date, hour).getTime();
    const slotEnd = setDateHours(date, hour + 1).getTime();
    return bookings.find(b =>
      b.roomId === room.id &&
      b.status !== BookingStatus.CANCELLED &&
      isSameDay(b.startTime, date) &&
      b.startTime.getTime() < slotEnd &&
      b.endTime.getTime() > slotStart
    );
  };

  const isSlotBlocked = (room: Room, hour: number, date: Date): boolean => {
    const slotStart = setDateHours(date, hour).getTime();
    const slotEnd = setDateHours(date, hour + 1).getTime();
    return blockedSlots.some(bs =>
      bs.roomId === room.id &&
      bs.startTime.getTime() < slotEnd &&
      bs.endTime.getTime() > slotStart
    );
  };

  const canViewAllBookings = [UserRole.ADMIN, UserRole.RECEPTION, UserRole.IT, UserRole.ADMINISTRATION].includes(currentUser.role);

  const getRoomStatus = useCallback((room: Room, date: Date): { label: string; color: string } => {
    const now = new Date();
    if (!isSameDay(date, now)) return { label: 'N/A', color: 'bg-slate-100 text-slate-500' };
    const currentBooking = bookings.find(b =>
      b.roomId === room.id && b.status !== BookingStatus.CANCELLED &&
      b.startTime <= now && b.endTime > now
    );
    if (currentBooking) return { label: 'In Use', color: 'bg-red-100 text-red-700' };
    const nextBooking = bookings.find(b =>
      b.roomId === room.id && b.status !== BookingStatus.CANCELLED &&
      isSameDay(b.startTime, now) && b.startTime > now &&
      b.startTime.getTime() - now.getTime() < 3600000
    );
    if (nextBooking) return { label: `In ${Math.ceil((nextBooking.startTime.getTime() - now.getTime()) / 60000)}m`, color: 'bg-amber-100 text-amber-700' };
    return { label: 'Available', color: 'bg-green-100 text-green-700' };
  }, [bookings]);

  const handleSlotClick = (room: Room, hour: number, date: Date) => {
    const booking = getBookingForSlot(room, hour, date);
    if (booking) return; // booking block in overlay handles its own click
    if (isSlotBlocked(room, hour, date)) return;

    // Block weekend bookings if not allowed
    if (!settings.allowWeekendBookings) {
      const day = date.getDay();
      if (day === 0 || day === 6) return;
    }

    // Block if maintenance mode is on (except admin)
    if (settings.maintenanceMode && currentUser.role !== UserRole.ADMIN) return;

    const slotTime = setDateHours(date, hour);
    if (slotTime.getTime() < Date.now()) return;
    setSelectedSlot({ room, time: slotTime });
    setEditBooking(null);
    setIsModalOpen(true);
  };

  const handlePreviousDay = () => setViewDate(addDays(viewDate, viewMode === 'week' ? -7 : -1));
  const handleNextDay = () => setViewDate(addDays(viewDate, viewMode === 'week' ? 7 : 1));
  const handleToday = () => setViewDate(new Date());

  const weekDays = viewMode === 'week'
    ? Array.from({ length: 5 }, (_, i) => addDays(startOfWeek(viewDate, { weekStartsOn: 1 }), i))
    : [viewDate];

  const getInitials = (name: string) => {
    const parts = name.split(' ');
    return parts.length >= 2 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : name.substring(0, 2).toUpperCase();
  };

  const getBookingStyle = (booking: Booking, isOwn: boolean) => {
    if (isOwn) {
      return booking.status === BookingStatus.PENDING
        ? 'bg-amber-50 border-amber-400 text-amber-900'
        : 'bg-indigo-50 border-indigo-500 text-indigo-900';
    }
    return 'bg-slate-50 border-slate-400 text-slate-700';
  };

  const renderDayGrid = (date: Date) => {
    const slotHeight = viewMode === 'week' ? SLOT_HEIGHT_WEEK : SLOT_HEIGHT_DAY;
    const now = new Date();
    const isToday = isSameDay(date, now);
    const startHour = showAllHours ? 0 : DEFAULT_START_HOUR;

    return (
      <div ref={gridRef} className="flex-1 overflow-auto bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col relative min-w-0" style={{ maxHeight: viewMode === 'week' ? 'calc(100vh - 280px)' : 'calc(100vh - 220px)' }}>
        {/* Header Row (Rooms) */}
        <div className="flex border-b border-slate-200 sticky top-0 bg-white/95 backdrop-blur-md z-20">
          <div className="w-16 flex-shrink-0 p-2 border-r border-slate-200 bg-gradient-to-b from-slate-50 to-slate-100/80 flex flex-col justify-center">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Time</span>
            {viewMode === 'week' && (
              <span className="text-[10px] font-bold text-indigo-600 mt-0.5">{format(date, 'EEE d')}</span>
            )}
          </div>
          {filteredRooms.map(room => {
            const status = getRoomStatus(room, date);
            return (
              <div key={room.id} className="flex-1 min-w-[150px] p-3 border-r border-slate-100 last:border-r-0">
                <div className="flex items-center gap-2 mb-1.5">
                  <h3 className="font-bold text-slate-800 truncate text-xs">{room.name}</h3>
                  <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold ${status.color} whitespace-nowrap flex-shrink-0`}>
                    {status.label}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1 text-[10px] text-slate-400 font-medium"><Users size={10} />{room.capacity}</span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-semibold ${room.type === 'Board Room' ? 'bg-purple-50 text-purple-600' : 'bg-blue-50 text-blue-600'}`}>
                    {room.type === 'Board Room' ? 'Board' : 'Conf'}
                  </span>
                  <div className="flex items-center gap-1 ml-auto">
                    {room.facilities.slice(0, 3).map(f => {
                      const Icon = FACILITY_ICONS[f];
                      return Icon ? <Icon key={f} size={11} className="text-slate-300" /> : null;
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Time Slots */}
        <div className="flex-1 relative">
          {/* Current time indicator — isolated component, only it re-renders each minute */}
          {isToday && <CurrentTimeLine startHour={startHour} slotHeight={slotHeight} />}

          {timeSlots.map(hour => (
            <div key={hour} className="flex border-b border-slate-100/80 last:border-b-0" style={{ height: `${slotHeight}px` }}>
              <div className="w-16 flex-shrink-0 px-1 py-1 text-right border-r border-slate-200 bg-gradient-to-r from-slate-50/80 to-white flex items-start justify-end">
                <span className="text-[10px] font-semibold text-slate-400 mt-1">{format(setDateHours(new Date(), hour), 'h a')}</span>
              </div>
              {filteredRooms.map(room => {
                const booking = getBookingForSlot(room, hour, date);
                const blocked = isSlotBlocked(room, hour, date);
                const slotTime = setDateHours(date, hour);
                const isPast = slotTime.getTime() + 3600000 <= Date.now();
                const slotKey = `${room.id}-${hour}-${format(date, 'yyyy-MM-dd')}`;
                const isHovered = hoveredSlot === slotKey && !booking && !blocked && !isPast;

                return (
                  <div                      key={slotKey}                      className={`flex-1 min-w-[150px] border-r border-slate-100/60 last:border-r-0 relative transition-all duration-200
                      ${isPast && !booking ? 'bg-slate-50/50 cursor-default' : 'cursor-pointer'}
                      ${blocked && !isPast ? 'bg-red-50/40 cursor-not-allowed' : ''}
                      ${!booking && !blocked && !isPast && isHovered ? 'bg-indigo-50/80 ring-1 ring-inset ring-indigo-200' : ''}
                      ${!booking && !blocked && !isPast && !isHovered ? 'hover:bg-indigo-50/30' : ''}
                    `}
                    onClick={() => handleSlotClick(room, hour, date)}
                    onMouseEnter={() => setHoveredSlot(slotKey)}
                    onMouseLeave={() => setHoveredSlot(null)}
                  >
                    {blocked && !booking && (
                      <div className="absolute inset-0.5 rounded-md bg-red-100/60 border border-red-200/60 flex items-center justify-center">
                        <span className="text-[9px] text-red-400 font-semibold">Blocked</span>
                      </div>
                    )}

                    {/* Hover preview tooltip */}
                    {!booking && !blocked && isHovered && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="bg-indigo-600 text-white px-2.5 py-1 rounded-lg shadow-lg text-[10px] font-semibold whitespace-nowrap">
                          Book {format(setDateHours(date, hour), 'h:mm a')} – {format(setDateHours(date, hour + 1), 'h:mm a')}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}

          {/* ── Booking blocks overlay ── pixel-perfect positioning relative to grid top */}
          <div className="absolute inset-0 pointer-events-none flex">
            <div className="w-16 flex-shrink-0" />
            {filteredRooms.map(room => {
              const gridStartMins = startHour * 60;
              const gridEndMins = (startHour + timeSlots.length) * 60;
              const roomDayBookings = bookings.filter(b =>
                b.roomId === room.id &&
                b.status !== BookingStatus.CANCELLED &&
                isSameDay(b.startTime, date) &&
                (b.startTime.getHours() * 60 + b.startTime.getMinutes()) < gridEndMins &&
                (b.endTime.getHours() * 60 + b.endTime.getMinutes()) > gridStartMins
              );
              return (
                <div key={room.id} className="flex-1 min-w-[150px] relative">
                  {roomDayBookings.map(booking => {
                    const bStartMins = booking.startTime.getHours() * 60 + booking.startTime.getMinutes();
                    const bEndMins = booking.endTime.getHours() * 60 + booking.endTime.getMinutes();
                    const topPx = ((bStartMins - gridStartMins) / 60) * slotHeight + 2;
                    const heightPx = Math.max(20, ((bEndMins - bStartMins) / 60) * slotHeight - 4);
                    const durationMins = bEndMins - bStartMins;
                    const isOwn = booking.userId === currentUser.id;
                    const showDetails = isOwn || canViewAllBookings;
                    const style = getBookingStyle(booking, isOwn);
                    return (
                      <div
                        key={booking.id}
                        className={`absolute left-0.5 right-0.5 rounded-xl p-2 shadow-sm border-l-[3px] overflow-hidden z-[2] pointer-events-auto cursor-pointer ${style}`}
                        style={{ top: `${topPx}px`, height: `${heightPx}px` }}
                        onClick={() => { if (showDetails) setDetailBooking(booking); }}
                      >
                        {showDetails ? (
                          <>
                            <div className="flex items-center gap-1.5">
                              <div className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white ${isOwn ? 'bg-indigo-500' : 'bg-slate-400'}`}>
                                {getInitials(booking.userName)}
                              </div>
                              <p className="font-semibold text-[11px] truncate leading-tight">{booking.title}</p>
                            </div>
                            {durationMins > 45 && (
                              <p className="text-[9px] opacity-60 mt-0.5 ml-6 flex items-center gap-0.5">
                                <Clock size={8} />
                                {format(booking.startTime, 'h:mm a')} – {format(booking.endTime, 'h:mm a')}
                              </p>
                            )}
                            {booking.itRequirements.vcRequired && (
                              <div className="absolute bottom-1 right-1.5">
                                <Monitor size={10} className={isOwn ? 'text-indigo-500' : 'text-slate-400'} />
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="flex items-center gap-1.5 h-full">
                            <div className="w-5 h-5 rounded-full bg-slate-300 flex items-center justify-center">
                              <Users size={9} className="text-white" />
                            </div>
                            <p className="font-medium text-[11px] text-slate-500">Occupied</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4 min-w-0 min-h-0">
      {/* Controls */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search rooms..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none w-44 bg-slate-50 hover:bg-white transition-colors"
            />
          </div>

          {/* Block Filter */}
          <div className="flex items-center gap-0.5 bg-slate-100 p-0.5 rounded-xl">
            {['ALL', ...roomBlocks.filter(b => b.active).map(b => b.name)].map(block => (
              <button
                key={block}
                onClick={() => setSelectedBlock(block)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  selectedBlock === block
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {block === 'ALL' ? 'All Rooms' : block}
              </button>
            ))}
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center gap-0.5 bg-slate-100 p-0.5 rounded-xl">
            <button
              onClick={() => setViewMode('day')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${viewMode === 'day' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <LayoutList size={12} /> Day
            </button>
            <button
              onClick={() => setViewMode('week')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${viewMode === 'week' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <CalendarDays size={12} /> Week
            </button>
          </div>

          {/* Show/Hide Hours */}
          <button
            onClick={() => { setShowAllHours(!showAllHours); didAutoScroll.current = false; }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors"
          >
            {showAllHours ? <EyeOff size={12} /> : <Eye size={12} />}
            {showAllHours ? 'Core hours' : '24 hours'}
          </button>

          {/* Date Navigation */}
          <div className="flex items-center gap-1 ml-auto bg-slate-50 rounded-xl border border-slate-200 px-1 py-0.5">
            <button onClick={handlePreviousDay} className="p-2 hover:bg-white rounded-lg transition-colors">
              <ChevronLeft size={16} className="text-slate-500" />
            </button>
            <button onClick={handleToday} className="px-2.5 py-1.5 text-xs font-bold text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
              Today
            </button>
            <div className="text-center min-w-[120px] px-2">
              <span className="block font-bold text-slate-900 text-sm">{format(viewDate, 'EEEE')}</span>
              <span className="block text-[10px] text-slate-400 font-medium">{format(viewDate, 'MMM do, yyyy')}</span>
            </div>
            <button onClick={handleNextDay} className="p-2 hover:bg-white rounded-lg transition-colors">
              <ChevronRight size={16} className="text-slate-500" />
            </button>
          </div>
        </div>
      </div>

      {/* Calendar Grid(s) */}

      {/* ── Mobile: simplified booking list (hidden on md+) ── */}
      <div className="md:hidden bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Schedule</p>
          <p className="text-sm font-bold text-slate-900">{format(viewDate, 'EEEE, MMMM d')}</p>
        </div>
        {(() => {
          const dayBookings = bookings
            .filter(b => b.status !== BookingStatus.CANCELLED && isSameDay(b.startTime, viewDate))
            .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
          if (dayBookings.length === 0) {
            return (
              <div className="py-10 text-center">
                <CalendarDays size={28} className="text-slate-300 mx-auto mb-2" />
                <p className="text-sm text-slate-400">No bookings for this day</p>
              </div>
            );
          }
          return (
            <div className="divide-y divide-slate-100">
              {dayBookings.map(b => {
                const room = rooms.find(r => r.id === b.roomId);
                const isOwn = b.userId === currentUser.id;
                return (
                  <div
                    key={b.id}
                    className={`px-4 py-3 flex items-start gap-3 cursor-pointer active:bg-slate-50 ${isOwn ? 'bg-indigo-50/30' : ''}`}
                    onClick={() => (isOwn || canViewAllBookings) ? setDetailBooking(b) : undefined}
                  >
                    <div className="w-1 self-stretch rounded-full flex-shrink-0 mt-0.5 bg-indigo-400" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">{b.title}</p>
                      <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                        <Clock size={11} /> {format(b.startTime, 'h:mm a')} \u2013 {format(b.endTime, 'h:mm a')}
                      </p>
                      {room && (
                        <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                          <MapPin size={11} /> {room.name}
                        </p>
                      )}
                    </div>
                    {isOwn && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-indigo-100 text-indigo-600 rounded font-semibold flex-shrink-0">Mine</span>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>

      {/* ── Desktop: full calendar grid (hidden on mobile) ── */}
      <div className="hidden md:contents">
        {viewMode === 'day' ? (
          renderDayGrid(viewDate)
        ) : (
          <div className="flex-1 overflow-auto space-y-4">
            {weekDays.map(day => (
              <div key={day.toISOString()}>
                <h3 className="text-xs font-bold text-slate-600 mb-1.5 flex items-center gap-2 px-1">
                  {format(day, 'EEEE, MMM d')}
                  {isSameDay(day, new Date()) && <span className="text-[10px] text-white bg-indigo-600 px-2 py-0.5 rounded-full font-bold">Today</span>}
                </h3>
                {renderDayGrid(day)}
              </div>
            ))}
          </div>
        )}
      </div>

      {isModalOpen && selectedSlot && createPortal(
        <BookingModal
          isOpen={isModalOpen}
          onClose={() => { setIsModalOpen(false); setEditBooking(null); }}
          preSelectedRoom={selectedSlot.room}
          preSelectedTime={selectedSlot.time}
          existingBooking={editBooking}
        />,
        document.body
      )}

      {createPortal(
        <BookingDetail isOpen={!!detailBooking} onClose={() => setDetailBooking(null)} booking={detailBooking} />,
        document.body
      )}
    </div>
  );
};
