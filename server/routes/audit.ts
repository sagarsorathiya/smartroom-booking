import { Router, Request, Response } from 'express';
import prisma from '../prisma.js';
import { requireRole } from '../middleware/auth.js';

export const auditRoutes = Router();

// GET /api/audit — Admin only
auditRoutes.get('/', requireRole('ADMIN'), async (req: Request, res: Response) => {
  const take = parseInt(req.query.limit as string) || 100;
  const skip = parseInt(req.query.offset as string) || 0;

  const logs = await prisma.auditLog.findMany({
    orderBy: { timestamp: 'desc' },
    take,
    skip,
  });

  res.json(logs.map(l => ({
    id: l.id,
    timestamp: l.timestamp,
    userId: l.userId,
    userName: l.userName,
    action: l.action,
    details: l.details,
    ipAddress: l.ipAddress,
  })));
});
