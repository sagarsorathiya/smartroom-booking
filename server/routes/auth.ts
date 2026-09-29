import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../prisma.js';
import { toFrontendUser } from '../mappers.js';
import { authenticateWithLdap, lookupLdapUser } from '../services/ldap.js';
import { signToken, authenticate } from '../middleware/auth.js';
import { getClientIp } from '../utils/ip.js';

export const authRoutes = Router();

const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS) || 12;

// Pre-computed dummy hash used to normalize bcrypt timing when a user is not found,
// preventing username enumeration via response-time differences.
const DUMMY_HASH = '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewYpR5bDIu7mplse';

// POST /api/auth/login
authRoutes.post('/login', async (req: Request, res: Response) => {
  const { domainId, password } = req.body;
  if (!domainId || !password) {
    res.status(400).json({ error: 'domainId and password are required' });
    return;
  }

  // Check if LDAP is enabled
  const ldapRow = await prisma.appSettings.findUnique({ where: { key: 'ldap' } });
  const ldapConfig = ldapRow ? JSON.parse(ldapRow.value) : null;

  if (ldapConfig?.enabled) {
    // ─── LDAP Authentication ────────────────────────────
    const ldapResult = await authenticateWithLdap(domainId, password);

    if (ldapResult.success) {
      const ldapUser = ldapResult.user!;

      // Upsert user in local DB from LDAP attributes
      let user = await prisma.user.findUnique({ where: { domainId: ldapUser.domainId.toLowerCase() } });
      if (user) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: {
            name: ldapUser.name,
            // Only update email from LDAP if LDAP provides one; never overwrite an existing email with empty
            ...(ldapUser.email ? { email: ldapUser.email } : {}),
            // Never overwrite role from LDAP — role is managed by profile setup or admin
            lastLogin: new Date(),
          },
        });
      } else {
        user = await prisma.user.create({
          data: {
            domainId: ldapUser.domainId.toLowerCase(),
            name: ldapUser.name,
            email: ldapUser.email,
            role: ldapUser.role,
            lastLogin: new Date(),
          },
        });
      }

      if (!user.active) {
        res.status(403).json({ error: 'Account is deactivated. Please contact your administrator.' });
        return;
      }

      const token = signToken({ userId: user.id, domainId: user.domainId, role: user.role, name: user.name });
      // Audit login
      prisma.auditLog.create({
        data: { userId: user.id, userName: user.name, action: 'USER_LOGIN', details: `LDAP login — Domain: ${user.domainId}, Role: ${user.role}`, ipAddress: getClientIp(req) },
      }).catch((e: any) => console.error('[AUDIT]', e.message));
      res.json({ ...toFrontendUser(user), token });
      return;
    }

    // ─── Fallback: allow local login for any user with a passwordHash when LDAP fails ───
    const localUser = await prisma.user.findUnique({ where: { domainId: domainId.toLowerCase() } });
    if (localUser && localUser.passwordHash && localUser.active) {
      const valid = await bcrypt.compare(password, localUser.passwordHash);
      if (valid) {
        await prisma.user.update({ where: { id: localUser.id }, data: { lastLogin: new Date() } });
        const token = signToken({ userId: localUser.id, domainId: localUser.domainId, role: localUser.role, name: localUser.name });
        // Audit login
        prisma.auditLog.create({
          data: { userId: localUser.id, userName: localUser.name, action: 'USER_LOGIN', details: `Local login (LDAP fallback) — Domain: ${localUser.domainId}, Role: ${localUser.role}`, ipAddress: getClientIp(req) },
        }).catch((e: any) => console.error('[AUDIT]', e.message));
        res.json({ ...toFrontendUser(localUser), token });
        return;
      }
    }

    res.status(401).json({ error: ldapResult.error || 'LDAP authentication failed' });
    return;
  }

  // ─── Local Authentication (bcrypt) ─────────────────────
  const user = await prisma.user.findUnique({ where: { domainId: domainId.toLowerCase() } });
  if (!user) {
    // Always run bcrypt to normalize response time and prevent username enumeration
    await bcrypt.compare(password, DUMMY_HASH);
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  if (!user.active) {
    res.status(403).json({ error: 'Account is deactivated. Please contact your administrator.' });
    return;
  }

  if (!user.passwordHash) {
    res.status(401).json({ error: 'Account not configured. Please contact admin to set your password.' });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  await prisma.user.update({ where: { id: user.id }, data: { lastLogin: new Date() } });

  const token = signToken({ userId: user.id, domainId: user.domainId, role: user.role, name: user.name });
  // Audit login
  prisma.auditLog.create({
    data: { userId: user.id, userName: user.name, action: 'USER_LOGIN', details: `Local login — Domain: ${user.domainId}, Role: ${user.role}`, ipAddress: getClientIp(req) },
  }).catch((e: any) => console.error('[AUDIT]', e.message));
  res.json({ ...toFrontendUser(user), token });
});

