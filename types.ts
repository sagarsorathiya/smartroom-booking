export enum UserRole {
  EMPLOYEE = 'EMPLOYEE',
  RECEPTION = 'RECEPTION',
  IT = 'IT',
  ADMINISTRATION = 'ADMINISTRATION',
  ADMIN = 'ADMIN'
}

export enum RoomType {
  CONFERENCE = 'Conference',
  BOARD = 'Board Room'
}

export enum BookingStatus {
  CONFIRMED = 'CONFIRMED',
  PENDING = 'PENDING',
  CANCELLED = 'CANCELLED',
  COMPLETED = 'COMPLETED'
}

export interface User {
  id: string;
  name: string;
  role: UserRole;
  email: string;
  domainId: string;
  companyId?: string;
  departmentId?: string;
  designationId?: string;
  active?: boolean;
  manualRole?: boolean;
}

export interface Room {
  id: string;
  name: string;
  type: RoomType;
  block: string;
  capacity: number;
  facilities: string[];
  imageUrl?: string;
  notifyEmail?: string;
  restricted?: boolean;
  allowedUserIds?: string[];
}

export interface ITRequirements {
  vcRequired: boolean;
  createMeetingLink: boolean;
  existingLink?: string | null;
  generatedLink?: string | null;
  meetingNumber?: string | null;
  meetingPassword?: string | null;
  platform?: 'Teams' | 'Zoom' | 'Google Meet' | 'Webex' | null;
  avSetup: boolean;
  supportStandby: boolean;
  notes?: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  archived?: boolean;
  /** Which pooled Webex account (e.g. "webex-1") generated this link; undefined for Google Meet / manual / Teams / Zoom */
  vcAccountRef?: string;
  /** True if this link was auto-generated and can be rescheduled in place (same link) rather than regenerated from scratch */
  vcUpdatable?: boolean;
}

export type RecurrenceFrequency = 'daily' | 'weekly' | 'biweekly' | 'monthly';

export interface RecurrenceRule {
  frequency: RecurrenceFrequency;
  endDate: Date;
}

export interface Booking {
  id: string;
  roomId: string;
  userId: string;
  userName: string;
  title: string;
  startTime: Date;
  endTime: Date;
  status: BookingStatus;
  participants: number;
  company: string;
  department: string;
  chairPerson: string;
  agenda?: string;
  notifyEmails: string[];
  itRequirements: ITRequirements;
  serviceRequests: ServiceRequest[];
  attachments?: BookingAttachment[];
  editedAt?: Date;
  recurrenceId?: string;
  recurrenceRule?: RecurrenceRule;
}

export interface CalendarSlot {
  time: Date;
  bookings: Booking[];
}

export type AuditAction =
  | 'BOOKING_CREATED'
  | 'BOOKING_CANCELLED'
  | 'BOOKING_EDITED'
  | 'BOOKING_APPROVED'
  | 'ROOM_CREATED'
  | 'ROOM_UPDATED'
  | 'ROOM_DELETED'
  | 'IT_STATUS_CHANGED'
  | 'ROOM_BLOCKED'
  | 'ROOM_UNBLOCKED'
  | 'SETTINGS_UPDATED'
  | 'USER_LOGIN'
  | 'USER_CREATED'
  | 'USER_UPDATED'
  | 'USER_DELETED'
  | 'PASSWORD_CHANGED'
  | 'PROFILE_UPDATED'
  | 'COMPANY_CREATED'
  | 'COMPANY_UPDATED'
  | 'COMPANY_DELETED'
  | 'DEPARTMENT_CREATED'
  | 'DEPARTMENT_UPDATED'
  | 'DEPARTMENT_DELETED'
  | 'DESIGNATION_CREATED'
  | 'DESIGNATION_UPDATED'
  | 'DESIGNATION_DELETED'
  | 'SERVICE_UPDATED';

export interface AuditLogEntry {
  id: string;
  timestamp: Date;
  userId: string;
  userName: string;
  action: AuditAction;
  details: string;
  ipAddress?: string;
}

export interface BlockedSlot {
  id: string;
  roomId: string;
  startTime: Date;
  endTime: Date;
  reason: string;
  blockedBy: string;
}

export interface AppNotification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  timestamp: Date;
  read: boolean;
}

export interface PortalSettings {
  portalName: string;
  maxBookingDuration: number;
  maxAdvanceBookingDays: number;
  autoApproveBookings: boolean;
  requireApprovalAboveCapacity: number;
  allowWeekendBookings: boolean;
  maintenanceMode: boolean;
  maintenanceMessage: string;
  emailNotifications: boolean;
  itAutoAssign: boolean;
}

