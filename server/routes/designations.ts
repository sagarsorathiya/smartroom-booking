import { Router, Request, Response } from 'express';
import prisma from '../prisma.js';
import { getClientIp } from '../utils/ip.js';
import { requireRole } from '../middleware/auth.js';

export const designationRoutes = Router();

// GET /api/designations
designationRoutes.get('/', async (req: Request, res: Response) => {
  const designations = await prisma.designation.findMany({ orderBy: { name: 'asc' } });
  let result = designations.map(d => ({ id: d.id, companyIds: d.companyIds, name: d.name, code: d.code, active: d.active }));
  if (req.query.companyId) {
    const cid = req.query.companyId as string;
    result = result.filter(d => d.companyIds.includes(cid));
  }
  res.json(result);
});

// POST /api/designations — Admin only
designationRoutes.post('/', requireRole('ADMIN'), async (req: Request, res: Response) => {
  const { companyIds, name, code, active } = req.body;
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    res.status(400).json({ error: 'Designation name is required' }); return;
  }
  const desig = await prisma.designation.create({ data: { companyIds: companyIds ?? [], name: name.trim(), code, active: active ?? true } });
  await prisma.auditLog.create({
    data: { userId: req.user!.userId, userName: req.user!.name || 'Admin', action: 'DESIGNATION_CREATED', details: `Created designation "${name}" — Code: ${code || 'N/A'}`, ipAddress: getClientIp(req) },
  });
  res.status(201).json({ id: desig.id, companyIds: desig.companyIds, name: desig.name, code: desig.code, active: desig.active });
});

// PUT /api/designations/:id — Admin only
designationRoutes.put('/:id', requireRole('ADMIN'), async (req, res) => {
  const id = String(req.params.id);
  const { companyIds, name, code, active } = req.body;
  const desig = await prisma.designation.update({ where: { id }, data: { companyIds, name, code, active } });
  await prisma.auditLog.create({
    data: { userId: req.user!.userId, userName: req.user!.name || 'Admin', action: 'DESIGNATION_UPDATED', details: `Updated designation "${name}" — Code: ${code || 'N/A'}, Active: ${active}`, ipAddress: getClientIp(req) },
  });
  res.json({ id: desig.id, companyIds: desig.companyIds, name: desig.name, code: desig.code, active: desig.active });
});

// DELETE /api/designations/:id — Admin only
designationRoutes.delete('/:id', requireRole('ADMIN'), async (req, res) => {
  const id = String(req.params.id);
  const desig = await prisma.designation.findUnique({ where: { id } });
  if (!desig) { res.status(404).json({ error: 'Designation not found' }); return; }
  await prisma.user.updateMany({ where: { designationId: id }, data: { designationId: null } });
  await prisma.designation.delete({ where: { id } });
  await prisma.auditLog.create({
    data: { userId: req.user!.userId, userName: req.user!.name || 'Admin', action: 'DESIGNATION_DELETED', details: `Deleted designation "${desig.name}" — Code: ${desig.code || 'N/A'}`, ipAddress: getClientIp(req) },
  });
  res.json({ success: true });
});
