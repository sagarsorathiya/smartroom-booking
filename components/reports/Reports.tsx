import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { BookingStatus, ServiceCategory, ServiceStatus, SERVICE_CATEGORY_LABELS } from '../../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend } from 'recharts';
import { TrendingUp, Users, Clock, AlertCircle, Monitor, Calendar, Coffee, BarChart2, Flame, ChevronDown, Download } from 'lucide-react';
import { format, isSameDay, startOfWeek, startOfMonth, addDays, getHours, isAfter, isBefore, subDays, subMonths, startOfYear, endOfDay, startOfDay, parseISO } from 'date-fns';

const CHART_TOOLTIP = { borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' };
const COLORS = ['#6366f1', '#14b8a6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

// ── Reusable print-section wrapper ───────────────────────────────────────────
const PSection: React.FC<{ title: string; sub?: string; children: React.ReactNode; className?: string }> = ({ title, sub, children, className = '' }) => (
  <div className={`border border-slate-200 rounded-lg overflow-hidden print-card ${className}`}>
    <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200">
      <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">{title}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
    <div className="p-4">{children}</div>
  </div>
);

// ── CSS-only mini bar (works perfectly in print) ──────────────────────────────
const MiniBar: React.FC<{ pct: number; color?: string }> = ({ pct, color = 'bg-indigo-500' }) => (
  <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden w-full">
    <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(pct, 0)}%` }} />
  </div>
);

export const Reports: React.FC = () => {
  const { bookings, rooms } = useApp();

  // ── Date range state ─────────────────────────────────────────────────────
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const [startDate, setStartDate] = useState<string>(() => format(subMonths(new Date(), 1), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState<string>(todayStr);
  const [presetOpen, setPresetOpen] = useState(false);

  const presets = [
    { label: 'Today', apply: () => { const d = format(new Date(), 'yyyy-MM-dd'); setStartDate(d); setEndDate(d); } },
    { label: 'This Week', apply: () => { setStartDate(format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd')); setEndDate(todayStr); } },
    { label: 'Last 7 Days', apply: () => { setStartDate(format(subDays(new Date(), 6), 'yyyy-MM-dd')); setEndDate(todayStr); } },
    { label: 'This Month', apply: () => { setStartDate(format(startOfMonth(new Date()), 'yyyy-MM-dd')); setEndDate(todayStr); } },
    { label: 'Last Month', apply: () => { const prev = subMonths(new Date(), 1); setStartDate(format(startOfMonth(prev), 'yyyy-MM-dd')); setEndDate(format(new Date(prev.getFullYear(), prev.getMonth() + 1, 0), 'yyyy-MM-dd')); } },
    { label: 'Last 3 Months', apply: () => { setStartDate(format(subMonths(new Date(), 3), 'yyyy-MM-dd')); setEndDate(todayStr); } },
    { label: 'This Year', apply: () => { setStartDate(format(startOfYear(new Date()), 'yyyy-MM-dd')); setEndDate(todayStr); } },
    { label: 'All Time', apply: () => { setStartDate('2000-01-01'); setEndDate(todayStr); } },
  ];

  // Period filtering
  const filteredBookings = useMemo(() => {
    if (!startDate && !endDate) return bookings;
    const from = startDate ? startOfDay(parseISO(startDate)) : null;
    const to = endDate ? endOfDay(parseISO(endDate)) : null;
    return bookings.filter(b => {
      if (from && isBefore(b.startTime, from)) return false;
      if (to && isAfter(b.startTime, to)) return false;
      return true;
    });
  }, [bookings, startDate, endDate]);

  const activeBookings = filteredBookings.filter(b => b.status !== BookingStatus.CANCELLED);

  // Room utilization
  const roomUtilization = rooms.map(room => {
    const rb = activeBookings.filter(b => b.roomId === room.id);
    const hours = Math.round(rb.reduce((s, b) => s + (b.endTime.getTime() - b.startTime.getTime()) / 3600000, 0) * 10) / 10;
    return { name: room.name.length > 12 ? room.name.slice(0, 12) + '…' : room.name, bookings: rb.length, hours };
  });

  // Peak hours 7AM–8PM
  const hourDistribution = Array.from({ length: 13 }, (_, i) => {
    const hour = i + 7;
    const count = activeBookings.filter(b => getHours(b.startTime) <= hour && getHours(b.endTime) > hour).length;
    return { hour: `${hour > 12 ? hour - 12 : hour}${hour >= 12 ? 'PM' : 'AM'}`, count };
  });
  const peakHourMax = Math.max(1, ...hourDistribution.map(h => h.count));

  // Cancellation
  const totalBookings = filteredBookings.length;
  const cancelledBookings = filteredBookings.filter(b => b.status === BookingStatus.CANCELLED).length;
  const cancellationRate = totalBookings > 0 ? Math.round((cancelledBookings / totalBookings) * 100) : 0;

  // IT demand
  const itRequests = filteredBookings.filter(b => b.itRequirements.vcRequired || b.itRequirements.avSetup || b.itRequirements.supportStandby);
  const itPending = itRequests.filter(b => b.itRequirements.status === 'PENDING').length;
  const itInProgress = itRequests.filter(b => b.itRequirements.status === 'IN_PROGRESS').length;
  const itCompleted = itRequests.filter(b => b.itRequirements.status === 'COMPLETED').length;
  const itPieData = [
    { name: 'Pending', value: itPending, color: '#f59e0b' },
    { name: 'In Progress', value: itInProgress, color: '#3b82f6' },
    { name: 'Completed', value: itCompleted, color: '#10b981' },
  ].filter(d => d.value > 0);
  const platformData = ['Teams', 'Zoom', 'Google Meet', 'Webex'].map(p => ({
    name: p, count: filteredBookings.filter(b => b.itRequirements.platform === p).length,
  })).filter(d => d.count > 0);

  // Day usage (this week)
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const dayUsage = dayNames.map((name, i) => ({
    name, count: activeBookings.filter(b => isSameDay(b.startTime, addDays(weekStart, i))).length,
  }));
  const dayUsageMax = Math.max(1, ...dayUsage.map(d => d.count));

  // Service requests
  const allServiceRequests = filteredBookings.flatMap(b => b.serviceRequests || []);
  const totalSR = allServiceRequests.length;
  const srPending = allServiceRequests.filter(sr => sr.status === ServiceStatus.PENDING).length;
  const srInProgress = allServiceRequests.filter(sr => sr.status === ServiceStatus.IN_PROGRESS).length;
  const srCompleted = allServiceRequests.filter(sr => sr.status === ServiceStatus.COMPLETED).length;
  const srByCategoryData = ([ServiceCategory.FOOD_BEVERAGE, ServiceCategory.STATIONERY, ServiceCategory.EQUIPMENT, ServiceCategory.OTHER] as ServiceCategory[])
    .map(cat => ({ name: SERVICE_CATEGORY_LABELS[cat], count: allServiceRequests.filter(sr => sr.category === cat).length }))
    .filter(d => d.count > 0);
  const srStatusPieData = [
    { name: 'Pending', value: srPending, color: '#f59e0b' },
    { name: 'In Progress', value: srInProgress, color: '#3b82f6' },
    { name: 'Completed', value: srCompleted, color: '#10b981' },
    { name: 'Cancelled', value: allServiceRequests.filter(sr => sr.status === ServiceStatus.CANCELLED).length, color: '#ef4444' },
  ].filter(d => d.value > 0);
  const itemCounts: Record<string, number> = {};
  allServiceRequests.forEach(sr => sr.items.forEach(item => { itemCounts[item] = (itemCounts[item] || 0) + 1; }));
  const topItems = Object.entries(itemCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);

  // Department / company
  const deptCounts: Record<string, number> = {};
  activeBookings.forEach(b => { if (b.department) deptCounts[b.department] = (deptCounts[b.department] || 0) + 1; });
  const deptData = Object.entries(deptCounts).sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([name, count]) => ({ name: name.length > 18 ? name.slice(0, 18) + '…' : name, count }));
  const companyCounts: Record<string, number> = {};
  activeBookings.forEach(b => { if (b.company) companyCounts[b.company] = (companyCounts[b.company] || 0) + 1; });
  const companyData = Object.entries(companyCounts).sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([name, count]) => ({ name: name.length > 18 ? name.slice(0, 18) + '…' : name, count }));

  // Top bookers
  const bookerCounts: Record<string, number> = {};
  activeBookings.forEach(b => { bookerCounts[b.userName] = (bookerCounts[b.userName] || 0) + 1; });
  const topBookers = Object.entries(bookerCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

  // Room utilization %
  const allDates = new Set(activeBookings.map(b => format(b.startTime, 'yyyy-MM-dd')));
  const numDays = Math.max(allDates.size, 1);
  const maxPossibleHours = 10 * numDays;
  const roomUtilizationPct = rooms.map(room => {
    const rb = activeBookings.filter(b => b.roomId === room.id);
    const hoursBooked = Math.round(rb.reduce((s, b) => s + (b.endTime.getTime() - b.startTime.getTime()) / 3600000, 0) * 10) / 10;
    const pct = Math.min(100, Math.round((hoursBooked / maxPossibleHours) * 100));
    return { id: room.id, name: room.name, hoursBooked, pct };
  }).sort((a, b) => b.pct - a.pct);
  const mostUnderutilized = roomUtilizationPct[roomUtilizationPct.length - 1];

  // Heatmap
  const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  const heatmapData = rooms.map(room => ({
    room,
    counts: WEEKDAYS.map((_, dow) => activeBookings.filter(b => b.roomId === room.id && b.startTime.getDay() === dow + 1).length),
  }));
  const heatmapMax = Math.max(1, ...heatmapData.flatMap(r => r.counts));

  // Peak day
  const dayBookingCounts = WEEKDAYS.map((day, i) => ({ day, count: activeBookings.filter(b => b.startTime.getDay() === i + 1).length }));
  const peakDay = dayBookingCounts.reduce((best, d) => d.count > best.count ? d : best, dayBookingCounts[0]);

  const totalBookedHours = Math.round(activeBookings.reduce((s, b) => s + (b.endTime.getTime() - b.startTime.getTime()) / 3600000, 0));
  const avgParticipants = activeBookings.length > 0 ? Math.round(activeBookings.reduce((s, b) => s + b.participants, 0) / activeBookings.length) : 0;

  // ── Screen StatCard ───────────────────────────────────────────────────────
  const StatCard = ({ title, value, sub, icon: Icon, color }: { title: string; value: string | number; sub?: string; icon: React.FC<{ size?: number }>; color: string }) => (
    <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide leading-tight">{title}</p>
        <div className={`p-2 rounded-lg flex-shrink-0 ${color}`}><Icon size={16} /></div>
      </div>
      <div>
        <h3 className="text-2xl font-bold text-slate-900 truncate" title={String(value)}>{value}</h3>
        {sub && <p className="text-xs text-slate-400 mt-0.5 truncate">{sub}</p>}
      </div>
    </div>
  );

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 report-print-root">

      {/* ══════════════════════════════════════════════════════
          SCREEN ONLY — header controls
      ══════════════════════════════════════════════════════ */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 print:hidden">
        <div className="flex items-center gap-3">
          <div className="w-1 h-8 bg-indigo-500 rounded-full flex-shrink-0" />
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Reports & Analytics</h1>
            <p className="text-slate-500">Operational insights and usage statistics</p>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 w-full sm:w-auto">
          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-sm">
            <Calendar size={14} className="text-slate-400 flex-shrink-0" />
            <input type="date" value={startDate} max={endDate || todayStr} onChange={e => setStartDate(e.target.value)} className="text-sm text-slate-700 bg-transparent outline-none cursor-pointer" />
          </div>
          <span className="text-slate-400 text-sm font-medium hidden sm:block">—</span>
          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-sm">
            <Calendar size={14} className="text-slate-400 flex-shrink-0" />
            <input type="date" value={endDate} min={startDate} max={todayStr} onChange={e => setEndDate(e.target.value)} className="text-sm text-slate-700 bg-transparent outline-none cursor-pointer" />
          </div>
          <div className="relative">
            <button onClick={() => setPresetOpen(p => !p)} className="flex items-center gap-1.5 px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-sm font-medium rounded-xl border border-indigo-100 transition-colors">
              Quick Select <ChevronDown size={14} className={`transition-transform ${presetOpen ? 'rotate-180' : ''}`} />
            </button>
            {presetOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-44 bg-white border border-slate-200 rounded-xl shadow-lg z-20 overflow-hidden">
                {presets.map(p => (
                  <button key={p.label} onClick={() => { p.apply(); setPresetOpen(false); }} className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors">
                    {p.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button onClick={() => window.print()} className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl transition-colors shadow-sm">
            <Download size={14} /> Export PDF
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
          SCREEN ONLY — KPI + charts
      ══════════════════════════════════════════════════════ */}
      <div className="print:hidden space-y-8">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <StatCard title="Total Bookings" value={totalBookings} icon={Calendar} color="bg-indigo-100 text-indigo-600" />
          <StatCard title="Booked Hours" value={`${totalBookedHours}h`} sub={`across ${rooms.length} rooms`} icon={Clock} color="bg-purple-100 text-purple-600" />
          <StatCard title="Cancellation Rate" value={`${cancellationRate}%`} sub={`${cancelledBookings} of ${totalBookings}`} icon={AlertCircle} color="bg-red-100 text-red-600" />
          <StatCard title="IT Requests" value={itRequests.length} sub={`${itPending} pending`} icon={Monitor} color="bg-amber-100 text-amber-600" />
          <StatCard title="Service Requests" value={totalSR} sub={`${srPending} pending`} icon={Coffee} color="bg-orange-100 text-orange-600" />
          <StatCard title="Avg. Participants" value={avgParticipants} icon={Users} color="bg-teal-100 text-teal-600" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-slate-100 flex-shrink-0"><BarChart2 size={20} className="text-slate-500" /></div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Most Underutilized Room</p>
              <p className="text-lg font-bold text-slate-900 truncate mt-0.5">{mostUnderutilized?.name ?? '—'}</p>
              <p className="text-xs text-slate-400">{mostUnderutilized?.pct ?? 0}% utilization · {mostUnderutilized?.hoursBooked ?? 0}h booked</p>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-rose-100 flex-shrink-0"><Flame size={20} className="text-rose-500" /></div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Busiest Day of Week</p>
              <p className="text-lg font-bold text-slate-900 mt-0.5">{peakDay?.count > 0 ? peakDay.day : '—'}</p>
              <p className="text-xs text-slate-400">{peakDay?.count > 0 ? `${peakDay.count} bookings this period` : 'No booking data yet'}</p>
            </div>
          </div>
        </div>

        {activeBookings.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4"><TrendingUp size={28} className="text-slate-400" /></div>
            <h3 className="text-lg font-semibold text-slate-700 mb-1">No data for this period</h3>
            <p className="text-sm text-slate-400">There are no bookings in the selected time range.</p>
          </div>
        )}

        {activeBookings.length > 0 && (<>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
              <h3 className="text-lg font-bold text-slate-900 mb-1">Room Utilization</h3>
              <p className="text-xs text-slate-500 mb-4">Bookings and hours booked per room</p>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={roomUtilization}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                    <Tooltip contentStyle={CHART_TOOLTIP} />
                    <Legend />
                    <Bar dataKey="bookings" fill="#6366f1" radius={[4,4,0,0]} barSize={20} name="Bookings" />
                    <Bar dataKey="hours" fill="#a5b4fc" radius={[4,4,0,0]} barSize={20} name="Hours" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
              <h3 className="text-lg font-bold text-slate-900 mb-1">Peak Usage Hours</h3>
              <p className="text-xs text-slate-500 mb-4">Booking activity by hour of day</p>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={hourDistribution}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="hour" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                    <Tooltip contentStyle={CHART_TOOLTIP} />
                    <Line type="monotone" dataKey="count" stroke="#6366f1" strokeWidth={2} dot={{ r: 4, fill: '#6366f1' }} name="Bookings" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
              <h3 className="text-lg font-bold text-slate-900 mb-1">Bookings by Department</h3>
              <p className="text-xs text-slate-500 mb-4">Top departments using conference rooms</p>
              <div className="h-56">
                {deptData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={deptData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                      <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                      <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} width={100} />
                      <Tooltip contentStyle={CHART_TOOLTIP} />
                      <Bar dataKey="count" fill="#8b5cf6" radius={[0,4,4,0]} barSize={18} name="Bookings" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <div className="h-full flex items-center justify-center"><p className="text-slate-400 text-sm">No department data</p></div>}
              </div>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
              <h3 className="text-lg font-bold text-slate-900 mb-1">Bookings by Company</h3>
              <p className="text-xs text-slate-500 mb-4">Top companies using conference rooms</p>
              <div className="h-56">
                {companyData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={companyData} cx="50%" cy="50%" innerRadius={45} outerRadius={75} dataKey="count" label={({ name, value }) => `${name}: ${value}`}>
                        {companyData.map((_, idx) => <Cell key={idx} fill={COLORS[idx % COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={CHART_TOOLTIP} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : <div className="h-full flex items-center justify-center"><p className="text-slate-400 text-sm">No company data</p></div>}
              </div>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
              <h3 className="text-lg font-bold text-slate-900 mb-1">IT Support Demand</h3>
              <p className="text-xs text-slate-500 mb-4">Status breakdown of IT requests</p>
              <div className="h-56 flex items-center justify-center">
                {itPieData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={itPieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                        {itPieData.map((entry, idx) => <Cell key={idx} fill={entry.color} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : <p className="text-slate-400 text-sm">No IT requests yet</p>}
              </div>
              {platformData.length > 0 && (
                <div className="mt-4 flex gap-2 flex-wrap">
                  {platformData.map(p => <span key={p.name} className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded">{p.name}: {p.count}</span>)}
                </div>
              )}
            </div>
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
              <h3 className="text-lg font-bold text-slate-900 mb-1">Administration Services</h3>
              <p className="text-xs text-slate-500 mb-4">Service requests by category and status</p>
              {totalSR > 0 ? (<>
                <div className="h-48 flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={srStatusPieData} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                        {srStatusPieData.map((entry, idx) => <Cell key={idx} fill={entry.color} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                {srByCategoryData.length > 0 && (
                  <div className="mt-3 flex gap-2 flex-wrap">
                    {srByCategoryData.map(d => <span key={d.name} className="text-xs bg-amber-50 text-amber-700 px-2 py-1 rounded-full border border-amber-100 font-medium">{d.name}: {d.count}</span>)}
                  </div>
                )}
                {topItems.length > 0 && (
                  <div className="mt-3">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Top Requested Items</p>
                    <div className="flex gap-1.5 flex-wrap">
                      {topItems.map(([item, count]) => <span key={item} className="text-[11px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-medium">{item} ({count})</span>)}
                    </div>
                  </div>
                )}
              </>) : (
                <div className="h-48 flex items-center justify-center"><p className="text-slate-400 text-sm">No service requests yet</p></div>
              )}
            </div>
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
              <h3 className="text-lg font-bold text-slate-900 mb-1">This Week's Activity</h3>
              <p className="text-xs text-slate-500 mb-4">Bookings per day this week</p>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dayUsage}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                    <Tooltip contentStyle={CHART_TOOLTIP} />
                    <Bar dataKey="count" fill="#14b8a6" radius={[4,4,0,0]} barSize={36} name="Bookings" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
              <h3 className="text-lg font-bold text-slate-900 mb-1">Top Bookers</h3>
              <p className="text-xs text-slate-500 mb-4">Most active users by booking count</p>
              {topBookers.length > 0 ? (
                <div className="space-y-2.5 mt-2">
                  {topBookers.map(([name, count], i) => {
                    const pct = topBookers[0][1] > 0 ? Math.round((count / topBookers[0][1]) * 100) : 0;
                    return (
                      <div key={name}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${i === 0 ? 'bg-amber-100 text-amber-700' : i === 1 ? 'bg-slate-200 text-slate-600' : i === 2 ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-500'}`}>{i + 1}</span>
                            <span className="text-sm font-medium text-slate-800">{name}</span>
                          </div>
                          <span className="text-sm font-bold text-slate-600">{count}</span>
                        </div>
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : <div className="h-48 flex items-center justify-center"><p className="text-slate-400 text-sm">No booking data yet</p></div>}
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
            <h3 className="text-lg font-bold text-slate-900 mb-1">Room Utilization Rate</h3>
            <p className="text-xs text-slate-500 mb-5">% of 10h/day capacity used per room over the filtered period ({numDays} day{numDays !== 1 ? 's' : ''})</p>
            <div className="space-y-3">
              {roomUtilizationPct.map(r => (
                <div key={r.id}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-slate-700">{r.name}</span>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span>{r.hoursBooked}h booked</span>
                      <span className={`font-bold ${r.pct >= 70 ? 'text-green-600' : r.pct >= 40 ? 'text-amber-600' : 'text-red-500'}`}>{r.pct}%</span>
                    </div>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${r.pct >= 70 ? 'bg-green-500' : r.pct >= 40 ? 'bg-amber-500' : 'bg-red-400'}`} style={{ width: `${r.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 overflow-x-auto">
            <h3 className="text-lg font-bold text-slate-900 mb-1">Booking Heatmap</h3>
            <p className="text-xs text-slate-500 mb-5">Number of bookings per room per weekday</p>
            <table className="min-w-full border-separate" style={{ borderSpacing: '3px' }}>
              <thead>
                <tr>
                  <th className="text-left text-xs font-semibold text-slate-500 pr-4 pb-2 w-32">Room</th>
                  {WEEKDAYS.map(d => <th key={d} className="text-xs font-semibold text-slate-500 text-center pb-2 w-20">{d}</th>)}
                </tr>
              </thead>
              <tbody>
                {heatmapData.map(({ room, counts }) => (
                  <tr key={room.id}>
                    <td className="text-xs font-medium text-slate-700 pr-4 py-1 whitespace-nowrap">{room.name.length > 16 ? room.name.slice(0, 16) + '…' : room.name}</td>
                    {counts.map((count, i) => {
                      const intensity = heatmapMax > 0 ? count / heatmapMax : 0;
                      const bg = intensity === 0 ? 'bg-slate-50' : intensity < 0.2 ? 'bg-indigo-50' : intensity < 0.4 ? 'bg-indigo-100' : intensity < 0.6 ? 'bg-indigo-200' : intensity < 0.8 ? 'bg-indigo-400' : 'bg-indigo-600';
                      const text = intensity >= 0.6 ? 'text-white' : 'text-slate-700';
                      return <td key={i} className={`text-center text-xs font-semibold py-2 px-3 rounded-md ${bg} ${text}`}>{count > 0 ? count : ''}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>)}
      </div>

      {/* ══════════════════════════════════════════════════════
          PRINT ONLY — title + full data layout (no SVG charts)
      ══════════════════════════════════════════════════════ */}
      <div className="hidden print:block space-y-4">

        {/* Title */}
        <div className="pb-3 mb-1 border-b-2 border-indigo-600 flex items-end justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Reports & Analytics</h1>
            <p className="text-xs text-slate-500 mt-0.5">ConferenceHub — Operational Insights</p>
          </div>
          <div className="text-right text-xs text-slate-500 leading-relaxed">
            <p className="font-semibold text-slate-700">Period: {startDate || 'All time'} — {endDate || 'Today'}</p>
            <p>Generated: {format(new Date(), 'dd MMM yyyy, HH:mm')}</p>
          </div>
        </div>

        {/* KPI stats — 3 × 2 grid */}
        <div className="grid grid-cols-3 gap-2 print-card">
          {[
            { label: 'Total Bookings', value: totalBookings, sub: `${cancelledBookings} cancelled` },
            { label: 'Booked Hours', value: `${totalBookedHours}h`, sub: `across ${rooms.length} rooms` },
            { label: 'Cancellation Rate', value: `${cancellationRate}%`, sub: `${cancelledBookings} of ${totalBookings}` },
            { label: 'IT Requests', value: itRequests.length, sub: `${itPending} pending` },
            { label: 'Service Requests', value: totalSR, sub: `${srPending} pending` },
            { label: 'Avg. Participants', value: avgParticipants, sub: 'per booking' },
          ].map(s => (
            <div key={s.label} className="border border-slate-200 rounded-lg p-3 bg-white">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{s.label}</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{s.value}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">{s.sub}</p>
            </div>
          ))}
        </div>

        {/* Key insights */}
        <div className="grid grid-cols-2 gap-2 print-grid-2 print-card">
          <div className="border border-slate-200 rounded-lg p-3 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-slate-100 flex-shrink-0"><BarChart2 size={16} className="text-slate-500" /></div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Most Underutilized Room</p>
              <p className="text-sm font-bold text-slate-900 mt-0.5">{mostUnderutilized?.name ?? '—'}</p>
              <p className="text-[10px] text-slate-400">{mostUnderutilized?.pct ?? 0}% utilization · {mostUnderutilized?.hoursBooked ?? 0}h booked</p>
            </div>
          </div>
          <div className="border border-slate-200 rounded-lg p-3 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-rose-100 flex-shrink-0"><Flame size={16} className="text-rose-500" /></div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Busiest Day of Week</p>
              <p className="text-sm font-bold text-slate-900 mt-0.5">{peakDay?.count > 0 ? peakDay.day : '—'}</p>
              <p className="text-[10px] text-slate-400">{peakDay?.count > 0 ? `${peakDay.count} bookings this period` : 'No data'}</p>
            </div>
          </div>
        </div>

        {activeBookings.length === 0 ? (
          <div className="border border-slate-200 rounded-lg p-8 text-center">
            <p className="text-slate-400 text-sm">No bookings in the selected period.</p>
          </div>
        ) : (<>

          {/* Room Utilization + Peak Hours */}
          <div className="grid grid-cols-2 gap-3 print-grid-2">
            <PSection title="Room Utilization" sub="Bookings and hours per room">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left pb-2 font-semibold text-slate-500">Room</th>
                    <th className="text-right pb-2 font-semibold text-slate-500">Bookings</th>
                    <th className="text-right pb-2 font-semibold text-slate-500 pr-1">Hours</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {roomUtilization.map((r, i) => (
                    <tr key={i}>
                      <td className="py-1.5 font-medium text-slate-700">{r.name}</td>
                      <td className="py-1.5 text-right text-slate-600">{r.bookings}</td>
                      <td className="py-1.5 text-right text-slate-600 pr-1">{r.hours}h</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </PSection>

            <PSection title="Peak Usage Hours" sub="Bookings active per hour">
              <div className="space-y-1.5">
                {hourDistribution.map((h, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-400 w-9 text-right flex-shrink-0 font-medium">{h.hour}</span>
                    <div className="flex-1"><MiniBar pct={Math.round((h.count / peakHourMax) * 100)} color="bg-indigo-500" /></div>
                    <span className="text-[10px] font-bold text-slate-600 w-4 text-right flex-shrink-0">{h.count || ''}</span>
                  </div>
                ))}
              </div>
            </PSection>
          </div>

          {/* Department + Company */}
          <div className="grid grid-cols-2 gap-3 print-grid-2">
            <PSection title="Bookings by Department" sub="Top departments">
              {deptData.length > 0 ? (
                <div className="space-y-1.5">
                  {deptData.map((d, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-600 font-medium flex-1 truncate">{d.name}</span>
                      <div className="w-20 flex-shrink-0"><MiniBar pct={Math.round((d.count / (deptData[0]?.count || 1)) * 100)} color="bg-violet-500" /></div>
                      <span className="text-[10px] font-bold text-violet-600 w-5 text-right flex-shrink-0">{d.count}</span>
                    </div>
                  ))}
                </div>
              ) : <p className="text-xs text-slate-400">No department data</p>}
            </PSection>

            <PSection title="Bookings by Company" sub="Top companies">
              {companyData.length > 0 ? (
                <div className="space-y-1.5">
                  {companyData.map((d, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-[10px] font-medium flex-shrink-0 w-2.5 h-2.5 rounded-full mt-0.5" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      <span className="text-[10px] text-slate-600 font-medium flex-1 truncate">{d.name}</span>
                      <div className="w-20 flex-shrink-0"><MiniBar pct={Math.round((d.count / (companyData[0]?.count || 1)) * 100)} color="bg-teal-500" /></div>
                      <span className="text-[10px] font-bold text-teal-600 w-5 text-right flex-shrink-0">{d.count}</span>
                    </div>
                  ))}
                </div>
              ) : <p className="text-xs text-slate-400">No company data</p>}
            </PSection>
          </div>

          {/* IT Support + Service Requests */}
          <div className="grid grid-cols-2 gap-3 print-grid-2">
            <PSection title="IT Support Demand" sub={`${itRequests.length} requests total`}>
              <div className="space-y-2">
                {[
                  { label: 'Pending', value: itPending, color: 'bg-amber-400' },
                  { label: 'In Progress', value: itInProgress, color: 'bg-blue-400' },
                  { label: 'Completed', value: itCompleted, color: 'bg-green-500' },
                ].map(s => (
                  <div key={s.label} className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-500 w-16 flex-shrink-0">{s.label}</span>
                    <div className="flex-1"><MiniBar pct={itRequests.length > 0 ? Math.round((s.value / itRequests.length) * 100) : 0} color={s.color} /></div>
                    <span className="text-[10px] font-bold text-slate-600 w-5 text-right flex-shrink-0">{s.value}</span>
                  </div>
                ))}
                {platformData.length > 0 && (
                  <div className="pt-2 border-t border-slate-100 flex flex-wrap gap-1">
                    {platformData.map(p => <span key={p.name} className="text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-medium">{p.name}: {p.count}</span>)}
                  </div>
                )}
              </div>
            </PSection>

            <PSection title="Administration Services" sub={`${totalSR} requests total`}>
              {totalSR > 0 ? (
                <div className="space-y-2">
                  {[
                    { label: 'Pending', value: srPending, color: 'bg-amber-400' },
                    { label: 'In Progress', value: srInProgress, color: 'bg-blue-400' },
                    { label: 'Completed', value: srCompleted, color: 'bg-green-500' },
                  ].map(s => (
                    <div key={s.label} className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-500 w-16 flex-shrink-0">{s.label}</span>
                      <div className="flex-1"><MiniBar pct={totalSR > 0 ? Math.round((s.value / totalSR) * 100) : 0} color={s.color} /></div>
                      <span className="text-[10px] font-bold text-slate-600 w-5 text-right flex-shrink-0">{s.value}</span>
                    </div>
                  ))}
                  {srByCategoryData.length > 0 && (
                    <div className="pt-2 border-t border-slate-100 flex flex-wrap gap-1">
                      {srByCategoryData.map(d => <span key={d.name} className="text-[9px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded border border-amber-100 font-medium">{d.name}: {d.count}</span>)}
                    </div>
                  )}
                  {topItems.length > 0 && (
                    <div className="pt-1.5 border-t border-slate-100">
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Top Items</p>
                      <div className="flex flex-wrap gap-1">
                        {topItems.map(([item, count]) => <span key={item} className="text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{item} ({count})</span>)}
                      </div>
                    </div>
                  )}
                </div>
              ) : <p className="text-xs text-slate-400">No service requests</p>}
            </PSection>
          </div>

          {/* Top Bookers + This Week */}
          <div className="grid grid-cols-2 gap-3 print-grid-2">
            <PSection title="Top Bookers" sub="Most active users by booking count">
              <div className="space-y-1.5">
                {topBookers.length > 0 ? topBookers.map(([name, count], i) => (
                  <div key={name} className="flex items-center gap-2">
                    <span className={`text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 ${i === 0 ? 'bg-amber-100 text-amber-700' : i === 1 ? 'bg-slate-200 text-slate-600' : 'bg-slate-100 text-slate-500'}`}>{i + 1}</span>
                    <span className="text-[10px] text-slate-700 font-medium flex-1 truncate">{name}</span>
                    <div className="w-20 flex-shrink-0"><MiniBar pct={Math.round((count / (topBookers[0][1] || 1)) * 100)} color="bg-indigo-500" /></div>
                    <span className="text-[10px] font-bold text-indigo-600 w-5 text-right flex-shrink-0">{count}</span>
                  </div>
                )) : <p className="text-xs text-slate-400">No data</p>}
              </div>
            </PSection>

            <PSection title="This Week's Activity" sub="Bookings per day (current week)">
              <div className="space-y-1.5">
                {dayUsage.map((d, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-500 w-7 font-semibold flex-shrink-0">{d.name}</span>
                    <div className="flex-1"><MiniBar pct={Math.round((d.count / dayUsageMax) * 100)} color="bg-teal-500" /></div>
                    <span className="text-[10px] font-bold text-teal-600 w-4 text-right flex-shrink-0">{d.count || ''}</span>
                  </div>
                ))}
              </div>
            </PSection>
          </div>

          {/* Room Utilization Rate */}
          <PSection title="Room Utilization Rate" sub={`% of 10h/day capacity · ${numDays} day${numDays !== 1 ? 's' : ''}`}>
            <div className="space-y-2">
              {roomUtilizationPct.map(r => (
                <div key={r.id} className="flex items-center gap-3">
                  <span className="text-[10px] font-medium text-slate-700 w-36 flex-shrink-0 truncate">{r.name}</span>
                  <div className="flex-1"><MiniBar pct={r.pct} color={r.pct >= 70 ? 'bg-green-500' : r.pct >= 40 ? 'bg-amber-500' : 'bg-red-400'} /></div>
                  <span className="text-[10px] text-slate-400 w-12 text-right flex-shrink-0">{r.hoursBooked}h</span>
                  <span className={`text-[10px] font-bold w-8 text-right flex-shrink-0 ${r.pct >= 70 ? 'text-green-600' : r.pct >= 40 ? 'text-amber-600' : 'text-red-500'}`}>{r.pct}%</span>
                </div>
              ))}
            </div>
          </PSection>

          {/* Booking Heatmap */}
          <PSection title="Booking Heatmap" sub="Bookings per room per weekday">
            <table className="w-full border-separate" style={{ borderSpacing: '3px' }}>
              <thead>
                <tr>
                  <th className="text-left text-[10px] font-semibold text-slate-500 pr-3 pb-1 w-28">Room</th>
                  {WEEKDAYS.map(d => <th key={d} className="text-[10px] font-semibold text-slate-500 text-center pb-1">{d}</th>)}
                </tr>
              </thead>
              <tbody>
                {heatmapData.map(({ room, counts }) => (
                  <tr key={room.id}>
                    <td className="text-[10px] font-medium text-slate-700 pr-3 py-0.5 whitespace-nowrap">{room.name.length > 16 ? room.name.slice(0, 16) + '…' : room.name}</td>
                    {counts.map((count, i) => {
                      const intensity = heatmapMax > 0 ? count / heatmapMax : 0;
                      const bg = intensity === 0 ? '#f8fafc' : intensity < 0.2 ? '#eef2ff' : intensity < 0.4 ? '#e0e7ff' : intensity < 0.6 ? '#c7d2fe' : intensity < 0.8 ? '#818cf8' : '#4f46e5';
                      const clr = intensity >= 0.6 ? 'white' : '#334155';
                      return <td key={i} className="text-center text-[10px] font-semibold py-1 px-2 rounded" style={{ backgroundColor: bg, color: clr }}>{count > 0 ? count : ''}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </PSection>

        </>)}
      </div>

    </div>
  );
};
