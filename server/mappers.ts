// Enum mapping between frontend display values and Prisma enum values

import pkg from '@prisma/client';
const { RoomType } = pkg;
type RoomTypeEnum = (typeof RoomType)[keyof typeof RoomType];

// Frontend → Prisma
export function toDbRoomType(frontendType: string): RoomTypeEnum {
  switch (frontendType) {
    case 'Conference': return RoomType.CONFERENCE;
    case 'Board Room': return RoomType.BOARD;
    default: return RoomType.CONFERENCE;
  }
}

export function toDbRoomBlock(frontendBlock: string): string {
  return frontendBlock;
}

// Prisma → Frontend
export function fromDbRoomType(dbType: RoomTypeEnum): string {
  switch (dbType) {
    case RoomType.CONFERENCE: return 'Conference';
    case RoomType.BOARD: return 'Board Room';
    default: return 'Conference';
  }
}

export function fromDbRoomBlock(dbBlock: string): string {
  return dbBlock;
}

// Transform a DB room record to frontend shape
export function toFrontendRoom(dbRoom: any) {
  return {
    id: dbRoom.id,
    name: dbRoom.name,
    type: fromDbRoomType(dbRoom.type),
    block: fromDbRoomBlock(dbRoom.block),
    capacity: dbRoom.capacity,
    facilities: dbRoom.facilities,
    imageUrl: dbRoom.imageUrl,
    notifyEmail: dbRoom.notifyEmail || '',
    restricted: dbRoom.restricted ?? false,
    allowedUserIds: dbRoom.allowedUserIds ?? [],
  };
}

// Transform a DB booking record to frontend shape
export function toFrontendBooking(dbBooking: any) {
  return {
    id: dbBooking.id,
    roomId: dbBooking.roomId,
    userId: dbBooking.userId,
    userName: dbBooking.userName,
    title: dbBooking.title,
    startTime: dbBooking.startTime,
    endTime: dbBooking.endTime,
    status: dbBooking.status,
    participants: dbBooking.participants,
    company: dbBooking.company,
    department: dbBooking.department,
    chairPerson: dbBooking.chairPerson,
    agenda: dbBooking.agenda || undefined,
    notifyEmails: dbBooking.notifyEmails || [],
    recurrenceId: dbBooking.recurrenceId || undefined,
    editedAt: dbBooking.editedAt,
    itRequirements: {
      vcRequired: dbBooking.vcRequired,
      createMeetingLink: dbBooking.createMeetingLink,
      existingLink: dbBooking.existingLink,
      generatedLink: dbBooking.generatedLink,
      meetingNumber: dbBooking.meetingNumber,
      meetingPassword: dbBooking.meetingPassword,
      platform: dbBooking.platform,
      avSetup: dbBooking.avSetup,
      supportStandby: dbBooking.supportStandby,
      notes: dbBooking.itNotes,
      status: dbBooking.itStatus,
      archived: dbBooking.itArchived,
      vcAccountRef: dbBooking.vcAccountRef || undefined,
      vcUpdatable: !!dbBooking.vcExternalEventId,
    },
    serviceRequests: (dbBooking.serviceRequests || []).map(toFrontendServiceRequest),
    attachments: (dbBooking.attachments || []).map(toFrontendAttachment),
  };
}

// Transform a DB booking attachment to frontend shape
export function toFrontendAttachment(a: any) {
  return {
    id: a.id,
    bookingId: a.bookingId,
    originalName: a.originalName,
    size: a.size,
    mimeType: a.mimeType,
    uploadedBy: a.uploadedBy,
    createdAt: a.createdAt,
  };
}

// Transform a DB service request to frontend shape
export function toFrontendServiceRequest(sr: any) {
  return {
    id: sr.id,
    bookingId: sr.bookingId,
    category: sr.category,
    items: sr.items,
    quantity: sr.quantity,
    notes: sr.notes || undefined,
    status: sr.status,
    handledBy: sr.handledBy || undefined,
    handledByName: sr.handledByName || undefined,
    completedAt: sr.completedAt,
    createdAt: sr.createdAt,
  };
}

// Transform a DB user record to frontend shape
export function toFrontendUser(dbUser: any) {
  return {
    id: dbUser.id,
    name: dbUser.name,
    domainId: dbUser.domainId,
    email: dbUser.email,
    role: dbUser.role,
    companyId: dbUser.companyId,
    departmentId: dbUser.departmentId,
    designationId: dbUser.designationId,
    active: dbUser.active,
    lastLogin: dbUser.lastLogin,
    isLocal: !!dbUser.passwordHash,
  };
}
