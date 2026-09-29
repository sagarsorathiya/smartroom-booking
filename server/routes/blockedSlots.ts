import { Router, Request, Response } from 'express';
import prisma from '../prisma.js';
import { getClientIp } from '../utils/ip.js';
import { requireRole } from '../middleware/auth.js';

export const blockedSlotRoutes = Router();

// GET /api/blocked-slots
blockedSlotRoutes.get('/', async (req: Request, res: Response) => {
  const where: any = {};
  if (req.query.roomId) where.roomId = req.query.roomId as string;
  const slots = await prisma.blockedSlot.findMany({ where, orderBy: { startTime: 'asc' } });
  res.json(slots.map(s => ({
    id: s.id,
    roomId: s.roomId,
    startTime: s.startTime,
    endTime: s.endTime,
    reason: s.reason,
    blockedBy: s.blockedBy,
  })));
});

// POST /api/blocked-slots — Admin only
blockedSlotRoutes.post('/', requireRole('ADMIN'), async (req: Request, res: Response) => {
  const { roomId, startTime, endTime, reason, blockedBy } = req.body;
  if (!roomId || !startTime || !endTime || !reason) {
    res.status(400).json({ error: 'roomId, startTime, endTime, and reason are required' }); return;
  }
  const start = new Date(startTime);
  const end = new Date(endTime);
  if (end.getTime() <= start.getTime()) {
    res.status(400).json({ error: 'End time must be after start time' }); return;
  }
  const roomExists = await prisma.room.findUnique({ where: { id: roomId } });
  if (!roomExists) {
    res.status(404).json({ error: 'Room not found' }); return;
  }
  const slot = await prisma.blockedSlot.create({
    data: { roomId, startTime: start, endTime: end, reason, blockedBy },
  });
  await prisma.auditLog.create({
    data: { userId: req.user!.userId, userName: blockedBy || 'System', action: 'ROOM_BLOCKED', details: `Blocked room "${roomExists?.name || roomId}" — Reason: ${reason}, From: ${new Date(startTime).toLocaleString()}, To: ${new Date(endTime).toLocaleString()}`, ipAddress: getClientIp(req) },
  });
  res.status(201).json({
    id: slot.id, roomId: slot.roomId, startTime: slot.startTime,
    endTime: slot.endTime, reason: slot.reason, blockedBy: slot.blockedBy,
  });
});

// DELETE /api/blocked-slots/:id — Admin only
blockedSlotRoutes.delete('/:id', requireRole('ADMIN'), async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const slot = await prisma.blockedSlot.findUnique({ where: { id } });
  if (!slot) { res.status(404).json({ error: 'Blocked slot not found' }); return; }
  await prisma.blockedSlot.delete({ where: { id } });
  const room = await prisma.room.findUnique({ where: { id: slot.roomId } });
  await prisma.auditLog.create({
    data: { userId: req.user!.userId, userName: 'Admin', action: 'ROOM_UNBLOCKED', details: `Unblocked room "${room?.name || slot.roomId}" — Was blocked: ${slot.reason || 'N/A'}`, ipAddress: getClientIp(req) },
  });
  res.json({ success: true });
});
