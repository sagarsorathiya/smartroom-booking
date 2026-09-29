import { Router, Request, Response } from 'express';
import path from 'path';
import prisma from '../prisma.js';
import { toFrontendBooking } from '../mappers.js';
import pkg from '@prisma/client';
const { BookingStatus, ITStatus } = pkg;
import { sendBookingConfirmation, sendCancellationNotice, sendITTaskNotification, sendMeetingLinkUpdate, sendITTaskLinkUpdate, sendServiceRequestNotification, type BookingInfo } from '../services/email.js';
import { getClientIp } from '../utils/ip.js';
import { createBookingSchema, updateBookingSchema } from '../validators/booking.js';
import { requireRole } from '../middleware/auth.js';
import { createGoogleMeetLink, updateGoogleMeetEventTime, type GoogleMeetConfig } from '../services/googleMeet.js';
import { createWebexMeeting, updateWebexMeetingTime, pickAvailableWebexAccount, type WebexAccount } from '../services/webex.js';

function fmtDt(d: Date | string): string {
  return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
}

export const bookingRoutes = Router();

// GET /api/bookings
bookingRoutes.get('/', async (req: Request, res: Response) => {
  const { userId, roomId, date, page, limit } = req.query;
  const where: any = {};
  if (userId) where.userId = userId as string;
  if (roomId) where.roomId = roomId as string;
  if (date) {
    const d = new Date(date as string);
    d.setHours(0, 0, 0, 0);
    const next = new Date(d);
    next.setDate(next.getDate() + 1);
    where.startTime = { gte: d, lt: next };
  }

  // Auto-complete past confirmed bookings (fire-and-forget)
  prisma.booking.updateMany({
    where: { status: 'CONFIRMED', endTime: { lt: new Date() } },
    data: { status: 'COMPLETED' },
  }).catch(() => {});

  const queryOptions: any = {
    where,
    include: { serviceRequests: true, attachments: true },
    orderBy: { startTime: 'asc' },
  };

  // Optional pagination — when page & limit are provided
  if (page && limit) {
    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(limit as string) || 20));
    queryOptions.skip = (pageNum - 1) * pageSize;
    queryOptions.take = pageSize;

    const [bookings, total] = await Promise.all([
      prisma.booking.findMany(queryOptions),
      prisma.booking.count({ where }),
    ]);
    res.json({ data: bookings.map(toFrontendBooking), total, page: pageNum, limit: pageSize });
    return;
  }

  const bookings = await prisma.booking.findMany(queryOptions);
  res.json(bookings.map(toFrontendBooking));
});

// GET /api/bookings/conflicts/check
bookingRoutes.get('/conflicts/check', async (req: Request, res: Response) => {
  const { roomId, startTime, endTime, excludeBookingId } = req.query;
  if (!roomId || !startTime || !endTime) {
    res.status(400).json({ error: 'roomId, startTime, endTime are required' });
    return;
  }

  const where: any = {
    roomId: roomId as string,
    status: { not: BookingStatus.CANCELLED },
    startTime: { lt: new Date(endTime as string) },
    endTime: { gt: new Date(startTime as string) },
  };
  if (excludeBookingId) where.id = { not: excludeBookingId as string };

  const conflicts = await prisma.booking.findMany({ where });
  res.json({ hasConflict: conflicts.length > 0, conflicts: conflicts.map(toFrontendBooking) });
});

// GET /api/bookings/:id
bookingRoutes.get('/:id', async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const booking = await prisma.booking.findUnique({ where: { id }, include: { serviceRequests: true, attachments: true } });
  if (!booking) { res.status(404).json({ error: 'Booking not found' }); return; }
  res.json(toFrontendBooking(booking));
});

