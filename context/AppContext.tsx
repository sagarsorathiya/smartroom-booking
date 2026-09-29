import React, { createContext, useContext, useState, useEffect, useRef, ReactNode, useCallback } from 'react';
import { Booking, Room, User, UserRole, ITRequirements, AuditLogEntry, AuditAction, BlockedSlot, AppNotification, BookingStatus, PortalSettings, LdapSettings, SmtpSettings, VcIntegrationSettings, VcAvailability, Company, Department, Designation, ManagedUser, DatabaseSettings, ExportManifest, RoomBlockConfig, Facility, ServiceRequest, ServiceStatus, RecurrenceRule } from '../types';
import { MOCK_ROOMS, MOCK_USERS, INITIAL_BOOKINGS } from '../constants';
import { authApi, roomsApi, bookingsApi, usersApi, companiesApi, departmentsApi, designationsApi, blockedSlotsApi, auditApi, settingsApi, vcAvailabilityApi, seedApi, blocksApi, facilitiesApi, serviceRequestsApi } from '../services/api';

interface AppState {
  currentUser: User;
  isAuthenticated: boolean;
  rooms: Room[];
  bookings: Booking[];
  viewDate: Date;
  auditLog: AuditLogEntry[];
  blockedSlots: BlockedSlot[];
  notifications: AppNotification[];
  settings: PortalSettings;
  ldapSettings: LdapSettings;
  smtpSettings: SmtpSettings;
  vcIntegrationSettings: VcIntegrationSettings;
  vcAvailability: VcAvailability;
  managedUsers: ManagedUser[];
  companies: Company[];
  departments: Department[];
  designations: Designation[];
  databaseSettings: DatabaseSettings;
  roomBlocks: RoomBlockConfig[];
  facilityList: Facility[];
}

interface AppContextType extends AppState {
  login: (domainId: string, password: string) => Promise<string | null>;
  loginByDomainId: (domainId: string) => Promise<boolean>;
  tryNegotiateLogin: () => Promise<boolean>;
  restoreSession: () => Promise<boolean>;
  logout: () => void;
  setCurrentUser: (user: User) => void;
  addBooking: (booking: Omit<Booking, 'id' | 'userName' | 'userId'>, bookForUserId?: string, deferEmail?: boolean) => Promise<string | null>;
  addRecurringBookings: (bookingData: Omit<Booking, 'id' | 'userName' | 'userId'>, rule: RecurrenceRule, bookForUserId?: string) => Promise<number>;
  editBooking: (id: string, updates: Partial<Omit<Booking, 'id' | 'userId' | 'userName'>>) => Promise<boolean>;
  updateBookingStatus: (id: string, status: Booking['status'], cancellationReason?: string) => void;
  cancelBookingSeries: (recurrenceId: string, fromNow?: boolean, cancellationReason?: string) => Promise<void>;
  updateITStatus: (bookingId: string, status: ITRequirements['status'], generatedLink?: string, meetingNumber?: string, meetingPassword?: string) => void;
  archiveITTask: (bookingId: string, archived: boolean) => void;
  generateVcLink: (bookingId: string, options?: { lockMeeting?: boolean }) => Promise<boolean>;
  updateVcLinkTime: (bookingId: string) => Promise<boolean>;
  setViewDate: (date: Date) => void;
  switchRole: (role: UserRole) => void;
  hasConflict: (roomId: string, startTime: Date, endTime: Date, excludeBookingId?: string) => boolean;

  // Room Management
  addRoom: (room: Omit<Room, 'id'>) => void;
  updateRoom: (room: Room) => void;
  deleteRoom: (id: string) => void;

  // Blocked Slots
  addBlockedSlot: (slot: Omit<BlockedSlot, 'id'>) => void;
  removeBlockedSlot: (id: string) => void;

  // Notifications
  addNotification: (type: AppNotification['type'], message: string) => void;
  markNotificationRead: (id: string) => void;
  clearNotifications: () => void;

  // Utility
  isRoleAllowed: (allowedRoles: UserRole[]) => boolean;
  updateSettings: (updates: Partial<PortalSettings>) => void;
  updateLdapSettings: (updates: Partial<LdapSettings>) => void;
  updateSmtpSettings: (updates: Partial<SmtpSettings>) => void;
  updateVcIntegrationSettings: (newSettings: VcIntegrationSettings) => void;

  // User Management
  addManagedUser: (user: Omit<ManagedUser, 'id'>) => void;
  updateManagedUser: (user: ManagedUser) => void;
  deleteManagedUser: (id: string) => void;

  // Company & Department
  addCompany: (company: Omit<Company, 'id'>) => void;
  updateCompany: (company: Company) => void;
  deleteCompany: (id: string) => void;
  addDepartment: (dept: Omit<Department, 'id'>) => void;
  updateDepartment: (dept: Department) => void;
  deleteDepartment: (id: string) => void;
  addDesignation: (desig: Omit<Designation, 'id'>) => void;
  updateDesignation: (desig: Designation) => void;
  deleteDesignation: (id: string) => void;

  // Block Management
  addBlock: (block: Omit<RoomBlockConfig, 'id'>) => void;
  updateBlock: (block: RoomBlockConfig) => void;
  deleteBlock: (id: string) => void;

  // Facility Management
  addFacility: (facility: Omit<Facility, 'id'>) => void;
  updateFacility: (facility: Facility) => void;
  deleteFacility: (id: string) => void;

  // Import / Export
  exportData: (sections: string[]) => Promise<string>;
  importData: (json: string) => Promise<{ success: boolean; message: string }>;
  refreshData: () => Promise<void>;
  refreshBooking: (id: string) => Promise<void>;

  // Service Requests
  updateServiceStatus: (requestId: string, status: ServiceStatus) => Promise<void>;

