import { Router, Request, Response } from 'express';
import prisma from '../prisma.js';
import { getClientIp } from '../utils/ip.js';
import { requireRole } from '../middleware/auth.js';

export const companyRoutes = Router();

// GET /api/companies
companyRoutes.get('/', async (_req: Request, res: Response) => {
  const companies = await prisma.company.findMany({ orderBy: { name: 'asc' } });
  res.json(companies.map(c => ({ id: c.id, name: c.name, code: c.code, active: c.active })));
});

// POST /api/companies — Admin only
companyRoutes.post('/', requireRole('ADMIN'), async (req: Request, res: Response) => {
  const { name, code, active } = req.body;
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    res.status(400).json({ error: 'Company name is required' }); return;
  }
  const company = await prisma.company.create({ data: { name: name.trim(), code, active: active ?? true } });
  await prisma.auditLog.create({
    data: { userId: req.user!.userId, userName: req.user!.name || 'Admin', action: 'COMPANY_CREATED', details: `Created company "${name}" — Code: ${code || 'N/A'}`, ipAddress: getClientIp(req) },
  });
  res.status(201).json({ id: company.id, name: company.name, code: company.code, active: company.active });
});

// PUT /api/companies/:id — Admin only
companyRoutes.put('/:id', requireRole('ADMIN'), async (req, res) => {
  const id = String(req.params.id);
  const { name, code, active } = req.body;
  const company = await prisma.company.update({ where: { id }, data: { name, code, active } });
  await prisma.auditLog.create({
    data: { userId: req.user!.userId, userName: req.user!.name || 'Admin', action: 'COMPANY_UPDATED', details: `Updated company "${name}" — Code: ${code || 'N/A'}, Active: ${active}`, ipAddress: getClientIp(req) },
  });
  res.json({ id: company.id, name: company.name, code: company.code, active: company.active });
});

// DELETE /api/companies/:id — Admin only
companyRoutes.delete('/:id', requireRole('ADMIN'), async (req, res) => {
  const id = String(req.params.id);
  const company = await prisma.company.findUnique({ where: { id } });
  if (!company) { res.status(404).json({ error: 'Company not found' }); return; }
  // Unlink users
  await prisma.user.updateMany({ where: { companyId: id }, data: { companyId: null, departmentId: null, designationId: null } });
  // Remove this company from all departments' companyIds arrays
  const depsWithCompany = await prisma.department.findMany({ where: { companyIds: { has: id } } });
  for (const dep of depsWithCompany) {
    await prisma.department.update({ where: { id: dep.id }, data: { companyIds: dep.companyIds.filter(cid => cid !== id) } });
  }
  // Remove this company from all designations' companyIds arrays
  const desigsWithCompany = await prisma.designation.findMany({ where: { companyIds: { has: id } } });
  for (const desig of desigsWithCompany) {
    await prisma.designation.update({ where: { id: desig.id }, data: { companyIds: desig.companyIds.filter(cid => cid !== id) } });
  }
  await prisma.company.delete({ where: { id } });
  await prisma.auditLog.create({
    data: { userId: req.user!.userId, userName: req.user!.name || 'Admin', action: 'COMPANY_DELETED', details: `Deleted company "${company.name}" — Code: ${company.code || 'N/A'}`, ipAddress: getClientIp(req) },
  });
  res.json({ success: true });
});
