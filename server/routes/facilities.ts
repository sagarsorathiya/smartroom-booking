import { Router, Request, Response } from 'express';
import prisma from '../prisma.js';
import { requireRole } from '../middleware/auth.js';

export const facilityRoutes = Router();

// GET /api/facilities
facilityRoutes.get('/', async (_req: Request, res: Response) => {
  const facilities = await prisma.facility.findMany({ orderBy: { name: 'asc' } });
  res.json(facilities.map(f => ({ id: f.id, name: f.name, active: f.active })));
});

// POST /api/facilities — Admin only
facilityRoutes.post('/', requireRole('ADMIN'), async (req: Request, res: Response) => {
  const { name, active } = req.body;
  const facility = await prisma.facility.create({
    data: { name, active: active ?? true },
  });
  res.status(201).json({ id: facility.id, name: facility.name, active: facility.active });
});

// PUT /api/facilities/:id — Admin only
facilityRoutes.put('/:id', requireRole('ADMIN'), async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const { name, active } = req.body;
  const facility = await prisma.facility.update({
    where: { id },
    data: { name, active },
  });
  res.json({ id: facility.id, name: facility.name, active: facility.active });
});

// DELETE /api/facilities/:id — Admin only
facilityRoutes.delete('/:id', requireRole('ADMIN'), async (req: Request, res: Response) => {
  const id = String(req.params.id);
  await prisma.facility.delete({ where: { id } });
  res.json({ success: true });
});