  // Profile setup
  needsProfileSetup: boolean;
  updateMyProfile: (data: Partial<{ companyId: string; departmentId: string; designationId: string }>) => Promise<boolean>;
  updateUserEmail: (email: string) => Promise<boolean>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const generateId = (): string => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
};

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User>(MOCK_USERS[0]);
  const currentUserRef = useRef<User>(MOCK_USERS[0]);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [viewDate, setViewDate] = useState<Date>(new Date());
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [blockedSlots, setBlockedSlots] = useState<BlockedSlot[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [settings, setSettings] = useState<PortalSettings>({
    portalName: 'ConferenceHub',
    maxBookingDuration: 10,
    maxAdvanceBookingDays: 365,
    autoApproveBookings: true,
    requireApprovalAboveCapacity: 0,
    allowWeekendBookings: true,
    maintenanceMode: false,
    maintenanceMessage: '',
    emailNotifications: true,
    itAutoAssign: true,
  });
  const [ldapSettings, setLdapSettings] = useState<LdapSettings>({
    enabled: false,
    serverUrl: '',
    port: 389,
    useSsl: false,
    bindDn: '',
    bindPassword: '',
    baseDn: '',
    userSearchFilter: '(sAMAccountName={0})',
    usernameAttribute: 'sAMAccountName',
    emailAttribute: 'mail',
    displayNameAttribute: 'displayName',
    groupSearchBase: '',
    adminGroupDn: '',
    itGroupDn: '',
    receptionGroupDn: '',
    administrationGroupDn: '',
    connectionTimeout: 5000,
    searchTimeout: 10000,
  });
  const [smtpSettings, setSmtpSettings] = useState<SmtpSettings>({
    enabled: false,
    host: '',
    port: 587,
    useTls: true,
    username: '',
    password: '',
    fromAddress: '',
    fromName: 'ConferenceHub',
    replyToAddress: '',
    sendBookingConfirmation: true,
    sendCancellationNotice: true,
    sendITTaskNotification: true,
    sendDailyDigest: false,
    ccReception: true,
  });
  const [vcIntegrationSettings, setVcIntegrationSettings] = useState<VcIntegrationSettings>({
    googleMeet: { companies: {} },
    webex: { enabled: false, companies: [], accounts: [] },
  });
  const [vcAvailability, setVcAvailability] = useState<VcAvailability>({
    googleMeet: { companies: [] },
    webex: { enabled: false, companies: [], accounts: [] },
  });
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [databaseSettings, setDatabaseSettings] = useState<DatabaseSettings>({
    enabled: true,
    host: 'localhost',
    port: 5432,
    database: 'crb',
    username: 'postgres',
    password: '********',
  });
  const [roomBlocks, setRoomBlocks] = useState<RoomBlockConfig[]>([]);
  const [facilityList, setFacilityList] = useState<Facility[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);

  // Track which booking ids have already fired the "starts in 15 min" notification
  // so we don't re-notify on every interval tick.
  const notifiedUpcomingRef = useRef<Set<string>>(new Set());

  // Load all data from API
  const refreshData = useCallback(async () => {
    const role = currentUserRef.current?.role;
    const isAdmin = role === UserRole.ADMIN;
    const isElevated = [UserRole.ADMIN, UserRole.RECEPTION, UserRole.ADMINISTRATION].includes(role as UserRole);
    try {
      const [roomsData, bookingsData, usersData, companiesData, depsData, desigsData, slotsData, auditData, portalData, ldapData, smtpData, dbData, blocksData, facilitiesData, vcIntegrationData, vcAvailabilityData] = await Promise.all([
        roomsApi.getAll().catch(() => []),
        bookingsApi.getAll().catch(() => []),
        isElevated ? usersApi.getAll().catch(() => []) : Promise.resolve([]),
        companiesApi.getAll().catch(() => []),
        departmentsApi.getAll().catch(() => []),
        designationsApi.getAll().catch(() => []),
        blockedSlotsApi.getAll().catch(() => []),
        isAdmin ? auditApi.getAll(500).catch(() => []) : Promise.resolve([]),
        settingsApi.getPortal().catch(() => null),
        isAdmin ? settingsApi.getLdap().catch(() => null) : Promise.resolve(null),
        isAdmin ? settingsApi.getSmtp().catch(() => null) : Promise.resolve(null),
        isAdmin ? settingsApi.getDatabase().catch(() => null) : Promise.resolve(null),
        blocksApi.getAll().catch(() => []),
        facilitiesApi.getAll().catch(() => []),
        isAdmin ? settingsApi.getVcIntegration().catch(() => null) : Promise.resolve(null),
        vcAvailabilityApi.get().catch(() => null),
      ]);
      setRooms(roomsData);
      setBookings(bookingsData.map((b: any) => ({ ...b, startTime: new Date(b.startTime), endTime: new Date(b.endTime), editedAt: b.editedAt ? new Date(b.editedAt) : undefined, serviceRequests: (b.serviceRequests || []).map((sr: any) => ({ ...sr, completedAt: sr.completedAt ? new Date(sr.completedAt) : undefined, createdAt: new Date(sr.createdAt) })) })));
      if (usersData.length > 0) setManagedUsers(usersData);
      setCompanies(companiesData);
      setDepartments(depsData);
      setDesignations(desigsData);
      setBlockedSlots(slotsData.map((s: any) => ({ ...s, startTime: new Date(s.startTime), endTime: new Date(s.endTime) })));
      setAuditLog(auditData.map((a: any) => ({ ...a, timestamp: new Date(a.timestamp) })));
      if (portalData) setSettings(portalData);
      if (ldapData) setLdapSettings(ldapData);
      if (smtpData) setSmtpSettings(smtpData);
      if (dbData) setDatabaseSettings(dbData);
      if (vcIntegrationData) setVcIntegrationSettings(vcIntegrationData);
      if (vcAvailabilityData) setVcAvailability(vcAvailabilityData);
      setRoomBlocks(blocksData);
      setFacilityList(facilitiesData);
      setDataLoaded(true);
    } catch (err) {
      console.error('Failed to load data from API, using defaults', err);
      // Fallback to mock data if API is unavailable
      setRooms(MOCK_ROOMS);
      setBookings(INITIAL_BOOKINGS);
      setManagedUsers([
        { id: 'u1', name: 'Sarah Jenkins', domainId: 'sarah.jenkins', email: 'sarah.j@company.com', role: UserRole.EMPLOYEE, companyId: 'c1', departmentId: 'd1', active: true },
        { id: 'u2', name: 'Reception Desk', domainId: 'reception', email: 'reception@company.com', role: UserRole.RECEPTION, companyId: 'c1', departmentId: 'd2', active: true },
        { id: 'u3', name: 'IT Support Team', domainId: 'it.support', email: 'it.support@company.com', role: UserRole.IT, companyId: 'c1', departmentId: 'd3', active: true },
        { id: 'u5', name: 'Administration Team', domainId: 'administration', email: 'administration@company.com', role: UserRole.ADMINISTRATION, companyId: 'c1', departmentId: 'd2', active: true },
        { id: 'u4', name: 'System Admin', domainId: 'admin', email: 'admin@company.com', role: UserRole.ADMIN, companyId: 'c1', departmentId: 'd3', active: true },
      ]);
      setCompanies([
        { id: 'c1', name: 'TechCorp', code: 'TC', active: true },
        { id: 'c2', name: 'Acme Solutions', code: 'AS', active: true },
      ]);
      setDepartments([
        { id: 'd1', companyIds: ['c1'], name: 'Engineering', code: 'ENG', active: true },
        { id: 'd2', companyIds: ['c1'], name: 'Operations', code: 'OPS', active: true },
        { id: 'd3', companyIds: ['c1', 'c2'], name: 'IT', code: 'IT', active: true },
        { id: 'd4', companyIds: ['c1'], name: 'Sales', code: 'SAL', active: true },
        { id: 'd5', companyIds: ['c2'], name: 'Marketing', code: 'MKT', active: true },
        { id: 'd6', companyIds: ['c1', 'c2'], name: 'Finance', code: 'FIN', active: true },
      ]);
      setDesignations([
        { id: 'dg1', companyIds: ['c1', 'c2'], name: 'Manager', code: 'MGR', active: true },
        { id: 'dg2', companyIds: ['c1', 'c2'], name: 'Senior Engineer', code: 'SE', active: true },
        { id: 'dg3', companyIds: ['c1', 'c2'], name: 'Team Lead', code: 'TL', active: true },
        { id: 'dg4', companyIds: ['c1'], name: 'Director', code: 'DIR', active: true },
        { id: 'dg5', companyIds: ['c2'], name: 'Analyst', code: 'ANL', active: true },
      ]);
      setRoomBlocks([
        { id: 'b1', name: 'Block A', code: 'A', active: true, itEmail: '', receptionEmail: '', adminEmail: '' },
        { id: 'b2', name: 'Block B', code: 'B', active: true, itEmail: '', receptionEmail: '', adminEmail: '' },
      ]);
      setFacilityList([
        { id: 'f1', name: 'Projector', active: true },
        { id: 'f2', name: 'Whiteboard', active: true },
        { id: 'f3', name: 'Video Conf', active: true },
        { id: 'f4', name: 'TV Screen', active: true },
        { id: 'f5', name: 'Speakerphone', active: true },
        { id: 'f6', name: 'HDMI', active: true },
        { id: 'f7', name: 'Mic System', active: true },
      ]);
      setDataLoaded(true);
    }
  }, []);

  // Keep currentUserRef in sync so refreshData() always sees the latest user role (avoids stale closure).
  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  // Only run initial data fetch if a token already exists (page refresh / restored session).
  // For fresh logins, login/loginByDomainId/tryNegotiateLogin/restoreSession all call refreshData().
  useEffect(() => {
    try {
      if (sessionStorage.getItem('smartbook_token')) refreshData();
    } catch { /* sessionStorage unavailable */ }
  }, [refreshData]);

  // ── 15-min upcoming meeting reminder ─────────────────────────────────────
  // Check every 60 seconds whether any of the current user's upcoming bookings
  // start within the next 15 minutes. Fire a warning notification once per booking.
  useEffect(() => {
    if (!isAuthenticated) return;
    const check = () => {
      const now = Date.now();
      bookings.forEach(b => {
        if (b.userId !== currentUser.id) return;
        if (b.status === BookingStatus.CANCELLED) return;
        const msUntil = b.startTime.getTime() - now;
        if (msUntil > 0 && msUntil <= 15 * 60 * 1000) {
          if (!notifiedUpcomingRef.current.has(b.id)) {
            notifiedUpcomingRef.current.add(b.id);
            const minutes = Math.ceil(msUntil / 60000);
            setNotifications(prev => {
              const note: AppNotification = {
                id: generateId(),
                type: 'warning',
                message: `"${b.title}" starts in ${minutes} minute${minutes !== 1 ? 's' : ''}!`,
                timestamp: new Date(),
                read: false,
              };
              return [note, ...prev];
            });
          }
        }
        // Clear the tracking once the meeting has started (so future same-title bookings can notify again)
        if (msUntil <= 0 && notifiedUpcomingRef.current.has(b.id)) {
          notifiedUpcomingRef.current.delete(b.id);
        }
      });
    };
    check(); // run immediately on mount/auth
    const interval = setInterval(check, 60_000);
    return () => clearInterval(interval);
  }, [isAuthenticated, bookings, currentUser.id]);

  // ── IT task completed → notify booking owner ──────────────────────────────
  // When IT marks a task COMPLETED (generatedLink appears), push a success
  // notification to the booking owner if they are the currently logged-in user.
  const prevBookingsRef = useRef<Booking[]>([]);
  useEffect(() => {
    const prev = prevBookingsRef.current;
    if (prev.length > 0) {
      bookings.forEach(b => {
        if (b.userId !== currentUser.id) return;
        const old = prev.find(p => p.id === b.id);
        if (!old) return;
        // IT just completed
        if (old.itRequirements.status !== 'COMPLETED' && b.itRequirements.status === 'COMPLETED' && b.itRequirements.generatedLink) {
          setNotifications(n => {
            const note: AppNotification = { id: generateId(), type: 'success', message: `VC link ready for "${b.title}" — check My Bookings to join.`, timestamp: new Date(), read: false };
            return [note, ...n];
          });
        }
      });
    }
    prevBookingsRef.current = bookings;
  }, [bookings, currentUser.id]);

  // ── Auto-refresh bookings every 30 seconds ───────────────────────────────
  // Keeps the calendar and booking lists in sync for all users without a full page reload.
  useEffect(() => {
    if (!isAuthenticated) return;
    const poll = async () => {
      try {
        const data = await bookingsApi.getAll();
        setBookings(data.map((b: any) => ({
          ...b,
          startTime: new Date(b.startTime),
          endTime: new Date(b.endTime),
          editedAt: b.editedAt ? new Date(b.editedAt) : undefined,
          serviceRequests: (b.serviceRequests || []).map((sr: any) => ({
            ...sr,
            completedAt: sr.completedAt ? new Date(sr.completedAt) : undefined,
            createdAt: new Date(sr.createdAt),
          })),
        })));
      } catch {
        // silently ignore — stale data is better than an error notification
      }
    };
    const interval = setInterval(poll, 30_000);
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  // Profile setup check — force first-time domain users to set company/department/designation (skip for ADMIN)
  const needsProfileSetup = isAuthenticated && currentUser.role !== UserRole.ADMIN && (!currentUser.companyId || !currentUser.departmentId || !currentUser.designationId);

  const isRoleAllowed = useCallback((allowedRoles: UserRole[]) => {
    return allowedRoles.includes(currentUser.role);
  }, [currentUser.role]);

  const addNotification = useCallback((type: AppNotification['type'], message: string) => {
    const notification: AppNotification = {
      id: generateId(),
      type,
      message,
      timestamp: new Date(),
      read: false,
    };
    setNotifications(prev => [notification, ...prev]);
  }, []);

  const markNotificationRead = useCallback((id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  }, []);

  const clearNotifications = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }, []);

  // Profile update (self-service for first-time domain users)
  const updateMyProfile = useCallback(async (data: Partial<{ companyId: string; departmentId: string; designationId: string }>): Promise<boolean> => {
    try {
      const updated = await authApi.updateProfile(data) as any;
      if (updated.token) {
        try { sessionStorage.setItem('smartbook_token', updated.token); } catch {}
      }
      setCurrentUser(prev => ({ ...prev, companyId: updated.companyId, departmentId: updated.departmentId, designationId: updated.designationId, role: updated.role }));
      addNotification('success', 'Profile updated successfully.');
      return true;
    } catch (err: any) {
      addNotification('error', err.message || 'Failed to update profile.');
      return false;
    }
  }, [addNotification]);

  const updateUserEmail = useCallback(async (email: string): Promise<boolean> => {
    try {
      const updated = await authApi.updateEmail(email) as any;
      if (updated.token) {
        try { sessionStorage.setItem('smartbook_token', updated.token); } catch {}
      }
      setCurrentUser(prev => ({ ...prev, email: updated.email }));
      addNotification('success', 'Email updated successfully.');
      return true;
    } catch (err: any) {
      addNotification('error', err.message || 'Failed to update email.');
      return false;
    }
  }, [addNotification]);

  // Authentication
  const login = useCallback(async (domainId: string, password: string): Promise<string | null> => {
    try {
      const user = await authApi.login(domainId, password) as any;
      if (user.token) {
        try { sessionStorage.setItem('smartbook_token', user.token); } catch {}
      }
      const userObj = { id: user.id, name: user.name, role: user.role, email: user.email, domainId: user.domainId, companyId: user.companyId, departmentId: user.departmentId, designationId: user.designationId };
      setCurrentUser(userObj);
      currentUserRef.current = userObj;
      setIsAuthenticated(true);
      try { sessionStorage.setItem('smartbook_auth', user.domainId); } catch {}
      await refreshData();
      return null;
    } catch (err: any) {
      return err.message || 'Login failed';
    }
  }, [refreshData]);

  const loginByDomainId = useCallback(async (domainId: string): Promise<boolean> => {
    try {
      const user = await authApi.loginSso(domainId) as any;
      if (user.token) {
        try { sessionStorage.setItem('smartbook_token', user.token); } catch {}
      }
      const userObj = { id: user.id, name: user.name, role: user.role, email: user.email, domainId: user.domainId, companyId: user.companyId, departmentId: user.departmentId, designationId: user.designationId };
      setCurrentUser(userObj);
      currentUserRef.current = userObj;
      setIsAuthenticated(true);
      try { sessionStorage.setItem('smartbook_auth', user.domainId); } catch {}
      await refreshData();
      return true;
    } catch {
      return false;
    }
  }, [refreshData]);

  const tryNegotiateLogin = useCallback(async (): Promise<boolean> => {
    try {
      const user = await authApi.negotiate() as any;
      if (user.token) {
        try { sessionStorage.setItem('smartbook_token', user.token); } catch {}
      }
      const userObj = { id: user.id, name: user.name, role: user.role, email: user.email, domainId: user.domainId, companyId: user.companyId, departmentId: user.departmentId, designationId: user.designationId };
      setCurrentUser(userObj);
      currentUserRef.current = userObj;
      setIsAuthenticated(true);
      try { sessionStorage.setItem('smartbook_auth', user.domainId); } catch {}
      await refreshData();
      return true;
    } catch {
      return false;
    }
  }, [refreshData]);

  const logout = useCallback(() => {
    setIsAuthenticated(false);
    setCurrentUser(MOCK_USERS[0]);
    try {
      sessionStorage.removeItem('smartbook_auth');
      sessionStorage.removeItem('smartbook_token');
    } catch {}
  }, []);

  const restoreSession = useCallback(async (): Promise<boolean> => {
    try {
      const savedToken = sessionStorage.getItem('smartbook_token');
      if (!savedToken) return false;
      const user = await authApi.me() as any;
      if (user && user.id) {
        if (user.token) {
          try { sessionStorage.setItem('smartbook_token', user.token); } catch {}
        }
        const userObj = { id: user.id, name: user.name, role: user.role, email: user.email, domainId: user.domainId, companyId: user.companyId, departmentId: user.departmentId, designationId: user.designationId };
        setCurrentUser(userObj);
        currentUserRef.current = userObj;
        setIsAuthenticated(true);
        try { sessionStorage.setItem('smartbook_auth', user.domainId); } catch {}
        await refreshData();
        return true;
      }
      return false;
    } catch {
      try { sessionStorage.removeItem('smartbook_token'); sessionStorage.removeItem('smartbook_auth'); } catch {}
      return false;
    }
  }, [refreshData]);

  const hasConflict = useCallback((roomId: string, startTime: Date, endTime: Date, excludeBookingId?: string): boolean => {
    const start = startTime.getTime();
    const end = endTime.getTime();

    // Check bookings
    const bookingConflict = bookings.some(b =>
      b.roomId === roomId &&
      b.status !== BookingStatus.CANCELLED &&
      b.id !== excludeBookingId &&
      b.startTime.getTime() < end &&
      b.endTime.getTime() > start
    );
    if (bookingConflict) return true;

    // Check blocked slots
    const blockedConflict = blockedSlots.some(bs =>
      bs.roomId === roomId &&
      bs.startTime.getTime() < end &&
      bs.endTime.getTime() > start
    );
    return blockedConflict;
  }, [bookings, blockedSlots]);

  const addBooking = useCallback(async (bookingData: Omit<Booking, 'id' | 'userName' | 'userId'>, bookForUserId?: string, deferEmail?: boolean): Promise<string | null> => {
    if (!isRoleAllowed([UserRole.EMPLOYEE, UserRole.RECEPTION, UserRole.IT, UserRole.ADMINISTRATION, UserRole.ADMIN])) {
      return null;
    }

    // Validate participants against room capacity
    const room = rooms.find(r => r.id === bookingData.roomId);
    if (room && bookingData.participants > room.capacity) {
      addNotification('warning', `Participants (${bookingData.participants}) exceed room capacity (${room.capacity}).`);
    }

    try {
      const payload: any = {
        ...bookingData,
        userId: currentUser.id,
        userName: currentUser.name,
        startTime: bookingData.startTime.toISOString(),
        endTime: bookingData.endTime.toISOString(),
      };
      if (bookForUserId) {
        payload.bookForUserId = bookForUserId;
      }
      const newBooking = await bookingsApi.create(payload, deferEmail) as any;
      setBookings(prev => [...prev, { ...newBooking, startTime: new Date(newBooking.startTime), endTime: new Date(newBooking.endTime), serviceRequests: (newBooking.serviceRequests || []).map((sr: any) => ({ ...sr, completedAt: sr.completedAt ? new Date(sr.completedAt) : undefined, createdAt: new Date(sr.createdAt) })) }]);
      if (newBooking.status === 'PENDING') {
        addNotification('info', `Booking "${newBooking.title}" submitted and pending approval.`);
      } else {
        addNotification('success', `Booking "${newBooking.title}" confirmed successfully!`);
      }
      if (newBooking.itRequirements?.vcRequired || newBooking.itRequirements?.avSetup) {
        addNotification('info', 'IT team has been notified about your setup requirements.');
      }
      return newBooking.id;
    } catch (err: any) {
      addNotification('error', err.message || 'Failed to create booking.');
      return null;
    }
  }, [currentUser, isRoleAllowed, addNotification, rooms]);

  // ── Recurring bookings ────────────────────────────────────────────────────
  const addRecurringBookings = useCallback(async (
    bookingData: Omit<Booking, 'id' | 'userName' | 'userId'>,
    rule: RecurrenceRule,
    bookForUserId?: string
  ): Promise<number> => {
    const recurrenceId = generateId();
    const duration = bookingData.endTime.getTime() - bookingData.startTime.getTime();
    const dates: Date[] = [];
    let cursor = new Date(bookingData.startTime);
    const endBound = new Date(rule.endDate);
    endBound.setHours(23, 59, 59, 999);

    while (cursor <= endBound) {
      dates.push(new Date(cursor));
      switch (rule.frequency) {
        case 'daily':    cursor.setDate(cursor.getDate() + 1); break;
        case 'weekly':   cursor.setDate(cursor.getDate() + 7); break;
        case 'biweekly': cursor.setDate(cursor.getDate() + 14); break;
        case 'monthly':  cursor.setMonth(cursor.getMonth() + 1); break;
      }
    }

    let created = 0;
    for (const date of dates) {
      const startTime = new Date(date);
      const endTime = new Date(date.getTime() + duration);
      try {
        const payload: any = {
          ...bookingData,
          userId: currentUser.id,
          userName: currentUser.name,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          recurrenceId,
        };
        if (bookForUserId) payload.bookForUserId = bookForUserId;
        const newBooking = await bookingsApi.create(payload, false) as any;
        setBookings(prev => [...prev, {
          ...newBooking,
          startTime: new Date(newBooking.startTime),
          endTime: new Date(newBooking.endTime),
          recurrenceId,
          serviceRequests: (newBooking.serviceRequests || []).map((sr: any) => ({
            ...sr,
            completedAt: sr.completedAt ? new Date(sr.completedAt) : undefined,
            createdAt: new Date(sr.createdAt),
          })),
        }]);
        created++;
      } catch { /* skip conflicts */ }
    }

    if (created > 0) {
      addNotification('success', `${created} recurring booking${created !== 1 ? 's' : ''} created for "${bookingData.title}".`);
    } else {
      addNotification('error', 'Failed to create recurring bookings.');
    }
    return created;
  }, [currentUser, addNotification]);

  const editBooking = useCallback(async (id: string, updates: Partial<Omit<Booking, 'id' | 'userId' | 'userName'>>): Promise<boolean> => {
    const existing = bookings.find(b => b.id === id);
    if (!existing) {
      addNotification('error', 'Booking not found.');
      return false;
    }

    if (existing.userId !== currentUser.id && !isRoleAllowed([UserRole.RECEPTION, UserRole.IT, UserRole.ADMINISTRATION, UserRole.ADMIN])) {
      addNotification('error', 'You do not have permission to edit this booking.');
      return false;
    }

    try {
      const apiUpdates: any = { ...updates, userId: currentUser.id, userName: currentUser.name };
      if (updates.startTime) apiUpdates.startTime = updates.startTime.toISOString();
      if (updates.endTime) apiUpdates.endTime = updates.endTime.toISOString();
      await bookingsApi.update(id, apiUpdates);
      // Re-fetch the booking by ID to guarantee the state reflects the authoritative server value
      const fresh = await bookingsApi.getById(id) as any;
      setBookings(prev => prev.map(b =>
        b.id === id ? { ...b, ...fresh, startTime: new Date(fresh.startTime), endTime: new Date(fresh.endTime), editedAt: fresh.editedAt ? new Date(fresh.editedAt) : undefined, serviceRequests: (fresh.serviceRequests || []).map((sr: any) => ({ ...sr, completedAt: sr.completedAt ? new Date(sr.completedAt) : undefined, createdAt: new Date(sr.createdAt) })) } : b
      ));
      addNotification('success', `Booking "${existing.title}" updated successfully!`);
      return true;
    } catch (err: any) {
      addNotification('error', err.message || 'Failed to edit booking.');
      return false;
    }
  }, [bookings, currentUser, isRoleAllowed, addNotification]);

  const updateBookingStatus = useCallback(async (id: string, status: Booking['status'], cancellationReason?: string) => {
    const booking = bookings.find(b => b.id === id);
    if (!booking) return;

    if (booking.userId !== currentUser.id && !isRoleAllowed([UserRole.RECEPTION, UserRole.IT, UserRole.ADMINISTRATION, UserRole.ADMIN])) {
      addNotification('error', 'You do not have permission to modify this booking.');
      return;
    }

    try {
      await bookingsApi.updateStatus(id, status, currentUser.id, currentUser.name, cancellationReason);
      // Use the full response from the server to keep all fields in sync
      const updated = await bookingsApi.getById(id) as any;
      setBookings(prev => prev.map(b =>
        b.id === id ? { ...updated, startTime: new Date(updated.startTime), endTime: new Date(updated.endTime), editedAt: updated.editedAt ? new Date(updated.editedAt) : undefined, serviceRequests: (updated.serviceRequests || []).map((sr: any) => ({ ...sr, completedAt: sr.completedAt ? new Date(sr.completedAt) : undefined, createdAt: new Date(sr.createdAt) })) } : b
      ));

      if (status === BookingStatus.CANCELLED) {
        addNotification('info', `Booking "${booking.title}" has been cancelled.`);
      } else if (status === BookingStatus.CONFIRMED) {
        addNotification('success', `Booking "${booking.title}" has been approved.`);
      }
    } catch (err: any) {
      addNotification('error', err.message || 'Failed to update booking status.');
    }
  }, [bookings, currentUser, isRoleAllowed, addNotification]);

  const cancelBookingSeries = useCallback(async (recurrenceId: string, fromNow = false, cancellationReason?: string) => {
    const now = new Date();
    try {
      const result = await bookingsApi.cancelSeries(recurrenceId, currentUser.id, currentUser.name, fromNow, cancellationReason);
      setBookings(prev => prev.map(b => {
        if (b.recurrenceId !== recurrenceId) return b;
        if (fromNow && b.startTime <= now) return b; // leave past/completed untouched
        return { ...b, status: BookingStatus.CANCELLED };
      }));
      addNotification('info', `${result.cancelled} recurring booking${result.cancelled !== 1 ? 's' : ''} cancelled.`);
    } catch (err: any) {
      addNotification('error', err.message || 'Failed to cancel series.');
    }
  }, [currentUser, addNotification]);

  const updateITStatus = useCallback(async (bookingId: string, status: ITRequirements['status'], generatedLink?: string, meetingNumber?: string, meetingPassword?: string) => {
    if (!isRoleAllowed([UserRole.IT, UserRole.ADMIN])) {
      addNotification('error', 'Only IT staff can update IT task status.');
      return;
    }

    const booking = bookings.find(b => b.id === bookingId);
    try {
      await bookingsApi.updateITStatus(bookingId, status, generatedLink, meetingNumber, meetingPassword, currentUser.id, currentUser.name);
      setBookings(prev => prev.map(b =>
        b.id === bookingId
        ? {
            ...b,
            itRequirements: {
              ...b.itRequirements,
              status,
              generatedLink: generatedLink || b.itRequirements.generatedLink,
              meetingNumber: meetingNumber || b.itRequirements.meetingNumber,
              meetingPassword: meetingPassword || b.itRequirements.meetingPassword
            }
          }
        : b
      ));
      if (status === 'COMPLETED') {
        addNotification('success', `IT setup for "${booking?.title}" completed.`);
      } else if (status === 'IN_PROGRESS') {
        addNotification('info', `IT setup for "${booking?.title}" is now in progress.`);
      }
    } catch (err: any) {
      addNotification('error', err.message || 'Failed to update IT status.');
    }
  }, [bookings, currentUser, isRoleAllowed, addNotification]);

  // Auto-generates a Google Meet / Webex link via the configured integration and completes the IT task.
  // Returns true on success, false on failure (caller falls back to manual entry).
  const generateVcLink = useCallback(async (bookingId: string, options?: { lockMeeting?: boolean }): Promise<boolean> => {
    if (!isRoleAllowed([UserRole.IT, UserRole.ADMIN])) {
      addNotification('error', 'Only IT staff can generate meeting links.');
      return false;
    }
    try {
      const updated = await bookingsApi.generateVcLink(bookingId, options);
      setBookings(prev => prev.map(b => b.id === bookingId
        ? { ...updated, startTime: new Date(updated.startTime), endTime: new Date(updated.endTime), editedAt: updated.editedAt ? new Date(updated.editedAt) : undefined }
        : b
      ));
      addNotification('success', `${updated.itRequirements.platform} link generated and sent.`);
      return true;
    } catch (err: any) {
      addNotification('error', err.message || 'Failed to generate the meeting link.');
      return false;
    }
  }, [isRoleAllowed, addNotification]);

  // Reschedules an already-generated Google Meet/Webex link to the booking's current time,
  // keeping the same link — used when the booking's date/time changed after a link was sent.
  const updateVcLinkTime = useCallback(async (bookingId: string): Promise<boolean> => {
    if (!isRoleAllowed([UserRole.IT, UserRole.ADMIN])) {
      addNotification('error', 'Only IT staff can update meeting links.');
      return false;
    }
    try {
      const updated = await bookingsApi.updateVcLinkTime(bookingId);
      setBookings(prev => prev.map(b => b.id === bookingId
        ? { ...updated, startTime: new Date(updated.startTime), endTime: new Date(updated.endTime), editedAt: updated.editedAt ? new Date(updated.editedAt) : undefined }
        : b
      ));
      addNotification('success', `${updated.itRequirements.platform} meeting updated to the new time.`);
      return true;
    } catch (err: any) {
      addNotification('error', err.message || 'Failed to update the meeting time.');
      return false;
    }
  }, [isRoleAllowed, addNotification]);

  const archiveITTask = useCallback(async (bookingId: string, archived: boolean) => {
    if (!isRoleAllowed([UserRole.IT, UserRole.ADMIN])) {
      addNotification('error', 'Only IT staff can archive tasks.');
      return;
    }
    try {
      await bookingsApi.archiveIT(bookingId, archived);
      setBookings(prev => prev.map(b =>
        b.id === bookingId
          ? { ...b, itRequirements: { ...b.itRequirements, archived } }
          : b
      ));
      addNotification('success', archived ? 'Task archived.' : 'Task restored.');
    } catch (err: any) {
      addNotification('error', err.message || 'Failed to archive task.');
    }
  }, [currentUser, isRoleAllowed, addNotification]);

  const refreshBooking = useCallback(async (id: string) => {
    try {
      const updated = await bookingsApi.getById(id) as any;
      setBookings(prev => prev.map(b =>
        b.id === id ? { ...updated, startTime: new Date(updated.startTime), endTime: new Date(updated.endTime), editedAt: updated.editedAt ? new Date(updated.editedAt) : undefined, serviceRequests: (updated.serviceRequests || []).map((sr: any) => ({ ...sr, completedAt: sr.completedAt ? new Date(sr.completedAt) : undefined, createdAt: new Date(sr.createdAt) })) } : b
      ));
    } catch (err: any) {
      console.error('[refreshBooking]', err.message);
    }
  }, []);

  const switchRole = useCallback((role: UserRole) => {
    const user = MOCK_USERS.find(u => u.role === role);
    if (user) setCurrentUser(user);
  }, []);

  // Room Management Functions
  const addRoom = useCallback(async (roomData: Omit<Room, 'id'>) => {
    if (!isRoleAllowed([UserRole.ADMIN])) {
      addNotification('error', 'Only admins can add rooms.');
      return;
    }
    try {
      const newRoom = await roomsApi.create(roomData, currentUser.id, currentUser.name) as any;
      setRooms(prev => [...prev, newRoom]);
      addNotification('success', `Room "${newRoom.name}" added successfully!`);
    } catch (err: any) {
      addNotification('error', err.message || 'Failed to add room.');
    }
  }, [currentUser, isRoleAllowed, addNotification]);

  const updateRoom = useCallback(async (updatedRoom: Room) => {
    if (!isRoleAllowed([UserRole.ADMIN])) {
      addNotification('error', 'Only admins can update rooms.');
      return;
    }
    try {
      const room = await roomsApi.update(updatedRoom.id, updatedRoom, currentUser.id, currentUser.name) as any;
      setRooms(prev => prev.map(r => r.id === room.id ? room : r));
      addNotification('success', `Room "${room.name}" updated.`);
    } catch (err: any) {
      addNotification('error', err.message || 'Failed to update room.');
    }
  }, [currentUser, isRoleAllowed, addNotification]);

  const deleteRoom = useCallback(async (id: string) => {
    if (!isRoleAllowed([UserRole.ADMIN])) {
      addNotification('error', 'Only admins can delete rooms.');
      return;
    }
    const room = rooms.find(r => r.id === id);
    try {
      await roomsApi.delete(id, currentUser.id, currentUser.name);
      setRooms(prev => prev.filter(r => r.id !== id));
      addNotification('info', `Room "${room?.name}" deleted.`);
    } catch (err: any) {
      addNotification('error', err.message || 'Failed to delete room.');
    }
  }, [rooms, currentUser, isRoleAllowed, addNotification]);

  // Blocked Slots
  const addBlockedSlot = useCallback(async (slotData: Omit<BlockedSlot, 'id'>) => {
    if (!isRoleAllowed([UserRole.RECEPTION, UserRole.ADMIN])) {
      addNotification('error', 'Only reception or admin can block rooms.');
      return;
    }
    try {
      const slot = await blockedSlotsApi.create(
        { ...slotData, startTime: slotData.startTime.toISOString(), endTime: slotData.endTime.toISOString() },
        currentUser.id,
        currentUser.name
      ) as any;
      setBlockedSlots(prev => [...prev, { ...slot, startTime: new Date(slot.startTime), endTime: new Date(slot.endTime) }]);
      const room = rooms.find(r => r.id === slotData.roomId);
      addNotification('success', `Room "${room?.name}" blocked successfully.`);
    } catch (err: any) {
      addNotification('error', err.message || 'Failed to block room.');
    }
  }, [rooms, currentUser, isRoleAllowed, addNotification]);

  const removeBlockedSlot = useCallback(async (id: string) => {
    if (!isRoleAllowed([UserRole.RECEPTION, UserRole.ADMIN])) {
      addNotification('error', 'Only reception or admin can unblock rooms.');
      return;
    }
    try {
      await blockedSlotsApi.delete(id, currentUser.id, currentUser.name);
      setBlockedSlots(prev => prev.filter(bs => bs.id !== id));
      addNotification('info', `Room block removed.`);
    } catch (err: any) {
      addNotification('error', err.message || 'Failed to unblock room.');
    }
  }, [currentUser, isRoleAllowed, addNotification]);

  const updateSettings = useCallback(async (updates: Partial<PortalSettings>) => {
    if (!isRoleAllowed([UserRole.ADMIN])) {
      addNotification('error', 'Only admins can modify settings.');
      return;
    }
    const newSettings = { ...settings, ...updates };
    try {
      await settingsApi.updatePortal(newSettings, currentUser.id, currentUser.name);
      setSettings(newSettings);
      addNotification('success', 'Settings saved successfully.');
    } catch (err: any) {
      addNotification('error', err.message || 'Failed to save settings.');
    }
  }, [settings, currentUser, isRoleAllowed, addNotification]);

  const updateLdapSettings = useCallback(async (updates: Partial<LdapSettings>) => {
    if (!isRoleAllowed([UserRole.ADMIN])) { addNotification('error', 'Only admins can modify LDAP settings.'); return; }
    const newSettings = { ...ldapSettings, ...updates };
    try {
      await settingsApi.updateLdap(newSettings, currentUser.id, currentUser.name);
      setLdapSettings(newSettings);
      addNotification('success', 'LDAP settings saved.');
    } catch (err: any) {
      addNotification('error', err.message || 'Failed to save LDAP settings.');
    }
  }, [ldapSettings, currentUser, isRoleAllowed, addNotification]);

  const updateSmtpSettings = useCallback(async (updates: Partial<SmtpSettings>) => {
    if (!isRoleAllowed([UserRole.ADMIN])) { addNotification('error', 'Only admins can modify SMTP settings.'); return; }
    const newSettings = { ...smtpSettings, ...updates };
    try {
      await settingsApi.updateSmtp(newSettings, currentUser.id, currentUser.name);
      setSmtpSettings(newSettings);
      addNotification('success', 'SMTP settings saved.');
    } catch (err: any) {
      addNotification('error', err.message || 'Failed to save SMTP settings.');
    }
  }, [smtpSettings, currentUser, isRoleAllowed, addNotification]);

  const updateVcIntegrationSettings = useCallback(async (newSettings: VcIntegrationSettings) => {
    if (!isRoleAllowed([UserRole.ADMIN])) { addNotification('error', 'Only admins can modify VC integration settings.'); return; }
    try {
      const saved = await settingsApi.updateVcIntegration(newSettings);
      setVcIntegrationSettings(saved);
      // Keep the non-secret availability view in sync immediately, without waiting for a refetch —
      // this is what drives the booking form's platform picker and the IT Queue's account labels.
      setVcAvailability({
        googleMeet: { companies: Object.entries<any>(saved.googleMeet?.companies || {}).filter(([, cfg]) => cfg?.enabled).map(([id]) => id) },
        webex: { enabled: !!saved.webex?.enabled, companies: saved.webex?.companies || [], accounts: (saved.webex?.accounts || []).map((a: any) => ({ id: a.id, label: a.label })) },
      });
      addNotification('success', 'VC integration settings saved.');
    } catch (err: any) {
      addNotification('error', err.message || 'Failed to save VC integration settings.');
    }
  }, [isRoleAllowed, addNotification]);

  // User Management
  const addManagedUser = useCallback(async (userData: Omit<ManagedUser, 'id'>) => {
    if (!isRoleAllowed([UserRole.ADMIN])) { addNotification('error', 'Only admins can manage users.'); return; }
    try {
      const newUser = await usersApi.create(userData, currentUser.id, currentUser.name) as any;
      setManagedUsers(prev => [...prev, newUser]);
      addNotification('success', `User "${newUser.name}" created.`);
    } catch (err: any) {
      addNotification('error', err.message || 'Failed to create user.');
    }
  }, [currentUser, isRoleAllowed, addNotification]);

  const updateManagedUser = useCallback(async (user: ManagedUser) => {
    if (!isRoleAllowed([UserRole.ADMIN])) { addNotification('error', 'Only admins can manage users.'); return; }
    try {
      const updated = await usersApi.update(user.id, user, currentUser.id, currentUser.name) as any;
      setManagedUsers(prev => prev.map(u => u.id === user.id ? updated : u));
      addNotification('success', `User "${user.name}" updated.`);
    } catch (err: any) {
      addNotification('error', err.message || 'Failed to update user.');
    }
  }, [currentUser, isRoleAllowed, addNotification]);

  const deleteManagedUser = useCallback(async (id: string) => {
    if (!isRoleAllowed([UserRole.ADMIN])) { addNotification('error', 'Only admins can manage users.'); return; }
    const user = managedUsers.find(u => u.id === id);
    try {
      await usersApi.delete(id);
      setManagedUsers(prev => prev.filter(u => u.id !== id));
      addNotification('info', `User "${user?.name}" deleted.`);
    } catch (err: any) {
      addNotification('error', err.message || 'Failed to delete user.');
    }
  }, [managedUsers, isRoleAllowed, addNotification]);

  // Company Management
  const addCompany = useCallback(async (data: Omit<Company, 'id'>) => {
    if (!isRoleAllowed([UserRole.ADMIN])) { addNotification('error', 'Only admins can manage companies.'); return; }
    try {
      const c = await companiesApi.create(data, currentUser.id, currentUser.name) as any;
      setCompanies(prev => [...prev, c]);
      addNotification('success', `Company "${c.name}" created.`);
    } catch (err: any) {
      addNotification('error', err.message || 'Failed to create company.');
    }
  }, [currentUser, isRoleAllowed, addNotification]);

  const updateCompany = useCallback(async (company: Company) => {
    if (!isRoleAllowed([UserRole.ADMIN])) { addNotification('error', 'Only admins can manage companies.'); return; }
    try {
      const updated = await companiesApi.update(company.id, company, currentUser.id, currentUser.name) as any;
      setCompanies(prev => prev.map(c => c.id === company.id ? updated : c));
      addNotification('success', `Company "${company.name}" updated.`);
    } catch (err: any) {
      addNotification('error', err.message || 'Failed to update company.');
    }
  }, [currentUser, isRoleAllowed, addNotification]);

  const deleteCompany = useCallback(async (id: string) => {
    if (!isRoleAllowed([UserRole.ADMIN])) { addNotification('error', 'Only admins can manage companies.'); return; }
    const c = companies.find(x => x.id === id);
    try {
      await companiesApi.delete(id, currentUser.id, currentUser.name);
      setCompanies(prev => prev.filter(x => x.id !== id));
      setDepartments(prev => prev.map(d => d.companyIds.includes(id) ? { ...d, companyIds: d.companyIds.filter(cid => cid !== id) } : d));
      setDesignations(prev => prev.map(d => d.companyIds.includes(id) ? { ...d, companyIds: d.companyIds.filter(cid => cid !== id) } : d));
      addNotification('info', `Company "${c?.name}" deleted.`);
    } catch (err: any) {
      addNotification('error', err.message || 'Failed to delete company.');
    }
  }, [companies, currentUser, isRoleAllowed, addNotification]);

  // Department Management
  const addDepartment = useCallback(async (data: Omit<Department, 'id'>) => {
    if (!isRoleAllowed([UserRole.ADMIN])) { addNotification('error', 'Only admins can manage departments.'); return; }
    try {
      const d = await departmentsApi.create(data, currentUser.id, currentUser.name) as any;
      setDepartments(prev => [...prev, d]);
      addNotification('success', `Department "${d.name}" created.`);
    } catch (err: any) {
      addNotification('error', err.message || 'Failed to create department.');
    }
  }, [currentUser, isRoleAllowed, addNotification]);

  const updateDepartment = useCallback(async (dept: Department) => {
    if (!isRoleAllowed([UserRole.ADMIN])) { addNotification('error', 'Only admins can manage departments.'); return; }
    try {
      const updated = await departmentsApi.update(dept.id, dept, currentUser.id, currentUser.name) as any;
      setDepartments(prev => prev.map(d => d.id === dept.id ? updated : d));
      addNotification('success', `Department "${dept.name}" updated.`);
    } catch (err: any) {
      addNotification('error', err.message || 'Failed to update department.');
    }
  }, [currentUser, isRoleAllowed, addNotification]);

  const deleteDepartment = useCallback(async (id: string) => {
    if (!isRoleAllowed([UserRole.ADMIN])) { addNotification('error', 'Only admins can manage departments.'); return; }
    const d = departments.find(x => x.id === id);
    try {
      await departmentsApi.delete(id, currentUser.id, currentUser.name);
      setDepartments(prev => prev.filter(x => x.id !== id));
      addNotification('info', `Department "${d?.name}" deleted.`);
    } catch (err: any) {
      addNotification('error', err.message || 'Failed to delete department.');
    }
  }, [departments, currentUser, isRoleAllowed, addNotification]);

  // Designation Management
  const addDesignation = useCallback(async (data: Omit<Designation, 'id'>) => {
    if (!isRoleAllowed([UserRole.ADMIN])) { addNotification('error', 'Only admins can manage designations.'); return; }
    try {
      const d = await designationsApi.create(data, currentUser.id, currentUser.name) as any;
      setDesignations(prev => [...prev, d]);
      addNotification('success', `Designation "${d.name}" created.`);
    } catch (err: any) {
      addNotification('error', err.message || 'Failed to create designation.');
    }
  }, [currentUser, isRoleAllowed, addNotification]);

  const updateDesignation = useCallback(async (desig: Designation) => {
    if (!isRoleAllowed([UserRole.ADMIN])) { addNotification('error', 'Only admins can manage designations.'); return; }
    try {
      const updated = await designationsApi.update(desig.id, desig, currentUser.id, currentUser.name) as any;
      setDesignations(prev => prev.map(d => d.id === desig.id ? updated : d));
      addNotification('success', `Designation "${desig.name}" updated.`);
    } catch (err: any) {
      addNotification('error', err.message || 'Failed to update designation.');
    }
  }, [currentUser, isRoleAllowed, addNotification]);

  const deleteDesignation = useCallback(async (id: string) => {
    if (!isRoleAllowed([UserRole.ADMIN])) { addNotification('error', 'Only admins can manage designations.'); return; }
    const d = designations.find(x => x.id === id);
    try {
      await designationsApi.delete(id, currentUser.id, currentUser.name);
      setDesignations(prev => prev.filter(x => x.id !== id));
      addNotification('info', `Designation "${d?.name}" deleted.`);
    } catch (err: any) {
      addNotification('error', err.message || 'Failed to delete designation.');
    }
  }, [designations, currentUser, isRoleAllowed, addNotification]);

  // Block Management
  const addBlock = useCallback(async (data: Omit<RoomBlockConfig, 'id'>) => {
    if (!isRoleAllowed([UserRole.ADMIN])) { addNotification('error', 'Only admins can manage blocks.'); return; }
    try {
      const b = await blocksApi.create(data) as any;
      setRoomBlocks(prev => [...prev, b]);
      addNotification('success', `Block "${b.name}" created.`);
    } catch (err: any) {
      addNotification('error', err.message || 'Failed to create block.');
    }
  }, [currentUser, isRoleAllowed, addNotification]);

  const updateBlock = useCallback(async (block: RoomBlockConfig) => {
    if (!isRoleAllowed([UserRole.ADMIN])) { addNotification('error', 'Only admins can manage blocks.'); return; }
    try {
      const updated = await blocksApi.update(block.id, block) as any;
      setRoomBlocks(prev => prev.map(b => b.id === block.id ? updated : b));
      addNotification('success', `Block "${block.name}" updated.`);
    } catch (err: any) {
      addNotification('error', err.message || 'Failed to update block.');
    }
  }, [currentUser, isRoleAllowed, addNotification]);

  const deleteBlock = useCallback(async (id: string) => {
    if (!isRoleAllowed([UserRole.ADMIN])) { addNotification('error', 'Only admins can manage blocks.'); return; }
    const b = roomBlocks.find(x => x.id === id);
    try {
      await blocksApi.delete(id);
      setRoomBlocks(prev => prev.filter(x => x.id !== id));
      addNotification('info', `Block "${b?.name}" deleted.`);
    } catch (err: any) {
      addNotification('error', err.message || 'Failed to delete block.');
    }
  }, [roomBlocks, isRoleAllowed, addNotification]);

  // Facility Management
  const addFacility = useCallback(async (data: Omit<Facility, 'id'>) => {
    if (!isRoleAllowed([UserRole.ADMIN])) { addNotification('error', 'Only admins can manage facilities.'); return; }
    try {
      const f = await facilitiesApi.create(data) as any;
      setFacilityList(prev => [...prev, f]);
      addNotification('success', `Facility "${f.name}" created.`);
    } catch (err: any) {
      addNotification('error', err.message || 'Failed to create facility.');
    }
  }, [currentUser, isRoleAllowed, addNotification]);

  const updateFacility = useCallback(async (facility: Facility) => {
    if (!isRoleAllowed([UserRole.ADMIN])) { addNotification('error', 'Only admins can manage facilities.'); return; }
    try {
      const updated = await facilitiesApi.update(facility.id, facility) as any;
      setFacilityList(prev => prev.map(f => f.id === facility.id ? updated : f));
      addNotification('success', `Facility "${facility.name}" updated.`);
    } catch (err: any) {
      addNotification('error', err.message || 'Failed to update facility.');
    }
  }, [currentUser, isRoleAllowed, addNotification]);

  const deleteFacility = useCallback(async (id: string) => {
    if (!isRoleAllowed([UserRole.ADMIN])) { addNotification('error', 'Only admins can manage facilities.'); return; }
    const f = facilityList.find(x => x.id === id);
    try {
      await facilitiesApi.delete(id);
      setFacilityList(prev => prev.filter(x => x.id !== id));
      addNotification('info', `Facility "${f?.name}" deleted.`);
    } catch (err: any) {
      addNotification('error', err.message || 'Failed to delete facility.');
    }
  }, [facilityList, isRoleAllowed, addNotification]);

  // Export Data
  const exportData = useCallback(async (sections: string[]): Promise<string> => {
    try {
      const data = await settingsApi.exportData(sections, currentUser.id, currentUser.name);
      return JSON.stringify(data, null, 2);
    } catch {
      // Fallback to local export
      const data: Record<string, unknown> = {};
      const manifest: ExportManifest = { version: '1.0', exportedAt: new Date().toISOString(), exportedBy: currentUser.name, sections };
      data._manifest = manifest;
      if (sections.includes('rooms')) data.rooms = rooms;
      if (sections.includes('bookings')) data.bookings = bookings;
      if (sections.includes('users')) data.managedUsers = managedUsers;
      if (sections.includes('companies')) data.companies = companies;
      if (sections.includes('departments')) data.departments = departments;
      if (sections.includes('designations')) data.designations = designations;
      if (sections.includes('blockedSlots')) data.blockedSlots = blockedSlots;
      if (sections.includes('settings')) data.settings = settings;
      if (sections.includes('ldapSettings')) data.ldapSettings = ldapSettings;
      if (sections.includes('smtpSettings')) data.smtpSettings = smtpSettings;
      if (sections.includes('auditLog')) data.auditLog = auditLog;
      return JSON.stringify(data, null, 2);
    }
  }, [currentUser, rooms, bookings, managedUsers, companies, departments, designations, blockedSlots, settings, ldapSettings, smtpSettings, auditLog]);

  // Import Data
  const importData = useCallback(async (json: string): Promise<{ success: boolean; message: string }> => {
    if (!isRoleAllowed([UserRole.ADMIN])) return { success: false, message: 'Only admins can import data.' };
    try {
      const data = JSON.parse(json);
      if (!data._manifest) return { success: false, message: 'Invalid export file: missing manifest.' };
      const result = await settingsApi.importData(data);
      if (result.success) {
        addNotification('success', result.message);
        refreshData(); // Reload all data from API
      }
      return result;
    } catch {
      return { success: false, message: 'Failed to parse import file. Ensure it is valid JSON.' };
    }
  }, [isRoleAllowed, addNotification, refreshData]);

  // Service Request management
  const updateServiceStatus = useCallback(async (requestId: string, status: ServiceStatus) => {
    try {
      const updated = await serviceRequestsApi.updateStatus(requestId, status) as any;
      // Update the service request within the corresponding booking
      setBookings(prev => prev.map(b => ({
        ...b,
        serviceRequests: b.serviceRequests.map(sr =>
          sr.id === requestId
            ? { ...sr, status: updated.status, handledBy: updated.handledBy, handledByName: updated.handledByName, completedAt: updated.completedAt ? new Date(updated.completedAt) : undefined }
            : sr
        ),
      })));
      if (status === 'COMPLETED') {
        addNotification('success', 'Service request completed.');
      } else if (status === 'IN_PROGRESS') {
        addNotification('info', 'Service request picked up.');
      } else if (status === 'CANCELLED') {
        addNotification('info', 'Service request cancelled.');
      }
    } catch (err: any) {
      addNotification('error', err.message || 'Failed to update service request.');
    }
  }, [addNotification]);

  return (
    <AppContext.Provider value={{
      currentUser,
      isAuthenticated,
      rooms,
      bookings,
      viewDate,
      auditLog,
      blockedSlots,
      notifications,
      settings,
      ldapSettings,
      smtpSettings,
      vcIntegrationSettings,
      vcAvailability,
      managedUsers,
      companies,
      departments,
      designations,
      login,
      loginByDomainId,
      tryNegotiateLogin,
      restoreSession,
      logout,
      setCurrentUser,
      addBooking,
      addRecurringBookings,
      editBooking,
      updateBookingStatus,
      cancelBookingSeries,
      updateITStatus,
      archiveITTask,
      generateVcLink,
      updateVcLinkTime,
      setViewDate,
      switchRole,
      hasConflict,
      addRoom,
      updateRoom,
      deleteRoom,
      addBlockedSlot,
      removeBlockedSlot,
      addNotification,
      markNotificationRead,
      clearNotifications,
      isRoleAllowed,
      updateSettings,
      updateLdapSettings,
      updateSmtpSettings,
      updateVcIntegrationSettings,
      addManagedUser,
      updateManagedUser,
      deleteManagedUser,
      addCompany,
      updateCompany,
      deleteCompany,
      addDepartment,
      updateDepartment,
      deleteDepartment,
      addDesignation,
      updateDesignation,
      deleteDesignation,
      roomBlocks,
      facilityList,
      addBlock,
      updateBlock,
      deleteBlock,
      addFacility,
      updateFacility,
      deleteFacility,
      databaseSettings,
      exportData,
      importData,
      refreshData,
      refreshBooking,
      needsProfileSetup,
      updateMyProfile,
      updateUserEmail,
      updateServiceStatus,
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};