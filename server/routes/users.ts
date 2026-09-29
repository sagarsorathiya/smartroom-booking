import { Router, Request, Response } from 'express';
import prisma from '../prisma.js';
import { toFrontendUser } from '../mappers.js';
import { getClientIp } from '../utils/ip.js';
import { searchLdapUsers } from '../services/ldap.js';
import { requireRole } from '../middleware/auth.js';

export const userRoutes = Router();

// GET /api/users/search-directory?q=...  — search LDAP and auto-provision
userRoutes.get('/search-directory', async (req: Request, res: Response) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) { res.json([]); return; }

  // 1. Search existing DB users
  const dbUsers = await prisma.user.findMany({
    where: {
      active: true,
      OR: [
        { name: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { domainId: { contains: q, mode: 'insensitive' } },
      ],
    },
    take: 20,
    orderBy: { name: 'asc' },
  });

  // 2. Try LDAP search for additional users
  const ldapResult = await searchLdapUsers(q, 20);
  const provisioned: any[] = [];

  if (ldapResult.success && ldapResult.users.length > 0) {
    const dbDomainIds = new Set(dbUsers.map(u => u.domainId.toLowerCase()));

    for (const ldapUser of ldapResult.users) {
      if (dbDomainIds.has(ldapUser.domainId.toLowerCase())) continue; // already in DB results

      // Auto-provision: create user in DB
      const existing = await prisma.user.findUnique({ where: { domainId: ldapUser.domainId.toLowerCase() } });
      if (existing) {
        if (existing.active) provisioned.push(existing);
        continue;
      }

      const newUser = await prisma.user.create({
        data: {
          name: ldapUser.name,
          domainId: ldapUser.domainId.toLowerCase(),
          email: ldapUser.email,
          role: ldapUser.role,
          active: true,
        },
      });
      provisioned.push(newUser);
    }
  }

  const allUsers = [...dbUsers, ...provisioned];
  res.json(allUsers.map(toFrontendUser));
});

// GET /api/users — restricted to ADMIN, RECEPTION, ADMINISTRATION
userRoutes.get('/', requireRole('ADMIN', 'RECEPTION', 'ADMINISTRATION'), async (_req: Request, res: Response) => {
  const users = await prisma.user.findMany({ orderBy: { name: 'asc' } });
  res.json(users.map(toFrontendUser));
});

// GET /api/users/:id
userRoutes.get('/:id', async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const elevatedRoles = ['IT', 'RECEPTION', 'ADMINISTRATION', 'ADMIN'];
  // Employees may only fetch their own profile; elevated roles can look up any user
  if (req.user!.userId !== id && !elevatedRoles.includes(req.user!.role)) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) { res.status(404).json({ error: 'User not found' }); return; }
  res.json(toFrontendUser(user));
});

// POST /api/users
userRoutes.post('/', requireRole('ADMIN'), async (req: Request, res: Response) => {
  const { name, domainId, email, role, companyId, departmentId, designationId, active } = req.body;
  const user = await prisma.user.create({
    data: { name, domainId, email, role: role || 'EMPLOYEE', companyId, departmentId, designationId, active: active ?? true, manualRole: !!role },
  });
  await prisma.auditLog.create({
    data: { userId: req.user!.userId, userName: req.user!.name || name, action: 'USER_CREATED', details: `Created user "${name}" — Domain: ${domainId}, Role: ${role || 'EMPLOYEE'}, Email: ${email || 'N/A'}`, ipAddress: getClientIp(req) },
  });
  res.status(201).json(toFrontendUser(user));
});

// PATCH /api/users/:id/email — IT/Reception/Admin can update a user's email (for book-on-behalf)
userRoutes.patch('/:id/email', requireRole('IT', 'RECEPTION', 'ADMINISTRATION', 'ADMIN'), async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const { email } = req.body;

  if (!email || typeof email !== 'string' || !email.trim()) {
    res.status(400).json({ error: 'Email is required' });
    return;
  }

  const trimmed = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    res.status(400).json({ error: 'Invalid email format' });
    return;
  }

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) { res.status(404).json({ error: 'User not found' }); return; }

  const user = await prisma.user.update({
    where: { id },
    data: { email: trimmed },
  });

  prisma.auditLog.create({
    data: { userId: req.user?.userId || id, userName: req.user?.name || existing.name, action: 'USER_UPDATED', details: `Updated email for "${existing.name}" to ${trimmed}`, ipAddress: getClientIp(req) },
  }).catch((e: any) => console.error('[AUDIT]', e.message));

  res.json(toFrontendUser(user));
});

// POST /api/users/sync-ldap-all — bulk sync name + email from LDAP for all domain users
userRoutes.post('/sync-ldap-all', requireRole('ADMIN'), async (req: Request, res: Response) => {
  const { lookupLdapUser } = await import('../services/ldap.js');

  // Only domain users (no passwordHash)
  const domainUsers = await prisma.user.findMany({
    where: { passwordHash: null, active: true },
    select: { id: true, domainId: true, name: true, email: true },
  });

  const results = { synced: 0, failed: 0, skipped: 0, errors: [] as string[] };

  for (const user of domainUsers) {
    if (!user.domainId) { results.skipped++; continue; }
    const result = await lookupLdapUser(user.domainId);
    if (!result.success || !result.user) {
      results.failed++;
      results.errors.push(`${user.domainId}: ${result.error || 'Not found in LDAP'}`);
      continue;
    }
    const newName = result.user.name || user.name;
    const newEmail = result.user.email || user.email;
    if (newName === user.name && newEmail === user.email) { results.skipped++; continue; }
    await prisma.user.update({ where: { id: user.id }, data: { name: newName, email: newEmail } });
    results.synced++;
  }

  await prisma.auditLog.create({
    data: {
      userId: req.user!.userId,
      userName: req.user!.name || 'Admin',
      action: 'USER_UPDATED',
      details: `Bulk LDAP sync: ${results.synced} updated, ${results.skipped} unchanged, ${results.failed} failed`,
      ipAddress: getClientIp(req),
    },
  });

  res.json(results);
});

