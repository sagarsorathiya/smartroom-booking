import { Router, Request, Response } from 'express';
import prisma from '../prisma.js';
import { getClientIp } from '../utils/ip.js';
import { requireRole } from '../middleware/auth.js';

export const departmentRoutes = Router();

// GET /api/departments
departmentRoutes.get('/', async (req: Request, res: Response) => {
  const departments = await prisma.department.findMany({ orderBy: { name: 'asc' } });
  let result = departments.map(d => ({ id: d.id, companyIds: d.companyIds, name: d.name, code: d.code, active: d.active }));
  // Optional filter: only return departments assigned to a specific company
  if (req.query.companyId) {
    const cid = req.query.companyId as string;
    result = result.filter(d => d.companyIds.includes(cid));
  }
  res.json(result);
});

// POST /api/departments — Admin only
departmentRoutes.post('/', requireRole('ADMIN'), async (req: Request, res: Response) => {
  const { companyIds, name, code, active } = req.body;
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    res.status(400).json({ error: 'Department name is required' }); return;
  }
  const dept = await prisma.department.create({ data: { companyIds: companyIds ?? [], name: name.trim(), code, active: active ?? true } });
  await prisma.auditLog.create({
    data: { userId: req.user!.userId, userName: req.user!.name || 'Admin', action: 'DEPARTMENT_CREATED', details: `Created department "${name}" — Code: ${code || 'N/A'}`, ipAddress: getClientIp(req) },
  });
  res.status(201).json({ id: dept.id, companyIds: dept.companyIds, name: dept.name, code: dept.code, active: dept.active });
});

// PUT /api/departments/:id — Admin only
departmentRoutes.put('/:id', requireRole('ADMIN'), async (req, res) => {
  const id = String(req.params.id);
  const { companyIds, name, code, active } = req.body;
  const dept = await prisma.department.update({ where: { id }, data: { companyIds, name, code, active } });
  await prisma.auditLog.create({
    data: { userId: req.user!.userId, userName: req.user!.name || 'Admin', action: 'DEPARTMENT_UPDATED', details: `Updated department "${name}" — Code: ${code || 'N/A'}, Active: ${active}`, ipAddress: getClientIp(req) },
  });
  res.json({ id: dept.id, companyIds: dept.companyIds, name: dept.name, code: dept.code, active: dept.active });
});

// DELETE /api/departments/:id — Admin only
departmentRoutes.delete('/:id', requireRole('ADMIN'), async (req, res) => {
  const id = String(req.params.id);
  const dept = await prisma.department.findUnique({ where: { id } });
  if (!dept) { res.status(404).json({ error: 'Department not found' }); return; }
  await prisma.user.updateMany({ where: { departmentId: id }, data: { departmentId: null } });
  await prisma.department.delete({ where: { id } });
  await prisma.auditLog.create({
    data: { userId: req.user!.userId, userName: req.user!.name || 'Admin', action: 'DEPARTMENT_DELETED', details: `Deleted department "${dept.name}" — Code: ${dept.code || 'N/A'}`, ipAddress: getClientIp(req) },
  });
  res.json({ success: true });
});