// POST /api/bookings
bookingRoutes.post('/', async (req: Request, res: Response) => {
  const parsed = createBookingSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
    return;
  }

  const validData = parsed.data;

  // Fetch portal settings for enforcement
  const portalRow = await prisma.appSettings.findUnique({ where: { key: 'portal' } });
  const portal = portalRow ? JSON.parse(portalRow.value) : {};

  // Enforce maintenance mode
  if (portal.maintenanceMode) {
    res.status(503).json({ error: portal.maintenanceMessage || 'Portal is under maintenance. Bookings are disabled.' });
    return;
  }

  const {
    roomId, title, startTime, endTime,
    status, participants, company, department, chairPerson,
    agenda, serviceRequests: serviceReqData, recurrenceId,
  } = validData;
  const userId = validData.userId;
  let userName = validData.userName || '';
  const notifyEmails = validData.notifyEmails || [];
  const itRequirements = validData.itRequirements;

  const start = new Date(startTime);
  const end = new Date(endTime);

  // Enforce allowWeekendBookings
  if (portal.allowWeekendBookings === false) {
    const day = start.getDay();
    if (day === 0 || day === 6) {
      res.status(400).json({ error: 'Weekend bookings are not allowed.' });
      return;
    }
  }

  // Enforce maxBookingDuration
  const maxDuration = portal.maxBookingDuration || 10;
  const durationHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
  if (durationHours > maxDuration) {
    res.status(400).json({ error: `Booking duration cannot exceed ${maxDuration} hours.` });
    return;
  }

  // Enforce maxAdvanceBookingDays
  const maxAdvanceDays = portal.maxAdvanceBookingDays || 365;
  if (maxAdvanceDays > 0) {
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + maxAdvanceDays);
    maxDate.setHours(23, 59, 59, 999);
    if (start.getTime() > maxDate.getTime()) {
      res.status(400).json({ error: `Cannot book more than ${maxAdvanceDays} days in advance.` });
      return;
    }
  }

  const it = itRequirements || {};
  // Determine booking status based on portal settings
  let resolvedStatus = status || 'CONFIRMED';
  if (portal.autoApproveBookings === false) {
    resolvedStatus = 'PENDING';
  }
  if (portal.requireApprovalAboveCapacity > 0 && participants > portal.requireApprovalAboveCapacity) {
    resolvedStatus = 'PENDING';
  }

  // Determine booking owner: support book-on-behalf for IT/RECEPTION/ADMIN
  const { bookForUserId } = validData;
  let resolvedUserId = req.user?.userId || userId;
  let resolvedUserName = userName;

  if (bookForUserId && req.user) {
    const callerRole = req.user.role;
    if (['IT', 'RECEPTION', 'ADMINISTRATION', 'ADMIN'].includes(callerRole)) {
      const targetUser = await prisma.user.findUnique({ where: { id: bookForUserId } });
      if (targetUser) {
        resolvedUserId = targetUser.id;
        resolvedUserName = targetUser.name;
      }
    }
  } else if (req.user?.userId) {
    const authUser = await prisma.user.findUnique({ where: { id: req.user.userId } });
    resolvedUserName = authUser?.name || userName;
  }

  // Conflict check + create wrapped in a transaction to prevent race conditions
  // Check room-level access restriction before entering transaction
  const targetRoom = await prisma.room.findUnique({ where: { id: roomId } });
  if (!targetRoom) { res.status(404).json({ error: 'Room not found' }); return; }
  if (targetRoom.restricted) {
    const callerRole = req.user?.role || '';
    const exempt = ['ADMIN', 'RECEPTION', 'IT'].includes(callerRole);
    if (!exempt && !targetRoom.allowedUserIds.includes(resolvedUserId || '')) {
      res.status(403).json({ error: 'You are not authorised to book this room.' });
      return;
    }
  }

  const booking = await prisma.$transaction(async (tx) => {
    const conflicts = await tx.booking.findMany({
      where: {
        roomId,
        status: { not: BookingStatus.CANCELLED },
        startTime: { lt: new Date(endTime) },
        endTime: { gt: new Date(startTime) },
      },
    });
    if (conflicts.length > 0) {
      throw new Error('CONFLICT:Time slot conflicts with an existing booking.');
    }

    // Check blocked slots
    const blockedConflicts = await tx.blockedSlot.findMany({
      where: {
        roomId,
        startTime: { lt: new Date(endTime) },
        endTime: { gt: new Date(startTime) },
      },
    });
    if (blockedConflicts.length > 0) {
      throw new Error('CONFLICT:Time slot is blocked.');
    }

    return tx.booking.create({
      data: {
        roomId,
        userId: resolvedUserId || '',
        userName: resolvedUserName,
        title,
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        status: resolvedStatus,
        participants,
        company,
        department,
        chairPerson,
        agenda: agenda || null,
        notifyEmails: Array.isArray(notifyEmails) ? notifyEmails : [],
        recurrenceId: recurrenceId || null,
        vcRequired: it.vcRequired || false,
        createMeetingLink: it.createMeetingLink || false,
        existingLink: it.existingLink || null,
        generatedLink: it.generatedLink || null,
        platform: it.platform || null,
        meetingNumber: it.meetingNumber || null,
        meetingPassword: it.meetingPassword || null,
        avSetup: it.avSetup || false,
        supportStandby: it.supportStandby || false,
        itNotes: it.notes || null,
        itStatus: (portal.itAutoAssign === false) ? ITStatus.COMPLETED : ((it.status as any) || ITStatus.PENDING),
        serviceRequests: Array.isArray(serviceReqData) && serviceReqData.length > 0 ? {
          create: serviceReqData.map((sr: any) => ({
            category: sr.category,
            items: sr.items || [],
            quantity: sr.quantity || 1,
            notes: sr.notes || null,
          })),
        } : undefined,
      },
      include: { serviceRequests: true, attachments: true },
    });
  }).catch((err: Error) => {
    if (err.message.startsWith('CONFLICT:')) {
      res.status(409).json({ error: err.message.slice(9) });
      return null;
    }
    throw err;
  });

  if (!booking) return;

  // Send email notifications (fire-and-forget)
  const room = await prisma.room.findUnique({ where: { id: roomId } });
  const booker = await prisma.user.findUnique({ where: { id: resolvedUserId } });

  const auditUserId = req.user?.userId || resolvedUserId || '';
  const auditDetails = bookForUserId && resolvedUserId !== auditUserId
    ? `Booked "${title}" on behalf of ${resolvedUserName}`
    : `Booked "${title}"`;
  await prisma.auditLog.create({
    data: { userId: auditUserId, userName: resolvedUserName, action: 'BOOKING_CREATED', details: `${auditDetails} — Room: ${room?.name || roomId}${room?.block ? ` (${room.block})` : ''}, Time: ${fmtDt(startTime)} – ${fmtDt(endTime)}, Chair: ${chairPerson}, Company: ${company}, Dept: ${department}, Participants: ${participants}${it.vcRequired ? `, VC: ${it.platform || 'Yes'}` : ''}`, ipAddress: getClientIp(req) },
  });

  if (room && booker && portal.emailNotifications !== false) {
    const info: BookingInfo = {
      id: booking.id, title, roomName: room.name, roomBlock: room.block, startTime: booking.startTime, endTime: booking.endTime,
      chairPerson, participants, company, department,
      userName: resolvedUserName, userEmail: booker.email,
      vcRequired: it.vcRequired, platform: it.platform || undefined,
      existingLink: it.existingLink || undefined,
      meetingNumber: it.meetingNumber || undefined,
      meetingPassword: it.meetingPassword || undefined,
      avSetup: it.avSetup, supportStandby: it.supportStandby,
      agenda: agenda || undefined,
      notifyEmails: Array.isArray(notifyEmails) ? notifyEmails : [],
      roomNotifyEmail: room.notifyEmail || undefined,
    };
    // deferEmail=1 means the client will upload attachments and then call /send-confirmation
    if (req.query.deferEmail !== '1') {
      sendBookingConfirmation(info).catch((e: any) => console.error('[EMAIL]', e.message));
    }
    if (it.vcRequired || it.avSetup || it.supportStandby) {
      sendITTaskNotification(info).catch((e: any) => console.error('[EMAIL]', e.message));
    }
    if (Array.isArray(serviceReqData) && serviceReqData.length > 0) {
      sendServiceRequestNotification(info, serviceReqData.map((sr: any) => ({
        category: sr.category, items: sr.items || [], quantity: sr.quantity || 1, notes: sr.notes,
      }))).catch((e: any) => console.error('[EMAIL]', e.message));
    }
  }

  res.status(201).json(toFrontendBooking(booking));
});

