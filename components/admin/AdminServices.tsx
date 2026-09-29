import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { format, differenceInMinutes, isBefore } from 'date-fns';
import { ServiceCategory, ServiceStatus, ServiceRequest, SERVICE_CATEGORY_LABELS, Booking } from '../../types';
import { Coffee, Package, Monitor, PlayCircle, Check, XCircle, AlertTriangle, CheckCircle2, Loader2, ListTodo, Search, Clock, Building2, User, Users, CalendarClock, MapPin, FileText, ArchiveRestore } from 'lucide-react';
import { Pagination } from '../common/Pagination';

const PAGE_SIZE = 6;

type FilterTab = 'all' | 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

const categoryIcons: Record<ServiceCategory, React.ReactNode> = {
  [ServiceCategory.FOOD_BEVERAGE]: <Coffee size={13} className="text-amber-500" />,
  [ServiceCategory.STATIONERY]: <Package size={13} className="text-blue-500" />,
  [ServiceCategory.EQUIPMENT]: <Monitor size={13} className="text-purple-500" />,
  [ServiceCategory.OTHER]: <Package size={13} className="text-slate-500" />,
};

const categoryColors: Record<ServiceCategory, string> = {
  [ServiceCategory.FOOD_BEVERAGE]: 'bg-amber-50 text-amber-700 border-amber-100',
  [ServiceCategory.STATIONERY]: 'bg-blue-50 text-blue-700 border-blue-100',
  [ServiceCategory.EQUIPMENT]: 'bg-purple-50 text-purple-700 border-purple-100',
  [ServiceCategory.OTHER]: 'bg-slate-50 text-slate-700 border-slate-100',
};

/** Grouped view: one card per booking, containing all its service requests */
interface BookingServiceGroup {
  bookingId: string;
  bookingTitle: string;
  bookingUserName: string;
  roomName: string;
  company: string;
  department: string;
  chairPerson: string;
  participants: number;
  startTime: Date;
  endTime: Date;
  requests: ServiceRequest[];
  /** Aggregate status: worst-case wins (PENDING > IN_PROGRESS > COMPLETED/CANCELLED) */
  aggregateStatus: ServiceStatus;
}

function getAggregateStatus(requests: ServiceRequest[]): ServiceStatus {
  const statuses = requests.map(r => r.status);
  if (statuses.includes(ServiceStatus.PENDING)) return ServiceStatus.PENDING;
  if (statuses.includes(ServiceStatus.IN_PROGRESS)) return ServiceStatus.IN_PROGRESS;
  if (statuses.includes(ServiceStatus.COMPLETED)) return ServiceStatus.COMPLETED;
  return ServiceStatus.CANCELLED;
}

