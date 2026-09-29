import { Router, Request, Response } from 'express';
import prisma from '../prisma.js';
import { requireRole } from '../middleware/auth.js';

export const blockRoutes = Router();

// GET /api/blocks
blockRoutes.get('/', async (_req: Request, res: Response) => {
  const blocks = await prisma.roomBlockConfig.findMany({ orderBy: { name: 'asc' } });
  res.json(blocks.map(b => ({
    id: b.id,
    name: b.name,
    code: b.code,
    active: b.active,
    itEmail: b.itEmail,
    receptionEmail: b.receptionEmail,
    adminEmail: b.adminEmail,
  })));
});

// POST /api/blocks — Admin only
blockRoutes.post('/', requireRole('ADMIN'), async (req: Request, res: Response) => {
  const { name, code, active, itEmail, receptionEmail, adminEmail } = req.body;
  const block = await prisma.roomBlockConfig.create({
    data: {
      name,
      code,
      active: active ?? true,
      itEmail: itEmail || '',
      receptionEmail: receptionEmail || '',
      adminEmail: adminEmail || '',
    },
  });
  res.status(201).json({
    id: block.id, name: block.name, code: block.code, active: block.active,
    itEmail: block.itEmail, receptionEmail: block.receptionEmail, adminEmail: block.adminEmail,
  });
});

// PUT /api/blocks/:id — Admin only
blockRoutes.put('/:id', requireRole('ADMIN'), async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const { name, code, active, itEmail, receptionEmail, adminEmail } = req.body;
  const block = await prisma.roomBlockConfig.update({
    where: { id },
    data: { name, code, active, itEmail, receptionEmail, adminEmail },
  });
  res.json({
    id: block.id, name: block.name, code: block.code, active: block.active,
    itEmail: block.itEmail, receptionEmail: block.receptionEmail, adminEmail: block.adminEmail,
  });
});

// DELETE /api/blocks/:id — Admin only
blockRoutes.delete('/:id', requireRole('ADMIN'), async (req: Request, res: Response) => {
  const id = String(req.params.id);
  await prisma.roomBlockConfig.delete({ where: { id } });
  res.json({ success: true });
});