export interface LdapSettings {
  enabled: boolean;
  serverUrl: string;
  port: number;
  useSsl: boolean;
  bindDn: string;
  bindPassword: string;
  baseDn: string;
  userSearchFilter: string;
  usernameAttribute: string;
  emailAttribute: string;
  displayNameAttribute: string;
  groupSearchBase: string;
  adminGroupDn: string;
  itGroupDn: string;
  receptionGroupDn: string;
  administrationGroupDn: string;
  connectionTimeout: number;
  searchTimeout: number;
}

export interface SmtpSettings {
  enabled: boolean;
  host: string;
  port: number;
  useTls: boolean;
  username: string;
  password: string;
  fromAddress: string;
  fromName: string;
  replyToAddress: string;
  sendBookingConfirmation: boolean;
  sendCancellationNotice: boolean;
  sendITTaskNotification: boolean;
  sendDailyDigest: boolean;
  ccReception: boolean;
}

export interface GoogleMeetCompanyConfig {
  enabled: boolean;
  serviceAccountEmail: string;
  privateKey: string;
  impersonateEmail: string;
}

export interface WebexAccountConfig {
  id: string;
  label: string;
  /** When false, this account is skipped for new link generation. Missing = enabled (accounts saved before this flag existed). */
  enabled?: boolean;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

export interface VcIntegrationSettings {
  googleMeet: {
    companies: Record<string, GoogleMeetCompanyConfig>;
  };
  webex: {
    enabled: boolean;
    /** Company IDs allowed to use Webex — the account pool itself stays shared across all of them */
    companies: string[];
    accounts: WebexAccountConfig[];
  };
}

/** Non-secret subset of VcIntegrationSettings — safe for any authenticated user (used to drive the
 *  platform picker in the booking form and to resolve a Webex account id to its label in the IT Queue). */
export interface VcAvailability {
  googleMeet: {
    /** Company IDs with Google Meet auto-generation enabled */
    companies: string[];
  };
  webex: {
    enabled: boolean;
    /** Company IDs allowed to use Webex */
    companies: string[];
    accounts: { id: string; label: string }[];
  };
}

export interface Company {
  id: string;
  name: string;
  code: string;
  active: boolean;
}

export interface Department {
  id: string;
  companyIds: string[];
  name: string;
  code: string;
  active: boolean;
}

export interface Designation {
  id: string;
  companyIds: string[];
  name: string;
  code: string;
  active: boolean;
}

export interface ManagedUser {
  id: string;
  name: string;
  domainId: string;
  email: string;
  role: UserRole;
  companyId?: string;
  departmentId?: string;
  designationId?: string;
  active: boolean;
  lastLogin?: Date;
  isLocal?: boolean;
}

export interface DatabaseSettings {
  enabled: boolean;
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
}

export interface ExportManifest {
  version: string;
  exportedAt: string;
  exportedBy: string;
  sections: string[];
}

export interface RoomBlockConfig {
  id: string;
  name: string;
  code: string;
  active: boolean;
  itEmail: string;
  receptionEmail: string;
  adminEmail: string;
}

export interface Facility {
  id: string;
  name: string;
  active: boolean;
}

// ─── Service Requests ────────────────────────────────────

export enum ServiceCategory {
  FOOD_BEVERAGE = 'FOOD_BEVERAGE',
  STATIONERY = 'STATIONERY',
  EQUIPMENT = 'EQUIPMENT',
  OTHER = 'OTHER',
}

export enum ServiceStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export interface ServiceRequest {
  id: string;
  bookingId: string;
  category: ServiceCategory;
  items: string[];
  quantity: number;
  notes?: string;
  status: ServiceStatus;
  handledBy?: string;
  handledByName?: string;
  completedAt?: Date;
  createdAt: Date;
}

// Predefined service items per category
export const SERVICE_ITEMS: Record<ServiceCategory, string[]> = {
  [ServiceCategory.FOOD_BEVERAGE]: ['Tea/Coffee', 'Water Bottles', 'Snacks/Biscuits', 'Food/Meal', 'Refreshments'],
  [ServiceCategory.STATIONERY]: ['Notepads & Pens', 'Whiteboard Markers', 'Sticky Notes', 'Printing/Copies'],
  [ServiceCategory.EQUIPMENT]: ['Flipchart', 'Extension Board', 'Name Plates', 'Laser Pointer'],
  [ServiceCategory.OTHER]: [],
};

export const SERVICE_CATEGORY_LABELS: Record<ServiceCategory, string> = {
  [ServiceCategory.FOOD_BEVERAGE]: 'Food & Beverage',
  [ServiceCategory.STATIONERY]: 'Stationery',
  [ServiceCategory.EQUIPMENT]: 'Equipment',
  [ServiceCategory.OTHER]: 'Other',
};

// ─── Booking Attachments ─────────────────────────────────

export interface BookingAttachment {
  id: string;
  bookingId: string;
  originalName: string;
  size: number;
  mimeType: string;
  uploadedBy: string;
  createdAt: Date;
}