export const AdminServices: React.FC = () => {
  const { bookings, rooms, updateServiceStatus } = useApp();
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const getRoomName = (id: string) => rooms.find(r => r.id === id)?.name || 'Unknown Room';

  // Group all service requests by booking
  const allGroups: BookingServiceGroup[] = useMemo(() => {
    const statusPriority: Record<ServiceStatus, number> = {
      [ServiceStatus.PENDING]: 0,
      [ServiceStatus.IN_PROGRESS]: 1,
      [ServiceStatus.COMPLETED]: 2,
      [ServiceStatus.CANCELLED]: 3,
    };
    const now = Date.now();
    const groups: BookingServiceGroup[] = [];
    bookings.forEach(b => {
      if (!b.serviceRequests || b.serviceRequests.length === 0) return;
      groups.push({
        bookingId: b.id,
        bookingTitle: b.title,
        bookingUserName: b.userName,
        roomName: getRoomName(b.roomId),
        company: b.company,
        department: b.department,
        chairPerson: b.chairPerson,
        participants: b.participants,
        startTime: b.startTime,
        endTime: b.endTime,
        requests: b.serviceRequests,
        aggregateStatus: getAggregateStatus(b.serviceRequests),
      });
    });

    return groups.sort((a, b) => {
      const pa = statusPriority[a.aggregateStatus] ?? 9;
      const pb = statusPriority[b.aggregateStatus] ?? 9;
      if (pa !== pb) return pa - pb;

      // Within same status: upcoming meetings first, then past
      const aUpcoming = a.startTime.getTime() >= now ? 0 : 1;
      const bUpcoming = b.startTime.getTime() >= now ? 0 : 1;
      if (aUpcoming !== bUpcoming) return aUpcoming - bUpcoming;

      // Upcoming: soonest first. Past: most recent first.
      if (aUpcoming === 0) return a.startTime.getTime() - b.startTime.getTime();
      return b.startTime.getTime() - a.startTime.getTime();
    });
  }, [bookings, rooms]);

  // Count individual requests for stats
  const allRequests = useMemo(() => allGroups.flatMap(g => g.requests), [allGroups]);

  const filtered = useMemo(() => {
    let list = allGroups;
    if (activeTab !== 'all') {
      // Filter groups that have at least one request matching the tab status
      list = list.filter(g => g.requests.some(r => r.status === activeTab));
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(g =>
        g.bookingTitle.toLowerCase().includes(q) ||
        g.bookingUserName.toLowerCase().includes(q) ||
        g.company.toLowerCase().includes(q) ||
        g.roomName.toLowerCase().includes(q) ||
        g.requests.some(r => r.items.some(i => i.toLowerCase().includes(q)))
      );
    }
    return list;
  }, [allGroups, activeTab, search]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [activeTab, search]);

  const counts = useMemo(() => ({
    all: allRequests.length,
    PENDING: allRequests.filter(r => r.status === ServiceStatus.PENDING).length,
    IN_PROGRESS: allRequests.filter(r => r.status === ServiceStatus.IN_PROGRESS).length,
    COMPLETED: allRequests.filter(r => r.status === ServiceStatus.COMPLETED).length,
    CANCELLED: allRequests.filter(r => r.status === ServiceStatus.CANCELLED).length,
  }), [allRequests]);

  const statusConfig: Record<FilterTab, { label: string; icon: React.ReactNode; activeColor: string }> = {
    all: { label: 'All', icon: <ListTodo size={14} />, activeColor: 'bg-white text-slate-900 shadow-sm' },
    PENDING: { label: 'Pending', icon: <AlertTriangle size={14} />, activeColor: 'bg-amber-50 text-amber-700 shadow-sm ring-1 ring-amber-200' },
    IN_PROGRESS: { label: 'In Progress', icon: <Loader2 size={14} />, activeColor: 'bg-blue-50 text-blue-700 shadow-sm ring-1 ring-blue-200' },
    COMPLETED: { label: 'Done', icon: <CheckCircle2 size={14} />, activeColor: 'bg-teal-50 text-teal-700 shadow-sm ring-1 ring-teal-200' },
    CANCELLED: { label: 'Cancelled', icon: <XCircle size={14} />, activeColor: 'bg-red-50 text-red-700 shadow-sm ring-1 ring-red-200' },
  };

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <div className="w-1 h-8 bg-indigo-500 rounded-full" />
          <h1 className="text-2xl font-bold text-slate-900">Administration Services</h1>
        </div>
        <p className="text-sm text-slate-500 mt-1">Manage food, stationery, and equipment requests for meetings</p>
      </div>

      {/* Stats Row — clickable to filter */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div
          onClick={() => { setActiveTab('all'); setPage(1); }}
          className={`bg-white rounded-xl border p-4 cursor-pointer transition-all hover:shadow-md ${
            activeTab === 'all'
              ? 'border-slate-400 ring-2 ring-slate-200 shadow-md'
              : 'border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center gap-2 text-slate-500 text-xs font-medium mb-1">
            <ListTodo size={13} /> TOTAL REQUESTS
          </div>
          <p className="text-2xl font-bold text-slate-900">{counts.all}</p>
        </div>
        <div
          onClick={() => { setActiveTab('PENDING'); setPage(1); }}
          className={`bg-white rounded-xl border p-4 cursor-pointer transition-all hover:shadow-md ${
            activeTab === 'PENDING'
              ? 'border-amber-400 ring-2 ring-amber-200 shadow-md'
              : 'border-amber-200 hover:border-amber-300'
          }`}
        >
          <div className="flex items-center gap-2 text-amber-600 text-xs font-medium mb-1">
            <AlertTriangle size={13} /> PENDING
          </div>
          <p className="text-2xl font-bold text-amber-600">{counts.PENDING}</p>
        </div>
        <div
          onClick={() => { setActiveTab('IN_PROGRESS'); setPage(1); }}
          className={`bg-white rounded-xl border p-4 cursor-pointer transition-all hover:shadow-md ${
            activeTab === 'IN_PROGRESS'
              ? 'border-blue-400 ring-2 ring-blue-200 shadow-md'
              : 'border-blue-200 hover:border-blue-300'
          }`}
        >
          <div className="flex items-center gap-2 text-blue-600 text-xs font-medium mb-1">
            <Loader2 size={13} /> IN PROGRESS
          </div>
          <p className="text-2xl font-bold text-blue-600">{counts.IN_PROGRESS}</p>
        </div>
        <div
          onClick={() => { setActiveTab('COMPLETED'); setPage(1); }}
          className={`bg-white rounded-xl border p-4 cursor-pointer transition-all hover:shadow-md ${
            activeTab === 'COMPLETED'
              ? 'border-teal-400 ring-2 ring-teal-200 shadow-md'
              : 'border-teal-200 hover:border-teal-300'
          }`}
        >
          <div className="flex items-center gap-2 text-teal-600 text-xs font-medium mb-1">
            <CheckCircle2 size={13} /> DONE
          </div>
          <p className="text-2xl font-bold text-teal-600">{counts.COMPLETED}</p>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-3 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by title, host, company, room or item..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:bg-white outline-none transition-colors"
          />
        </div>
        <div className="flex gap-1 bg-slate-100 p-1 rounded-lg flex-shrink-0">
          {(['all', 'PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as FilterTab[]).map(key => {
            const cfg = statusConfig[key];
            const isActive = activeTab === key;
            const count = counts[key];
            return (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap ${isActive ? cfg.activeColor : 'text-slate-500 hover:text-slate-700 hover:bg-white/60'}`}
              >
                {cfg.icon}
                {cfg.label}
                {count > 0 && (
                  <span className={`ml-0.5 min-w-[18px] h-[18px] px-1 text-[10px] font-bold rounded-full flex items-center justify-center ${
                    isActive ? 'bg-white/30 text-white' : 'bg-slate-200 text-slate-600'
                  }`}>{count}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Task List — grouped by booking */}
      <div className="space-y-3">
        {paginated.map(group => {
          const aggStatus = group.aggregateStatus;
          const isPending = aggStatus === ServiceStatus.PENDING;
          const isInProgress = aggStatus === ServiceStatus.IN_PROGRESS;
          const isCompleted = aggStatus === ServiceStatus.COMPLETED;
          const isCancelled = aggStatus === ServiceStatus.CANCELLED;
          const isUrgent = isPending && isBefore(group.startTime, new Date(Date.now() + 3600000));
          const allDone = group.requests.every(r => r.status === ServiceStatus.COMPLETED || r.status === ServiceStatus.CANCELLED);

          return (
            <div
              key={group.bookingId}
              className={`bg-white rounded-xl border border-slate-200 overflow-hidden transition-all hover:shadow-md ${allDone ? 'opacity-70' : ''}`}
            >
              {/* Card Header */}
              <div className={`px-5 py-3 flex items-center justify-between gap-4 ${
                isPending ? 'bg-amber-50 border-b border-amber-100' :
                isInProgress ? 'bg-blue-50 border-b border-blue-100' :
                isCancelled ? 'bg-red-50 border-b border-red-100' :
                'bg-teal-50 border-b border-teal-100'
              }`}>
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    isPending ? 'bg-amber-500' : isInProgress ? 'bg-blue-500 animate-pulse' : isCancelled ? 'bg-red-500' : 'bg-teal-500'
                  }`} />
                  <h3 className="font-semibold text-slate-900 truncate">{group.bookingTitle}</h3>
                  {isUrgent && (
                    <span className="flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 text-[10px] font-bold rounded-full uppercase flex-shrink-0">
                      <AlertTriangle size={10} /> Urgent
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* Category badges — all categories in this group */}
                  {group.requests.map(sr => (
                    <span key={sr.id} className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${categoryColors[sr.category]}`}>
                      {categoryIcons[sr.category]}
                      {SERVICE_CATEGORY_LABELS[sr.category]}
                    </span>
                  ))}
                </div>
              </div>

              {/* Card Body */}
              <div className="p-5">
                {/* Meeting Details */}
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2.5 text-sm mb-4">
                  <div className="flex items-center gap-2 text-slate-600">
                    <User size={13} className="text-slate-400 flex-shrink-0" />
                    <span className="text-slate-500">Booked by:</span>
                    <span className="font-medium text-slate-800 truncate">{group.bookingUserName}</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-600">
                    <Building2 size={13} className="text-slate-400 flex-shrink-0" />
                    <span className="truncate">{group.company} &middot; {group.department}</span>
                  </div>
                  <div className="flex items-center gap-2 text-indigo-700 font-medium">
                    <MapPin size={13} className="flex-shrink-0" />
                    <span className="truncate">{group.roomName}</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-600">
                    <CalendarClock size={13} className="text-slate-400 flex-shrink-0" />
                    <span>{format(group.startTime, 'MMM d, h:mm a')} &ndash; {format(group.endTime, 'h:mm a')}</span>
                    <span className="text-slate-400">({(() => { const mins = differenceInMinutes(group.endTime, group.startTime); return mins >= 60 ? `${Math.floor(mins / 60)}h${mins % 60 ? ` ${mins % 60}m` : ''}` : `${mins}m`; })()})</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-600">
                    <Users size={13} className="text-slate-400 flex-shrink-0" />
                    <span className="text-slate-500">Participants:</span>
                    <span className="font-medium text-slate-800">{group.participants}</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-600">
                    <User size={13} className="text-slate-400 flex-shrink-0" />
                    <span className="text-slate-500">Chair:</span>
                    <span className="font-medium text-slate-800 truncate">{group.chairPerson}</span>
                  </div>
                </div>

                {/* Each service request within the booking */}
                <div className="space-y-3">
                  {group.requests.map(sr => {
                    const srPending = sr.status === ServiceStatus.PENDING;
                    const srInProgress = sr.status === ServiceStatus.IN_PROGRESS;
                    const srCompleted = sr.status === ServiceStatus.COMPLETED;
                    const srCancelled = sr.status === ServiceStatus.CANCELLED;

                    return (
                      <div key={sr.id} className={`rounded-lg border overflow-hidden ${
                        srCompleted || srCancelled ? 'border-slate-100' : 'border-amber-100'
                      }`}>
                        {/* Service header with category + status */}
                        <div className={`px-4 py-2 flex items-center justify-between ${
                          srPending ? 'bg-amber-50/60' : srInProgress ? 'bg-blue-50/60' : srCancelled ? 'bg-red-50/40' : 'bg-teal-50/40'
                        }`}>
                          <div className="flex items-center gap-2">
                            {categoryIcons[sr.category]}
                            <span className="text-sm font-semibold text-slate-800">{SERVICE_CATEGORY_LABELS[sr.category]}</span>
                            {sr.category === ServiceCategory.FOOD_BEVERAGE && sr.quantity > 1 && (
                              <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[10px] font-bold">
                                {sr.quantity} people
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold uppercase ${
                              srPending ? 'bg-amber-200/60 text-amber-800' :
                              srInProgress ? 'bg-blue-200/60 text-blue-800' :
                              srCancelled ? 'bg-red-200/60 text-red-800' :
                              'bg-teal-200/60 text-teal-800'
                            }`}>
                              {srPending ? 'Pending' : srInProgress ? 'In Progress' : srCancelled ? 'Cancelled' : 'Fulfilled'}
                            </span>
                          </div>
                        </div>

                        <div className="px-4 py-3">
                          {/* Items */}
                          <div className="flex flex-wrap gap-1.5 mb-2">
                            {sr.items.map(item => (
                              <span key={item} className="px-2.5 py-1 bg-white text-slate-700 rounded-lg text-xs font-medium border border-slate-200 shadow-sm">
                                {item}
                              </span>
                            ))}
                          </div>
                          {sr.notes && (
                            <div className="flex items-start gap-1.5 mb-2">
                              <FileText size={12} className="text-slate-400 mt-0.5 flex-shrink-0" />
                              <p className="text-xs text-slate-600 italic">{sr.notes}</p>
                            </div>
                          )}

                          {/* Handled by info */}
                          {sr.handledByName && (srCompleted || srInProgress) && (
                            <div className="text-xs text-slate-500 mb-2 flex items-center gap-1.5">
                              <User size={11} />
                              Handled by <span className="font-semibold text-slate-700">{sr.handledByName}</span>
                              {sr.completedAt && <> &middot; Completed {format(new Date(sr.completedAt), 'MMM d, h:mm a')}</>}
                            </div>
                          )}

                          {/* Action Buttons */}
                          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                            {srPending && (
                              <>
                                <button
                                  onClick={() => updateServiceStatus(sr.id, ServiceStatus.IN_PROGRESS)}
                                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded-lg font-medium transition-colors"
                                >
                                  <PlayCircle size={13} /> Pick Up
                                </button>
                                <button
                                  onClick={() => updateServiceStatus(sr.id, ServiceStatus.COMPLETED)}
                                  className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs rounded-lg font-medium transition-colors"
                                >
                                  <Check size={13} /> Fulfilled
                                </button>
                                <button
                                  onClick={() => updateServiceStatus(sr.id, ServiceStatus.CANCELLED)}
                                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-red-600 hover:text-red-700 hover:bg-red-50 text-xs rounded-lg font-medium transition-colors border border-red-200"
                                >
                                  <XCircle size={13} /> Cancel
                                </button>
                              </>
                            )}
                            {srInProgress && (
                              <>
                                <button
                                  onClick={() => updateServiceStatus(sr.id, ServiceStatus.COMPLETED)}
                                  className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs rounded-lg font-medium transition-colors"
                                >
                                  <Check size={13} /> Fulfilled
                                </button>
                                <button
                                  onClick={() => updateServiceStatus(sr.id, ServiceStatus.CANCELLED)}
                                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-red-600 hover:text-red-700 hover:bg-red-50 text-xs rounded-lg font-medium transition-colors border border-red-200"
                                >
                                  <XCircle size={13} /> Cancel
                                </button>
                              </>
                            )}
                            {srCompleted && (
                              <div className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg text-teal-700 bg-teal-50 border border-teal-200">
                                <CheckCircle2 size={13} /> Fulfilled
                              </div>
                            )}
                            {srCancelled && (
                              <>
                                <button
                                  onClick={() => updateServiceStatus(sr.id, ServiceStatus.PENDING)}
                                  className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs rounded-lg font-medium transition-colors"
                                  title="Reopen this service request"
                                >
                                  <ArchiveRestore size={13} /> Reopen
                                </button>
                                <div className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg text-red-700 bg-red-50 border border-red-200">
                                  <XCircle size={13} /> Cancelled
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="text-center py-16 bg-white rounded-xl border border-dashed border-slate-300">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
              <Coffee size={20} className="text-slate-400" />
            </div>
            <p className="text-slate-500 font-medium">{search ? 'No requests match your search.' : 'No service requests yet.'}</p>
            <p className="text-slate-400 text-sm mt-1">Requests will appear when rooms are booked with admin service needs.</p>
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="mt-6">
          <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
        </div>
      )}
    </div>
  );
};