// POST /api/bookings/:id/send-confirmation
// Trigger the booking confirmation email (used after deferred upload).
bookingRoutes.post('/:id/send-confirmation', async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const booking = await prisma.booking.findUnique({
    where: { id },
    include: { serviceRequests: true, attachments: true },
  });
  if (!booking) { res.status(404).json({ error: 'Booking not found' }); return; }

  // Only the booking owner or elevated roles can trigger the confirmation email
  const callerRole = req.user!.role;
  const elevatedRoles = ['IT', 'RECEPTION', 'ADMINISTRATION', 'ADMIN'];
  if (booking.userId !== req.user!.userId && !elevatedRoles.includes(callerRole)) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }

  const room = await prisma.room.findUnique({ where: { id: booking.roomId } });
  const booker = await prisma.user.findUnique({ where: { id: booking.userId } });
  const portalRow = await prisma.appSettings.findUnique({ where: { key: 'portal' } });
  const portal = portalRow ? JSON.parse(portalRow.value) : {};

  if (room && booker && portal.emailNotifications !== false) {
    const info: BookingInfo = {
      id: booking.id,
      title: booking.title,
      roomName: room.name,
      roomBlock: room.block,
      startTime: booking.startTime,
      endTime: booking.endTime,
      chairPerson: booking.chairPerson,
      participants: booking.participants,
      company: booking.company,
      department: booking.department,
      userName: booking.userName,
      userEmail: booker.email,
      vcRequired: booking.vcRequired,
      platform: booking.platform || undefined,
      existingLink: booking.existingLink || undefined,
      meetingNumber: booking.meetingNumber || undefined,
      meetingPassword: booking.meetingPassword || undefined,
      avSetup: booking.avSetup,
      supportStandby: booking.supportStandby,
      agenda: booking.agenda || undefined,
      notifyEmails: booking.notifyEmails || [],
      roomNotifyEmail: room.notifyEmail || undefined,
      emailAttachments: (booking.attachments || []).map((a: any) => ({
        filename: a.originalName,
        path: path.join(process.cwd(), 'uploads', 'bookings', a.filename),
        contentType: a.mimeType,
      })),
    };
    sendBookingConfirmation(info).catch((e: any) => console.error('[EMAIL]', e.message));
  }

  res.json({ success: true });
});