// POST /api/auth/change-password (requires authentication)
authRoutes.post('/change-password', authenticate, async (req: Request, res: Response) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: 'currentPassword and newPassword are required' });
    return;
  }

  if (newPassword.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters' });
    return;
  }
  if (!/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
    res.status(400).json({ error: 'Password must contain at least one uppercase letter, one lowercase letter, and one digit' });
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
  if (!user || !user.passwordHash) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: 'Current password is incorrect' });
    return;
  }

  const hash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: hash } });
  // Audit password change
  prisma.auditLog.create({
    data: { userId: user.id, userName: user.name, action: 'PASSWORD_CHANGED', details: `Password changed — Domain: ${user.domainId}`, ipAddress: getClientIp(req) },
  }).catch((e: any) => console.error('[AUDIT]', e.message));
  res.json({ message: 'Password changed successfully' });
});

// GET /api/auth/me — validates JWT token and returns the authenticated user
authRoutes.get('/me', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  const jwt = await import('jsonwebtoken');
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) { res.status(500).json({ error: 'Server misconfigured' }); return; }
  try {
    const decoded = jwt.default.verify(
      authHeader.slice(7),
      jwtSecret
    ) as { userId: string; domainId: string; role: string; exp?: number };
    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
    if (!user) {
      res.status(401).json({ error: 'User not found' });
      return;
    }
    // Deactivated accounts must not receive refreshed tokens
    if (!user.active) {
      res.status(401).json({ error: 'Account is deactivated. Please contact your administrator.' });
      return;
    }
    // Only re-sign token if it expires within 30 minutes (avoids infinite sliding window)
    let token = authHeader.slice(7);
    if (decoded.exp && (decoded.exp * 1000 - Date.now()) < 30 * 60 * 1000) {
      token = signToken({ userId: user.id, domainId: user.domainId, role: user.role, name: user.name });
    }
    res.json({ ...toFrontendUser(user), token });
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
});

// POST /api/auth/login-sso (SSO flow — auto-creates users from LDAP if they don't exist yet)
authRoutes.post('/login-sso', async (req: Request, res: Response) => {
  const { domainId } = req.body;
  if (!domainId) {
    res.status(400).json({ error: 'domainId is required' });
    return;
  }

  // SSO login only works when LDAP is enabled
  const ldapRow = await prisma.appSettings.findUnique({ where: { key: 'ldap' } });
  const ldapConfig = ldapRow ? JSON.parse(ldapRow.value) : null;
  if (!ldapConfig?.enabled) {
    res.status(403).json({ error: 'SSO login requires LDAP to be enabled' });
    return;
  }

  let user = await prisma.user.findUnique({ where: { domainId: domainId.toLowerCase() } });

  if (user && !user.active) {
    res.status(403).json({ error: 'Account is deactivated. Please contact your administrator.' });
    return;
  }

  // If user doesn't exist locally, look them up in LDAP and auto-create
  if (!user) {
    const ldapResult = await lookupLdapUser(domainId);
    if (!ldapResult.success || !ldapResult.user) {
      res.status(404).json({ error: ldapResult.error || 'User not found in directory' });
      return;
    }

    const ldapUser = ldapResult.user;
    user = await prisma.user.create({
      data: {
        domainId: ldapUser.domainId.toLowerCase(),
        name: ldapUser.name,
        email: ldapUser.email,
        role: ldapUser.role,
        lastLogin: new Date(),
      },
    });
  } else {
    await prisma.user.update({ where: { id: user.id }, data: { lastLogin: new Date() } });
  }

  const token = signToken({ userId: user.id, domainId: user.domainId, role: user.role, name: user.name });
  // Audit SSO login
  prisma.auditLog.create({
    data: { userId: user.id, userName: user.name, action: 'USER_LOGIN', details: `SSO login — Domain: ${user.domainId}, Role: ${user.role}`, ipAddress: getClientIp(req) },
  }).catch((e: any) => console.error('[AUDIT]', e.message));
  res.json({ ...toFrontendUser(user), token });
});

