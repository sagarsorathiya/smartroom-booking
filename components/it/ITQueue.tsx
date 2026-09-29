import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { format, isBefore, differenceInMinutes } from 'date-fns';
import { Monitor, Check, Clock, Video, Mic, Building2, User, Search, PlayCircle, Send, Link2, AlertTriangle, CheckCircle2, Loader2, ListTodo, Users, Mail, FileText, Shield, CalendarClock, XCircle, Archive, ArchiveRestore, Sparkles, Edit3 } from 'lucide-react';
import { Pagination } from '../common/Pagination';
import { isValidUrl } from '../../utils/url';
import { ConfirmModal } from '../common/ConfirmModal';

const PAGE_SIZE = 5;

type FilterTab = 'all' | 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export const ITQueue: React.FC = () => {
  const { bookings, updateITStatus, archiveITTask, generateVcLink, updateVcLinkTime, rooms, vcAvailability } = useApp();
  const [linkInputs, setLinkInputs] = useState<Record<string, string>>({});
  const [numberInputs, setNumberInputs] = useState<Record<string, string>>({});
  const [passwordInputs, setPasswordInputs] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showArchived, setShowArchived] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);
  const [reopenTarget, setReopenTarget] = useState<string | null>(null);
  const [approveTarget, setApproveTarget] = useState<string | null>(null);
  // null = IT hasn't answered "lock this meeting?" yet — Approve stays disabled for Webex until they do
  const [lockMeeting, setLockMeeting] = useState<boolean | null>(null);
  // Client-only: once IT declines auto-generation for a task, fall back to the manual panel for this session.
  const [declinedAuto, setDeclinedAuto] = useState<Record<string, boolean>>({});
  const [generating, setGenerating] = useState<Record<string, boolean>>({});
  // Client-only: IT explicitly asked to mint a brand-new link instead of resending the existing one.
  const [forceRegen, setForceRegen] = useState<Record<string, boolean>>({});
  const [updatingTime, setUpdatingTime] = useState<Record<string, boolean>>({});
  // Client-only: IT is replacing the link on an already-completed task (e.g. booker got a link outside the portal).
  const [editingLink, setEditingLink] = useState<Record<string, boolean>>({});

  const allTasks = useMemo(() => {
    const statusPriority: Record<string, number> = { PENDING: 0, IN_PROGRESS: 1, COMPLETED: 2, CANCELLED: 3 };
    const now = Date.now();
    return bookings
      .filter(b => b.itRequirements.vcRequired || b.itRequirements.avSetup || b.itRequirements.supportStandby)
      .filter(b => showArchived ? b.itRequirements.archived : !b.itRequirements.archived)
      .sort((a, b) => {
        const pa = statusPriority[a.itRequirements.status] ?? 9;
        const pb = statusPriority[b.itRequirements.status] ?? 9;
        if (pa !== pb) return pa - pb;

        // Within same status: upcoming meetings first, then past
        const aUpcoming = a.startTime.getTime() >= now ? 0 : 1;
        const bUpcoming = b.startTime.getTime() >= now ? 0 : 1;
        if (aUpcoming !== bUpcoming) return aUpcoming - bUpcoming;

        // Upcoming: soonest first. Past: most recent first.
        if (aUpcoming === 0) return a.startTime.getTime() - b.startTime.getTime();
        return b.startTime.getTime() - a.startTime.getTime();
      });
  }, [bookings, showArchived]);

  const filtered = useMemo(() => {
    let list = allTasks;
    if (activeTab !== 'all') list = list.filter(t => t.itRequirements.status === activeTab);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(t =>
        t.title.toLowerCase().includes(q) ||
        t.userName.toLowerCase().includes(q) ||
        t.company.toLowerCase().includes(q) ||
        getRoomName(t.roomId).toLowerCase().includes(q)
      );
    }
    return list;
  }, [allTasks, activeTab, search]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const counts = useMemo(() => ({
    all: allTasks.length,
    PENDING: allTasks.filter(t => t.itRequirements.status === 'PENDING').length,
    IN_PROGRESS: allTasks.filter(t => t.itRequirements.status === 'IN_PROGRESS').length,
    COMPLETED: allTasks.filter(t => t.itRequirements.status === 'COMPLETED').length,
    CANCELLED: allTasks.filter(t => t.itRequirements.status === 'CANCELLED').length,
  }), [allTasks]);

  function getRoomName(id: string) { return rooms.find(r => r.id === id)?.name || 'Unknown Room'; }
  function getWebexAccountLabel(ref?: string) { return ref ? (vcAvailability.webex.accounts.find(a => a.id === ref)?.label || ref) : undefined; }

  const handleLinkChange = (id: string, val: string) => {
    setLinkInputs(prev => ({...prev, [id]: val}));
  };

  const handleNumberChange = (id: string, val: string) => {
    setNumberInputs(prev => ({...prev, [id]: val}));
  };

  const handlePasswordChange = (id: string, val: string) => {
    setPasswordInputs(prev => ({...prev, [id]: val}));
  };

  const startTask = (id: string) => {
    updateITStatus(id, 'IN_PROGRESS');
  };

  const approveAutoGenerate = async (id: string, lock: boolean) => {
    setGenerating(prev => ({ ...prev, [id]: true }));
    const ok = await generateVcLink(id, { lockMeeting: lock });
    setGenerating(prev => ({ ...prev, [id]: false }));
    if (!ok) {
      // Fall back to the manual panel so IT isn't stuck — the notification banner already explains why it failed.
      setDeclinedAuto(prev => ({ ...prev, [id]: true }));
    }
  };

  const declineAutoGenerate = (id: string) => {
    setDeclinedAuto(prev => ({ ...prev, [id]: true }));
  };

  // Reopened task that already has a link from before (e.g. booking edited after IT sent it) —
  // just close it out with the same link/credentials rather than minting a brand-new meeting via the API.
  const completeWithExistingLink = (task: { id: string; itRequirements: { generatedLink?: string; meetingNumber?: string; meetingPassword?: string } }) => {
    updateITStatus(task.id, 'COMPLETED', task.itRequirements.generatedLink, task.itRequirements.meetingNumber, task.itRequirements.meetingPassword);
  };

  // Same idea, but for links that can actually be rescheduled in place (Google Meet/Webex auto-generated) —
  // reschedules the real meeting to the booking's current time via the platform's API, same link throughout.
  const updateLinkTime = async (id: string) => {
    setUpdatingTime(prev => ({ ...prev, [id]: true }));
    const ok = await updateVcLinkTime(id);
    setUpdatingTime(prev => ({ ...prev, [id]: false }));
    if (!ok) {
      // Fall back to the manual panel so IT isn't stuck — the notification banner already explains why it failed.
      setDeclinedAuto(prev => ({ ...prev, [id]: true }));
    }
  };

  const completeTask = (id: string, createLink: boolean, existing?: { generatedLink?: string; meetingNumber?: string; meetingPassword?: string }) => {
    const link = createLink ? (linkInputs[id] ?? existing?.generatedLink) : undefined;
    if (createLink && link && !isValidUrl(link)) return;
    const number = createLink ? (numberInputs[id] ?? existing?.meetingNumber) || undefined : undefined;
    const password = createLink ? (passwordInputs[id] ?? existing?.meetingPassword) || undefined : undefined;
    updateITStatus(id, 'COMPLETED', link, number, password);
  };

  // IT wants to swap the link on a task that's already COMPLETED — e.g. the booker received a working
  // link from outside the portal and wants that one on record instead of the one IT originally sent.
  const startEditLink = (task: { id: string; itRequirements: { generatedLink?: string; meetingNumber?: string; meetingPassword?: string } }) => {
    setLinkInputs(prev => ({ ...prev, [task.id]: task.itRequirements.generatedLink || '' }));
    setNumberInputs(prev => ({ ...prev, [task.id]: task.itRequirements.meetingNumber || '' }));
    setPasswordInputs(prev => ({ ...prev, [task.id]: task.itRequirements.meetingPassword || '' }));
    setEditingLink(prev => ({ ...prev, [task.id]: true }));
  };

  const cancelEditLink = (id: string) => {
    setEditingLink(prev => ({ ...prev, [id]: false }));
  };

  const saveEditedLink = (id: string) => {
    const link = linkInputs[id];
    if (!link || !isValidUrl(link)) return;
    updateITStatus(id, 'COMPLETED', link, numberInputs[id] || undefined, passwordInputs[id] || undefined);
    setEditingLink(prev => ({ ...prev, [id]: false }));
  };

  const statusConfig: Record<FilterTab, { label: string; icon: React.ReactNode; color: string; activeColor: string }> = {
    all: { label: 'All', icon: <ListTodo size={14} />, color: 'text-slate-600', activeColor: 'bg-white text-slate-900 shadow-sm' },
    PENDING: { label: 'Pending', icon: <AlertTriangle size={14} />, color: 'text-amber-600', activeColor: 'bg-amber-50 text-amber-700 shadow-sm ring-1 ring-amber-200' },
    IN_PROGRESS: { label: 'In Progress', icon: <Loader2 size={14} />, color: 'text-blue-600', activeColor: 'bg-blue-50 text-blue-700 shadow-sm ring-1 ring-blue-200' },
    COMPLETED: { label: 'Done', icon: <CheckCircle2 size={14} />, color: 'text-teal-600', activeColor: 'bg-teal-50 text-teal-700 shadow-sm ring-1 ring-teal-200' },
    CANCELLED: { label: 'Cancelled', icon: <XCircle size={14} />, color: 'text-red-600', activeColor: 'bg-red-50 text-red-700 shadow-sm ring-1 ring-red-200' },
  };

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-1 h-8 bg-indigo-500 rounded-full flex-shrink-0" />
            <h1 className="text-2xl font-bold text-slate-900">IT Support Queue</h1>
          </div>
          <p className="text-sm text-slate-500 mt-1">Manage VC links and presentation requests</p>
        </div>
        <button
          onClick={() => { setShowArchived(!showArchived); setPage(1); }}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${
            showArchived
              ? 'bg-slate-800 text-white border-slate-800 hover:bg-slate-700'
              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
          }`}
        >
          <Archive size={15} />
          {showArchived ? 'Viewing Archived' : 'Show Archived'}
        </button>
      </div>

      {/* Stats Row */}
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
            <ListTodo size={13} /> TOTAL TASKS
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
            placeholder="Search by title, host, company or room..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none transition-colors"
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
                onClick={() => { setActiveTab(key); setPage(1); }}
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

      {/* Task List */}
      <div className="space-y-3">
        {paginated.map(task => {
          const status = task.itRequirements.status;
          const isPending = status === 'PENDING';
          const isInProgress = status === 'IN_PROGRESS';
          const isCompleted = status === 'COMPLETED';
          const isCancelled = status === 'CANCELLED';
          const isUrgent = isPending && isBefore(task.startTime, new Date(Date.now() + 3600000));
          const needsLinkCreation = task.itRequirements.vcRequired && task.itRequirements.createMeetingLink;
          const canAutoGenerate = needsLinkCreation && (task.itRequirements.platform === 'Google Meet' || task.itRequirements.platform === 'Webex');
          const showApprovalPanel = isPending && canAutoGenerate && !declinedAuto[task.id];
          const linkWasSent = isCompleted && needsLinkCreation && task.itRequirements.generatedLink;
          const hasExistingLink = !!task.itRequirements.generatedLink;
          const showResendPanel = showApprovalPanel && hasExistingLink && !forceRegen[task.id];

          return (
            <div
              key={task.id}
              className={`bg-white rounded-xl border border-slate-200 overflow-hidden transition-all hover:shadow-md ${isCompleted || isCancelled ? 'opacity-70' : ''}`}
            >
              {/* Card Header Bar */}
              <div className={`px-5 py-3 flex items-center justify-between gap-4 ${
                isPending ? 'bg-amber-50 border-b border-amber-100' :
                isInProgress ? 'bg-blue-50 border-b border-blue-100' :
                isCancelled ? 'bg-red-50 border-b border-red-100' :
                'bg-teal-50 border-b border-teal-100'
              }`}>
                <div className="flex items-center gap-3 min-w-0">
                  {/* Status indicator */}
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    isPending ? 'bg-amber-500' : isInProgress ? 'bg-blue-500 animate-pulse' : isCancelled ? 'bg-red-500' : 'bg-teal-500'
                  }`} />
                  <h3 className="font-semibold text-slate-900 truncate">{task.title}</h3>
                  {isUrgent && (
                    <span className="flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 text-[10px] font-bold rounded-full uppercase flex-shrink-0">
                      <AlertTriangle size={10} /> Urgent
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* Requirement badges */}
                  {task.itRequirements.vcRequired && (
                    <span className="flex items-center gap-1 px-2.5 py-1 bg-indigo-100 text-indigo-700 rounded-full text-[11px] font-semibold">
                      <Video size={11} /> {task.itRequirements.platform || 'VC'}
                    </span>
                  )}
                  {task.itRequirements.avSetup && (
                    <span className="flex items-center gap-1 px-2.5 py-1 bg-purple-100 text-purple-700 rounded-full text-[11px] font-semibold">
                      <Mic size={11} /> Presentation
                    </span>
                  )}
                  {/* Status badge */}
                  <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold uppercase ${
                    isPending ? 'bg-amber-200/60 text-amber-800' :
                    isInProgress ? 'bg-blue-200/60 text-blue-800' :
                    isCancelled ? 'bg-red-200/60 text-red-800' :
                    linkWasSent ? 'bg-teal-200/60 text-teal-800' : 'bg-teal-200/60 text-teal-800'
                  }`}>
                    {isPending ? 'Pending' : isInProgress ? 'In Progress' : isCancelled ? 'Cancelled' : linkWasSent ? 'Link Sent' : 'Setup Done'}
                  </span>
                </div>
              </div>

              {/* Card Body */}
              <div className="p-5">
                {/* Meeting Details */}
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2.5 text-sm mb-4">
                  <div className="flex items-center gap-2 text-slate-600">
                    <User size={13} className="text-slate-400 flex-shrink-0" />
                    <span className="text-slate-500">Booked by:</span>
                    <span className="font-medium text-slate-800 truncate">{task.userName}</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-600">
                    <Building2 size={13} className="text-slate-400 flex-shrink-0" />
                    <span className="truncate">{task.company} &middot; {task.department}</span>
                  </div>
                  <div className="flex items-center gap-2 text-indigo-700 font-medium">
                    <Monitor size={13} className="flex-shrink-0" />
                    <span className="truncate">{getRoomName(task.roomId)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-600">
                    <User size={13} className="text-slate-400 flex-shrink-0" />
                    <span className="text-slate-500">Chair:</span>
                    <span className="font-medium text-slate-800 truncate">{task.chairPerson}</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-600">
                    <CalendarClock size={13} className="text-slate-400 flex-shrink-0" />
                    <span>{format(task.startTime, 'MMM d, h:mm a')} &ndash; {format(task.endTime, 'h:mm a')}</span>
                    <span className="text-slate-400">({(() => { const mins = differenceInMinutes(task.endTime, task.startTime); return mins >= 60 ? `${Math.floor(mins / 60)}h${mins % 60 ? ` ${mins % 60}m` : ''}` : `${mins}m`; })()})</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-600">
                    <Users size={13} className="text-slate-400 flex-shrink-0" />
                    <span className="text-slate-500">Participants:</span>
                    <span className="font-medium text-slate-800">{task.participants}</span>
                  </div>
                </div>

                {/* IT Requirements Summary */}
                <div className="flex flex-wrap items-center gap-2 mb-4">
                  {task.itRequirements.supportStandby && (
                    <span className="flex items-center gap-1 px-2.5 py-1 bg-amber-50 text-amber-700 rounded-full text-[11px] font-semibold border border-amber-100">
                      <Shield size={11} /> Support Standby
                    </span>
                  )}
                  {task.itRequirements.notes && (
                    <span className="flex items-center gap-1 px-2.5 py-1 bg-slate-100 text-slate-600 rounded-full text-[11px] font-medium">
                      <FileText size={11} /> {task.itRequirements.notes}
                    </span>
                  )}
                </div>

                {/* Notified People */}
                {task.notifyEmails && task.notifyEmails.length > 0 && (
                  <div className="bg-slate-50 rounded-lg border border-slate-200 p-3 mb-4">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Mail size={11} /> Notified People ({task.notifyEmails.length})
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {task.notifyEmails.map((email: string, i: number) => (
                        <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-white border border-slate-200 rounded text-xs text-slate-600">
                          <Mail size={10} className="text-slate-400" /> {email}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* This task already has a link from before (e.g. booking was edited after IT sent
                    it originally) — the link is still valid, so just let IT close the task out or
                    cancel it, rather than implying anything needs to be resent or regenerated. */}
                {showResendPanel && (
                  <div className="bg-gradient-to-br from-teal-50 to-slate-50 p-4 rounded-lg border border-teal-100 mb-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-6 h-6 rounded-full bg-teal-100 flex items-center justify-center">
                        <Link2 size={12} className="text-teal-600" />
                      </div>
                      <p className="text-xs font-bold text-teal-700 uppercase tracking-wide">This meeting already has a {task.itRequirements.platform} link</p>
                    </div>
                    <p className="text-xs text-slate-500 mb-3">
                      {task.itRequirements.vcUpdatable
                        ? "If the date or time changed, update the same meeting to match — the link stays the same. If nothing meaningful changed, just complete it."
                        : "The booking was edited, but the existing link is still valid — nothing to do here."}
                    </p>
                    <div className="flex items-center gap-2">
                      {task.itRequirements.vcUpdatable ? (
                        <button
                          onClick={() => updateLinkTime(task.id)}
                          disabled={updatingTime[task.id]}
                          className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-sm rounded-lg font-medium transition-colors"
                        >
                          {updatingTime[task.id] ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} {updatingTime[task.id] ? 'Updating…' : 'Update Time & Complete'}
                        </button>
                      ) : (
                        <button
                          onClick={() => completeWithExistingLink(task)}
                          className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm rounded-lg font-medium transition-colors"
                        >
                          <Check size={15} /> Complete
                        </button>
                      )}
                      <button
                        onClick={() => setForceRegen(prev => ({ ...prev, [task.id]: true }))}
                        disabled={updatingTime[task.id]}
                        className="text-xs text-slate-500 hover:text-slate-700 underline underline-offset-2 disabled:opacity-50"
                      >
                        Meeting details actually changed? Generate a new link
                      </button>
                      <button
                        onClick={() => setCancelTarget(task.id)}
                        className="flex items-center gap-2 px-3 py-2 text-red-600 hover:text-red-700 hover:bg-red-50 text-sm rounded-lg font-medium transition-colors border border-red-200 ml-auto"
                      >
                        <XCircle size={15} /> Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Auto-generate approval panel — Google Meet / Webex only, before IT has made a decision */}
                {showApprovalPanel && !showResendPanel && (
                  <div className="bg-gradient-to-br from-violet-50 to-indigo-50 p-4 rounded-lg border border-violet-100 mb-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-6 h-6 rounded-full bg-violet-100 flex items-center justify-center">
                        <Sparkles size={12} className="text-violet-600" />
                      </div>
                      <p className="text-xs font-bold text-violet-700 uppercase tracking-wide">Auto-generate {task.itRequirements.platform} link?</p>
                    </div>
                    <p className="text-xs text-slate-500 mb-3">
                      {task.itRequirements.platform} is configured for automatic link creation. Approve to generate and send it immediately, or decline to enter a link manually.
                    </p>
                    <div className="flex items-center gap-2">
                      {hasExistingLink && (
                        <button
                          onClick={() => setForceRegen(prev => ({ ...prev, [task.id]: false }))}
                          className="text-xs text-slate-500 hover:text-slate-700 underline underline-offset-2 mr-2"
                        >
                          ← Back to resending the existing link
                        </button>
                      )}
                      <button
                        onClick={() => { setLockMeeting(null); setApproveTarget(task.id); }}
                        disabled={generating[task.id]}
                        className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-sm rounded-lg font-medium transition-colors"
                      >
                        {generating[task.id] ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />} {generating[task.id] ? 'Generating…' : 'Approve'}
                      </button>
                      <button
                        onClick={() => declineAutoGenerate(task.id)}
                        disabled={generating[task.id]}
                        className="flex items-center gap-2 px-4 py-2 border border-slate-300 text-slate-600 hover:bg-slate-50 text-sm rounded-lg font-medium transition-colors disabled:opacity-50"
                      >
                        <Edit3 size={15} /> Decline &amp; Enter Manually
                      </button>
                      <button
                        onClick={() => setCancelTarget(task.id)}
                        disabled={generating[task.id]}
                        className="flex items-center gap-2 px-3 py-2 text-red-600 hover:text-red-700 hover:bg-red-50 text-sm rounded-lg font-medium transition-colors border border-red-200 disabled:opacity-50"
                      >
                        <XCircle size={15} /> Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* VC Action Area */}
                {task.itRequirements.vcRequired && (isPending || isInProgress) && needsLinkCreation && !showApprovalPanel && (
                  <div className="bg-gradient-to-br from-indigo-50 to-slate-50 p-4 rounded-lg border border-indigo-100 mb-4">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center">
                        <Link2 size={12} className="text-indigo-600" />
                      </div>
                      <p className="text-xs font-bold text-indigo-700 uppercase tracking-wide">Generate {task.itRequirements.platform} Link</p>
                    </div>
                    {task.itRequirements.generatedLink && (
                      <p className="text-[11px] text-slate-500 mb-2">A link was already sent for this meeting before it was rescheduled — reusing it below. Edit or replace it if the meeting details changed.</p>
                    )}
                    <input
                      type="url"
                      placeholder="Paste meeting link here (https://...)"
                      className="w-full text-sm px-3 py-2.5 bg-white border border-indigo-200 rounded-lg mb-2 focus:ring-2 focus:ring-indigo-400 outline-none placeholder:text-slate-400"
                      value={linkInputs[task.id] ?? task.itRequirements.generatedLink ?? ''}
                      onChange={(e) => handleLinkChange(task.id, e.target.value)}
                    />
                    {(linkInputs[task.id] ?? task.itRequirements.generatedLink) && !isValidUrl(linkInputs[task.id] ?? task.itRequirements.generatedLink ?? '') && (
                      <p className="text-xs text-red-500 mb-2">Please enter a valid URL</p>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                      <input
                        type="text"
                        placeholder="Meeting Number (optional)"
                        className="w-full text-sm px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-400 outline-none placeholder:text-slate-400"
                        value={numberInputs[task.id] ?? task.itRequirements.meetingNumber ?? ''}
                        onChange={(e) => handleNumberChange(task.id, e.target.value)}
                      />
                      <input
                        type="text"
                        placeholder="Password (optional)"
                        className="w-full text-sm px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-400 outline-none placeholder:text-slate-400"
                        value={passwordInputs[task.id] ?? task.itRequirements.meetingPassword ?? ''}
                        onChange={(e) => handlePasswordChange(task.id, e.target.value)}
                      />
                    </div>
                  </div>
                )}

                {/* User provided link (read-only) */}
                {task.itRequirements.vcRequired && (isPending || isInProgress) && !needsLinkCreation && task.itRequirements.existingLink && (
                  <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 mb-4">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">User Provided Link</p>
                    <div className="text-sm bg-white p-2.5 rounded-lg border border-slate-200 text-slate-700 break-all font-mono">
                      {task.itRequirements.existingLink}
                    </div>
                  </div>
                )}

                {/* Completed link info */}
                {linkWasSent && !editingLink[task.id] && (
                  <div className="bg-teal-50 p-4 rounded-lg border border-teal-100 mb-4">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 size={14} className="text-teal-600" />
                        <p className="text-xs font-bold text-teal-700 uppercase tracking-wide">Link Sent to User</p>
                      </div>
                      <button
                        onClick={() => startEditLink(task)}
                        className="flex items-center gap-1 text-xs font-medium text-teal-700 hover:text-teal-900 underline underline-offset-2"
                      >
                        <Edit3 size={12} /> Replace Link
                      </button>
                    </div>
                    <div className="text-sm bg-white p-2.5 rounded-lg border border-teal-200 text-indigo-700 break-all font-mono mb-2">
                      <a href={task.itRequirements.generatedLink} target="_blank" rel="noopener noreferrer" className="hover:underline flex items-center gap-1.5">
                        <Link2 size={13} className="flex-shrink-0" />
                        {task.itRequirements.generatedLink}
                      </a>
                    </div>
                    {(task.itRequirements.meetingNumber || task.itRequirements.meetingPassword || task.itRequirements.vcAccountRef) && (
                      <div className="flex flex-wrap gap-4 text-sm text-slate-600">
                        {task.itRequirements.meetingNumber && (
                          <span>Meeting #: <span className="font-semibold text-slate-800">{task.itRequirements.meetingNumber}</span></span>
                        )}
                        {task.itRequirements.meetingPassword && (
                          <span>Password: <span className="font-semibold text-slate-800">{task.itRequirements.meetingPassword}</span></span>
                        )}
                        {task.itRequirements.vcAccountRef && (
                          <span>Webex Account: <span className="font-semibold text-slate-800">{getWebexAccountLabel(task.itRequirements.vcAccountRef)}</span></span>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Replacing the link on an already-completed task — e.g. booker got a working link from
                    outside the portal and wants that one on record instead. Saving resends the same
                    "link updated" emails (with an updated ICS) as the original completion. */}
                {linkWasSent && editingLink[task.id] && (
                  <div className="bg-gradient-to-br from-indigo-50 to-slate-50 p-4 rounded-lg border border-indigo-100 mb-4">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center">
                        <Edit3 size={12} className="text-indigo-600" />
                      </div>
                      <p className="text-xs font-bold text-indigo-700 uppercase tracking-wide">Replace {task.itRequirements.platform} Link</p>
                    </div>
                    <p className="text-[11px] text-slate-500 mb-2">Saving will resend the meeting link email to the booker and invitees with an updated calendar invite.</p>
                    <input
                      type="url"
                      placeholder="Paste new meeting link here (https://...)"
                      className="w-full text-sm px-3 py-2.5 bg-white border border-indigo-200 rounded-lg mb-2 focus:ring-2 focus:ring-indigo-400 outline-none placeholder:text-slate-400"
                      value={linkInputs[task.id] ?? ''}
                      onChange={(e) => handleLinkChange(task.id, e.target.value)}
                      autoFocus
                    />
                    {linkInputs[task.id] && !isValidUrl(linkInputs[task.id]) && (
                      <p className="text-xs text-red-500 mb-2">Please enter a valid URL</p>
                    )}
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <input
                        type="text"
                        placeholder="Meeting Number (optional)"
                        className="w-full text-sm px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-400 outline-none placeholder:text-slate-400"
                        value={numberInputs[task.id] ?? ''}
                        onChange={(e) => handleNumberChange(task.id, e.target.value)}
                      />
                      <input
                        type="text"
                        placeholder="Password (optional)"
                        className="w-full text-sm px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-400 outline-none placeholder:text-slate-400"
                        value={passwordInputs[task.id] ?? ''}
                        onChange={(e) => handlePasswordChange(task.id, e.target.value)}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => saveEditedLink(task.id)}
                        disabled={!linkInputs[task.id] || !isValidUrl(linkInputs[task.id])}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-sm rounded-lg font-medium transition-colors"
                      >
                        <Send size={15} /> Save &amp; Resend
                      </button>
                      <button
                        onClick={() => cancelEditLink(task.id)}
                        className="px-4 py-2 border border-slate-300 text-slate-600 hover:bg-slate-50 text-sm rounded-lg font-medium transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                  {isPending && !showApprovalPanel && (
                    <>
                      <button
                        onClick={() => startTask(task.id)}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg font-medium transition-colors"
                      >
                        <PlayCircle size={15} /> Pick Up
                      </button>
                      {!needsLinkCreation && (
                        <button
                          onClick={() => completeTask(task.id, false, task.itRequirements)}
                          className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm rounded-lg font-medium transition-colors"
                        >
                          <Check size={15} /> Mark Complete
                        </button>
                      )}
                      <button
                        onClick={() => setCancelTarget(task.id)}
                        className="flex items-center gap-2 px-3 py-2 text-red-600 hover:text-red-700 hover:bg-red-50 text-sm rounded-lg font-medium transition-colors border border-red-200"
                      >
                        <XCircle size={15} /> Cancel
                      </button>
                    </>
                  )}
                  {isInProgress && (
                    <button
                      onClick={() => setCancelTarget(task.id)}
                      className="flex items-center gap-2 px-3 py-2 text-red-600 hover:text-red-700 hover:bg-red-50 text-sm rounded-lg font-medium transition-colors border border-red-200"
                    >
                      <XCircle size={15} /> Cancel
                    </button>
                  )}
                  {isInProgress && needsLinkCreation && (
                    <button
                      onClick={() => completeTask(task.id, true, task.itRequirements)}
                      disabled={!(linkInputs[task.id] ?? task.itRequirements.generatedLink) || !isValidUrl(linkInputs[task.id] ?? task.itRequirements.generatedLink ?? '')}
                      className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-sm rounded-lg font-medium transition-colors"
                    >
                      <Send size={15} /> Send Link
                    </button>
                  )}
                  {isInProgress && !needsLinkCreation && (
                    <button
                      onClick={() => completeTask(task.id, false, task.itRequirements)}
                      className="flex items-center gap-2 px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white text-sm rounded-lg font-medium transition-colors"
                    >
                      <Check size={15} /> Mark Complete
                    </button>
                  )}
                  {isCompleted && (
                    <div className={`flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-lg ${
                      linkWasSent
                        ? 'text-teal-700 bg-teal-50 border border-teal-200'
                        : 'text-teal-700 bg-teal-50 border border-teal-200'
                    }`}>
                      <CheckCircle2 size={16} />
                      {linkWasSent ? 'Link Sent' : 'Setup Done'}
                    </div>
                  )}
                  {isCancelled && (
                    <>
                      <button
                        onClick={() => setReopenTarget(task.id)}
                        className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm rounded-lg font-medium transition-colors"
                        title="Reopen this IT task"
                      >
                        <ArchiveRestore size={15} /> Reopen Task
                      </button>
                      <div className="flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-lg text-red-700 bg-red-50 border border-red-200">
                        <XCircle size={16} />
                        Cancelled
                      </div>
                    </>
                  )}
                  {(isCompleted || isCancelled) && !showArchived && (
                    <button
                      onClick={() => archiveITTask(task.id, true)}
                      className="flex items-center gap-2 px-3 py-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 text-sm rounded-lg font-medium transition-colors"
                      title="Archive this task"
                    >
                      <Archive size={15} /> Archive
                    </button>
                  )}
                  {showArchived && (
                    <button
                      onClick={() => archiveITTask(task.id, false)}
                      className="flex items-center gap-2 px-3 py-2 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 text-sm rounded-lg font-medium transition-colors"
                      title="Restore this task"
                    >
                      <ArchiveRestore size={15} /> Restore
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="text-center py-16 bg-white rounded-xl border border-dashed border-slate-300">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
              <ListTodo size={20} className="text-slate-400" />
            </div>
            <p className="text-slate-500 font-medium">{search ? 'No tasks match your search.' : 'No IT requests in the queue.'}</p>
            <p className="text-slate-400 text-sm mt-1">Tasks will appear when rooms are booked with IT requirements.</p>
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="mt-6">
          <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
        </div>
      )}

      <ConfirmModal
        isOpen={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        onConfirm={() => { if (cancelTarget) updateITStatus(cancelTarget, 'CANCELLED'); }}
        title="Cancel IT Task"
        message="Are you sure you want to cancel this IT task? You can reopen it later if needed."
        confirmLabel="Cancel Task"
        confirmVariant="danger"
      />

      <ConfirmModal
        isOpen={!!reopenTarget}
        onClose={() => setReopenTarget(null)}
        onConfirm={() => { if (reopenTarget) updateITStatus(reopenTarget, 'PENDING'); }}
        title="Reopen IT Task"
        message="Reopen this IT task? It will return to Pending status and appear in the active queue."
        confirmLabel="Reopen"
        confirmVariant="primary"
      />

      <ConfirmModal
        isOpen={!!approveTarget}
        onClose={() => setApproveTarget(null)}
        onConfirm={() => { if (approveTarget) approveAutoGenerate(approveTarget, lockMeeting === true); }}
        title="Generate Meeting Link"
        message={(() => {
          const t = bookings.find(b => b.id === approveTarget);
          const base = `This will immediately generate a new ${t?.itRequirements.platform || ''} link and mark this task as completed.`;
          return t?.itRequirements.generatedLink
            ? `${base} The previously sent link will be replaced by a brand-new one. Continue?`
            : `${base} Continue?`;
        })()}
        confirmLabel="Approve & Generate"
        confirmVariant="primary"
        confirmDisabled={bookings.find(b => b.id === approveTarget)?.itRequirements.platform === 'Webex' && lockMeeting === null}
      >
        {bookings.find(b => b.id === approveTarget)?.itRequirements.platform === 'Webex' && (
          <div className="mt-4 p-3 rounded-lg border border-slate-200 bg-slate-50">
            <p className="text-sm font-medium text-slate-800">Do you want to lock this meeting?</p>
            <p className="text-xs text-slate-500 mt-0.5">A locked meeting locks as soon as it starts; anyone joining after that waits in the lobby until the host admits them.</p>
            <div className="flex gap-2 mt-3">
              {([
                { value: true, label: 'Yes, lock it' },
                { value: false, label: 'No, keep open' },
              ] as const).map(opt => (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => setLockMeeting(opt.value)}
                  className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
                    lockMeeting === opt.value
                      ? 'bg-indigo-600 border-indigo-600 text-white'
                      : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </ConfirmModal>
    </div>
  );
};