// PUT /api/bookings/:id
bookingRoutes.put('/:id', async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const existing = await prisma.booking.findUnique({ where: { id } });
  if (!existing) { res.status(404).json({ error: 'Booking not found' }); return; }

  // Only the booking owner, IT, RECEPTION, or ADMIN can edit a booking
  if (req.user && existing.userId !== req.user.userId && !['IT', 'RECEPTION', 'ADMINISTRATION', 'ADMIN'].includes(req.user.role)) {
    res.status(403).json({ error: 'You can only edit your own bookings' });
    return;
  }

  const parsed = updateBookingSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
    return;
  }
  const validUpdate = parsed.data;
  const {
    roomId, title, startTime, endTime,
    status, participants, company, department, chairPerson,
    itRequirements, userId, userName, agenda,
  } = validUpdate;

  const newRoomId = roomId || existing.roomId;
  const newStart = startTime ? new Date(startTime) : existing.startTime;
  const newEnd = endTime ? new Date(endTime) : existing.endTime;

  // Enforce portal rules on edits as well
  const portalRowEdit = await prisma.appSettings.findUnique({ where: { key: 'portal' } });
  const portalEdit = portalRowEdit ? JSON.parse(portalRowEdit.value) : {};

  if (portalEdit.maintenanceMode) {
    res.status(503).json({ error: portalEdit.maintenanceMessage || 'Portal is under maintenance. Edits are disabled.' });
    return;
  }

  if (portalEdit.allowWeekendBookings === false) {
    const day = newStart.getDay();
    if (day === 0 || day === 6) {
      res.status(400).json({ error: 'Weekend bookings are not allowed.' });
      return;
    }
  }

  const maxDurationEdit = portalEdit.maxBookingDuration || 10;
  const durationHoursEdit = (newEnd.getTime() - newStart.getTime()) / (1000 * 60 * 60);
  if (durationHoursEdit > maxDurationEdit) {
    res.status(400).json({ error: `Booking duration cannot exceed ${maxDurationEdit} hours.` });
    return;
  }

  // Conflict check (excluding self)
  const conflicts = await prisma.booking.findMany({
    where: {
      roomId: newRoomId,
      id: { not: id },
      status: { not: BookingStatus.CANCELLED },
      startTime: { lt: newEnd },
      endTime: { gt: newStart },
    },
  });
  if (conflicts.length > 0) {
    res.status(409).json({ error: 'Updated time conflicts with an existing booking.' });
    return;
  }

  // Check blocked slots for edits
  const blockedConflictsEdit = await prisma.blockedSlot.findMany({
    where: {
      roomId: newRoomId,
      startTime: { lt: newEnd },
      endTime: { gt: newStart },
    },
  });
  if (blockedConflictsEdit.length > 0) {
    res.status(409).json({ error: 'Updated time overlaps with a blocked slot.' });
    return;
  }

  const it = itRequirements || {};
  const updateData: any = { editedAt: new Date() };
  if (roomId !== undefined) updateData.roomId = roomId;
  if (title !== undefined) updateData.title = title;
  if (startTime !== undefined) updateData.startTime = new Date(startTime);
  if (endTime !== undefined) updateData.endTime = new Date(endTime);
  if (status !== undefined) updateData.status = status;
  if (participants !== undefined) updateData.participants = participants;
  if (company !== undefined) updateData.company = company;
  if (department !== undefined) updateData.department = department;
  if (chairPerson !== undefined) updateData.chairPerson = chairPerson;
  if (agenda !== undefined) updateData.agenda = agenda || null;
  if (req.body.notifyEmails !== undefined) updateData.notifyEmails = Array.isArray(req.body.notifyEmails) ? req.body.notifyEmails : [];
  if (itRequirements) {
    if (it.vcRequired !== undefined) updateData.vcRequired = it.vcRequired;
    if (it.createMeetingLink !== undefined) updateData.createMeetingLink = it.createMeetingLink;
    if (it.existingLink !== undefined) updateData.existingLink = it.existingLink;
    if (it.generatedLink !== undefined) updateData.generatedLink = it.generatedLink;
    if (it.platform !== undefined) updateData.platform = it.platform;
    if (it.meetingNumber !== undefined) updateData.meetingNumber = it.meetingNumber;
    if (it.meetingPassword !== undefined) updateData.meetingPassword = it.meetingPassword;
    if (it.avSetup !== undefined) updateData.avSetup = it.avSetup;
    if (it.supportStandby !== undefined) updateData.supportStandby = it.supportStandby;
    if (it.notes !== undefined) updateData.itNotes = it.notes;
    // itStatus is NOT updated here — it is owned exclusively by the updateITStatus endpoint
    // and the two auto-reopen rules below (new requirement / schedule change).
    // Accepting it.status from the client would allow stale frontend state to silently
    // reset a COMPLETED IT task back to PENDING on any ordinary booking edit.
  }

  // Reopen IT task if new requirements are added while status was COMPLETED
  if (itRequirements && existing.itStatus === 'COMPLETED') {
    const wouldAddNewIt =
      (!existing.vcRequired && it.vcRequired) ||
      (!existing.avSetup && it.avSetup) ||
      (!existing.supportStandby && it.supportStandby);
    if (wouldAddNewIt) {
      updateData.itStatus = 'PENDING';
    }
  }

  // D4: Reopen IT task only when the START time changes — the VC link and AV setup are
  // tied to when the meeting begins (IT needs to reschedule). A room change alone does NOT
  // invalidate the link, so it is intentionally excluded from this check. An end-time-only
  // change (e.g. the Adjust End Time modal, used for early close / extending in place) also
  // does NOT invalidate the link — the meeting still starts at the same time with the same
  // link, it just runs shorter or longer — so it must NOT trigger a reopen either.
  // Compare at minute-level precision so sub-second DB rounding never falsely triggers a reopen.
  const toMin = (t: number) => Math.floor(t / 60000);
  const scheduleChangedOnEdit =
    !!startTime && toMin(new Date(startTime).getTime()) !== toMin(existing.startTime.getTime());
  if (scheduleChangedOnEdit && existing.itStatus === 'COMPLETED' &&
      (existing.vcRequired || existing.avSetup || existing.supportStandby)) {
    updateData.itStatus = 'PENDING';
  }

  const booking = await prisma.booking.update({
    where: { id },
    data: updateData,
    include: { serviceRequests: true, attachments: true },
  });

  // Send updated booking confirmation email (fire-and-forget)
  const room = await prisma.room.findUnique({ where: { id: booking.roomId } });

  await prisma.auditLog.create({
    data: {
      userId: req.user?.userId || existing.userId,
      userName: req.user?.name || existing.userName,
      action: 'BOOKING_EDITED',
      details: `Edited booking "${existing.title}" — Room: ${room?.name || booking.roomId}${room?.block ? ` (${room.block})` : ''}, Time: ${fmtDt(booking.startTime)} – ${fmtDt(booking.endTime)}, Chair: ${booking.chairPerson}, Company: ${booking.company}, Dept: ${booking.department}, Participants: ${booking.participants}`,
      ipAddress: getClientIp(req),
    },
  });

  const booker = await prisma.user.findUnique({ where: { id: booking.userId } });
  if (room && booker) {
    // Check emailNotifications setting
    const portalRow2 = await prisma.appSettings.findUnique({ where: { key: 'portal' } });
    const portalCfg = portalRow2 ? JSON.parse(portalRow2.value) : {};
    if (portalCfg.emailNotifications !== false) {
      const editInfo: BookingInfo = {
        id: booking.id, title: booking.title, roomName: room.name, roomBlock: room.block,
        startTime: booking.startTime, endTime: booking.endTime,
        chairPerson: booking.chairPerson, participants: booking.participants,
        company: booking.company, department: booking.department,
        userName: booking.userName, userEmail: booker.email,
        vcRequired: booking.vcRequired, platform: booking.platform || undefined,
        existingLink: booking.existingLink || undefined,
        generatedLink: booking.generatedLink || undefined,
        meetingNumber: booking.meetingNumber || undefined,
        meetingPassword: booking.meetingPassword || undefined,
        avSetup: booking.avSetup, supportStandby: booking.supportStandby,
        agenda: booking.agenda || undefined,
        notifyEmails: booking.notifyEmails || [],
        roomNotifyEmail: room.notifyEmail || undefined,
        emailAttachments: (booking.attachments || []).map((a: any) => ({
          filename: a.originalName,
          path: path.join(process.cwd(), 'uploads', 'bookings', a.filename),
          contentType: a.mimeType,
        })),
      };

      // Detect what changed to send targeted emails
      const roomChangedForEmail = existing.roomId !== booking.roomId;
      const startChangedForEmail = existing.startTime.getTime() !== booking.startTime.getTime();
      const endChangedForEmail = existing.endTime.getTime() !== booking.endTime.getTime();
      // An end-time-only edit on a meeting that has already started (e.g. the Adjust End Time
      // modal, used to close early or extend in place) shouldn't blast an "updated" email —
      // attendees are already in the meeting; nothing about when/where it started changed.
      const isOngoingEndTimeOnlyEdit = !roomChangedForEmail && !startChangedForEmail && endChangedForEmail
        && existing.startTime.getTime() <= Date.now();
      const scheduleChanged = (roomChangedForEmail || startChangedForEmail || endChangedForEmail) && !isOngoingEndTimeOnlyEdit;

      const existingNotify = existing.notifyEmails || [];
      const updatedNotify = booking.notifyEmails || [];
      const newNotifyEmails = updatedNotify.filter((e: string) => !existingNotify.includes(e));

      const itRequirementsNewlyAdded =
        (!existing.vcRequired && booking.vcRequired) ||
        (!existing.avSetup && booking.avSetup) ||
        (!existing.supportStandby && booking.supportStandby);

      if (scheduleChanged) {
        // Room/date/time changed → notify everyone (booker + all notify + IT + admin)
        sendBookingConfirmation(editInfo, true).catch((e: any) => console.error('[EMAIL]', e.message));
        // Re-notify IT if any IT requirements exist (even if completed — time/room changed)
        if (booking.vcRequired || booking.avSetup || booking.supportStandby) {
          sendITTaskNotification(editInfo).catch((e: any) => console.error('[EMAIL]', e.message));
        }
        // Re-notify admin for service requests (time/room changed)
        if (booking.serviceRequests && booking.serviceRequests.length > 0) {
          sendServiceRequestNotification(editInfo, booking.serviceRequests.map((sr: any) => ({
            category: sr.category, items: sr.items || [], quantity: sr.quantity || 1, notes: sr.notes,
          }))).catch((e: any) => console.error('[EMAIL]', e.message));
        }
      } else if (newNotifyEmails.length > 0) {
        // Only new notify recipients added → send invite only to them (no reception re-notify)
        sendBookingConfirmation({ ...editInfo, notifyEmails: newNotifyEmails }, false, { skipBooker: true, skipReception: true })
          .catch((e: any) => console.error('[EMAIL]', e.message));
      }

      // Send IT task notification only if IT requirements were newly added (reopens if was COMPLETED)
      if (!scheduleChanged && itRequirementsNewlyAdded) {
        sendITTaskNotification(editInfo).catch((e: any) => console.error('[EMAIL]', e.message));
      }
    }
  }

  res.json(toFrontendBooking(booking));
});

