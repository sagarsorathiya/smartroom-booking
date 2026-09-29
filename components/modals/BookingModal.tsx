import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { Room, Booking, BookingStatus, UserRole, ManagedUser, ServiceCategory, ServiceRequest, SERVICE_ITEMS, SERVICE_CATEGORY_LABELS, BookingAttachment, RecurrenceFrequency, RecurrenceRule } from '../../types';
import { format, addHours, addWeeks, addMonths, addDays } from 'date-fns';
import { X, Calendar, Clock, Monitor, CheckCircle, User, Briefcase, AlertTriangle, Mail, Plus, XCircle, MapPin, Users, ChevronDown, Search, Loader2, Coffee, Package, Paperclip, FileText, Trash2, Repeat } from 'lucide-react';
import { DatePicker } from '../shared/DatePicker';
import { usersApi, bookingsApi, attachmentsApi } from '../../services/api';
import { isValidUrl } from '../../utils/url';

interface BookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  preSelectedRoom: Room;
  preSelectedTime: Date;
  existingBooking?: Booking | null;
  cloneFrom?: Booking | null;
}

export const BookingModal: React.FC<BookingModalProps> = ({ isOpen, onClose, preSelectedRoom, preSelectedTime, existingBooking, cloneFrom }) => {
  const { addBooking, addRecurringBookings, editBooking, rooms, bookings, blockedSlots, companies, departments, managedUsers, currentUser, settings, vcAvailability, updateUserEmail, addNotification, refreshBooking } = useApp();
  const isPrivileged = [UserRole.ADMIN, UserRole.RECEPTION, UserRole.IT].includes(currentUser.role);
  const bookableRooms = rooms.filter(r => !r.restricted || isPrivileged || r.allowedUserIds?.includes(currentUser.id));
  const isEditMode = !!existingBooking;
  const canBookOnBehalf = [UserRole.IT, UserRole.RECEPTION, UserRole.ADMINISTRATION, UserRole.ADMIN].includes(currentUser.role);

  // Pre-build email → user map so notify-chips don't call .find() on every render
  const managedUsersByEmail = useMemo(
    () => new Map(managedUsers.map(u => [u.email, u])),
    [managedUsers]
  );

  const [bookForUserId, setBookForUserId] = useState<string | null>(null);
  const [bookForUserName, setBookForUserName] = useState<string>('');
  const [bookForUserEmail, setBookForUserEmail] = useState<string>('');
  const [bookForDropdownOpen, setBookForDropdownOpen] = useState(false);
  const [bookForSearch, setBookForSearch] = useState('');
  const [directoryResults, setDirectoryResults] = useState<ManagedUser[]>([]);
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Debounced directory search
  useEffect(() => {
    if (!canBookOnBehalf) return;
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    const q = bookForSearch.trim();
    if (q.length < 2) {
      setDirectoryResults([]);
      setDirectoryLoading(false);
      return;
    }

    setDirectoryLoading(true);
    searchTimerRef.current = setTimeout(async () => {
      try {
        const results = await usersApi.searchDirectory(q);
        setDirectoryResults(results);
      } catch {
        setDirectoryResults([]);
      } finally {
        setDirectoryLoading(false);
      }
    }, 300);

    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [bookForSearch, canBookOnBehalf]);

  const [title, setTitle] = useState('');
  const [duration, setDuration] = useState(1);
  const [participants, setParticipants] = useState(2);

  // Editable date/time fields
  const [bookingDate, setBookingDate] = useState(format(preSelectedTime, 'yyyy-MM-dd'));
  const [bookingHourInput, setBookingHourInput] = useState(() => {
    const h = preSelectedTime.getHours();
    return String(h === 0 ? 12 : h > 12 ? h - 12 : h);
  });
  const [bookingMinute, setBookingMinute] = useState(String(preSelectedTime.getMinutes()).padStart(2, '0'));
  const [bookingAmPm, setBookingAmPm] = useState<'AM' | 'PM'>(preSelectedTime.getHours() >= 12 ? 'PM' : 'AM');
  const [selectedRoomId, setSelectedRoomId] = useState(preSelectedRoom.id);
  const [roomDropdownOpen, setRoomDropdownOpen] = useState(false);
  const selectedRoom = rooms.find(r => r.id === selectedRoomId) || preSelectedRoom;

  // Sync time fields when preSelectedTime changes (different slot clicked)
  useEffect(() => {
    const h = preSelectedTime.getHours();
    setBookingDate(format(preSelectedTime, 'yyyy-MM-dd'));
    setBookingHourInput(String(h === 0 ? 12 : h > 12 ? h - 12 : h));
    setBookingMinute(String(preSelectedTime.getMinutes()).padStart(2, '0'));
    setBookingAmPm(h >= 12 ? 'PM' : 'AM');
    setSelectedRoomId(preSelectedRoom.id);
  }, [preSelectedTime, preSelectedRoom]);

  const parsedHour = Math.min(12, Math.max(1, parseInt(bookingHourInput) || 12));
  const parsedMinute = Math.min(59, Math.max(0, parseInt(bookingMinute) || 0));
  const hour24 = bookingAmPm === 'AM' ? (parsedHour === 12 ? 0 : parsedHour) : (parsedHour === 12 ? 12 : parsedHour + 12);
  const computedStartTime = new Date(`${bookingDate}T${String(hour24).padStart(2, '0')}:${String(parsedMinute).padStart(2, '0')}:00`);
  const computedEndTime = addHours(computedStartTime, duration);

  // Live conflict detection
  const conflictingBookings = bookings.filter(b =>
    b.roomId === selectedRoomId &&
    b.status !== BookingStatus.CANCELLED &&
    b.id !== existingBooking?.id &&
    b.startTime.getTime() < computedEndTime.getTime() &&
    b.endTime.getTime() > computedStartTime.getTime()
  );
  const hasBlockedConflict = blockedSlots.some(bs =>
    bs.roomId === selectedRoomId &&
    bs.startTime.getTime() < computedEndTime.getTime() &&
    bs.endTime.getTime() > computedStartTime.getTime()
  );
  const hasOverlap = conflictingBookings.length > 0 || hasBlockedConflict;
  const isPastTime = computedStartTime.getTime() < Date.now();

  const [company, setCompany] = useState('');
  const [department, setDepartment] = useState('');
  const [companyDropdownOpen, setCompanyDropdownOpen] = useState(false);
  const [departmentDropdownOpen, setDepartmentDropdownOpen] = useState(false);

  const activeCompanies = companies.filter(c => c.active);
  const selectedCompanyObj = activeCompanies.find(c => c.name === company);
  const filteredDepartments = departments.filter(d => d.active && selectedCompanyObj && d.companyIds.includes(selectedCompanyObj.id));
  // Only platforms we actually have auto-generation configured for are offered — Teams/Zoom have
  // no integration (no license) and are never offered; Google Meet is per-company, Webex is global.
  const getAvailablePlatformsForCompany = useCallback((companyObj: typeof selectedCompanyObj) =>
    (['Google Meet', 'Webex'] as const).filter(p =>
      p === 'Google Meet'
        ? !!companyObj && vcAvailability.googleMeet.companies.includes(companyObj.id)
        : vcAvailability.webex.enabled && !!companyObj && vcAvailability.webex.companies.includes(companyObj.id)
    ), [vcAvailability]);
  const availablePlatforms = getAvailablePlatformsForCompany(selectedCompanyObj);
  const [chairPerson, setChairPerson] = useState('');
  const [agenda, setAgenda] = useState('');
  // File attachments: pendingFiles are new files to upload on save; existingAttachments come from the booking being edited
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [existingAttachments, setExistingAttachments] = useState<BookingAttachment[]>([]);
  const [attachmentsToDelete, setAttachmentsToDelete] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const ALLOWED_EXTENSIONS = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.gif,.webp,.txt';
  const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB per-file
  const COMBINED_SIZE_LIMIT = 20 * 1024 * 1024; // 20 MB combined total

  const [vcRequired, setVcRequired] = useState(false);
  const [createMeetingLink, setCreateMeetingLink] = useState(true);
  const [existingLink, setExistingLink] = useState('');
  const [platform, setPlatform] = useState<'Teams' | 'Zoom' | 'Google Meet' | 'Webex' | undefined>(undefined);

  // Email prompt state — shown when user has no email in DB
  const [showEmailPrompt, setShowEmailPrompt] = useState(false);
  const [emailPromptFor, setEmailPromptFor] = useState<'self' | 'behalf'>('self');
  const [emailInput, setEmailInput] = useState('');
  const [emailError, setEmailError] = useState('');
  const [emailSaving, setEmailSaving] = useState(false);
  const [avSetup, setAvSetup] = useState(false);
  const [supportStandby, setSupportStandby] = useState(false);

  const [meetingNumber, setMeetingNumber] = useState('');
  const [meetingPassword, setMeetingPassword] = useState('');

  const [notifyEmails, setNotifyEmails] = useState<string[]>([]);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [notifyDropdownOpen, setNotifyDropdownOpen] = useState(false);
  const [notifySectionOpen, setNotifySectionOpen] = useState(false);
  const [itSectionOpen, setItSectionOpen] = useState(false);
  const [servicesSectionOpen, setServicesSectionOpen] = useState(false);

  // ── Recurring bookings state ──────────────────────────────────────────────
  const [recurrenceEnabled, setRecurrenceEnabled] = useState(false);
  const [recurrenceFrequency, setRecurrenceFrequency] = useState<RecurrenceFrequency>('weekly');
  const [recurrenceEndDate, setRecurrenceEndDate] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedServices, setSelectedServices] = useState<Record<ServiceCategory, { enabled: boolean; items: string[]; quantity: number; notes: string; itemTimes: Record<string, string> }>>({
    [ServiceCategory.FOOD_BEVERAGE]: { enabled: false, items: [], quantity: participants || 2, notes: '', itemTimes: {} },
    [ServiceCategory.STATIONERY]: { enabled: false, items: [], quantity: 1, notes: '', itemTimes: {} },
    [ServiceCategory.EQUIPMENT]: { enabled: false, items: [], quantity: 1, notes: '', itemTimes: {} },
    [ServiceCategory.OTHER]: { enabled: false, items: [], quantity: 1, notes: '', itemTimes: {} },
  });
  const [manualEmailInput, setManualEmailInput] = useState('');
  const [notifyDirResults, setNotifyDirResults] = useState<ManagedUser[]>([]);
  const [notifyDirLoading, setNotifyDirLoading] = useState(false);
  const notifySearchTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const otherItemInputRef = useRef<HTMLInputElement>(null);

  // Debounced directory search for Notify Others
  useEffect(() => {
    if (notifySearchTimerRef.current) clearTimeout(notifySearchTimerRef.current);
    const q = userSearchQuery.trim();
    if (q.length < 2) { setNotifyDirResults([]); setNotifyDirLoading(false); return; }
    setNotifyDirLoading(true);
    notifySearchTimerRef.current = setTimeout(async () => {
      try {
        const results = await usersApi.searchDirectory(q);
        setNotifyDirResults(results);
        if (results.length > 0) setNotifyDropdownOpen(true);
      } catch { setNotifyDirResults([]); }
      finally { setNotifyDirLoading(false); }
    }, 300);
    return () => { if (notifySearchTimerRef.current) clearTimeout(notifySearchTimerRef.current); };
  }, [userSearchQuery]);

  const [errors, setErrors] = useState<Record<string, string>>({});

  const applySelfOrgDefaults = useCallback(() => {
    // Prefer org info directly from authenticated user, then fallback to managed directory match
    const companyFromCurrent = currentUser.companyId
      ? companies.find(c => c.id === currentUser.companyId && c.active)
      : undefined;
    const departmentFromCurrent = currentUser.departmentId
      ? departments.find(d => d.id === currentUser.departmentId && d.active)
      : undefined;

    const managed = managedUsers.find(
      u => u.id === currentUser.id || u.domainId === currentUser.domainId
    );
    const companyFromManaged = managed?.companyId
      ? companies.find(c => c.id === managed.companyId && c.active)
      : undefined;
    const departmentFromManaged = managed?.departmentId
      ? departments.find(d => d.id === managed.departmentId && d.active)
      : undefined;

    const selectedCompany = companyFromCurrent || companyFromManaged;
    if (selectedCompany) {
      setCompany(selectedCompany.name);
      const selectedDepartment = departmentFromCurrent || departmentFromManaged;
      if (selectedDepartment && selectedDepartment.companyIds.includes(selectedCompany.id)) {
        setDepartment(selectedDepartment.name);
      } else {
        setDepartment('');
      }
    }
  }, [currentUser.id, currentUser.domainId, currentUser.companyId, currentUser.departmentId, managedUsers, companies, departments]);

  // Pre-populate company/department from current user's org assignment (self booking only)
  useEffect(() => {
    if (!existingBooking && !bookForUserId && !company) {
      applySelfOrgDefaults();
    }
  }, [existingBooking, bookForUserId, company, applySelfOrgDefaults]);

  // When booking on behalf, force manual company/department selection
  useEffect(() => {
    if (existingBooking) return;
    if (bookForUserId) {
      setCompany('');
      setDepartment('');
      setCompanyDropdownOpen(false);
      setDepartmentDropdownOpen(false);
    }
  }, [bookForUserId, existingBooking]);

  // Reset form state when modal opens for a new (non-edit) booking
  useEffect(() => {
    if (isOpen && !isEditMode) {
      setTitle('');
      setDuration(1);
      setParticipants(2);
      setChairPerson('');
      setAgenda('');
      setPendingFiles([]);
      setExistingAttachments([]);
      setAttachmentsToDelete([]);
      setVcRequired(false);
      setCreateMeetingLink(true);
      setExistingLink('');
      setPlatform(undefined);
      setAvSetup(false);
      setSupportStandby(false);
      setMeetingNumber('');
      setMeetingPassword('');
      setNotifyEmails([]);
      setUserSearchQuery('');
      setManualEmailInput('');
      setSelectedServices({
        [ServiceCategory.FOOD_BEVERAGE]: { enabled: false, items: [], quantity: 2, notes: '', itemTimes: {} },
        [ServiceCategory.STATIONERY]: { enabled: false, items: [], quantity: 1, notes: '', itemTimes: {} },
        [ServiceCategory.EQUIPMENT]: { enabled: false, items: [], quantity: 1, notes: '', itemTimes: {} },
        [ServiceCategory.OTHER]: { enabled: false, items: [], quantity: 1, notes: '', itemTimes: {} },
      });
      setBookForUserId(null);
      setBookForUserName('');
      setBookForUserEmail('');
      setErrors({});
      setRecurrenceEnabled(false);
      setRecurrenceFrequency('weekly');
      setRecurrenceEndDate('');
    }
  }, [isOpen, isEditMode]);

  // Pre-populate form when cloning a booking (creates a new booking, not an edit)
  useEffect(() => {
    if (isOpen && cloneFrom && !existingBooking) {
      setTitle(cloneFrom.title);
      setDuration(Math.round((cloneFrom.endTime.getTime() - cloneFrom.startTime.getTime()) / (1000 * 60 * 30)) / 2);
      setParticipants(cloneFrom.participants);
      setCompany(cloneFrom.company);
      setDepartment(cloneFrom.department);
      setChairPerson(cloneFrom.chairPerson);
      setAgenda(cloneFrom.agenda || '');
      setVcRequired(cloneFrom.itRequirements.vcRequired);
      setCreateMeetingLink(cloneFrom.itRequirements.createMeetingLink);
      setExistingLink(''); // don't carry VC links over
      setPlatform(cloneFrom.itRequirements.platform);
      setAvSetup(cloneFrom.itRequirements.avSetup);
      setSupportStandby(cloneFrom.itRequirements.supportStandby);
      setNotifyEmails(cloneFrom.notifyEmails || []);
    }
  }, [isOpen, cloneFrom, existingBooking]);

  // Populate form when editing
  useEffect(() => {
    if (existingBooking) {
      setTitle(existingBooking.title);
      setDuration(Math.round((existingBooking.endTime.getTime() - existingBooking.startTime.getTime()) / (1000 * 60 * 30)) / 2);
      setParticipants(existingBooking.participants);
      setCompany(existingBooking.company);
      setDepartment(existingBooking.department);
      setChairPerson(existingBooking.chairPerson);
      setAgenda(existingBooking.agenda || '');
      setExistingAttachments(existingBooking.attachments || []);
      setPendingFiles([]);
      setAttachmentsToDelete([]);
      setVcRequired(existingBooking.itRequirements.vcRequired);
      setCreateMeetingLink(existingBooking.itRequirements.createMeetingLink);
      setExistingLink(existingBooking.itRequirements.existingLink || '');
      setMeetingNumber(existingBooking.itRequirements.meetingNumber || '');
      setMeetingPassword(existingBooking.itRequirements.meetingPassword || '');
      setPlatform(existingBooking.itRequirements.platform);
      setAvSetup(existingBooking.itRequirements.avSetup);
      setSupportStandby(existingBooking.itRequirements.supportStandby);
      setNotifyEmails(existingBooking.notifyEmails || []);

      // ── Restore Administration Services from saved serviceRequests ──────────
      const restored: Record<ServiceCategory, { enabled: boolean; items: string[]; quantity: number; notes: string; itemTimes: Record<string, string> }> = {
        [ServiceCategory.FOOD_BEVERAGE]: { enabled: false, items: [], quantity: existingBooking.participants || 2, notes: '', itemTimes: {} },
        [ServiceCategory.STATIONERY]:    { enabled: false, items: [], quantity: 1, notes: '', itemTimes: {} },
        [ServiceCategory.EQUIPMENT]:     { enabled: false, items: [], quantity: 1, notes: '', itemTimes: {} },
        [ServiceCategory.OTHER]:         { enabled: false, items: [], quantity: 1, notes: '', itemTimes: {} },
      };
      for (const sr of existingBooking.serviceRequests || []) {
        if (!restored[sr.category]) continue;
        // Parse itemTimes back out of the notes string (format: "Serve: <item> at <time>, ...")
        const itemTimes: Record<string, string> = {};
        if (sr.notes) {
          const serveMatch = sr.notes.match(/Serve:\s*([^|]+)/);
          if (serveMatch) {
            for (const part of serveMatch[1].split(',')) {
              const m = part.trim().match(/^(.+?)\s+at\s+(\d{2}:\d{2})$/);
              if (m) itemTimes[m[1].trim()] = m[2];
            }
          }
        }
        // Extract plain notes (everything after the first "|" separator, if any)
        const plainNotes = sr.notes
          ? sr.notes.replace(/^Serve:[^|]+\|?\s*/, '').trim()
          : '';
        restored[sr.category] = {
          enabled: true,
          items: sr.items || [],
          quantity: sr.quantity ?? 1,
          notes: plainNotes,
          itemTimes,
        };
      }
      setSelectedServices(restored);
    }
  }, [existingBooking]);

  if (!isOpen) return null;

  const capacityExceeded = participants > selectedRoom.capacity;
  const isCompletedBooking = isEditMode && (
    existingBooking?.status === BookingStatus.COMPLETED ||
    (existingBooking?.startTime && new Date(existingBooking.startTime).getTime() < Date.now())
  );

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (isCompletedBooking) { e.title = 'Completed bookings cannot be modified'; setErrors(e); return false; }
    if (!title.trim()) e.title = 'Title is required';
    if (!bookingDate) e.date = 'Date is required';
    if (!isEditMode && computedStartTime.getTime() < Date.now()) e.date = 'Cannot book in the past';
    if (!duration || duration < 0.5) e.duration = 'Minimum duration is 0.5 hours';
    if (duration > (settings.maxBookingDuration || 10)) e.duration = `Maximum duration is ${settings.maxBookingDuration || 10} hours`;
    if (!company.trim()) e.company = 'Company is required';
    if (!department.trim()) e.department = 'Department is required';
    if (!chairPerson.trim()) e.chairPerson = 'Chair person is required';
    if (participants < 1) e.participants = 'At least 1 participant required';
    if (vcRequired && !createMeetingLink && existingLink && !isValidUrl(existingLink)) {
      e.existingLink = 'Please enter a valid URL (https://...)';
    }
    if (vcRequired && createMeetingLink && !platform) {
      e.platform = 'Please select a platform';
    }
    // Enforce maxAdvanceBookingDays
    if (settings.maxAdvanceBookingDays > 0) {
      const maxDate = new Date();
      maxDate.setDate(maxDate.getDate() + settings.maxAdvanceBookingDays);
      maxDate.setHours(23, 59, 59, 999);
      if (computedStartTime.getTime() > maxDate.getTime()) {
        e.date = `Cannot book more than ${settings.maxAdvanceBookingDays} days in advance`;
      }
    }
    // Enforce allowWeekendBookings
    if (!settings.allowWeekendBookings) {
      const day = computedStartTime.getDay();
      if (day === 0 || day === 6) {
        e.date = 'Weekend bookings are not allowed';
      }
    }
    // Enforce maintenanceMode
    if (settings.maintenanceMode) {
      e.title = settings.maintenanceMessage || 'Portal is under maintenance. Bookings are disabled.';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    // Check if current user has an email — if not, prompt for it
    if (!currentUser.email || !currentUser.email.trim()) {
      setEmailPromptFor('self');
      setEmailInput('');
      setShowEmailPrompt(true);
      return;
    }

    // Check if booking on behalf and that user has no email
    if (bookForUserId && (!bookForUserEmail || !bookForUserEmail.trim())) {
      setEmailPromptFor('behalf');
      setEmailInput('');
      setShowEmailPrompt(true);
      return;
    }

    await submitBooking();
  };

  const handleEmailSubmit = async () => {
    const trimmed = emailInput.trim().toLowerCase();
    if (!trimmed) { setEmailError('Email is required'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) { setEmailError('Invalid email format'); return; }
    setEmailError('');
    setEmailSaving(true);
    try {
      if (emailPromptFor === 'self') {
        const ok = await updateUserEmail(trimmed);
        if (!ok) { setEmailSaving(false); return; }
      } else {
        // Update the on-behalf user's email
        await usersApi.updateEmail(bookForUserId!, trimmed);
        setBookForUserEmail(trimmed);
      }
      setShowEmailPrompt(false);
      setEmailSaving(false);
      await submitBooking();
    } catch (err: any) {
      setEmailError(err.message || 'Failed to update email.');
      setEmailSaving(false);
    }
  };

  const submitBooking = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    const bookingData = {
      roomId: selectedRoom.id,
      title: title.trim(),
      company: company.trim(),
      department: department.trim(),
      chairPerson: chairPerson.trim(),
      agenda: agenda.trim() || undefined,
      startTime: computedStartTime,
      endTime: addHours(computedStartTime, duration),
      status: BookingStatus.CONFIRMED,
      participants,
      notifyEmails,
      itRequirements: {
        vcRequired,
        createMeetingLink,
        // Explicit null (not undefined) for the side that doesn't apply to the selected mode — undefined
        // keys are dropped by JSON.stringify, so the server never clears a stale value left over from
        // switching modes on an edit (e.g. a Webex link IT generated, after the booker switches to
        // "I have a link" with their own Teams link — both would otherwise linger and show up together).
        existingLink: !createMeetingLink ? (existingLink.trim() || null) : null,
        platform: createMeetingLink ? platform : null,
        avSetup,
        supportStandby,
        // Preserve IT status and generated link on edit — don't reset to PENDING if IT already completed
        status: isEditMode && existingBooking?.itRequirements?.status
          ? existingBooking.itRequirements.status
          : (vcRequired || avSetup || supportStandby) ? 'PENDING' as const : 'COMPLETED' as const,
        // Meeting number/password are owned by whichever mode is active: the booker's own credentials
        // when they provided their own link, or IT's when a link is generated for them.
        meetingNumber: !createMeetingLink
          ? (meetingNumber.trim() || null)
          : (isEditMode ? (existingBooking?.itRequirements?.meetingNumber ?? null) : null),
        meetingPassword: !createMeetingLink
          ? (meetingPassword.trim() || null)
          : (isEditMode ? (existingBooking?.itRequirements?.meetingPassword ?? null) : null),
        generatedLink: (isEditMode && createMeetingLink) ? (existingBooking?.itRequirements?.generatedLink ?? null) : null,
      },
      serviceRequests: (Object.entries(selectedServices)
        .filter(([_, v]) => v.enabled && v.items.length > 0)
        .map(([cat, v]) => {
          const timeParts = Object.entries(v.itemTimes)
            .filter(([item, time]) => v.items.includes(item) && time)
            .map(([item, time]) => `${item} at ${time}`);
          const noteParts = [
            timeParts.length > 0 ? `Serve: ${timeParts.join(', ')}` : '',
            v.notes.trim(),
          ].filter(Boolean);
          return {
            category: cat as ServiceCategory,
            items: v.items,
            quantity: v.quantity,
            notes: noteParts.join(' | ') || undefined,
          };
        })) as unknown as ServiceRequest[],
    };

    try {
    if (isEditMode && existingBooking) {
      // Process attachment changes BEFORE calling editBooking so the confirmation
      // email fires with the final set of attachments already in the database.
      for (const attachId of attachmentsToDelete) {
        await attachmentsApi.delete(existingBooking.id, attachId).catch(e => console.error('[ATTACHMENT DELETE]', e));
      }
      if (pendingFiles.length > 0) {
        await attachmentsApi.upload(existingBooking.id, pendingFiles).catch(e => console.error('[ATTACHMENT UPLOAD]', e));
      }
      await editBooking(existingBooking.id, bookingData);
    } else if (recurrenceEnabled && recurrenceEndDate) {
      // Recurring: create multiple bookings with a shared recurrenceId
      const rule: RecurrenceRule = {
        frequency: recurrenceFrequency,
        endDate: new Date(recurrenceEndDate + 'T23:59:59'),
      };
      await addRecurringBookings(bookingData, rule, bookForUserId || undefined);
    } else {
      // For new bookings with files: defer confirmation email until after upload
      const hasFiles = pendingFiles.length > 0;
      const newId = await addBooking(bookingData, bookForUserId || undefined, hasFiles);
      if (newId) {
        if (hasFiles) {
          try {
            await attachmentsApi.upload(newId, pendingFiles);
          } catch (err: any) {
            addNotification('error', `Files uploaded for booking but some may have failed: ${err.message}`);
          }
          // Now send confirmation email with attachments included
          bookingsApi.sendConfirmation(newId).catch(e => console.error('[SEND CONFIRMATION]', e));
        }
        // Refresh the booking in context so attachments appear immediately
        await refreshBooking(newId);
      }
    }
    onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[55] flex items-center justify-center p-4 sm:p-6">
      {/* Email Prompt Modal */}
      {showEmailPrompt && (
        <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                <Mail size={20} className="text-amber-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Email Required</h3>
                <p className="text-sm text-slate-500">{emailPromptFor === 'self' ? 'Your email is needed to receive booking confirmations' : `Email is needed for ${bookForUserName} to receive booking confirmations`}</p>
              </div>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-1">Email Address</label>
              <input
                type="email"
                value={emailInput}
                onChange={e => { setEmailInput(e.target.value); setEmailError(''); }}
                onKeyDown={e => e.key === 'Enter' && handleEmailSubmit()}
                className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${emailError ? 'border-red-300' : 'border-slate-300'}`}
                placeholder="your.name@company.com"
                autoFocus
              />
              {emailError && <p className="text-xs text-red-500 mt-1">{emailError}</p>}
            </div>
            <div className="flex gap-3 justify-end">
              <button type="button" onClick={() => setShowEmailPrompt(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">
                Cancel
              </button>
              <button type="button" onClick={handleEmailSubmit} disabled={emailSaving} className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2">
                {emailSaving && <Loader2 size={14} className="animate-spin" />}
                Save & Continue
              </button>
            </div>
          </div>
        </div>
      )}
      <div
        className="bg-white w-full max-w-2xl max-h-[90vh] rounded-2xl shadow-2xl overflow-y-auto"
        style={{ animation: 'scaleUp 0.2s ease-out' }}
      >
        <style>{`@keyframes scaleUp { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }`}</style>

        {/* Header — sticky */}
        <div className="sticky top-0 z-10 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white px-6 py-5">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.1),transparent)]" />
          <div className="relative flex justify-between items-start">
            <div>
              <h3 className="text-lg font-bold">{isEditMode ? 'Edit Booking' : 'New Booking'}</h3>
              <div className="flex items-center gap-3 mt-2 text-indigo-100 text-sm">
                <span className="flex items-center gap-1.5 bg-white/15 backdrop-blur-sm px-2.5 py-1 rounded-lg">
                  <MapPin size={13} /> {selectedRoom.name}
                </span>
                <span className="flex items-center gap-1.5 bg-white/15 backdrop-blur-sm px-2.5 py-1 rounded-lg">
                  <Users size={13} /> {selectedRoom.capacity} seats
                </span>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-white/20 rounded-lg transition-colors">
              <X size={20} />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-6">
            {isCompletedBooking && (
              <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                <AlertTriangle size={16} className="text-amber-500 mt-0.5 shrink-0" />
                <p className="text-sm text-amber-800 font-medium">This meeting has already taken place and cannot be edited.</p>
              </div>
            )}

            {/* Time Bar & Warnings */}
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-3 bg-indigo-50 rounded-xl border border-indigo-100">
                <div className="p-2 bg-indigo-100 rounded-lg">
                  <Clock size={16} className="text-indigo-600" />
                </div>
                <div className="flex-1">
                  <p className="text-xs text-indigo-500 font-medium">Booking Time</p>
                  <p className="text-sm font-bold text-indigo-900">{format(computedStartTime, 'EEE, MMM d')} &bull; {format(computedStartTime, 'h:mm a')} – {format(computedEndTime, 'h:mm a')} <span className="font-normal text-indigo-500">({duration}h)</span></p>
                </div>
              </div>

              {/* Conflict Warning */}
              {hasOverlap && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2.5">
                  <div className="p-1.5 bg-amber-100 rounded-lg flex-shrink-0">
                    <AlertTriangle size={14} className="text-amber-600" />
                  </div>
                  <div className="text-sm">
                    <p className="font-semibold text-amber-800">Time Conflict</p>
                    <ul className="mt-1 space-y-0.5">
                      {conflictingBookings.map(cb => (
                        <li key={cb.id} className="text-amber-700 text-xs">
                          <strong className="font-bold text-amber-900">{cb.title}</strong> ({format(cb.startTime, 'h:mm a')} – {format(cb.endTime, 'h:mm a')})
                        </li>
                      ))}
                      {hasBlockedConflict && <li className="text-amber-700 text-xs">Blocked slot in this range</li>}
                    </ul>
                  </div>
                </div>
              )}

              {/* Past Time Warning */}
              {!isEditMode && isPastTime && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2.5">
                  <div className="p-1.5 bg-red-100 rounded-lg flex-shrink-0">
                    <AlertTriangle size={14} className="text-red-500" />
                  </div>
                  <p className="text-sm text-red-700 font-medium">Cannot book in the past.</p>
                </div>
              )}
            </div>

            <div className="space-y-8">
              {/* Schedule Section */}
              <div>
                <h4 className="text-sm font-bold text-slate-800 mb-4 border-b border-slate-100 pb-2 flex items-center gap-2">
                  <Calendar size={16} className="text-indigo-500" />
                  Schedule Details
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  <div className="md:col-span-3 relative">
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Room</label>
                    <button
                      type="button"
                      onClick={() => setRoomDropdownOpen(!roomDropdownOpen)}
                      className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 hover:bg-white transition-colors outline-none focus:ring-2 focus:ring-indigo-500 flex items-center justify-between gap-2 text-left"
                    >
                      <span className="truncate font-medium text-slate-800">{selectedRoom.name}</span>
                      <ChevronDown size={14} className={`text-slate-400 transition-transform flex-shrink-0 ${roomDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {roomDropdownOpen && (
                      <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden max-h-52 overflow-y-auto">
                        {bookableRooms.map(r => (
                          <button
                            key={r.id}
                            type="button"
                            onClick={() => { setSelectedRoomId(r.id); setRoomDropdownOpen(false); }}
                            className={`w-full px-3 py-2.5 text-left text-sm flex items-center justify-between gap-2 transition-colors ${
                              r.id === selectedRoomId
                                ? 'bg-indigo-50 text-indigo-700 font-medium'
                                : 'text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${r.id === selectedRoomId ? 'bg-indigo-500' : 'bg-slate-300'}`} />
                              <span className="truncate">{r.name}</span>
                            </div>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              <span className={`text-xs px-1.5 py-0.5 rounded-md ${r.id === selectedRoomId ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-500'}`}>{r.capacity} seats</span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-md ${r.id === selectedRoomId ? 'bg-indigo-50 text-indigo-500' : 'bg-slate-50 text-slate-400'}`}>{r.type}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Date</label>
                    <DatePicker
                      value={bookingDate}
                      onChange={val => setBookingDate(val)}
                      hasError={!!errors.date}
                    />
                    {errors.date && <p className="text-[10px] text-red-500 mt-0.5">{errors.date}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Start Time</label>
                    <div className="flex items-center gap-1">
                      <input type="number" min={1} max={12} value={bookingHourInput}
                        onChange={e => setBookingHourInput(e.target.value)}
                        onBlur={() => setBookingHourInput(String(parsedHour))}
                        className="w-12 flex-shrink-0 px-1.5 py-2.5 border border-slate-200 rounded-xl text-sm text-center focus:ring-2 focus:ring-indigo-500 outline-none bg-slate-50"
                      />
                      <span className="text-slate-300 font-bold flex-shrink-0">:</span>
                      <input type="number" min={0} max={59} value={bookingMinute}
                        onChange={e => setBookingMinute(e.target.value)}
                        onBlur={() => setBookingMinute(String(parsedMinute).padStart(2, '0'))}
                        className="w-12 flex-shrink-0 px-1.5 py-2.5 border border-slate-200 rounded-xl text-sm text-center focus:ring-2 focus:ring-indigo-500 outline-none bg-slate-50"
                      />
                      <div className="flex border border-slate-200 rounded-xl overflow-hidden flex-shrink-0">
                        <button type="button" onClick={() => setBookingAmPm('AM')}
                          className={`px-2 py-2.5 text-xs font-bold transition-colors ${bookingAmPm === 'AM' ? 'bg-indigo-600 text-white' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}
                        >AM</button>
                        <button type="button" onClick={() => setBookingAmPm('PM')}
                          className={`px-2 py-2.5 text-xs font-bold transition-colors ${bookingAmPm === 'PM' ? 'bg-indigo-600 text-white' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}
                        >PM</button>
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Duration (hrs)</label>
                    <input type="number" min={0.5} max={settings.maxBookingDuration || 10} step={0.5} value={duration}
                      onChange={(e) => setDuration(Math.max(0.5, Number(e.target.value)))}
                      className={`w-full px-3 py-2.5 border rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-slate-50 hover:bg-white transition-colors ${errors.duration ? 'border-red-300' : 'border-slate-200'}`}
                    />
                    {errors.duration && <p className="text-[10px] text-red-500 mt-0.5">{errors.duration}</p>}
                  </div>
                </div>
              </div>

              {/* Meeting Info Section */}
              <div>
                <h4 className="text-sm font-bold text-slate-800 mb-4 border-b border-slate-100 pb-2 flex items-center gap-2">
                  <Briefcase size={16} className="text-indigo-500" />
                  Meeting Information
                </h4>

                {/* Book on behalf of */}
                {canBookOnBehalf && !isEditMode && (
                  <div className="mb-5">
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Book on Behalf of</label>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setBookForDropdownOpen(!bookForDropdownOpen)}
                        className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 hover:bg-white transition-colors outline-none focus:ring-2 focus:ring-indigo-500 flex items-center justify-between gap-2 text-left"
                      >
                        <span className={`truncate ${bookForUserId ? 'font-medium text-slate-800' : 'text-slate-400'}`}>
                          {bookForUserId ? (bookForUserName || 'Selected user') : 'Myself (default)'}
                        </span>
                        <ChevronDown size={14} className={`text-slate-400 transition-transform flex-shrink-0 ${bookForDropdownOpen ? 'rotate-180' : ''}`} />
                      </button>
                      {bookForDropdownOpen && (
                        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden max-h-60">
                          <div className="p-2 border-b border-slate-100">
                            <div className="relative">
                              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                              <input
                                type="text"
                                value={bookForSearch}
                                onChange={e => setBookForSearch(e.target.value)}
                                placeholder="Search directory..."
                                className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                              />
                            </div>
                          </div>
                          <div className="max-h-48 overflow-y-auto">
                            <button
                              type="button"
                              onClick={() => {
                                setBookForUserId(null);
                                setBookForUserName('');
                                setBookForUserEmail('');
                                setBookForDropdownOpen(false);
                                setBookForSearch('');
                                setDirectoryResults([]);
                                applySelfOrgDefaults();
                              }}
                              className={`w-full px-3 py-2.5 text-left text-sm flex items-center gap-2 transition-colors ${!bookForUserId ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-slate-700 hover:bg-slate-50'}`}
                            >
                              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${!bookForUserId ? 'bg-indigo-500' : 'bg-slate-300'}`} />
                              Myself ({currentUser.name})
                            </button>
                            {directoryLoading && (
                              <div className="flex items-center gap-2 px-3 py-3 text-sm text-slate-400">
                                <Loader2 size={14} className="animate-spin" /> Searching directory...
                              </div>
                            )}
                            {(() => {
                              // Use directory results when searching, otherwise show local managedUsers
                              const userList = bookForSearch.trim().length >= 2
                                ? directoryResults.filter(u => u.active && u.id !== currentUser.id)
                                : managedUsers.filter(u => u.active && u.id !== currentUser.id);
                              if (!directoryLoading && userList.length === 0 && bookForSearch.trim().length >= 2) {
                                return <div className="px-3 py-3 text-sm text-slate-400 text-center">No users found</div>;
                              }
                              return userList.map(u => (
                                <button
                                  key={u.id}
                                  type="button"
                                  onClick={() => { setBookForUserId(u.id); setBookForUserName(u.name); setBookForUserEmail(u.email || ''); setBookForDropdownOpen(false); setBookForSearch(''); setDirectoryResults([]); }}
                                  className={`w-full px-3 py-2.5 text-left text-sm flex items-center gap-2 transition-colors ${bookForUserId === u.id ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-slate-700 hover:bg-slate-50'}`}
                                >
                                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${bookForUserId === u.id ? 'bg-indigo-500' : 'bg-slate-300'}`} />
                                  <div className="min-w-0 flex-1">
                                    <span className="truncate block">{u.name}</span>
                                    <span className="text-[10px] text-slate-400 truncate block">{u.email || u.domainId}</span>
                                  </div>
                                </button>
                              ));
                            })()}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Title <span className="text-red-400">*</span></label>
                    <input type="text" required value={title} onChange={(e) => setTitle(e.target.value)}
                      placeholder="e.g. Q3 Marketing Strategy"
                      className={`w-full px-3 py-2.5 border rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm bg-slate-50 hover:bg-white transition-colors ${errors.title ? 'border-red-300' : 'border-slate-200'}`}
                    />
                    {errors.title && <p className="text-[10px] text-red-500 mt-0.5">{errors.title}</p>}
                  </div>
                  <div className="relative">
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Company <span className="text-red-400">*</span></label>
                    <button
                      type="button"
                      onClick={() => { setCompanyDropdownOpen(!companyDropdownOpen); setDepartmentDropdownOpen(false); }}
                      className={`w-full px-3 py-2.5 border rounded-xl text-sm bg-slate-50 hover:bg-white transition-colors outline-none focus:ring-2 focus:ring-indigo-500 flex items-center justify-between gap-2 text-left ${errors.company ? 'border-red-300' : 'border-slate-200'}`}
                    >
                      <span className={`truncate ${company ? 'font-medium text-slate-800' : 'text-slate-400'}`}>{company || 'Select company'}</span>
                      <ChevronDown size={14} className={`text-slate-400 transition-transform flex-shrink-0 ${companyDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {companyDropdownOpen && (
                      <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden max-h-52 overflow-y-auto">
                        {activeCompanies.length === 0 ? (
                          <p className="px-3 py-2.5 text-sm text-slate-400">No companies configured</p>
                        ) : activeCompanies.map(c => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => {
                              setCompany(c.name);
                              setDepartment('');
                              setCompanyDropdownOpen(false);
                              // Clear the platform choice only if the newly-picked company doesn't
                              // support it — a genuine user-driven switch, not the edit-form populating.
                              if (platform && !getAvailablePlatformsForCompany(c).includes(platform as any)) {
                                setPlatform(undefined);
                              }
                            }}
                            className={`w-full px-3 py-2.5 text-left text-sm flex items-center gap-2 transition-colors ${
                              company === c.name
                                ? 'bg-indigo-50 text-indigo-700 font-medium'
                                : 'text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${company === c.name ? 'bg-indigo-500' : 'bg-slate-300'}`} />
                            <span className="truncate">{c.name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {errors.company && <p className="text-[10px] text-red-500 mt-0.5">{errors.company}</p>}
                  </div>
                  <div className="relative">
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Department <span className="text-red-400">*</span></label>
                    <button
                      type="button"
                      onClick={() => { if (company) { setDepartmentDropdownOpen(!departmentDropdownOpen); setCompanyDropdownOpen(false); } }}
                      className={`w-full px-3 py-2.5 border rounded-xl text-sm bg-slate-50 hover:bg-white transition-colors outline-none focus:ring-2 focus:ring-indigo-500 flex items-center justify-between gap-2 text-left ${!company ? 'opacity-50 cursor-not-allowed' : ''} ${errors.department ? 'border-red-300' : 'border-slate-200'}`}
                    >
                      <span className={`truncate ${department ? 'font-medium text-slate-800' : 'text-slate-400'}`}>{department || (company ? 'Select department' : 'Select company first')}</span>
                      <ChevronDown size={14} className={`text-slate-400 transition-transform flex-shrink-0 ${departmentDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {departmentDropdownOpen && company && (
                      <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden max-h-52 overflow-y-auto">
                        {filteredDepartments.length === 0 ? (
                          <p className="px-3 py-2.5 text-sm text-slate-400">No departments for this company</p>
                        ) : filteredDepartments.map(d => (
                          <button
                            key={d.id}
                            type="button"
                            onClick={() => { setDepartment(d.name); setDepartmentDropdownOpen(false); }}
                            className={`w-full px-3 py-2.5 text-left text-sm flex items-center gap-2 transition-colors ${
                              department === d.name
                                ? 'bg-indigo-50 text-indigo-700 font-medium'
                                : 'text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${department === d.name ? 'bg-indigo-500' : 'bg-slate-300'}`} />
                            <span className="truncate">{d.name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {errors.department && <p className="text-[10px] text-red-500 mt-0.5">{errors.department}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Chair Person <span className="text-red-400">*</span></label>
                    <input type="text" required value={chairPerson} onChange={(e) => setChairPerson(e.target.value)}
                      placeholder="Name of the person leading"
                      className={`w-full px-3 py-2.5 border rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm bg-slate-50 hover:bg-white transition-colors ${errors.chairPerson ? 'border-red-300' : 'border-slate-200'}`}
                    />
                    {errors.chairPerson && <p className="text-[10px] text-red-500 mt-0.5">{errors.chairPerson}</p>}
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Meeting Agenda</label>
                    <textarea value={agenda} onChange={(e) => setAgenda(e.target.value)}
                      placeholder="Enter meeting agenda or key topics..."
                      rows={3}
                      className="w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm bg-slate-50 hover:bg-white transition-colors resize-none"
                    />
                  </div>

                  {/* File Attachments */}
                  <div className="col-span-2">
                    <label className="flex text-xs font-semibold text-slate-600 mb-1 items-center gap-1.5">
                      <Paperclip size={12} />
                      Attachments
                      <span className="text-slate-400 font-normal">(max 10 files, 20 MB combined)</span>
                    </label>

                    {/* Existing attachments (edit mode) */}
                    {existingAttachments.filter(a => !attachmentsToDelete.includes(a.id)).length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-2">
                        {existingAttachments
                          .filter(a => !attachmentsToDelete.includes(a.id))
                          .map(a => (
                            <div key={a.id} className="flex items-center gap-1.5 bg-slate-100 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700">
                              <FileText size={12} className="text-slate-400 flex-shrink-0" />
                              <span className="truncate max-w-[160px]" title={a.originalName}>{a.originalName}</span>
                              <span className="text-slate-400">({(a.size / 1024).toFixed(0)} KB)</span>
                              <button type="button"
                                onClick={() => setAttachmentsToDelete(prev => [...prev, a.id])}
                                className="text-slate-400 hover:text-red-500 transition-colors ml-0.5">
                                <X size={12} />
                              </button>
                            </div>
                          ))}
                      </div>
                    )}

                    {/* Pending new files */}
                    {pendingFiles.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-2">
                        {pendingFiles.map((f, i) => (
                          <div key={i} className="flex items-center gap-1.5 bg-indigo-50 border border-indigo-200 rounded-lg px-2.5 py-1.5 text-xs text-indigo-700">
                            <FileText size={12} className="text-indigo-400 flex-shrink-0" />
                            <span className="truncate max-w-[160px]" title={f.name}>{f.name}</span>
                            <span className="text-indigo-400">({(f.size / 1024).toFixed(0)} KB)</span>
                            <button type="button"
                              onClick={() => setPendingFiles(prev => prev.filter((_, j) => j !== i))}
                              className="text-indigo-400 hover:text-red-500 transition-colors ml-0.5">
                              <X size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Drop zone / file picker */}
                    <button type="button"
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={e => e.preventDefault()}
                      onDrop={e => {
                        e.preventDefault();
                        const keptExisting = existingAttachments.filter(a => !attachmentsToDelete.includes(a.id));
                        const existingSize = keptExisting.reduce((s, a) => s + a.size, 0);
                        const currentPendingSize = pendingFiles.reduce((s, f) => s + f.size, 0);
                        const limit = 10 - keptExisting.length;
                        const dropped: File[] = [];
                        let runningSize = existingSize + currentPendingSize;
                        for (const f of Array.from(e.dataTransfer.files)) {
                          if (f.size > MAX_FILE_SIZE) { addNotification('warning', `"${f.name}" exceeds 20 MB per-file limit and was skipped.`); continue; }
                          if (runningSize + f.size > COMBINED_SIZE_LIMIT) { addNotification('warning', 'Combined attachment size would exceed 20 MB. Some files were skipped.'); break; }
                          dropped.push(f);
                          runningSize += f.size;
                        }
                        setPendingFiles(prev => [...prev, ...dropped].slice(0, Math.max(0, prev.length + limit)));
                      }}
                      className="w-full border-2 border-dashed border-slate-200 rounded-xl py-3 px-4 text-xs text-slate-400 hover:border-indigo-300 hover:text-indigo-500 transition-colors flex items-center justify-center gap-2"
                    >
                      <Paperclip size={14} />
                      Click to add files or drag &amp; drop here
                    </button>
                    <input ref={fileInputRef} type="file" multiple accept={ALLOWED_EXTENSIONS} className="hidden"
                      onChange={e => {
                        const keptExisting = existingAttachments.filter(a => !attachmentsToDelete.includes(a.id));
                        const existingSize = keptExisting.reduce((s, a) => s + a.size, 0);
                        const currentPendingSize = pendingFiles.reduce((s, f) => s + f.size, 0);
                        const limit = 10 - keptExisting.length;
                        const picked: File[] = [];
                        let runningSize = existingSize + currentPendingSize;
                        for (const f of Array.from(e.target.files || [])) {
                          if (f.size > MAX_FILE_SIZE) { addNotification('warning', `"${f.name}" exceeds 20 MB per-file limit and was skipped.`); continue; }
                          if (runningSize + f.size > COMBINED_SIZE_LIMIT) { addNotification('warning', 'Combined attachment size would exceed 20 MB. Some files were skipped.'); break; }
                          picked.push(f);
                          runningSize += f.size;
                        }
                        setPendingFiles(prev => [...prev, ...picked].slice(0, Math.max(0, prev.length + limit)));
                        e.target.value = '';
                      }}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Participants</label>
                    <input type="number" min={1} max={100} value={participants}
                      onChange={(e) => setParticipants(Number(e.target.value))}
                      className={`w-full px-3 py-2.5 border rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-slate-50 hover:bg-white transition-colors ${capacityExceeded ? 'border-amber-300' : 'border-slate-200'}`}
                    />
                    {capacityExceeded && <p className="text-[10px] text-amber-600 mt-0.5">Exceeds capacity ({selectedRoom.capacity})</p>}
                  </div>
                </div>
              </div>
            </div>

            {/* Notify Emails — collapsible */}
            <div className="border border-slate-200 rounded-xl">
              <button type="button"
                onClick={() => setNotifySectionOpen(!notifySectionOpen)}
                className="w-full px-4 py-3 flex items-center justify-between bg-slate-50 hover:bg-slate-100 transition-colors rounded-xl"
              >
                <span className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <Mail size={15} className="text-slate-400" />
                  Notify Others
                  {notifyEmails.length > 0 && <span className="text-[10px] bg-indigo-100 text-indigo-700 font-bold px-1.5 py-0.5 rounded-full">{notifyEmails.length}</span>}
                </span>
                <ChevronDown size={16} className={`text-slate-400 transition-transform ${notifySectionOpen ? 'rotate-180' : ''}`} />
              </button>
              {notifySectionOpen && <div className="p-4 border-t border-slate-200 space-y-3">
                {/* User search dropdown */}
                <div className="relative">
                  <label className="block text-[10px] text-slate-500 mb-1 uppercase tracking-wider font-semibold">Search Users</label>
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input type="text" value={userSearchQuery}
                      onChange={e => { setUserSearchQuery(e.target.value); setNotifyDropdownOpen(true); }}
                      onFocus={() => setNotifyDropdownOpen(true)}
                      onBlur={() => { setTimeout(() => setNotifyDropdownOpen(false), 400); }}
                      placeholder="Search users by name or email..."
                      className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-slate-50"
                    />
                  </div>
                  {notifyDropdownOpen && (() => {
                    const q = userSearchQuery.trim().toLowerCase();
                    // Use directory results when searching (2+ chars), otherwise show local managedUsers
                    const sourceUsers = q.length >= 2 ? notifyDirResults : managedUsers;
                    const availableUsers = sourceUsers.filter(u =>
                      u.active &&
                      u.id !== currentUser.id &&
                      !notifyEmails.includes(u.email) &&
                      (q.length < 2 || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || u.domainId.toLowerCase().includes(q))
                    );
                    if (notifyDirLoading) return (
                      <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
                        <div className="flex items-center gap-2 px-3 py-3 text-sm text-slate-400">
                          <Loader2 size={14} className="animate-spin" /> Searching directory...
                        </div>
                      </div>
                    );
                    return availableUsers.length > 0 ? (
                      <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden max-h-52 overflow-y-auto">
                        {availableUsers.map(u => (
                          <button
                            key={u.id}
                            type="button"
                            onClick={() => {
                              setNotifyEmails(prev => [...prev, u.email]);
                              setUserSearchQuery('');
                              setNotifyDropdownOpen(false);
                            }}
                            className="w-full px-3 py-2 text-left flex items-center gap-2.5 transition-colors text-slate-700 hover:bg-indigo-50"
                          >
                            <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                              <User size={13} className="text-indigo-600" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-slate-800 truncate">{u.name}</p>
                              <p className="text-[10px] text-slate-400 truncate">{u.email}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : q ? (
                      <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
                        <p className="px-3 py-2.5 text-sm text-slate-400">No matching users found</p>
                      </div>
                    ) : null;
                  })()}
                </div>

                {/* Manual email input */}
                <div>
                  <label className="block text-[10px] text-slate-500 mb-1 uppercase tracking-wider font-semibold">Or Add Email Manually</label>
                  <div className="flex gap-2">
                    <input type="email" value={manualEmailInput}
                      onChange={e => setManualEmailInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const email = manualEmailInput.trim().toLowerCase();
                          if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !notifyEmails.includes(email)) {
                            setNotifyEmails(prev => [...prev, email]);
                            setManualEmailInput('');
                          }
                        }
                      }}
                      placeholder="Enter email address..."
                      className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-slate-50"
                    />
                    <button type="button"
                      onClick={() => {
                        const email = manualEmailInput.trim().toLowerCase();
                        if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !notifyEmails.includes(email)) {
                          setNotifyEmails(prev => [...prev, email]);
                          setManualEmailInput('');
                        }
                      }}
                      className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-1"
                    >
                      <Plus size={14} /> Add
                    </button>
                  </div>
                </div>

                {notifyEmails.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {notifyEmails.map(email => {
                      const matchedUser = managedUsersByEmail.get(email);
                      return (
                        <span key={email} className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full text-[11px] font-medium border border-indigo-100">
                          {matchedUser ? matchedUser.name : email}
                          <button type="button" onClick={() => setNotifyEmails(prev => prev.filter(e => e !== email))} className="text-indigo-300 hover:text-red-500">
                            <XCircle size={12} />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>}
            </div>
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <button type="button"
                onClick={() => setItSectionOpen(!itSectionOpen)}
                className="w-full px-4 py-3 flex items-center justify-between bg-slate-50 hover:bg-slate-100 transition-colors"
              >
                <span className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <Monitor size={15} className="text-indigo-500" />
                  IT & VC Requirements
                  {(vcRequired || avSetup || supportStandby) && <span className="w-2 h-2 bg-indigo-500 rounded-full" />}
                </span>
                <ChevronDown size={16} className={`text-slate-400 transition-transform ${itSectionOpen ? 'rotate-180' : ''}`} />
              </button>
              {itSectionOpen && <div className="p-4 border-t border-slate-200 space-y-3">
                {/* VC Required */}
                <label className="flex items-center gap-3 cursor-pointer group p-2 rounded-lg hover:bg-slate-50 -mx-2 transition-colors">
                  <div className="relative flex items-center">
                    <input type="checkbox" checked={vcRequired} onChange={(e) => setVcRequired(e.target.checked)}
                      className="peer h-5 w-5 cursor-pointer appearance-none rounded-md border border-slate-300 transition-all checked:border-indigo-600 checked:bg-indigo-600"
                    />
                    <span className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-white opacity-0 peer-checked:opacity-100">
                      <CheckCircle size={14} />
                    </span>
                  </div>
                  <div>
                    <span className="font-medium text-sm text-slate-800">Video Conferencing</span>
                    <p className="text-[10px] text-slate-400">Request VC setup for this meeting</p>
                  </div>
                </label>

                {vcRequired && (
                  <div className="p-3 bg-indigo-50/50 rounded-xl border border-indigo-100 space-y-3">
                    <div className="flex flex-wrap gap-2">
                      <label className={`flex items-center gap-2 cursor-pointer px-3 py-2 rounded-lg border transition-all text-sm ${createMeetingLink ? 'border-indigo-300 bg-indigo-50 text-indigo-700 font-medium' : 'border-slate-200 text-slate-600 hover:border-indigo-200'}`}>
                        <input type="radio" name="linkType" checked={createMeetingLink} onChange={() => setCreateMeetingLink(true)} className="sr-only" />
                        <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${createMeetingLink ? 'border-indigo-600' : 'border-slate-300'}`}>
                          {createMeetingLink && <div className="w-1.5 h-1.5 bg-indigo-600 rounded-full" />}
                        </div>
                        Need link created
                      </label>
                      <label className={`flex items-center gap-2 cursor-pointer px-3 py-2 rounded-lg border transition-all text-sm ${!createMeetingLink ? 'border-indigo-300 bg-indigo-50 text-indigo-700 font-medium' : 'border-slate-200 text-slate-600 hover:border-indigo-200'}`}>
                        <input type="radio" name="linkType" checked={!createMeetingLink} onChange={() => setCreateMeetingLink(false)} className="sr-only" />
                        <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${!createMeetingLink ? 'border-indigo-600' : 'border-slate-300'}`}>
                          {!createMeetingLink && <div className="w-1.5 h-1.5 bg-indigo-600 rounded-full" />}
                        </div>
                        I have a link
                      </label>
                    </div>

                    {createMeetingLink ? (
                      <div>
                        <p className="text-[10px] text-slate-500 mb-2 uppercase tracking-wider font-semibold">Select Platform</p>
                        {availablePlatforms.length > 0 ? (
                          <div className="grid grid-cols-2 gap-1.5">
                            {availablePlatforms.map((p) => (
                              <button key={p} type="button" onClick={() => setPlatform(p)}
                                className={`px-2 py-2 text-xs font-medium rounded-lg border transition-all ${
                                  platform === p ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm' : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-300 hover:bg-indigo-50'
                                }`}
                              >{p}</button>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-slate-400 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                            {selectedCompanyObj ? 'No meeting platforms are configured for this company yet.' : 'Select a company to see available platforms.'} Choose &ldquo;I have a link&rdquo; instead if you already have one.
                          </p>
                        )}
                        {errors.platform && <p className="text-[10px] text-red-500 mt-1">{errors.platform}</p>}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div>
                          <label className="block text-[10px] text-slate-500 mb-1 uppercase tracking-wider font-semibold">Meeting Link</label>
                          <input type="url" value={existingLink} onChange={(e) => setExistingLink(e.target.value)}
                            className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none ${errors.existingLink ? 'border-red-300' : 'border-slate-200'}`}
                            placeholder="https://..."
                          />
                          {errors.existingLink && <p className="text-[10px] text-red-500 mt-0.5">{errors.existingLink}</p>}
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[10px] text-slate-500 mb-1 uppercase tracking-wider font-semibold">Meeting ID</label>
                            <input type="text" value={meetingNumber} onChange={(e) => setMeetingNumber(e.target.value)}
                              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                              placeholder="123 456 789"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-slate-500 mb-1 uppercase tracking-wider font-semibold">Password</label>
                            <input type="text" value={meetingPassword} onChange={(e) => setMeetingPassword(e.target.value)}
                              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                              placeholder="abc123"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* AV Setup */}
                <label className="flex items-center gap-3 cursor-pointer group p-2 rounded-lg hover:bg-slate-50 -mx-2 transition-colors">
                  <div className="relative flex items-center">
                    <input type="checkbox" checked={avSetup} onChange={(e) => setAvSetup(e.target.checked)}
                      className="peer h-5 w-5 cursor-pointer appearance-none rounded-md border border-slate-300 transition-all checked:border-indigo-600 checked:bg-indigo-600"
                    />
                    <span className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-white opacity-0 peer-checked:opacity-100">
                      <CheckCircle size={14} />
                    </span>
                  </div>
                  <div>
                    <span className="font-medium text-sm text-slate-800">Presentation</span>
                    <p className="text-[10px] text-slate-400">IT will prepare room equipment</p>
                  </div>
                </label>

                {/* Support Standby */}
                <label className="flex items-center gap-3 cursor-pointer group p-2 rounded-lg hover:bg-slate-50 -mx-2 transition-colors">
                  <div className="relative flex items-center">
                    <input type="checkbox" checked={supportStandby} onChange={(e) => setSupportStandby(e.target.checked)}
                      className="peer h-5 w-5 cursor-pointer appearance-none rounded-md border border-slate-300 transition-all checked:border-indigo-600 checked:bg-indigo-600"
                    />
                    <span className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-white opacity-0 peer-checked:opacity-100">
                      <CheckCircle size={14} />
                    </span>
                  </div>
                  <div>
                    <span className="font-medium text-sm text-slate-800">IT Support Standby</span>
                    <p className="text-[10px] text-slate-400">VIP — IT staff on-site during meeting</p>
                  </div>
                </label>
              </div>}
            </div>

            {/* Administration Services — collapsible */}
            <div className="border border-slate-200 dark:border-slate-600 rounded-xl overflow-hidden">
              <button type="button"
                onClick={() => setServicesSectionOpen(!servicesSectionOpen)}
                className="w-full px-4 py-3 flex items-center justify-between bg-slate-50 dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors"
              >
                <span className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                  <Coffee size={15} className="text-amber-500" />
                  Administration Services
                  {Object.values(selectedServices).some(v => v.enabled && v.items.length > 0) && <span className="w-2 h-2 bg-amber-500 rounded-full" />}
                </span>
                <ChevronDown size={16} className={`text-slate-400 transition-transform ${servicesSectionOpen ? 'rotate-180' : ''}`} />
              </button>
              {servicesSectionOpen && (
                <div className="p-4 border-t border-slate-200 dark:border-slate-600 space-y-4">
                  <p className="text-xs text-slate-400">Request snacks, stationery, or equipment for your meeting. Reception/Admin will arrange these.</p>

                  {([ServiceCategory.FOOD_BEVERAGE, ServiceCategory.STATIONERY, ServiceCategory.EQUIPMENT, ServiceCategory.OTHER] as ServiceCategory[]).map(cat => {
                    const svc = selectedServices[cat];
                    const catItems = SERVICE_ITEMS[cat];
                    const label = SERVICE_CATEGORY_LABELS[cat];
                    const icons: Record<string, React.ReactNode> = {
                      [ServiceCategory.FOOD_BEVERAGE]: <Coffee size={14} className="text-amber-500" />,
                      [ServiceCategory.STATIONERY]: <Package size={14} className="text-blue-500" />,
                      [ServiceCategory.EQUIPMENT]: <Monitor size={14} className="text-purple-500" />,
                      [ServiceCategory.OTHER]: <Package size={14} className="text-slate-500" />,
                    };
                    return (
                      <div key={cat}>
                        <label className="flex items-center gap-3 cursor-pointer group p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 -mx-2 transition-colors">
                          <div className="relative flex items-center">
                            <input type="checkbox" checked={svc.enabled}
                              onChange={(e) => setSelectedServices(prev => ({ ...prev, [cat]: { ...prev[cat], enabled: e.target.checked } }))}
                              className="peer h-5 w-5 cursor-pointer appearance-none rounded-md border border-slate-300 dark:border-slate-500 transition-all checked:border-amber-600 checked:bg-amber-600"
                            />
                            <span className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-white opacity-0 peer-checked:opacity-100">
                              <CheckCircle size={14} />
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            {icons[cat]}
                            <span className="font-medium text-sm text-slate-800 dark:text-slate-200">{label}</span>
                          </div>
                        </label>

                        {svc.enabled && (
                          <div className="ml-8 mt-2 p-3 bg-amber-50/50 dark:bg-slate-700/60 rounded-xl border border-amber-100 dark:border-slate-600 space-y-3">
                            {catItems.length > 0 && (
                              <div className="flex flex-wrap gap-1.5">
                                {catItems.map(item => {
                                  const selected = svc.items.includes(item);
                                  return (
                                    <button key={item} type="button"
                                      onClick={() => {
                                        setSelectedServices(prev => ({
                                          ...prev,
                                          [cat]: {
                                            ...prev[cat],
                                            items: selected ? prev[cat].items.filter(i => i !== item) : [...prev[cat].items, item],
                                          },
                                        }));
                                      }}
                                      className={`px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                                        selected
                                          ? 'bg-amber-600 border-amber-600 text-white shadow-sm'
                                          : 'bg-white dark:bg-slate-600 border-slate-200 dark:border-slate-500 text-slate-600 dark:text-slate-200 hover:border-amber-300 hover:bg-amber-50 dark:hover:bg-slate-500'
                                      }`}
                                    >{item}</button>
                                  );
                                })}
                              </div>
                            )}
                            {/* Serve time inputs for Tea/Coffee and Food/Meal */}
                            {cat === ServiceCategory.FOOD_BEVERAGE && (() => {
                              const timeItems = svc.items.filter(i => i === 'Tea/Coffee' || i === 'Food/Meal');
                              if (timeItems.length === 0) return null;
                              const pad = (n: number) => String(n).padStart(2, '0');
                              const minTime = `${pad(computedStartTime.getHours())}:${pad(computedStartTime.getMinutes())}`;
                              const maxTime = `${pad(computedEndTime.getHours())}:${pad(computedEndTime.getMinutes())}`;
                              return (
                                <div className="space-y-2">
                                  <label className="block text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold">
                                    Serve Time <span className="normal-case font-normal text-slate-400 dark:text-slate-500">({minTime} – {maxTime})</span>
                                  </label>
                                  {timeItems.map(item => (
                                    <div key={item} className="flex items-center gap-3">
                                      <span className="text-xs text-slate-600 dark:text-slate-300 w-20 shrink-0">{item}</span>
                                      <input
                                        type="time"
                                        min={minTime}
                                        max={maxTime}
                                        value={svc.itemTimes[item] || ''}
                                        onChange={e => {
                                          const val = e.target.value;
                                          if (val && (val < minTime || val > maxTime)) return;
                                          setSelectedServices(prev => ({
                                            ...prev,
                                            [cat]: { ...prev[cat], itemTimes: { ...prev[cat].itemTimes, [item]: val } },
                                          }));
                                        }}
                                        className="px-2.5 py-1.5 text-sm border border-slate-200 dark:border-slate-500 rounded-lg focus:ring-2 focus:ring-amber-400 outline-none bg-white dark:bg-slate-600 text-slate-800 dark:text-slate-100"
                                      />
                                    </div>
                                  ))}
                                </div>
                              );
                            })()}
                            {cat === ServiceCategory.FOOD_BEVERAGE && (
                              <div>
                                <label className="block text-[10px] text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wider font-semibold">No. of People</label>
                                <input type="number" min={1} max={200} value={svc.quantity}
                                  onChange={e => setSelectedServices(prev => ({ ...prev, [cat]: { ...prev[cat], quantity: Math.max(1, Number(e.target.value)) } }))}
                                  className="w-24 px-3 py-1.5 text-sm border border-slate-200 dark:border-slate-500 rounded-lg focus:ring-2 focus:ring-amber-400 outline-none bg-white dark:bg-slate-600 text-slate-800 dark:text-slate-100"
                                />
                              </div>
                            )}
                            <div>
                              <label className="block text-[10px] text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wider font-semibold">Special Instructions</label>
                              <input type="text" value={svc.notes}
                                onChange={e => setSelectedServices(prev => ({ ...prev, [cat]: { ...prev[cat], notes: e.target.value } }))}
                                placeholder={cat === ServiceCategory.FOOD_BEVERAGE ? 'e.g. No sugar, vegan options...' : 'Any specific requirements...'}
                                className="w-full px-3 py-1.5 text-sm border border-slate-200 dark:border-slate-500 rounded-lg focus:ring-2 focus:ring-amber-400 outline-none bg-white dark:bg-slate-600 text-slate-800 dark:text-slate-100 placeholder:text-slate-400"
                              />
                            </div>
                            {cat === ServiceCategory.OTHER && (
                              <>
                                {svc.items.length > 0 && (
                                  <div className="flex flex-wrap gap-1.5">
                                    {svc.items.map(item => (
                                      <span key={item} className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-[11px] font-medium border border-amber-200">
                                        {item}
                                        <button type="button" onClick={() => setSelectedServices(prev => ({ ...prev, [cat]: { ...prev[cat], items: prev[cat].items.filter(i => i !== item) } }))} className="text-amber-400 hover:text-red-500">
                                          <XCircle size={12} />
                                        </button>
                                      </span>
                                    ))}
                                  </div>
                                )}
                                <div>
                                  <label className="block text-[10px] text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wider font-semibold">Item Name</label>
                                  <div className="flex gap-2">
                                    <input type="text" ref={otherItemInputRef}
                                      placeholder="Type item name..."
                                      className="flex-1 px-3 py-1.5 text-sm border border-slate-200 dark:border-slate-500 rounded-lg focus:ring-2 focus:ring-amber-400 outline-none bg-white dark:bg-slate-600 text-slate-800 dark:text-slate-100 placeholder:text-slate-400"
                                      onKeyDown={e => {
                                        if (e.key === 'Enter') {
                                          e.preventDefault();
                                          const val = otherItemInputRef.current?.value.trim();
                                          if (val && !svc.items.includes(val)) {
                                            setSelectedServices(prev => ({ ...prev, [cat]: { ...prev[cat], items: [...prev[cat].items, val] } }));
                                            if (otherItemInputRef.current) otherItemInputRef.current.value = '';
                                          }
                                        }
                                      }}
                                    />
                                    <button type="button"
                                      onClick={() => {
                                        const val = otherItemInputRef.current?.value.trim();
                                        if (val && !svc.items.includes(val)) {
                                          setSelectedServices(prev => ({ ...prev, [cat]: { ...prev[cat], items: [...prev[cat].items, val] } }));
                                          if (otherItemInputRef.current) otherItemInputRef.current.value = '';
                                        }
                                      }}
                                      className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium rounded-lg transition-colors"
                                    >Add</button>
                                  </div>
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Recurrence Section (new bookings only) ─────────────────────── */}
            {!isEditMode && (
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setRecurrenceEnabled(!recurrenceEnabled)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-sm font-medium text-slate-700"
                >
                  <span className="flex items-center gap-2">
                    <Repeat size={15} className="text-indigo-500" />
                    Repeat Booking
                  </span>
                  <div className={`w-8 h-4 rounded-full transition-colors relative ${recurrenceEnabled ? 'bg-indigo-600' : 'bg-slate-300'}`}>
                    <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${recurrenceEnabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </div>
                </button>
                {recurrenceEnabled && (
                  <div className="px-4 py-3 space-y-3">
                    <div className="flex gap-2">
                      {(['daily', 'weekly', 'biweekly', 'monthly'] as RecurrenceFrequency[]).map(f => (
                        <button
                          key={f}
                          type="button"
                          onClick={() => setRecurrenceFrequency(f)}
                          className={`flex-1 py-1.5 text-xs font-medium rounded-lg border transition-colors capitalize ${recurrenceFrequency === f ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-300 hover:border-indigo-400'}`}
                        >
                          {f}
                        </button>
                      ))}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Repeat Until</label>
                      <DatePicker
                        value={recurrenceEndDate}
                        onChange={setRecurrenceEndDate}
                        minDate={computedStartTime}
                      />
                    </div>
                    {recurrenceEndDate && (
                      <p className="text-xs text-indigo-600 bg-indigo-50 rounded-lg px-3 py-2">
                        Repeats <span className="font-semibold">{recurrenceFrequency}</span> from{' '}
                        <span className="font-semibold">{format(computedStartTime, 'MMM d')}</span> until{' '}
                        <span className="font-semibold">{format(new Date(recurrenceEndDate + 'T00:00:00'), 'MMM d, yyyy')}</span>
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Footer */}
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={onClose}
                className="flex-1 px-4 py-2.5 text-slate-600 font-semibold bg-white border border-slate-200 hover:bg-slate-100 rounded-xl transition-colors text-sm"
              >Cancel</button>
              <button type="submit"
                className="flex-1 px-4 py-2.5 text-white font-bold bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-lg shadow-indigo-200 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed text-sm flex items-center justify-center gap-2"
              disabled={hasOverlap || !!isCompletedBooking || isSubmitting}
              >{isSubmitting ? <><Loader2 size={15} className="animate-spin" />{isEditMode ? 'Saving…' : 'Booking…'}</> : isEditMode ? 'Save Changes' : 'Confirm Booking'}</button>
            </div>

          </div>
        </form>
      </div>
    </div>
  );
};
