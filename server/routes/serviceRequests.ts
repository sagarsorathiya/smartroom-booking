import { Router, Request, Response } from 'express';
import prisma from '../prisma.js';
import { toFrontendServiceRequest } from '../mappers.js';
import { getClientIp } from '../utils/ip.js';
import { requireRole } from '../middleware/auth.js';

export const serviceRequestRoutes = Router();

// GET /api/service-requests — list all service requests (IT/RECEPTION/ADMINISTRATION/ADMIN only)
serviceRequestRoutes.get('/', requireRole('IT', 'RECEPTION', 'ADMINISTRATION', 'ADMIN'), async (req: Request, res: Response) => {
  const { status, bookingId } = req.query;
  const where: any = {};
  if (status) where.status = status as string;
  if (bookingId) where.bookingId = bookingId as string;

  const requests = await prisma.serviceRequest.findMany({
    where,
    include: { booking: { select: { id: true, title: true, userName: true, roomId: true, company: true, department: true, chairPerson: true, startTime: true, endTime: true, participants: true, status: true } } },
    orderBy: { createdAt: 'desc' },
  });

  res.json(requests.map(sr => ({
    ...toFrontendServiceRequest(sr),
    booking: sr.booking,
  })));
});

// PATCH /api/service-requests/:id/status — update status (IT/RECEPTION/ADMIN only)
serviceRequestRoutes.patch('/:id/status', requireRole('IT', 'RECEPTION', 'ADMINISTRATION', 'ADMIN'), async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const { status }: any = req.body;

  if (!['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].includes(status)) {
    res.status(400).json({ error: 'Invalid status' });
    return;
  }

  const existing = await prisma.serviceRequest.findUnique({ where: { id }, include: { booking: { select: { title: true } } } });
  if (!existing) { res.status(404).json({ error: 'Service request not found' }); return; }

  const updateData: any = { status };
  if (status === 'COMPLETED') {
    updateData.completedAt = new Date();
    updateData.handledBy = req.user?.userId || null;
    const user = req.user?.userId ? await prisma.user.findUnique({ where: { id: req.user.userId }, select: { name: true } }) : null;
    updateData.handledByName = user?.name || null;
  } else if (status === 'IN_PROGRESS') {
    updateData.handledBy = req.user?.userId || null;
    const user = req.user?.userId ? await prisma.user.findUnique({ where: { id: req.user.userId }, select: { name: true } }) : null;
    updateData.handledByName = user?.name || null;
  }

  const updated = await prisma.serviceRequest.update({ where: { id }, data: updateData });

  // Audit log
  if (req.user?.userId) {
    const userName = updateData.handledByName || 'Unknown';
    await prisma.auditLog.create({
      data: {
        userId: req.user.userId,
        userName,
        action: 'SERVICE_UPDATED',
        details: `Service request (${existing.category}) for "${existing.booking.title}" → ${status}`,
        ipAddress: getClientIp(req),
      },
    }).catch(() => {});
  }

  res.json(toFrontendServiceRequest(updated));
});