// PATCH /api/bookings/series/:recurrenceId/cancel — cancel bookings in a recurring series
// Body: { userId, userName, fromNow?: boolean }
// fromNow=true → cancel only future occurrences (startTime >= now); false/omitted → cancel all
bookingRoutes.patch('/series/:recurrenceId/cancel', async (req: Request, res: Response) => {
  const { recurrenceId } = req.params;
  const { userId, userName, fromNow, cancellationReason }: any = req.body;

  const where: any = {
    recurrenceId,
    status: { not: BookingStatus.CANCELLED },
  };
  if (fromNow) {
    where.startTime = { gte: new Date() };
  }

  const bookings = await prisma.booking.findMany({
    where,
    include: { serviceRequests: true, attachments: true },
  });

  if (bookings.length === 0) {
    res.status(404).json({ error: 'No upcoming bookings found for this series' });
    return;
  }

  // Only the booking owner or ADMIN/RECEPTION can cancel the series
  const firstBooking = bookings[0];
  if (req.user && firstBooking.userId !== req.user.userId && !['RECEPTION', 'ADMINISTRATION', 'ADMIN'].includes(req.user.role)) {
    res.status(403).json({ error: 'You can only cancel your own bookings' });
    return;
  }

  const cancelledIds: string[] = [];

  for (const b of bookings) {
    const updateData: any = { status: 'CANCELLED' };
    if (b.vcRequired || b.avSetup || b.supportStandby) updateData.itStatus = 'CANCELLED';

    await prisma.booking.update({ where: { id: b.id }, data: updateData });

    if (b.serviceRequests.length > 0) {
      await prisma.serviceRequest.updateMany({
        where: { bookingId: b.id, status: { notIn: ['COMPLETED', 'CANCELLED'] } },
        data: { status: 'CANCELLED' },
      });
    }
    cancelledIds.push(b.id);
  }

  const scopeLabel = fromNow ? 'remaining future occurrences of' : 'entire';
  await prisma.auditLog.create({
    data: {
      userId: req.user?.userId || userId || firstBooking.userId,
      userName: req.user?.name || userName || firstBooking.userName,
      action: 'BOOKING_CANCELLED',
      details: `Cancelled ${scopeLabel} recurring series "${firstBooking.title}" (${cancelledIds.length} occurrences, recurrenceId: ${recurrenceId})`,
      ipAddress: getClientIp(req),
    },
  });

  // Send cancellation emails for each cancelled occurrence (fire-and-forget)
  const seriesRoom = await prisma.room.findUnique({ where: { id: firstBooking.roomId } });
  const seriesBooker = await prisma.user.findUnique({ where: { id: firstBooking.userId } });
  const portalRowSeries = await prisma.appSettings.findUnique({ where: { key: 'portal' } });
  const portalCfgSeries = portalRowSeries ? JSON.parse(portalRowSeries.value) : {};
  if (seriesRoom && seriesBooker && portalCfgSeries.emailNotifications !== false) {
    for (const b of bookings) {
      sendCancellationNotice({
        id: b.id, title: b.title, roomName: seriesRoom.name, roomBlock: seriesRoom.block,
        startTime: b.startTime, endTime: b.endTime,
        chairPerson: b.chairPerson, participants: b.participants,
        company: b.company, department: b.department,
        userName: req.user?.name || userName || b.userName, userEmail: seriesBooker.email,
        agenda: b.agenda || undefined,
        notifyEmails: b.notifyEmails || [],
        roomNotifyEmail: seriesRoom.notifyEmail || undefined,
        cancellationReason: cancellationReason || undefined,
      }, {
        hasServiceRequests: b.serviceRequests.length > 0,
        hasITRequirements: b.vcRequired === true,
      }).catch((e: any) => console.error('[EMAIL]', e.message));
    }
  }

  res.json({ cancelled: cancelledIds.length, ids: cancelledIds });
});