// POST /api/users/:id/sync-ldap — fetch name + email from LDAP and update (preserves company/dept/designation/role)
userRoutes.post('/:id/sync-ldap', requireRole('ADMIN'), async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const { lookupLdapUser } = await import('../services/ldap.js');

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) { res.status(404).json({ error: 'User not found' }); return; }
  if (!existing.domainId) { res.status(400).json({ error: 'User has no domain ID to look up' }); return; }

  const result = await lookupLdapUser(existing.domainId);
  if (!result.success || !result.user) {
    res.status(502).json({ error: result.error || 'User not found in LDAP directory' });
    return;
  }

  const updated = await prisma.user.update({
    where: { id },
    data: {
      name: result.user.name || existing.name,
      email: result.user.email || existing.email,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: req.user!.userId,
      userName: req.user!.name || 'Admin',
      action: 'USER_UPDATED',
      details: `Synced user "${existing.name}" from LDAP — Name: "${result.user.name}", Email: "${result.user.email}"`,
      ipAddress: getClientIp(req),
    },
  });

  res.json(toFrontendUser(updated));
});

// PUT /api/users/:id
userRoutes.put('/:id', requireRole('ADMIN'), async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const { name, domainId, email, role, companyId, departmentId, designationId, active } = req.body;
  // Check if admin is changing the role vs keeping it the same
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) { res.status(404).json({ error: 'User not found' }); return; }
  const isLocal = !!existing.passwordHash;
  // Domain users must have company, department, and designation
  if (!isLocal && (!companyId || !departmentId || !designationId)) {
    res.status(400).json({ error: 'Company, Department, and Designation are required for domain users' });
    return;
  }
  const roleChanged = role && role !== existing.role;
  const user = await prisma.user.update({
    where: { id },
    data: { name, domainId, email, role, companyId: companyId || null, departmentId: departmentId || null, designationId: designationId || null, active, ...(roleChanged ? { manualRole: true } : {}) },
  });
  await prisma.auditLog.create({
    data: { userId: req.body.currentUserId || user.id, userName: req.body.currentUserName || name, action: 'USER_UPDATED', details: `Updated user "${name}" — Domain: ${domainId}, Role: ${role}${roleChanged ? ' (changed)' : ''}, Active: ${active}`, ipAddress: getClientIp(req) },
  });
  res.json(toFrontendUser(user));
});

// PUT /api/users/:id/reset-password — admin resets password for local users
userRoutes.put('/:id/reset-password', requireRole('ADMIN'), async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters' });
    return;
  }
  if (!/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
    res.status(400).json({ error: 'Password must contain at least one uppercase letter, one lowercase letter, and one digit' });
    return;
  }
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) { res.status(404).json({ error: 'User not found' }); return; }
  if (!user.passwordHash) {
    res.status(400).json({ error: 'Cannot reset password for domain/LDAP users' });
    return;
  }
  const bcrypt = await import('bcryptjs');
  const hash = await bcrypt.default.hash(newPassword, 12);
  await prisma.user.update({ where: { id }, data: { passwordHash: hash } });
  await prisma.auditLog.create({
    data: { userId: req.user!.userId, userName: 'Admin', action: 'PASSWORD_CHANGED', details: `Admin reset password for user "${user.name}" (${user.domainId})`, ipAddress: getClientIp(req) },
  });
  res.json({ message: 'Password reset successfully' });
});

// DELETE /api/users/:id — permanently delete user and related records
userRoutes.delete('/:id', requireRole('ADMIN'), async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) { res.status(404).json({ error: 'User not found' }); return; }
  if (user.id === req.user!.userId) {
    res.status(400).json({ error: 'You cannot delete your own account' }); return;
  }

  // Delete in order: service requests → bookings → audit logs → user
  await prisma.$transaction(async (tx) => {
    const bookingIds = (await tx.booking.findMany({ where: { userId: id }, select: { id: true } })).map(b => b.id);
    if (bookingIds.length > 0) {
      await tx.serviceRequest.deleteMany({ where: { bookingId: { in: bookingIds } } });
      await tx.booking.deleteMany({ where: { userId: id } });
    }
    await tx.auditLog.deleteMany({ where: { userId: id } });
    await tx.user.delete({ where: { id } });
  });

  // Audit log for the admin who performed the deletion
  await prisma.auditLog.create({
    data: { userId: req.user!.userId, userName: req.user!.name || 'Admin', action: 'USER_DELETED', details: `Permanently deleted user "${user.name}" (${user.domainId})`, ipAddress: getClientIp(req) },
  });
  res.json({ success: true });
});