// GET /api/auth/negotiate — detect domain user from reverse proxy headers (IIS / Windows Auth)
authRoutes.get('/negotiate', async (req: Request, res: Response) => {
  try {
  // Read the authenticated Windows username from reverse proxy headers
  // IIS with Windows Auth sets these headers when forwarding to Node.js
  const remoteUser =
    req.headers['x-remote-user'] ||
    req.headers['x-forwarded-user'] ||
    req.headers['remote-user'] ||
    req.headers['x-iis-windowsauthtoken'];

  if (!remoteUser) {
    res.status(401).json({ error: 'No domain credentials detected' });
    return;
  }

  // Extract the username part — headers may come as "DOMAIN\\username" or "username@domain"
  let domainId = String(Array.isArray(remoteUser) ? remoteUser[0] : remoteUser).trim();
  if (domainId.includes('\\')) {
    domainId = domainId.split('\\').pop()!;
  } else if (domainId.includes('@')) {
    domainId = domainId.split('@')[0];
  }

  if (!domainId) {
    res.status(401).json({ error: 'Could not parse domain username' });
    return;
  }

  // LDAP must be enabled for domain SSO to work
  const ldapRow = await prisma.appSettings.findUnique({ where: { key: 'ldap' } });
  const ldapConfig = ldapRow ? JSON.parse(ldapRow.value) : null;
  if (!ldapConfig?.enabled) {
    res.status(403).json({ error: 'SSO requires LDAP to be enabled' });
    return;
  }

  let user = await prisma.user.findUnique({ where: { domainId: domainId.toLowerCase() } });

  if (user && !user.active) {
    res.status(403).json({ error: 'Account is deactivated. Please contact your administrator.' });
    return;
  }

  // Auto-create from LDAP if not found
  if (!user) {
    const ldapResult = await lookupLdapUser(domainId);
    if (!ldapResult.success || !ldapResult.user) {
      res.status(404).json({ error: 'User not found in directory' });
      return;
    }

    const ldapUser = ldapResult.user;
    user = await prisma.user.create({
      data: {
        domainId: ldapUser.domainId.toLowerCase(),
        name: ldapUser.name,
        email: ldapUser.email,
        role: ldapUser.role,
        lastLogin: new Date(),
      },
    });
  } else {
    await prisma.user.update({ where: { id: user.id }, data: { lastLogin: new Date() } });
  }

  const token = signToken({ userId: user.id, domainId: user.domainId, role: user.role, name: user.name });
  // Audit negotiate login
  prisma.auditLog.create({
    data: { userId: user.id, userName: user.name, action: 'USER_LOGIN', details: `Windows SSO login — Domain: ${user.domainId}, Role: ${user.role}`, ipAddress: getClientIp(req) },
  }).catch((e: any) => console.error('[AUDIT]', e.message));
  res.json({ ...toFrontendUser(user), token });
  } catch (err: any) {
    console.error('[NEGOTIATE]', err.message || err);
    res.status(503).json({ error: 'SSO unavailable. Use username and password to sign in.' });
  }
});

// PUT /api/auth/profile — let authenticated user update their own company/department/designation
authRoutes.put('/profile', authenticate, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { companyId, departmentId, designationId } = req.body;

  // Allow skip (empty body) — just return current user without updating
  if (!companyId && !departmentId && !designationId) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }
    const token = signToken({ userId: user.id, domainId: user.domainId, role: user.role, name: user.name });
    res.json({ ...toFrontendUser(user), token });
    return;
  }

  if (!companyId || !departmentId || !designationId) {
    res.status(400).json({ error: 'companyId, departmentId, and designationId are required' });
    return;
  }

  // Auto-assign role based on department name — only on first-time profile setup,
  // not on subsequent updates (prevents re-escalation by switching departments).
  const currentUser = await prisma.user.findUnique({ where: { id: userId } });
  let roleUpdate: Record<string, any> = {};
  if (!currentUser?.manualRole && !currentUser?.departmentId) {
    const dept = await prisma.department.findUnique({ where: { id: departmentId } });
    let role = 'EMPLOYEE';
    if (dept) {
      const deptName = dept.name.toUpperCase();
      if (deptName === 'IT' || deptName.includes('INFORMATION TECHNOLOGY') || deptName.includes('INFORMATION AND TECHNOLOGY')) role = 'IT';
      else if (deptName === 'ADMINISTRATION' || deptName.includes('ADMINISTRATION')) role = 'ADMINISTRATION';
      else if (deptName === 'ADMIN' || deptName.includes('ADMIN')) role = 'ADMIN';
      else if (deptName === 'RECEPTION' || deptName.includes('RECEPTION')) role = 'RECEPTION';
    }
    roleUpdate = { role };
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: { companyId, departmentId, designationId, ...roleUpdate },
  });

  const token = signToken({ userId: user.id, domainId: user.domainId, role: user.role, name: user.name });
  // Audit profile update
  prisma.auditLog.create({
    data: { userId: user.id, userName: user.name, action: 'PROFILE_UPDATED', details: `Updated profile — Company: ${companyId}, Department: ${departmentId}, Designation: ${designationId}${roleUpdate.role ? `, Auto-role: ${roleUpdate.role}` : ''}`, ipAddress: getClientIp(req) },
  }).catch((e: any) => console.error('[AUDIT]', e.message));
  res.json({ ...toFrontendUser(user), token });
});

// PUT /api/auth/email — let authenticated user update their own email address
authRoutes.put('/email', authenticate, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
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

  const user = await prisma.user.update({
    where: { id: userId },
    data: { email: trimmed },
  });

  prisma.auditLog.create({
    data: { userId: user.id, userName: user.name, action: 'PROFILE_UPDATED', details: `Updated email to ${trimmed}`, ipAddress: getClientIp(req) },
  }).catch((e: any) => console.error('[AUDIT]', e.message));

  const token = signToken({ userId: user.id, domainId: user.domainId, role: user.role, name: user.name });
  res.json({ ...toFrontendUser(user), token });
});