// PATCH /api/bookings/:id/status
bookingRoutes.patch('/:id/status', async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const { status, userId, userName, cancellationReason }: any = req.body;
  const existing = await prisma.booking.findUnique({ where: { id } });
  if (!existing) { res.status(404).json({ error: 'Booking not found' }); return; }

  // Only the booking owner, RECEPTION, or ADMIN can change booking status
  if (req.user && existing.userId !== req.user.userId && !['RECEPTION', 'ADMINISTRATION', 'ADMIN'].includes(req.user.role)) {
    res.status(403).json({ error: 'You can only modify your own bookings' });
    return;
  }

  const updateData: any = { status };
  // If cancelling a booking with an IT requirement, cancel IT task too
  if (status === 'CANCELLED' && (existing.vcRequired || existing.avSetup || existing.supportStandby)) {
    updateData.itStatus = 'CANCELLED';
  }

  const booking = await prisma.booking.update({
    where: { id },
    data: updateData,
    include: { serviceRequests: true, attachments: true },
  });

  // If cancelling, also cancel all non-completed service requests
  if (status === 'CANCELLED' && booking.serviceRequests.length > 0) {
    await prisma.serviceRequest.updateMany({
      where: {
        bookingId: id,
        status: { notIn: ['COMPLETED', 'CANCELLED'] },
      },
      data: { status: 'CANCELLED' },
    });
    // Update local booking object to reflect cancelled service requests
    booking.serviceRequests = booking.serviceRequests.map(sr =>
      sr.status !== 'COMPLETED' && sr.status !== 'CANCELLED'
        ? { ...sr, status: 'CANCELLED' as any }
        : sr
    );
  }

  const action = status === 'CANCELLED' ? 'BOOKING_CANCELLED' : 'BOOKING_APPROVED';
  await prisma.auditLog.create({
    data: { userId: req.user?.userId || existing.userId, userName: req.user?.name || existing.userName, action, details: `${status === 'CANCELLED' ? 'Cancelled' : 'Approved'} booking "${existing.title}" — Time: ${fmtDt(existing.startTime)} – ${fmtDt(existing.endTime)}, Chair: ${existing.chairPerson}, Company: ${existing.company}`, ipAddress: getClientIp(req) },
  });

  // Send cancellation email (fire-and-forget)
  if (status === 'CANCELLED') {
    const room = await prisma.room.findUnique({ where: { id: existing.roomId } });
    const booker = await prisma.user.findUnique({ where: { id: existing.userId } });
    // Check emailNotifications setting
    const portalRow3 = await prisma.appSettings.findUnique({ where: { key: 'portal' } });
    const portalCfg3 = portalRow3 ? JSON.parse(portalRow3.value) : {};
    if (room && booker && portalCfg3.emailNotifications !== false) {
      sendCancellationNotice({
        id: existing.id, title: existing.title, roomName: room.name, roomBlock: room.block,
        startTime: existing.startTime, endTime: existing.endTime,
        chairPerson: existing.chairPerson, participants: existing.participants,
        company: existing.company, department: existing.department,
        userName: userName || existing.userName, userEmail: booker.email,
        agenda: existing.agenda || undefined,
        notifyEmails: existing.notifyEmails || [],
        roomNotifyEmail: room.notifyEmail || undefined,
        cancellationReason: cancellationReason || undefined,
      }, {
        hasServiceRequests: booking.serviceRequests.length > 0,
        hasITRequirements: booking.vcRequired === true,
      }).catch((e: any) => console.error('[EMAIL]', e.message));
    }
  }

  res.json(toFrontendBooking(booking));
});

// PATCH /api/bookings/:id/it-status — IT/ADMIN only
bookingRoutes.patch('/:id/it-status', requireRole('IT', 'ADMIN'), async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const { status, generatedLink, meetingNumber, meetingPassword }: any = req.body;
  const existing = await prisma.booking.findUnique({ where: { id } });
  if (!existing) { res.status(404).json({ error: 'Booking not found' }); return; }

  const updateData: any = { itStatus: status };
  if (generatedLink) updateData.generatedLink = generatedLink;
  if (meetingNumber !== undefined) updateData.meetingNumber = meetingNumber;
  if (meetingPassword !== undefined) updateData.meetingPassword = meetingPassword;
  // Manually pasting/replacing a link here (this route, unlike /generate-vc-link, is never called by the
  // auto-generate integrations) means the link is no longer the one behind vcAccountRef/vcExternalEventId —
  // clear both so a stale pooled-account slot isn't held and "Update Time" doesn't reschedule the wrong meeting.
  if (generatedLink && generatedLink !== existing.generatedLink) {
    updateData.vcAccountRef = null;
    updateData.vcExternalEventId = null;
  }

  const booking = await prisma.booking.update({
    where: { id },
    data: updateData,
    include: { serviceRequests: true, attachments: true },
  });

  await prisma.auditLog.create({
    data: {
      userId: req.user!.userId,
      userName: req.user!.name || 'IT',
      action: 'IT_STATUS_CHANGED',
      details: `IT status for "${existing.title}" changed to ${status}${generatedLink ? ` — Link: ${generatedLink}` : ''}, Time: ${fmtDt(existing.startTime)} – ${fmtDt(existing.endTime)}, Chair: ${existing.chairPerson}`,
      ipAddress: getClientIp(req),
    },
  });

  // Send meeting link email to booker when IT completes the task
  if (status === 'COMPLETED' && (generatedLink || existing.generatedLink)) {
    const room = await prisma.room.findUnique({ where: { id: existing.roomId } });
    const booker = await prisma.user.findUnique({ where: { id: existing.userId } });
    // Check emailNotifications setting
    const portalRow4 = await prisma.appSettings.findUnique({ where: { key: 'portal' } });
    const portalCfg4 = portalRow4 ? JSON.parse(portalRow4.value) : {};
    if (room && booker && portalCfg4.emailNotifications !== false) {
      sendMeetingLinkUpdate({
        id: existing.id,
        title: existing.title,
        roomName: room.name,
        roomBlock: room.block,
        startTime: existing.startTime,
        endTime: existing.endTime,
        chairPerson: existing.chairPerson,
        participants: existing.participants,
        company: existing.company,
        department: existing.department,
        userName: existing.userName,
        userEmail: booker.email,
        agenda: existing.agenda || undefined,
        vcRequired: existing.vcRequired,
        platform: existing.platform || undefined,
        notifyEmails: existing.notifyEmails || [],
        generatedLink: generatedLink || existing.generatedLink || undefined,
        meetingNumber: meetingNumber ?? existing.meetingNumber ?? undefined,
        meetingPassword: meetingPassword ?? existing.meetingPassword ?? undefined,
      }).catch((e: any) => console.error('[EMAIL]', e.message));

      // Update existing IT task calendar event (same UID) with link details
      sendITTaskLinkUpdate({
        id: existing.id,
        title: existing.title,
        roomName: room.name,
        roomBlock: room.block,
        startTime: existing.startTime,
        endTime: existing.endTime,
        chairPerson: existing.chairPerson,
        participants: existing.participants,
        company: existing.company,
        department: existing.department,
        userName: existing.userName,
        userEmail: booker.email,
        agenda: existing.agenda || undefined,
        vcRequired: existing.vcRequired,
        platform: existing.platform || undefined,
        notifyEmails: existing.notifyEmails || [],
        generatedLink: generatedLink || existing.generatedLink || undefined,
        meetingNumber: meetingNumber ?? existing.meetingNumber ?? undefined,
        meetingPassword: meetingPassword ?? existing.meetingPassword ?? undefined,
      }).catch((e: any) => console.error('[EMAIL]', e.message));
    }
  }

  res.json(toFrontendBooking(booking));
});

