import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../../context/AppContext';
import { UserRole, BookingStatus, Room, Booking } from '../../types';
import { Calendar, Clock, CheckCircle, Monitor, Users, Plus, AlertTriangle, MapPin, ArrowRight, Zap, Sun, Sunrise, Moon, Video, ChevronDown, X } from 'lucide-react';
import { format, isSameDay, addHours, differenceInMinutes } from 'date-fns';
import { LucideIcon } from 'lucide-react';
import { BookingModal } from '../modals/BookingModal';
import { CalendarView } from '../calendar/CalendarView';
import { DatePicker } from '../shared/DatePicker';

export const Dashboard: React.FC = () => {
  const { currentUser, bookings, rooms } = useApp();
  const [mounted, setMounted] = useState(false);

  // Quick Book state
  const [selectedRoomId, setSelectedRoomId] = useState('');
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const nowH = new Date().getHours();
  const [qbHourInput, setQbHourInput] = useState(() => {
    const h = nowH < 17 ? Math.max(8, nowH + 1) : 9;
    return String(h === 0 ? 12 : h > 12 ? h - 12 : h);
  });
  const [qbMinute, setQbMinute] = useState('00');
  const [qbAmPm, setQbAmPm] = useState<'AM' | 'PM'>(() => {
    const h = nowH < 17 ? Math.max(8, nowH + 1) : 9;
    return h >= 12 ? 'PM' : 'AM';
  });
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [quickBookError, setQuickBookError] = useState('');
  const [qbRoomDropdownOpen, setQbRoomDropdownOpen] = useState(false);
  const qbRoomBtnRef = useRef<HTMLButtonElement>(null);
  const [quickBookTime, setQuickBookTime] = useState<Date>(() => new Date());

  useEffect(() => { setMounted(true); }, []);

  const qbParsedHour = Math.min(12, Math.max(1, parseInt(qbHourInput) || 12));
  const qbParsedMinute = Math.min(59, Math.max(0, parseInt(qbMinute) || 0));
  const qbHour24 = qbAmPm === 'AM' ? (qbParsedHour === 12 ? 0 : qbParsedHour) : (qbParsedHour === 12 ? 12 : qbParsedHour + 12);

  const canBook = [UserRole.EMPLOYEE, UserRole.RECEPTION, UserRole.IT, UserRole.ADMINISTRATION, UserRole.ADMIN].includes(currentUser.role);

  const handleQuickBook = () => {
    if (!selectedRoomId) { setQuickBookError('Please select a room'); return; }
    if (!selectedDate) { setQuickBookError('Please select a date'); return; }
    const qbTime = new Date(`${selectedDate}T${String(qbHour24).padStart(2, '0')}:${String(qbParsedMinute).padStart(2, '0')}:00`);
    if (qbTime.getTime() < Date.now()) { setQuickBookError('Cannot book in the past'); return; }
    setQuickBookError('');
    setQuickBookTime(qbTime);
    setShowBookingModal(true);
  };

  const quickBookRoom = rooms.find(r => r.id === selectedRoomId);

  const now = new Date();
  const activeBookings = bookings.filter(b => b.status !== BookingStatus.CANCELLED);
  const myBookings = activeBookings.filter(b => b.userId === currentUser.id);
  const todaysBookings = activeBookings.filter(b => isSameDay(b.startTime, now));
  const myUpcoming = myBookings.filter(b => b.startTime > now).sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

  const pendingITTasks = bookings.filter(b =>
    (b.itRequirements.vcRequired || b.itRequirements.avSetup) &&
    b.itRequirements.status === 'PENDING'
  );

  const currentlyOccupiedRoomIds = new Set(
    activeBookings.filter(b => b.startTime <= now && b.endTime > now).map(b => b.roomId)
  );
  const availableRooms = rooms.filter(r => !currentlyOccupiedRoomIds.has(r.id)).length;

  // Current meeting (happening right now)
  const currentMeeting = myBookings.find(b => b.startTime <= now && b.endTime > now);
  // Next meeting
  const nextMeeting = myUpcoming[0];

  // 15-min imminent meeting banners
  const [dismissedImminentIds, setDismissedImminentIds] = useState<Set<string>>(new Set());
  const imminentMeetings = myUpcoming.filter(b => {
    const mins = differenceInMinutes(b.startTime, now);
    return mins >= 0 && mins <= 15;
  });
  const visibleImminent = imminentMeetings.filter(b => !dismissedImminentIds.has(b.id));

  // Greeting based on time of day
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const GreetingIcon = hour < 12 ? Sunrise : hour < 17 ? Sun : Moon;
  const bannerGradient = hour < 12
    ? 'from-indigo-500 via-blue-600 to-cyan-600'
    : hour < 17
    ? 'from-indigo-500 via-indigo-600 to-violet-700'
    : 'from-slate-700 via-indigo-700 to-indigo-900';

  const getRoom = (roomId: string) => rooms.find(r => r.id === roomId);

  // Animated counter hook
  const AnimatedNumber: React.FC<{ value: number; delay?: number }> = ({ value, delay = 0 }) => {
    const [display, setDisplay] = useState(0);
    useEffect(() => {
      if (!mounted) return;
      const timer = setTimeout(() => {
        let start = 0;
        const step = Math.max(1, Math.ceil(value / 20));
        const interval = setInterval(() => {
          start += step;
          if (start >= value) { setDisplay(value); clearInterval(interval); }
          else setDisplay(start);
        }, 30);
        return () => clearInterval(interval);
      }, delay);
      return () => clearTimeout(timer);
    }, [value, delay]);
    return <>{display}</>;
  };

  const statCards = [
    { title: "Today's Meetings", value: todaysBookings.length, subtitle: format(now, 'EEEE, MMM d'), icon: Calendar, gradient: 'from-indigo-500 to-indigo-600', bg: 'bg-indigo-50', text: 'text-indigo-600', delay: 0 },
    { title: 'Rooms Available', value: availableRooms, subtitle: `of ${rooms.length} total`, icon: CheckCircle, gradient: 'from-teal-500 to-emerald-600', bg: 'bg-teal-50', text: 'text-teal-600', delay: 80 },
    ...(currentUser.role === UserRole.IT
      ? [{ title: 'Pending IT Tasks', value: pendingITTasks.length, subtitle: pendingITTasks.length > 0 ? 'needs attention' : 'all clear', icon: Monitor, gradient: 'from-amber-500 to-indigo-500', bg: 'bg-amber-50', text: 'text-amber-600', delay: 160 }]
      : [{ title: 'My Upcoming', value: myUpcoming.length, subtitle: 'upcoming meetings', icon: Clock, gradient: 'from-blue-500 to-cyan-500', bg: 'bg-blue-50', text: 'text-blue-600', delay: 160 }]
    ),
    { title: 'Total Bookings', value: activeBookings.length, subtitle: 'all active', icon: Users, gradient: 'from-purple-500 to-violet-600', bg: 'bg-purple-50', text: 'text-purple-600', delay: 240 },
  ];

  const MeetingCard: React.FC<{ booking: Booking; label: string; accent: string; isCurrent?: boolean }> = ({ booking, label, accent, isCurrent }) => {
    const room = getRoom(booking.roomId);
    const minutesUntil = differenceInMinutes(booking.startTime, now);
    return (
      <div className={`relative overflow-hidden rounded-xl border ${isCurrent ? 'border-green-200 bg-gradient-to-br from-green-50 to-emerald-50' : 'border-indigo-200 bg-gradient-to-br from-indigo-50 to-blue-50'}`}>
        <div className={`absolute top-0 left-0 w-1 h-full ${accent}`} />
        <div className="p-4 pl-5">
          <div className="flex items-center justify-between mb-2">
            <span className={`text-[10px] font-bold uppercase tracking-wider ${isCurrent ? 'text-green-600' : 'text-indigo-500'}`}>{label}</span>
            {isCurrent && (
              <span className="flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold rounded-full">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" /> LIVE
              </span>
            )}
            {!isCurrent && minutesUntil <= 60 && minutesUntil > 0 && (
              <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                in {minutesUntil}m
              </span>
            )}
          </div>
          <h4 className="font-bold text-slate-900 text-sm truncate">{booking.title}</h4>
          <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
            <span className="flex items-center gap-1"><Clock size={12} /> {format(booking.startTime, 'h:mm a')} – {format(booking.endTime, 'h:mm a')}</span>
            {room && <span className="flex items-center gap-1"><MapPin size={12} /> {room.name}</span>}
          </div>
          {booking.itRequirements.vcRequired && (
            <div className="mt-2 flex items-center gap-1 text-xs text-indigo-600">
              <Video size={12} />
              <span>{booking.itRequirements.platform || 'Video Call'}</span>
              {booking.itRequirements.generatedLink && (
                <a href={booking.itRequirements.generatedLink} target="_blank" rel="noopener noreferrer" className="ml-auto text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-0.5">
                  Join <ArrowRight size={10} />
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* ── Hero + Book a Room (2-column) ─────────────────────────────── */}
      <div
        className="grid grid-cols-1 lg:grid-cols-3 gap-4"
        style={{ opacity: mounted ? 1 : 0, transform: mounted ? 'translateY(0)' : 'translateY(12px)', transition: 'all 0.5s cubic-bezier(0.16, 1, 0.3, 1)' }}
      >
        {/* Left: Hero banner */}
        <div
          className={`relative overflow-hidden rounded-2xl text-white flex flex-col justify-center px-8 py-7 min-h-[200px] ${canBook ? 'lg:col-span-2' : 'lg:col-span-3'}`}
          style={{ background: 'linear-gradient(120deg, #4f46e5 0%, #6366f1 40%, #7c3aed 100%)' }}
        >
          {/* Subtle radial glow top-right */}
          <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at 80% 20%, rgba(167,139,250,0.35) 0%, transparent 60%)' }} />

          {/* Right: conference room illustration */}
          <div className="absolute right-0 top-0 bottom-0 w-[42%] hidden lg:block pointer-events-none select-none overflow-hidden">
            {/* Photo-realistic SVG room scene */}
            <svg viewBox="0 0 340 220" fill="none" xmlns="http://www.w3.org/2000/svg" className="absolute inset-0 w-full h-full">
              {/* Back wall */}
              <rect width="340" height="220" fill="rgba(99,102,241,0.15)" />
              {/* Ceiling light strip */}
              <rect x="80" y="0" width="180" height="4" rx="2" fill="rgba(255,255,255,0.18)" />
              {/* Left wall panel */}
              <rect x="0" y="0" width="60" height="220" fill="rgba(0,0,0,0.08)" />
              {/* Floor */}
              <rect x="0" y="168" width="340" height="52" rx="0" fill="rgba(0,0,0,0.18)" />
              {/* Floor shine */}
              <ellipse cx="170" cy="175" rx="130" ry="10" fill="rgba(255,255,255,0.04)" />
              {/* TV / presentation screen */}
              <rect x="90" y="18" width="160" height="95" rx="6" fill="rgba(15,15,40,0.55)" />
              <rect x="95" y="23" width="150" height="85" rx="3" fill="rgba(255,255,255,0.06)" />
              {/* Screen glare */}
              <polygon points="95,23 145,23 95,60" fill="rgba(255,255,255,0.04)" />
              {/* TV stand / mount */}
              <rect x="162" y="113" width="16" height="10" rx="2" fill="rgba(255,255,255,0.2)" />
              <rect x="150" y="121" width="40" height="4" rx="2" fill="rgba(255,255,255,0.15)" />
              {/* Conference table — perspective trapezoid */}
              <path d="M30 158 L310 158 L280 175 L60 175 Z" fill="rgba(255,255,255,0.22)" />
              <path d="M30 158 L310 158 L310 162 L30 162 Z" fill="rgba(255,255,255,0.1)" />
              {/* Table legs */}
              <rect x="72" y="173" width="10" height="16" rx="2" fill="rgba(255,255,255,0.15)" />
              <rect x="258" y="173" width="10" height="16" rx="2" fill="rgba(255,255,255,0.15)" />
              {/* Chairs behind table (top) */}
              {[55, 110, 165, 220, 270].map((x, i) => (
                <g key={i}>
                  <rect x={x} y="134" width="28" height="22" rx="5" fill="rgba(255,255,255,0.18)" />
                  <rect x={x + 4} y="130" width="20" height="6" rx="3" fill="rgba(255,255,255,0.12)" />
                </g>
              ))}
              {/* Chairs in front of table (bottom) */}
              {[55, 120, 185, 250].map((x, i) => (
                <g key={i}>
                  <rect x={x} y="177" width="28" height="20" rx="5" fill="rgba(255,255,255,0.2)" />
                  <rect x={x + 3} y="195" width="22" height="6" rx="2" fill="rgba(255,255,255,0.1)" />
                </g>
              ))}
              {/* Plant pot */}
              <rect x="292" y="148" width="22" height="20" rx="3" fill="rgba(255,255,255,0.12)" />
              <ellipse cx="303" cy="146" rx="14" ry="14" fill="rgba(255,255,255,0.12)" />
              <ellipse cx="296" cy="140" rx="9" ry="10" fill="rgba(255,255,255,0.09)" />
              <ellipse cx="312" cy="141" rx="8" ry="9" fill="rgba(255,255,255,0.09)" />
              {/* Wall clock */}
              <circle cx="38" cy="42" r="18" fill="rgba(255,255,255,0.14)" />
              <circle cx="38" cy="42" r="14" fill="rgba(255,255,255,0.07)" />
              <line x1="38" y1="42" x2="38" y2="32" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" />
              <line x1="38" y1="42" x2="46" y2="42" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" />
              {/* Door right side */}
              <rect x="306" y="60" width="34" height="108" rx="3" fill="rgba(255,255,255,0.07)" />
              <circle cx="310" cy="118" r="3" fill="rgba(255,255,255,0.3)" />
            </svg>
            {/* Fade to left so it blends into the gradient */}
            <div className="absolute inset-0" style={{ background: 'linear-gradient(to right, rgba(79,70,229,1) 0%, transparent 35%)' }} />
          </div>

          {/* Text content */}
          <div className="relative z-10 max-w-[60%] lg:max-w-[55%]">
            <div className="flex items-center gap-2 mb-3">
              <GreetingIcon size={16} className="text-amber-300 flex-shrink-0" />
              <span className="text-indigo-200 text-[11px] font-bold uppercase tracking-[0.15em]">{greeting}! 👋</span>
            </div>
            <h1 className="text-3xl lg:text-4xl font-extrabold tracking-tight leading-tight text-white drop-shadow-sm">
              Let's make today productive
            </h1>
            <p className="text-indigo-200 text-sm mt-3 leading-relaxed">
              Book a room, manage meetings, and stay organized.
            </p>
          </div>
        </div>

        {/* Right: Book a Room panel */}
        {canBook && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 flex flex-col gap-4 overflow-visible">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-indigo-100 rounded-lg">
                <Calendar size={15} className="text-indigo-600" />
              </div>
              <h3 className="text-sm font-bold text-slate-900">Book a Room</h3>
            </div>

            {/* Room dropdown */}
            <div>
              <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Select room</label>
              <button
                ref={qbRoomBtnRef}
                type="button"
                onClick={() => setQbRoomDropdownOpen(!qbRoomDropdownOpen)}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 hover:bg-white transition-colors outline-none focus:ring-2 focus:ring-indigo-500 flex items-center justify-between gap-2 text-left"
              >
                <span className={`truncate ${selectedRoomId ? 'font-medium text-slate-800' : 'text-slate-400'}`}>
                  {selectedRoomId ? (rooms.find(r => r.id === selectedRoomId)?.name || 'Choose a room') : 'Choose a room'}
                </span>
                <ChevronDown size={14} className={`text-slate-400 transition-transform flex-shrink-0 ${qbRoomDropdownOpen ? 'rotate-180' : ''}`} />
              </button>
              {qbRoomDropdownOpen && createPortal(
                <>
                  <div className="fixed inset-0 z-[999]" onClick={() => setQbRoomDropdownOpen(false)} />
                  <div
                    className="fixed z-[1000] bg-white border border-slate-200 rounded-xl shadow-xl max-h-52 overflow-y-auto"
                    style={(() => {
                      const rect = qbRoomBtnRef.current?.getBoundingClientRect();
                      return rect ? { top: rect.bottom + 4, left: rect.left, width: rect.width } : {};
                    })()}
                  >
                    {rooms.map(r => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => { setSelectedRoomId(r.id); setQbRoomDropdownOpen(false); setQuickBookError(''); }}
                        className={`w-full px-3 py-2.5 text-left text-sm flex items-center justify-between gap-2 transition-colors ${
                          r.id === selectedRoomId ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${r.id === selectedRoomId ? 'bg-indigo-500' : 'bg-slate-300'}`} />
                          <span className="truncate">{r.name}</span>
                        </div>
                        <span className={`text-xs flex-shrink-0 px-1.5 py-0.5 rounded-md ${r.id === selectedRoomId ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-500'}`}>{r.capacity} seats</span>
                      </button>
                    ))}
                  </div>
                </>,
                document.body
              )}
            </div>

            {/* Date + Time row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Date</label>
                <DatePicker
                  value={selectedDate}
                  onChange={val => { setSelectedDate(val); setQuickBookError(''); }}
                  minDate={new Date()}
                  size="sm"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Time</label>
                <div className="flex items-center gap-1">
                  <input
                    type="number" min={1} max={12} value={qbHourInput}
                    onChange={e => { setQbHourInput(e.target.value); setQuickBookError(''); }}
                    onBlur={() => setQbHourInput(String(qbParsedHour))}
                    className="w-11 px-1 py-2 border border-slate-200 rounded-lg text-sm text-center focus:ring-2 focus:ring-indigo-500 outline-none bg-slate-50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <span className="text-slate-300 font-bold text-xs">:</span>
                  <input
                    type="number" min={0} max={59} value={qbMinute}
                    onChange={e => { setQbMinute(e.target.value); setQuickBookError(''); }}
                    onBlur={() => setQbMinute(String(qbParsedMinute).padStart(2, '0'))}
                    className="w-11 px-1 py-2 border border-slate-200 rounded-lg text-sm text-center focus:ring-2 focus:ring-indigo-500 outline-none bg-slate-50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <div className="flex border border-slate-200 rounded-lg overflow-hidden">
                    <button type="button" onClick={() => { setQbAmPm('AM'); setQuickBookError(''); }}
                      className={`px-1.5 py-2 text-[10px] font-bold transition-colors ${qbAmPm === 'AM' ? 'bg-indigo-600 text-white' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}
                    >AM</button>
                    <button type="button" onClick={() => { setQbAmPm('PM'); setQuickBookError(''); }}
                      className={`px-1.5 py-2 text-[10px] font-bold transition-colors ${qbAmPm === 'PM' ? 'bg-indigo-600 text-white' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}
                    >PM</button>
                  </div>
                </div>
              </div>
            </div>

            {/* Book button */}
            <div className="mt-auto">
              {quickBookError && <p className="text-[10px] text-red-500 mb-1.5">{quickBookError}</p>}
              <button
                onClick={handleQuickBook}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl shadow-sm shadow-indigo-200 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
              >
                <Calendar size={14} /> Book
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── 15-min imminent meeting banners ──────────────────────────────── */}
      {visibleImminent.map(b => {
        const minsLeft = differenceInMinutes(b.startTime, now);
        const room = rooms.find(r => r.id === b.roomId);
        return (
          <div key={b.id} className="flex items-center justify-between gap-4 bg-amber-50 border border-amber-300 rounded-xl px-4 py-3 shadow-sm animate-pulse-once">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                <Clock size={16} className="text-amber-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-amber-900">
                  "{b.title}" starts in {minsLeft <= 1 ? 'less than a minute' : `${minsLeft} minutes`}!
                </p>
                {room && (
                  <p className="text-xs text-amber-700">{room.name} · {format(b.startTime, 'h:mm a')}</p>
                )}
              </div>
            </div>
            <button
              onClick={() => setDismissedImminentIds(prev => new Set([...prev, b.id]))}
              className="text-amber-400 hover:text-amber-600 transition-colors flex-shrink-0"
              aria-label="Dismiss"
            >
              <X size={16} />
            </button>
          </div>
        );
      })}

      {/* ── Current / Next Meeting Cards ─────────────────────────────────── */}
      {(currentMeeting || nextMeeting) && (
        <div
          className="grid grid-cols-1 lg:grid-cols-3 gap-4"
          style={{ opacity: mounted ? 1 : 0, transform: mounted ? 'translateY(0)' : 'translateY(12px)', transition: 'all 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.1s' }}
        >
          <div>
            {currentMeeting ? (
              <MeetingCard booking={currentMeeting} label="Happening Now" accent="bg-green-500" isCurrent />
            ) : (
              <MeetingCard booking={nextMeeting!} label="Next Meeting" accent="bg-indigo-500" />
            )}
          </div>
        </div>
      )}

      {/* ── KPI Stat Cards — circular icon badge style ───────────────────── */}
      <div
        className="grid grid-cols-2 lg:grid-cols-4 gap-4"
        style={{ opacity: mounted ? 1 : 0, transform: mounted ? 'translateY(0)' : 'translateY(12px)', transition: 'all 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.2s' }}
      >
        {statCards.map((card) => (
          <div
            key={card.title}
            className="bg-white rounded-xl shadow-sm border border-slate-100 px-5 py-4 flex items-center gap-4 hover:shadow-md transition-shadow group cursor-default"
          >
            {/* Circular icon */}
            <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${card.bg}`}>
              <card.icon size={22} className={card.text} />
            </div>
            {/* Text */}
            <div className="flex-1 min-w-0">
              <p className="text-slate-400 text-[11px] font-medium truncate">{card.title}</p>
              <h3 className="text-2xl font-bold text-slate-900 tabular-nums leading-tight">
                <AnimatedNumber value={card.value} delay={card.delay} />
              </h3>
              <p className="text-[10px] text-slate-400 mt-0.5 truncate">{card.subtitle}</p>
            </div>
            {/* Arrow */}
            <ArrowRight size={16} className="text-slate-300 flex-shrink-0 group-hover:text-slate-400 transition-colors" />
          </div>
        ))}
      </div>

      {/* Booking Modal triggered from Quick Book */}
      {showBookingModal && quickBookRoom && (
        <BookingModal
          isOpen={showBookingModal}
          onClose={() => setShowBookingModal(false)}
          preSelectedRoom={quickBookRoom}
          preSelectedTime={quickBookTime}
        />
      )}

      {/* Room Availability Calendar */}
      <div style={{ opacity: mounted ? 1 : 0, transform: mounted ? 'translateY(0)' : 'translateY(12px)', transition: 'all 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.3s' }}>
        <CalendarView />
      </div>
    </div>
  );
};
