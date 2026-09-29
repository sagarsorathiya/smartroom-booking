import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { Booking, ServiceCategory, SERVICE_CATEGORY_LABELS, ServiceStatus, UserRole } from '../../types';
import { format } from 'date-fns';
import { X, Clock, MapPin, Users, Building2, User, Video, Monitor, Mic, Shield, Mail, Link2, Loader2, CheckCircle2, FileText, Coffee, Package, Paperclip, Download, Trash2, Clipboard, Copy } from 'lucide-react';
import { isValidUrl } from '../../utils/url';
import { attachmentsApi } from '../../services/api';
import { BookingModal } from '../modals/BookingModal';

interface BookingDetailProps {
  isOpen: boolean;
  onClose: () => void;
  booking: Booking | null;
}

export const BookingDetail: React.FC<BookingDetailProps> = ({ isOpen, onClose, booking }) => {
  const { rooms, currentUser, refreshBooking } = useApp();
  const [isClosing, setIsClosing] = useState(false);
  const [deletingAttachmentId, setDeletingAttachmentId] = useState<string | null>(null);
  const [localAttachments, setLocalAttachments] = useState(booking?.attachments || []);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showCloneModal, setShowCloneModal] = useState(false);
  const [cloneStartTime, setCloneStartTime] = useState<Date>(new Date());

  const copyLink = (link: string) => {
    navigator.clipboard.writeText(link).catch(() => {});
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  useEffect(() => {
    if (booking) setLocalAttachments(booking.attachments || []);
  }, [booking]);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => { setIsClosing(false); onClose(); }, 200);
  };

  if (!isOpen && !isClosing) return null;
  if (!booking) return null;

  const room = rooms.find(r => r.id === booking.roomId);

  // Agenda and attachments are private: only visible to the booking creator or ADMIN.
  // IT / RECEPTION / ADMINISTRATION only see them when they are the one who made the booking.
  const canSeePrivateContent =
    currentUser.id === booking.userId ||
    currentUser.role === UserRole.ADMIN;

  const itStatusColors = {
    PENDING: 'bg-amber-100 text-amber-800',
    IN_PROGRESS: 'bg-blue-100 text-blue-800',
    COMPLETED: 'bg-green-100 text-green-800',
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) handleClose(); }}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
        style={{ animation: `${isClosing ? 'detailOut' : 'detailIn'} 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards` }}
      >
        <style>{`
          @keyframes detailIn { from { opacity: 0; transform: translateY(16px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
          @keyframes detailOut { from { opacity: 1; transform: translateY(0) scale(1); } to { opacity: 0; transform: translateY(12px) scale(0.97); } }
        `}</style>

        {/* Header */}
        <div className="relative bg-gradient-to-r from-indigo-600 to-indigo-700 text-white px-6 py-5">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.1),transparent)]" />
          <div className="relative flex justify-between items-start">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                  booking.status === 'CONFIRMED' ? 'bg-green-400/20 text-green-100' :
                  booking.status === 'PENDING' ? 'bg-amber-400/20 text-amber-100' :
                  booking.status === 'CANCELLED' ? 'bg-red-400/20 text-red-100' :
                  'bg-white/20 text-white/80'
                }`}>{booking.status}</span>
                {booking.editedAt && (
                  <span className="text-[10px] text-indigo-200">Edited {format(booking.editedAt, 'MMM d')}</span>
                )}
              </div>
              <h3 className="text-lg font-bold truncate">{booking.title}</h3>
              <p className="text-indigo-200 text-sm mt-0.5">by {booking.userName}</p>
            </div>
            <button onClick={handleClose} className="p-1.5 hover:bg-white/20 rounded-lg transition-colors flex-shrink-0">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="max-h-[65vh] overflow-y-auto">
          <div className="p-5 space-y-4">

            {/* Time & Room Bar */}
            <div className="flex gap-3">
              <div className="flex-1 flex items-center gap-2.5 p-3 bg-indigo-50 rounded-xl border border-indigo-100">
                <div className="p-1.5 bg-indigo-100 rounded-lg">
                  <Clock size={14} className="text-indigo-600" />
                </div>
                <div>
                  <p className="text-[10px] text-indigo-500 font-semibold uppercase tracking-wider">When</p>
                  <p className="text-sm font-bold text-indigo-900">{format(booking.startTime, 'EEE, MMM d')}</p>
                  <p className="text-xs text-indigo-600 font-medium">{format(booking.startTime, 'h:mm a')} – {format(booking.endTime, 'h:mm a')}</p>
                </div>
              </div>
              <div className="flex-1 flex items-center gap-2.5 p-3 bg-slate-50 rounded-xl border border-slate-200">
                <div className="p-1.5 bg-slate-100 rounded-lg">
                  <MapPin size={14} className="text-slate-600" />
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Where</p>
                  <p className="text-sm font-bold text-slate-900">{room?.name || 'Unknown'}</p>
                  <p className="text-xs text-slate-500">{room?.block} &bull; {room?.capacity} seats</p>
                </div>
              </div>
            </div>

            {/* Meeting Details */}
            <div>
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2.5">Meeting Details</h4>
              <div className="grid grid-cols-2 gap-2.5">
                {[
                  { icon: Building2, label: 'Company', value: booking.company },
                  { icon: Shield, label: 'Department', value: booking.department },
                  { icon: User, label: 'Chair Person', value: booking.chairPerson },
                  { icon: Users, label: 'Participants', value: String(booking.participants) },
                ].map(item => (
                  <div key={item.label} className="flex items-center gap-2.5 p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                    <div className="p-1.5 bg-white rounded-lg border border-slate-200">
                      <item.icon size={12} className="text-slate-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] text-slate-400 font-semibold">{item.label}</p>
                      <p className="text-sm font-medium text-slate-800 truncate">{item.value}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Agenda */}
            {canSeePrivateContent && booking.agenda && (
              <div>
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                  <FileText size={11} /> Agenda
                </h4>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{booking.agenda}</p>
                </div>
              </div>
            )}

            {/* Attachments */}
            {canSeePrivateContent && localAttachments.length > 0 && (
              <div>
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                  <Paperclip size={11} /> Attachments
                </h4>
                <div className="space-y-1.5">
                  {localAttachments.map(a => (
                    <div key={a.id} className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl">
                      <FileText size={14} className="text-slate-400 flex-shrink-0" />
                      <span className="text-sm text-slate-700 truncate flex-1" title={a.originalName}>{a.originalName}</span>
                      <span className="text-xs text-slate-400 flex-shrink-0">{(a.size / 1024).toFixed(0)} KB</span>
                      <button type="button"
                        onClick={() => attachmentsApi.downloadFile(a.id, a.originalName).catch(e => console.error(e))}
                        className="text-slate-400 hover:text-indigo-600 transition-colors flex-shrink-0" title="Download">
                        <Download size={14} />
                      </button>
                      {(currentUser.id === booking.userId || [UserRole.ADMIN, UserRole.RECEPTION, UserRole.ADMINISTRATION].includes(currentUser.role)) && (
                        <button type="button"
                          disabled={deletingAttachmentId === a.id}
                          onClick={async () => {
                            setDeletingAttachmentId(a.id);
                            try {
                              await attachmentsApi.delete(booking.id, a.id);
                              setLocalAttachments(prev => prev.filter(x => x.id !== a.id));
                              // Sync context so other views stay up-to-date
                              refreshBooking(booking.id).catch(() => {});
                            } catch (e) { console.error(e); }
                            finally { setDeletingAttachmentId(null); }
                          }}
                          className="text-slate-400 hover:text-red-500 transition-colors flex-shrink-0" title="Delete">
                          {deletingAttachmentId === a.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Notify Emails */}
            {booking.notifyEmails && booking.notifyEmails.length > 0 && (
              <div>
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                  <Mail size={11} /> Notifications
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {booking.notifyEmails.map(email => (
                    <span key={email} className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full text-[11px] font-medium border border-indigo-100">
                      {email}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* IT Requirements */}
            {(booking.itRequirements.vcRequired || booking.itRequirements.avSetup || booking.itRequirements.supportStandby) && (
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200">
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                    <Monitor size={11} className="text-indigo-500" /> IT Requirements
                  </h4>
                </div>
                <div className="p-4 space-y-3">
                  {/* Badges */}
                  <div className="flex flex-wrap gap-1.5">
                    {booking.itRequirements.vcRequired && (
                      <span className="flex items-center gap-1 px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-semibold border border-indigo-100">
                        <Video size={12} /> {booking.itRequirements.platform || 'VC'}
                      </span>
                    )}
                    {booking.itRequirements.avSetup && (
                      <span className="flex items-center gap-1 px-2.5 py-1 bg-purple-50 text-purple-700 rounded-lg text-xs font-semibold border border-purple-100">
                        <Mic size={12} /> Presentation
                      </span>
                    )}
                    {booking.itRequirements.supportStandby && (
                      <span className="flex items-center gap-1 px-2.5 py-1 bg-amber-50 text-amber-700 rounded-lg text-xs font-semibold border border-amber-100">
                        <Shield size={12} /> Standby
                      </span>
                    )}
                    <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${itStatusColors[booking.itRequirements.status]}`}>
                      {booking.itRequirements.status.replace('_', ' ')}
                    </span>
                  </div>

                  {/* VC Link Section */}
                  {booking.itRequirements.vcRequired && (
                    <>
                      {/* Generated link from IT (completed) */}
                      {booking.itRequirements.generatedLink && (
                        <div className="flex items-start gap-3 p-3 bg-green-50 rounded-lg border border-green-100">
                          <div className="p-1.5 bg-green-100 rounded-lg flex-shrink-0 mt-0.5">
                            <CheckCircle2 size={14} className="text-green-600" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[10px] text-green-600 font-bold uppercase tracking-wider mb-1">Meeting Link (from IT)</p>
                            <a href={isValidUrl(booking.itRequirements.generatedLink) ? booking.itRequirements.generatedLink : '#'} target="_blank" rel="noreferrer noopener" className="text-sm text-green-700 font-medium underline break-all block" onClick={e => e.stopPropagation()}>
                              {booking.itRequirements.generatedLink}
                            </a>
                          </div>
                          <button
                            onClick={() => copyLink(booking.itRequirements.generatedLink!)}
                            className="p-1.5 text-green-400 hover:text-green-700 transition-colors flex-shrink-0 self-start"
                            title="Copy link"
                          >
                            {copiedLink ? <span className="text-xs font-medium text-green-700">Copied!</span> : <Clipboard size={13} />}
                          </button>
                        </div>
                      )}

                      {/* User's own link */}
                      {booking.itRequirements.existingLink && (
                        <div className="flex items-start gap-3 p-3 bg-indigo-50 rounded-lg border border-indigo-100">
                          <div className="p-1.5 bg-indigo-100 rounded-lg flex-shrink-0 mt-0.5">
                            <Link2 size={14} className="text-indigo-600" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[10px] text-indigo-600 font-bold uppercase tracking-wider mb-1">Meeting Link (provided)</p>
                            <a href={isValidUrl(booking.itRequirements.existingLink) ? booking.itRequirements.existingLink : '#'} target="_blank" rel="noreferrer noopener" className="text-sm text-indigo-700 font-medium underline break-all block" onClick={e => e.stopPropagation()}>
                              {booking.itRequirements.existingLink}
                            </a>
                          </div>
                        </div>
                      )}

                      {/* Waiting for IT to generate link */}
                      {booking.itRequirements.createMeetingLink && !booking.itRequirements.generatedLink && (
                        <div className="flex items-center gap-3 p-3 bg-amber-50 rounded-lg border border-amber-100">
                          <div className="p-1.5 bg-amber-100 rounded-lg flex-shrink-0">
                            <Loader2 size={14} className="text-amber-600 animate-spin" />
                          </div>
                          <div>
                            <p className="text-[10px] text-amber-600 font-bold uppercase tracking-wider">Awaiting {booking.itRequirements.platform || 'VC'} Link</p>
                            <p className="text-xs text-amber-700 mt-0.5">IT team is generating the meeting link</p>
                          </div>
                        </div>
                      )}

                      {/* Meeting credentials */}
                      {(booking.itRequirements.meetingNumber || booking.itRequirements.meetingPassword) && (
                        <div className="flex gap-3 text-sm">
                          {booking.itRequirements.meetingNumber && (
                            <div className="flex-1 p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                              <p className="text-[10px] text-slate-400 font-semibold mb-0.5">Meeting ID</p>
                              <p className="font-bold text-slate-800">{booking.itRequirements.meetingNumber}</p>
                            </div>
                          )}
                          {booking.itRequirements.meetingPassword && (
                            <div className="flex-1 p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                              <p className="text-[10px] text-slate-400 font-semibold mb-0.5">Password</p>
                              <p className="font-bold text-slate-800">{booking.itRequirements.meetingPassword}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Service Requests — grouped by category */}
            {booking.serviceRequests && booking.serviceRequests.length > 0 && (() => {
              const grouped = booking.serviceRequests.reduce<Record<string, typeof booking.serviceRequests>>((acc, sr) => {
                (acc[sr.category] = acc[sr.category] || []).push(sr);
                return acc;
              }, {});
              return (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-100">
                    <h4 className="text-[10px] font-bold text-amber-600 uppercase tracking-widest flex items-center gap-1.5">
                      <Coffee size={11} className="text-amber-500" /> Administration Services
                    </h4>
                  </div>
                  <div className="p-4 space-y-5">
                    {Object.entries(grouped).map(([cat, items]) => {
                      const catIcons: Record<string, React.ReactNode> = {
                        [ServiceCategory.FOOD_BEVERAGE]: <Coffee size={12} className="text-amber-500" />,
                        [ServiceCategory.STATIONERY]: <Package size={12} className="text-blue-500" />,
                        [ServiceCategory.EQUIPMENT]: <Monitor size={12} className="text-purple-500" />,
                        [ServiceCategory.OTHER]: <Package size={12} className="text-slate-500" />,
                      };
                      const statusColors: Record<string, string> = {
                        [ServiceStatus.PENDING]: 'bg-amber-100 text-amber-800',
                        [ServiceStatus.IN_PROGRESS]: 'bg-blue-100 text-blue-800',
                        [ServiceStatus.COMPLETED]: 'bg-green-100 text-green-800',
                        [ServiceStatus.CANCELLED]: 'bg-red-100 text-red-800',
                      };
                      return (
                        <div key={cat}>
                          <p className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                            {catIcons[cat]}
                            {SERVICE_CATEGORY_LABELS[cat as ServiceCategory] || cat}
                          </p>
                          <div className="space-y-2">
                            {items.map(sr => (
                              <div key={sr.id} className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-xs text-slate-600 font-medium">
                                    {sr.category === ServiceCategory.FOOD_BEVERAGE && sr.quantity > 1 && (
                                      <span className="text-[10px] text-slate-400 mr-1">({sr.quantity} people)</span>
                                    )}
                                  </span>
                                  <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${statusColors[sr.status]}`}>
                                    {sr.status.replace('_', ' ')}
                                  </span>
                                </div>
                                <div className="flex flex-wrap gap-1">
                                  {sr.items.map(item => (
                                    <span key={item} className="px-2 py-0.5 bg-white text-slate-600 rounded text-[11px] font-medium border border-slate-200">
                                      {item}
                                    </span>
                                  ))}
                                </div>
                                {sr.notes && (
                                  <p className="mt-1.5 text-xs text-slate-500 italic flex items-center gap-1">
                                    <FileText size={10} /> {sr.notes}
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-slate-100 bg-slate-50/50">
          <div className="flex gap-3">
            <button
              onClick={() => { setShowCloneModal(true); setCloneStartTime(new Date(Date.now() + 60 * 60 * 1000)); }}
              className="flex-1 px-4 py-2.5 text-sm font-semibold text-teal-700 bg-teal-50 border border-teal-200 rounded-xl hover:bg-teal-100 transition-colors flex items-center justify-center gap-2"
            >
              <Copy size={14} />
              Clone
            </button>
            <button onClick={handleClose} className="flex-1 px-4 py-2.5 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-100 transition-colors">
              Close
            </button>
          </div>
        </div>

      </div>

      {/* Clone Modal — rendered outside the max-w-lg panel so it gets full viewport */}
      {showCloneModal && booking && (() => {
        const room = rooms.find(r => r.id === booking.roomId);
        if (!room) return null;
        return (
          <BookingModal
            isOpen={true}
            onClose={() => setShowCloneModal(false)}
            preSelectedRoom={room}
            preSelectedTime={cloneStartTime}
            cloneFrom={booking}
          />
        );
      })()}
    </div>
  );
};