// POST /api/bookings/:id/generate-vc-link — IT/ADMIN only
// Auto-generates a Google Meet / Webex link via the configured integration, and completes the IT task.
bookingRoutes.post('/:id/generate-vc-link', requireRole('IT', 'ADMIN'), async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const existing = await prisma.booking.findUnique({ where: { id } });
  if (!existing) { res.status(404).json({ error: 'Booking not found' }); return; }

  if (!existing.vcRequired || !existing.createMeetingLink || !['Google Meet', 'Webex'].includes(existing.platform || '')) {
    res.status(400).json({ error: 'This booking is not eligible for auto-generated links.' });
    return;
  }
  if (!['PENDING', 'IN_PROGRESS'].includes(existing.itStatus)) {
    res.status(400).json({ error: 'This IT task is not pending.' });
    return;
  }

  const vcSettingsRow = await prisma.appSettings.findUnique({ where: { key: 'vcIntegration' } });
  const vcSettings = vcSettingsRow ? JSON.parse(vcSettingsRow.value) : {};

  let generatedLink: string;
  let meetingNumber: string | undefined;
  let meetingPassword: string | undefined;
  let vcAccountRef: string | undefined;
  let vcExternalEventId: string;

  try {
    if (existing.platform === 'Google Meet') {
      const company = await prisma.company.findFirst({ where: { name: existing.company, active: true } });
      const cfg: GoogleMeetConfig | undefined = company ? vcSettings?.googleMeet?.companies?.[company.id] : undefined;
      if (!cfg || !cfg.enabled) {
        res.status(409).json({ error: `Google Meet isn't configured for "${existing.company}".` });
        return;
      }
      const result = await createGoogleMeetLink(cfg, { title: existing.title, startTime: existing.startTime, endTime: existing.endTime });
      generatedLink = result.link;
      vcExternalEventId = result.externalId;
    } else {
      const company = await prisma.company.findFirst({ where: { name: existing.company, active: true } });
      const webexCompanies: string[] = vcSettings?.webex?.companies || [];
      if (!vcSettings?.webex?.enabled || !company || !webexCompanies.includes(company.id)) {
        res.status(409).json({ error: `Webex isn't configured for "${existing.company}".` });
        return;
      }
      const accounts: WebexAccount[] = vcSettings.webex.accounts || [];
      const account = await pickAvailableWebexAccount(accounts, existing.startTime, existing.endTime);
      if (!account) {
        res.status(409).json({ error: 'No Webex account is free for this time slot.' });
        return;
      }
      const result = await createWebexMeeting(account, { title: existing.title, startTime: existing.startTime, endTime: existing.endTime, lockMeeting: req.body?.lockMeeting === true });
      generatedLink = result.link;
      meetingNumber = result.meetingNumber;
      meetingPassword = result.password;
      vcAccountRef = account.id;
      vcExternalEventId = result.externalId;
    }
  } catch (err: any) {
    res.status(502).json({ error: err.message || 'Failed to generate the meeting link.' });
    return;
  }

  const updateData: any = { generatedLink, itStatus: 'COMPLETED', vcExternalEventId };
  if (meetingNumber !== undefined) updateData.meetingNumber = meetingNumber;
  if (meetingPassword !== undefined) updateData.meetingPassword = meetingPassword;
  if (vcAccountRef !== undefined) updateData.vcAccountRef = vcAccountRef;

  const booking = await prisma.booking.update({
    where: { id },
    data: updateData,
    include: { serviceRequests: true, attachments: true },
  });

  await prisma.auditLog.create({
    data: {
      userId: req.user!.userId,
      userName: req.user!.name || 'IT',
      action: 'IT_STATUS_CHANGED',
      details: `Auto-generated ${existing.platform} link for "${existing.title}"${existing.platform === 'Webex' ? (req.body?.lockMeeting === true ? ' (locked)' : ' (unlocked)') : ''} — Link: ${generatedLink}, Time: ${fmtDt(existing.startTime)} – ${fmtDt(existing.endTime)}, Chair: ${existing.chairPerson}`,
      ipAddress: getClientIp(req),
    },
  });

  const room = await prisma.room.findUnique({ where: { id: existing.roomId } });
  const booker = await prisma.user.findUnique({ where: { id: existing.userId } });
  const portalRow5 = await prisma.appSettings.findUnique({ where: { key: 'portal' } });
  const portalCfg5 = portalRow5 ? JSON.parse(portalRow5.value) : {};
  if (room && booker && portalCfg5.emailNotifications !== false) {
    const emailInfo: BookingInfo = {
      id: existing.id, title: existing.title, roomName: room.name, roomBlock: room.block,
      startTime: existing.startTime, endTime: existing.endTime,
      chairPerson: existing.chairPerson, participants: existing.participants,
      company: existing.company, department: existing.department,
      userName: existing.userName, userEmail: booker.email,
      agenda: existing.agenda || undefined,
      vcRequired: existing.vcRequired, platform: existing.platform || undefined,
      notifyEmails: existing.notifyEmails || [],
      generatedLink, meetingNumber, meetingPassword,
    };
    sendMeetingLinkUpdate(emailInfo).catch((e: any) => console.error('[EMAIL]', e.message));
    sendITTaskLinkUpdate(emailInfo).catch((e: any) => console.error('[EMAIL]', e.message));
  }

  res.json(toFrontendBooking(booking));
});

