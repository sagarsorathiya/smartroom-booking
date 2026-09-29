import { Router, Request, Response } from 'express';
import prisma from '../prisma.js';
import { toFrontendRoom, toDbRoomType, toDbRoomBlock } from '../mappers.js';
import { getClientIp } from '../utils/ip.js';
import { requireRole } from '../middleware/auth.js';

export const roomRoutes = Router();

// GET /api/rooms
roomRoutes.get('/', async (_req: Request, res: Response) => {
  const rooms = await prisma.room.findMany({ orderBy: { name: 'asc' } });
  res.json(rooms.map(toFrontendRoom));
});

// GET /api/rooms/:id
roomRoutes.get('/:id', async (req, res) => {
  const id = String(req.params.id);
  const room = await prisma.room.findUnique({ where: { id } });
  if (!room) { res.status(404).json({ error: 'Room not found' }); return; }
  res.json(toFrontendRoom(room));
});

// POST /api/rooms — Admin only
roomRoutes.post('/', requireRole('ADMIN'), async (req: Request, res: Response) => {
  const { name, type, block, capacity, facilities, imageUrl, notifyEmail, restricted, allowedUserIds } = req.body;
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    res.status(400).json({ error: 'Room name is required' }); return;
  }
  if (!type) { res.status(400).json({ error: 'Room type is required' }); return; }
  if (!block || typeof block !== 'string') { res.status(400).json({ error: 'Block is required' }); return; }
  if (!capacity || typeof capacity !== 'number' || capacity < 1) {
    res.status(400).json({ error: 'Capacity must be a positive number' }); return;
  }
  const room = await prisma.room.create({
    data: {
      name,
      type: toDbRoomType(type),
      block: toDbRoomBlock(block),
      capacity,
      facilities: facilities || [],
      imageUrl: imageUrl || `https://picsum.photos/400/300?random=${Math.floor(Math.random() * 1000)}`,
      notifyEmail: typeof notifyEmail === 'string' ? notifyEmail.trim() : '',
      restricted: restricted === true,
      allowedUserIds: Array.isArray(allowedUserIds) ? allowedUserIds : [],
    },
  });
  await prisma.auditLog.create({
    data: { userId: req.user!.userId, userName: req.user!.name || 'Admin', action: 'ROOM_CREATED', details: `Created room "${name}" — Block: ${block}, Type: ${type}, Capacity: ${capacity}`, ipAddress: getClientIp(req) },
  });
  res.status(201).json(toFrontendRoom(room));
});

// PUT /api/rooms/:id — Admin only
roomRoutes.put('/:id', requireRole('ADMIN'), async (req, res) => {
  const id = String(req.params.id);
  const { name, type, block, capacity, facilities, imageUrl, notifyEmail, restricted, allowedUserIds } = req.body;
  const room = await prisma.room.update({
    where: { id },
    data: {
      name,
      type: toDbRoomType(type),
      block: toDbRoomBlock(block),
      capacity,
      facilities: facilities || [],
      imageUrl,
      notifyEmail: typeof notifyEmail === 'string' ? notifyEmail.trim() : '',
      restricted: restricted === true,
      allowedUserIds: Array.isArray(allowedUserIds) ? allowedUserIds : [],
    },
  });
  await prisma.auditLog.create({
    data: { userId: req.user!.userId, userName: req.user!.name || 'Admin', action: 'ROOM_UPDATED', details: `Updated room "${name}" — Block: ${block}, Type: ${type}, Capacity: ${capacity}`, ipAddress: getClientIp(req) },
  });
  res.json(toFrontendRoom(room));
});

// DELETE /api/rooms/:id — Admin only
roomRoutes.delete('/:id', requireRole('ADMIN'), async (req, res) => {
  const id = String(req.params.id);
  const room = await prisma.room.findUnique({ where: { id } });
  if (!room) { res.status(404).json({ error: 'Room not found' }); return; }

  // Check for future bookings
  const futureBookings = await prisma.booking.count({
    where: { roomId: id, status: { not: 'CANCELLED' }, endTime: { gt: new Date() } },
  });
  if (futureBookings > 0) {
    // Cancel all future bookings for this room instead of silently deleting
    await prisma.booking.updateMany({
      where: { roomId: id, status: { not: 'CANCELLED' }, endTime: { gt: new Date() } },
      data: { status: 'CANCELLED' },
    });
  }

  // Delete related bookings and blocked slots first
  await prisma.serviceRequest.deleteMany({ where: { booking: { roomId: id } } });
  await prisma.booking.deleteMany({ where: { roomId: id } });
  await prisma.blockedSlot.deleteMany({ where: { roomId: id } });
  await prisma.room.delete({ where: { id } });
  await prisma.auditLog.create({
    data: {
      userId: req.user!.userId,
      userName: req.user!.name || 'Admin',
      action: 'ROOM_DELETED',
      details: `Deleted room "${room.name}" — Block: ${room.block}${futureBookings > 0 ? `, ${futureBookings} future booking(s) cancelled` : ''}`,
      ipAddress: getClientIp(req),
    },
  });
  res.json({ success: true, cancelledBookings: futureBookings });
});