// POST /api/bookings/:id/update-vc-link-time — IT/ADMIN only
// Reschedules the already-generated Google Meet/Webex meeting to the booking's current start/end
// time, keeping the same link/meeting number/password — used when a booking's date/time changes
// after IT already sent a link, instead of minting a brand-new meeting via generate-vc-link.
bookingRoutes.post('/:id/update-vc-link-time', requireRole('IT', 'ADMIN'), async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const existing = await prisma.booking.findUnique({ where: { id } });
  if (!existing) { res.status(404).json({ error: 'Booking not found' }); return; }

  if (!existing.generatedLink || !existing.vcExternalEventId || !['Google Meet', 'Webex'].includes(existing.platform || '')) {
    res.status(400).json({ error: 'This booking has no auto-generated link to update.' });
    return;
  }
  if (!['PENDING', 'IN_PROGRESS'].includes(existing.itStatus)) {
    res.status(400).json({ error: 'This IT task is not pending.' });
    return;
  }

  const vcSettingsRow = await prisma.appSettings.findUnique({ where: { key: 'vcIntegration' } });
  const vcSettings = vcSettingsRow ? JSON.parse(vcSettingsRow.value) : {};

  try {
    if (existing.platform === 'Google Meet') {
      const company = await prisma.company.findFirst({ where: { name: existing.company, active: true } });
      const cfg: GoogleMeetConfig | undefined = company ? vcSettings?.googleMeet?.companies?.[company.id] : undefined;
      if (!cfg || !cfg.enabled) {
        res.status(409).json({ error: `Google Meet isn't configured for "${existing.company}".` });
        return;
      }
      await updateGoogleMeetEventTime(cfg, existing.vcExternalEventId, { startTime: existing.startTime, endTime: existing.endTime });
    } else {
      const accounts: WebexAccount[] = vcSettings?.webex?.accounts || [];
      const account = accounts.find(a => a.id === existing.vcAccountRef);
      if (!account) {
        res.status(409).json({ error: 'The Webex account that hosts this meeting is no longer configured.' });
        return;
      }
      await updateWebexMeetingTime(account, existing.vcExternalEventId, { title: existing.title, startTime: existing.startTime, endTime: existing.endTime });
    }
  } catch (err: any) {
    res.status(502).json({ error: err.message || 'Failed to update the meeting time.' });
    return;
  }

  const booking = await prisma.booking.update({
    where: { id },
    data: { itStatus: 'COMPLETED' },
    include: { serviceRequests: true, attachments: true },
  });

  await prisma.auditLog.create({
    data: {
      userId: req.user!.userId,
      userName: req.user!.name || 'IT',
      action: 'IT_STATUS_CHANGED',
      details: `Updated ${existing.platform} meeting time in place for "${existing.title}" — Time: ${fmtDt(existing.startTime)} – ${fmtDt(existing.endTime)}, Chair: ${existing.chairPerson}`,
      ipAddress: getClientIp(req),
    },
  });

  const room = await prisma.room.findUnique({ where: { id: existing.roomId } });
  const booker = await prisma.user.findUnique({ where: { id: existing.userId } });
  const portalRow6 = await prisma.appSettings.findUnique({ where: { key: 'portal' } });
  const portalCfg6 = portalRow6 ? JSON.parse(portalRow6.value) : {};
  if (room && booker && portalCfg6.emailNotifications !== false) {
    const emailInfo: BookingInfo = {
      id: existing.id, title: existing.title, roomName: room.name, roomBlock: room.block,
      startTime: existing.startTime, endTime: existing.endTime,
      chairPerson: existing.chairPerson, participants: existing.participants,
      company: existing.company, department: existing.department,
      userName: existing.userName, userEmail: booker.email,
      agenda: existing.agenda || undefined,
      vcRequired: existing.vcRequired, platform: existing.platform || undefined,
      notifyEmails: existing.notifyEmails || [],
      generatedLink: existing.generatedLink || undefined,
      meetingNumber: existing.meetingNumber || undefined,
      meetingPassword: existing.meetingPassword || undefined,
    };
    sendMeetingLinkUpdate(emailInfo).catch((e: any) => console.error('[EMAIL]', e.message));
    sendITTaskLinkUpdate(emailInfo).catch((e: any) => console.error('[EMAIL]', e.message));
  }

  res.json(toFrontendBooking(booking));
});

// PATCH /api/bookings/:id/it-archive — IT/ADMIN only
bookingRoutes.patch('/:id/it-archive', requireRole('IT', 'ADMIN'), async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const { archived }: any = req.body;
  const existing = await prisma.booking.findUnique({ where: { id } });
  if (!existing) { res.status(404).json({ error: 'Booking not found' }); return; }

  const booking = await prisma.booking.update({
    where: { id },
    data: { itArchived: !!archived },
    include: { serviceRequests: true, attachments: true },
  });

  res.json(toFrontendBooking(booking));
});
