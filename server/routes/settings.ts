import { Router, Request, Response } from 'express';
import prisma, { dbConfig } from '../prisma.js';
import pg from 'pg';
import { testLdapConnection } from '../services/ldap.js';
import { testSmtpConnection } from '../services/email.js';
import { getClientIp } from '../utils/ip.js';
import { testGoogleMeetAccess } from '../services/googleMeet.js';
import { testWebexAccess } from '../services/webex.js';

export const settingsRoutes = Router();

// Generic settings getter/setter using AppSettings key-value store
async function getSetting(key: string): Promise<any> {
  const row = await prisma.appSettings.findUnique({ where: { key } });
  return row ? JSON.parse(row.value) : null;
}

async function setSetting(key: string, value: any): Promise<void> {
  await prisma.appSettings.upsert({
    where: { key },
    update: { value: JSON.stringify(value) },
    create: { id: key, key, value: JSON.stringify(value) },
  });
}

// GET /api/settings/portal
settingsRoutes.get('/portal', async (_req: Request, res: Response) => {
  const settings = await getSetting('portal');
  res.json(settings || {
    portalName: 'ConferenceHub',
    maxBookingDuration: 10,
    maxAdvanceBookingDays: 365,
    autoApproveBookings: true,
    requireApprovalAboveCapacity: 0,
    allowWeekendBookings: true,
    maintenanceMode: false,
    maintenanceMessage: '',
    emailNotifications: true,
    itAutoAssign: true,
  });
});

// PUT /api/settings/portal
settingsRoutes.put('/portal', async (req: Request, res: Response) => {
  await setSetting('portal', req.body);
  await prisma.auditLog.create({
    data: { userId: req.user!.userId, userName: req.user!.name || 'Admin', action: 'SETTINGS_UPDATED', details: 'Portal settings updated', ipAddress: getClientIp(req) },
  });
  res.json(req.body);
});

// GET /api/settings/ldap
settingsRoutes.get('/ldap', async (_req: Request, res: Response) => {
  const settings = await getSetting('ldap');
  const data = settings || {
    enabled: false, serverUrl: '', port: 389, useSsl: false,
    bindDn: '', bindPassword: '', baseDn: '',
    userSearchFilter: '(sAMAccountName={0})', usernameAttribute: 'sAMAccountName',
    emailAttribute: 'mail', displayNameAttribute: 'displayName',
    groupSearchBase: '', adminGroupDn: '', itGroupDn: '', receptionGroupDn: '', administrationGroupDn: '',
    connectionTimeout: 5000, searchTimeout: 10000,
  };
  // Mask bindPassword — never expose the stored credential over the wire
  res.json({ ...data, bindPassword: data.bindPassword ? '********' : '' });
});

// PUT /api/settings/ldap
settingsRoutes.put('/ldap', async (req: Request, res: Response) => {
  // Preserve the stored bindPassword if the client sends the masked placeholder
  if (req.body.bindPassword === '********') {
    const existing = await getSetting('ldap');
    req.body.bindPassword = existing?.bindPassword ?? '';
  }
  await setSetting('ldap', req.body);
  await prisma.auditLog.create({
    data: { userId: req.user!.userId, userName: req.user!.name || 'Admin', action: 'SETTINGS_UPDATED', details: 'LDAP settings updated', ipAddress: getClientIp(req) },
  });
  res.json({ ...req.body, bindPassword: req.body.bindPassword ? '********' : '' });
});

// POST /api/settings/ldap/test — test LDAP connection with given config
settingsRoutes.post('/ldap/test', async (req: Request, res: Response) => {
  const result = await testLdapConnection(req.body);
  res.json(result);
});

// GET /api/settings/smtp
settingsRoutes.get('/smtp', async (_req: Request, res: Response) => {
  const settings = await getSetting('smtp');
  const data = settings || {
    enabled: false, host: '', port: 587, useTls: true,
    username: '', password: '', fromAddress: '', fromName: 'ConferenceHub',
    replyToAddress: '', sendBookingConfirmation: true, sendCancellationNotice: true,
    sendITTaskNotification: true, sendDailyDigest: false, ccReception: true,
  };
  // Mask password — never expose the stored credential over the wire
  res.json({ ...data, password: data.password ? '********' : '' });
});

// PUT /api/settings/smtp
settingsRoutes.put('/smtp', async (req: Request, res: Response) => {
  // Preserve the stored password if the client sends the masked placeholder
  if (req.body.password === '********') {
    const existing = await getSetting('smtp');
    req.body.password = existing?.password ?? '';
  }
  await setSetting('smtp', req.body);
  await prisma.auditLog.create({
    data: { userId: req.user!.userId, userName: req.user!.name || 'Admin', action: 'SETTINGS_UPDATED', details: 'SMTP settings updated', ipAddress: getClientIp(req) },
  });
  res.json({ ...req.body, password: req.body.password ? '********' : '' });
});

// POST /api/settings/smtp/test — send a test email with given config
settingsRoutes.post('/smtp/test', async (req: Request, res: Response) => {
  const { recipientEmail, ...smtpConfig } = req.body;
  if (!recipientEmail) {
    res.status(400).json({ success: false, message: 'recipientEmail is required' });
    return;
  }
  const result = await testSmtpConnection(smtpConfig, recipientEmail);
  res.json(result);
});

// GET /api/settings/vc-integration
settingsRoutes.get('/vc-integration', async (_req: Request, res: Response) => {
  const settings = await getSetting('vcIntegration');
  const data = settings || { googleMeet: { companies: {} }, webex: { enabled: false, companies: [], accounts: [] } };
  // Mask secrets — never expose stored credentials over the wire
  const maskedCompanies: Record<string, any> = {};
  for (const [companyId, cfg] of Object.entries<any>(data.googleMeet?.companies || {})) {
    maskedCompanies[companyId] = { ...cfg, privateKey: cfg.privateKey ? '********' : '' };
  }
  const maskedAccounts = (data.webex?.accounts || []).map((a: any) => ({ ...a, clientSecret: a.clientSecret ? '********' : '', refreshToken: a.refreshToken ? '********' : '' }));
  res.json({
    googleMeet: { companies: maskedCompanies },
    webex: { enabled: data.webex?.enabled ?? false, companies: data.webex?.companies || [], accounts: maskedAccounts },
  });
});

// PUT /api/settings/vc-integration
settingsRoutes.put('/vc-integration', async (req: Request, res: Response) => {
  const existing = (await getSetting('vcIntegration')) || { googleMeet: { companies: {} }, webex: { enabled: false, companies: [], accounts: [] } };
  const body = req.body;

  // Preserve stored secrets if the client sends back the masked placeholder
  const companies: Record<string, any> = {};
  for (const [companyId, cfg] of Object.entries<any>(body.googleMeet?.companies || {})) {
    companies[companyId] = {
      ...cfg,
      privateKey: cfg.privateKey === '********' ? (existing.googleMeet?.companies?.[companyId]?.privateKey ?? '') : cfg.privateKey,
    };
  }
  const accounts = (body.webex?.accounts || []).map((a: any) => {
    const existingAccount = (existing.webex?.accounts || []).find((e: any) => e.id === a.id);
    return {
      ...a,
      enabled: a.enabled !== false,
      clientSecret: a.clientSecret === '********' ? (existingAccount?.clientSecret ?? '') : a.clientSecret,
      refreshToken: a.refreshToken === '********' ? (existingAccount?.refreshToken ?? '') : a.refreshToken,
    };
  });

  const toStore = { googleMeet: { companies }, webex: { enabled: !!body.webex?.enabled, companies: Array.isArray(body.webex?.companies) ? body.webex.companies : [], accounts } };
  await setSetting('vcIntegration', toStore);
  await prisma.auditLog.create({
    data: { userId: req.user!.userId, userName: req.user!.name || 'Admin', action: 'SETTINGS_UPDATED', details: 'VC integration settings updated', ipAddress: getClientIp(req) },
  });

  const maskedCompanies: Record<string, any> = {};
  for (const [companyId, cfg] of Object.entries<any>(companies)) {
    maskedCompanies[companyId] = { ...cfg, privateKey: cfg.privateKey ? '********' : '' };
  }
  res.json({
    googleMeet: { companies: maskedCompanies },
    webex: { enabled: toStore.webex.enabled, companies: toStore.webex.companies, accounts: accounts.map((a: any) => ({ ...a, clientSecret: a.clientSecret ? '********' : '', refreshToken: a.refreshToken ? '********' : '' })) },
  });
});

// POST /api/settings/vc-integration/test-google — test a (possibly unsaved) Google service-account config
settingsRoutes.post('/vc-integration/test-google', async (req: Request, res: Response) => {
  let cfg = req.body;
  // If the client sent back the masked placeholder, use the stored key instead
  if (cfg.privateKey === '********' && cfg.companyId) {
    const settings = await getSetting('vcIntegration');
    cfg = { ...cfg, privateKey: settings?.googleMeet?.companies?.[cfg.companyId]?.privateKey ?? '' };
  }
  const result = await testGoogleMeetAccess(cfg);
  res.json(result);
});

// POST /api/settings/vc-integration/test-webex — test a (possibly unsaved) Webex account's credentials
settingsRoutes.post('/vc-integration/test-webex', async (req: Request, res: Response) => {
  let account = req.body;
  if (account.clientSecret === '********' || account.refreshToken === '********') {
    const settings = await getSetting('vcIntegration');
    const stored = (settings?.webex?.accounts || []).find((a: any) => a.id === account.id);
    account = {
      ...account,
      clientSecret: account.clientSecret === '********' ? (stored?.clientSecret ?? '') : account.clientSecret,
      refreshToken: account.refreshToken === '********' ? (stored?.refreshToken ?? '') : account.refreshToken,
    };
  }
  const result = await testWebexAccess(account);
  res.json(result);
});

// GET /api/settings/database — returns the real backend DB config (password masked)
settingsRoutes.get('/database', async (_req: Request, res: Response) => {
  res.json({
    enabled: true,
    host: dbConfig.host,
    port: dbConfig.port,
    database: dbConfig.database,
    username: dbConfig.user,
    password: '********',
  });
});

// POST /api/settings/database/test — test the server's own PostgreSQL connection
settingsRoutes.post('/database/test', async (_req: Request, res: Response) => {
  const pool = new pg.Pool({
    host: dbConfig.host,
    port: dbConfig.port,
    database: dbConfig.database,
    user: dbConfig.user,
    password: dbConfig.password,
    connectionTimeoutMillis: 5000,
    max: 1,
  });
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT version()');
    const version = result.rows[0]?.version || 'Unknown';
    client.release();
    await pool.end();
    res.json({ success: true, message: `Connected successfully — ${version}` });
  } catch (err: any) {
    try { await pool.end(); } catch {}
    res.json({ success: false, message: `Connection failed: ${err.message}` });
  }
});

// POST /api/settings/export
settingsRoutes.post('/export', async (req: Request, res: Response) => {
  const { sections } = req.body;
  const data: Record<string, any> = {};
  data._manifest = { version: '1.0', exportedAt: new Date().toISOString(), exportedBy: req.user!.name || 'Admin', sections };

  if (sections.includes('rooms')) {
    const rooms = await prisma.room.findMany();
    data.rooms = rooms;
  }
  if (sections.includes('bookings')) {
    const bookings = await prisma.booking.findMany();
    data.bookings = bookings;
  }
  if (sections.includes('users')) {
    const users = await prisma.user.findMany();
    // Strip passwordHash from export — never expose password hashes
    data.managedUsers = users.map(({ passwordHash, ...rest }: any) => ({ ...rest, hasPassword: !!passwordHash }));
  }
  if (sections.includes('companies')) {
    const companies = await prisma.company.findMany();
    data.companies = companies;
  }
  if (sections.includes('departments')) {
    const departments = await prisma.department.findMany();
    data.departments = departments;
  }
  if (sections.includes('designations')) {
    const designations = await prisma.designation.findMany();
    data.designations = designations;
  }
  if (sections.includes('blockedSlots')) {
    const slots = await prisma.blockedSlot.findMany();
    data.blockedSlots = slots;
  }
  if (sections.includes('blocks')) {
    data.blocks = await prisma.roomBlockConfig.findMany();
  }
  if (sections.includes('facilities')) {
    data.facilities = await prisma.facility.findMany();
  }
  if (sections.includes('serviceRequests')) {
    data.serviceRequests = await prisma.serviceRequest.findMany();
  }
  if (sections.includes('settings')) data.settings = await getSetting('portal');
  if (sections.includes('ldapSettings')) {
    const ldap = await getSetting('ldap');
    if (ldap) { delete ldap.bindPassword; }
    data.ldapSettings = ldap;
  }
  if (sections.includes('smtpSettings')) {
    const smtp = await getSetting('smtp');
    if (smtp) { delete smtp.password; }
    data.smtpSettings = smtp;
  }
  if (sections.includes('auditLog')) {
    data.auditLog = await prisma.auditLog.findMany({ orderBy: { timestamp: 'desc' } });
  }

  await prisma.auditLog.create({
    data: { userId: req.user!.userId, userName: req.user!.name || 'Admin', action: 'SETTINGS_UPDATED', details: `Exported data: ${sections.join(', ')}`, ipAddress: getClientIp(req) },
  });

  res.json(data);
});

// POST /api/settings/import
settingsRoutes.post('/import', async (req: Request, res: Response) => {
  const data = req.body;
  if (!data._manifest) { res.status(400).json({ error: 'Invalid export file: missing manifest.' }); return; }

  const sections: string[] = data._manifest.sections || [];
  let count = 0;

  // Import order matters for FK constraints:
  // 1. Companies (no FK deps)
  // 2. Departments, Designations (no FK deps — companyIds are plain string[])
  // 3. Users (FK → company, department, designation)
  // 4. Rooms (no FK deps)
  // 5. Bookings (FK → room, user)
  // 6. Service Requests (FK → booking)
  // 7. Blocked Slots (FK → room)
  // 8. Audit Log (FK → user)
  // 9. Blocks, Facilities (no FK deps)
  // 10. Settings (key-value, no FK)

  // --- Phase 1: Independent entities ---
  if (sections.includes('companies') && Array.isArray(data.companies)) {
    await prisma.user.updateMany({ data: { companyId: null } });
    await prisma.company.deleteMany({});
    await prisma.company.createMany({
      data: data.companies.map((c: any) => ({
        id: c.id, name: c.name, code: c.code, active: c.active, createdAt: c.createdAt ? new Date(c.createdAt) : undefined,
      })),
    });
    count++;
  }
  if (sections.includes('departments') && Array.isArray(data.departments)) {
    await prisma.user.updateMany({ data: { departmentId: null } });
    await prisma.department.deleteMany({});
    await prisma.department.createMany({
      data: data.departments.map((d: any) => ({
        id: d.id, companyIds: d.companyIds ?? (d.companyId ? [d.companyId] : []), name: d.name, code: d.code, active: d.active, createdAt: d.createdAt ? new Date(d.createdAt) : undefined,
      })),
    });
    count++;
  }
  if (sections.includes('designations') && Array.isArray(data.designations)) {
    await prisma.user.updateMany({ data: { designationId: null } });
    await prisma.designation.deleteMany({});
    await prisma.designation.createMany({
      data: data.designations.map((d: any) => ({
        id: d.id, companyIds: d.companyIds ?? (d.companyId ? [d.companyId] : []), name: d.name, code: d.code, active: d.active, createdAt: d.createdAt ? new Date(d.createdAt) : undefined,
      })),
    });
    count++;
  }
  if (sections.includes('blocks') && Array.isArray(data.blocks)) {
    await prisma.roomBlockConfig.deleteMany({});
    await prisma.roomBlockConfig.createMany({
      data: data.blocks.map((b: any) => ({
        id: b.id, name: b.name, code: b.code, active: b.active ?? true,
        itEmail: b.itEmail || '', receptionEmail: b.receptionEmail || '', adminEmail: b.adminEmail || '',
        createdAt: b.createdAt ? new Date(b.createdAt) : undefined,
      })),
    });
    count++;
  }
  if (sections.includes('facilities') && Array.isArray(data.facilities)) {
    await prisma.facility.deleteMany({});
    await prisma.facility.createMany({
      data: data.facilities.map((f: any) => ({
        id: f.id, name: f.name, active: f.active ?? true, createdAt: f.createdAt ? new Date(f.createdAt) : undefined,
      })),
    });
    count++;
  }

  // --- Phase 2: Users (depends on companies, departments, designations) ---
  if (sections.includes('users') && Array.isArray(data.managedUsers)) {
    await prisma.serviceRequest.deleteMany({});
    await prisma.auditLog.deleteMany({});
    await prisma.booking.deleteMany({});
    await prisma.user.deleteMany({});
    for (const u of data.managedUsers) {
      // Never import raw passwordHash from external files — only import the flag
      await prisma.user.create({
        data: {
          id: u.id, name: u.name, domainId: u.domainId, email: u.email,
          passwordHash: null, role: u.role, manualRole: u.manualRole ?? false,
          companyId: u.companyId || null, departmentId: u.departmentId || null,
          designationId: u.designationId || null, active: u.active ?? true,
          lastLogin: u.lastLogin ? new Date(u.lastLogin) : null,
          createdAt: u.createdAt ? new Date(u.createdAt) : undefined,
        },
      });
    }
    count++;
  }

  // --- Phase 3: Rooms (no user FK, but bookings/blockedSlots depend on it) ---
  if (sections.includes('rooms') && Array.isArray(data.rooms)) {
    await prisma.serviceRequest.deleteMany({});
    await prisma.blockedSlot.deleteMany({});
    await prisma.booking.deleteMany({});
    await prisma.room.deleteMany({});
    for (const r of data.rooms) {
      await prisma.room.create({
        data: {
          id: r.id, name: r.name, type: r.type, block: r.block,
          capacity: r.capacity, facilities: r.facilities, imageUrl: r.imageUrl,
          notifyEmail: r.notifyEmail ?? '',
          restricted: r.restricted ?? false,
          allowedUserIds: r.allowedUserIds ?? [],
          createdAt: r.createdAt ? new Date(r.createdAt) : undefined,
        },
      });
    }
    count++;
  }

  // --- Phase 4: Bookings (depends on rooms & users) ---
  if (sections.includes('bookings') && Array.isArray(data.bookings)) {
    await prisma.serviceRequest.deleteMany({});
    await prisma.booking.deleteMany({});
    for (const b of data.bookings) {
      await prisma.booking.create({
        data: {
          id: b.id, roomId: b.roomId, userId: b.userId, userName: b.userName,
          title: b.title, startTime: new Date(b.startTime), endTime: new Date(b.endTime),
          status: b.status, participants: b.participants, company: b.company,
          department: b.department, chairPerson: b.chairPerson, agenda: b.agenda || null,
          notifyEmails: b.notifyEmails || [], editedAt: b.editedAt ? new Date(b.editedAt) : null,
          createdAt: b.createdAt ? new Date(b.createdAt) : undefined,
          vcRequired: b.vcRequired ?? false, createMeetingLink: b.createMeetingLink ?? false,
          existingLink: b.existingLink || null, generatedLink: b.generatedLink || null,
          meetingNumber: b.meetingNumber || null, meetingPassword: b.meetingPassword || null,
          platform: b.platform || null, avSetup: b.avSetup ?? false,
          supportStandby: b.supportStandby ?? false, itNotes: b.itNotes || null,
          itStatus: b.itStatus || 'PENDING', itArchived: b.itArchived ?? false,
        },
      });
    }
    count++;
  }

  // --- Phase 5: Service Requests (depends on bookings) ---
  if (sections.includes('serviceRequests') && Array.isArray(data.serviceRequests)) {
    await prisma.serviceRequest.deleteMany({});
    for (const sr of data.serviceRequests) {
      await prisma.serviceRequest.create({
        data: {
          id: sr.id, bookingId: sr.bookingId, category: sr.category,
          items: sr.items || [], quantity: sr.quantity ?? 1, notes: sr.notes || null,
          status: sr.status || 'PENDING', handledBy: sr.handledBy || null,
          handledByName: sr.handledByName || null,
          completedAt: sr.completedAt ? new Date(sr.completedAt) : null,
          createdAt: new Date(sr.createdAt),
        },
      });
    }
    count++;
  }

  // --- Phase 6: Blocked Slots (depends on rooms) ---
  if (sections.includes('blockedSlots') && Array.isArray(data.blockedSlots)) {
    await prisma.blockedSlot.deleteMany({});
    for (const s of data.blockedSlots) {
      await prisma.blockedSlot.create({
        data: {
          id: s.id, roomId: s.roomId, startTime: new Date(s.startTime),
          endTime: new Date(s.endTime), reason: s.reason, blockedBy: s.blockedBy,
          createdAt: s.createdAt ? new Date(s.createdAt) : undefined,
        },
      });
    }
    count++;
  }

  // --- Phase 7: Audit Log (depends on users) ---
  if (sections.includes('auditLog') && Array.isArray(data.auditLog)) {
    await prisma.auditLog.deleteMany({});
    for (const a of data.auditLog) {
      await prisma.auditLog.create({
        data: {
          id: a.id, userId: a.userId, userName: a.userName,
          action: a.action, details: a.details, ipAddress: a.ipAddress || null,
          timestamp: new Date(a.timestamp),
        },
      });
    }
    count++;
  }

  // --- Phase 8: Settings (key-value store, no FK deps) ---
  if (sections.includes('settings') && data.settings) { await setSetting('portal', data.settings); count++; }
  if (sections.includes('ldapSettings') && data.ldapSettings) { await setSetting('ldap', data.ldapSettings); count++; }
  if (sections.includes('smtpSettings') && data.smtpSettings) { await setSetting('smtp', data.smtpSettings); count++; }

  // Log the import action using the authenticated user
  const importUser = (req as any).user;
  if (importUser?.userId) {
    const dbUser = await prisma.user.findUnique({ where: { id: importUser.userId }, select: { name: true } });
    await prisma.auditLog.create({
      data: { userId: importUser.userId, userName: dbUser?.name || 'Admin', action: 'SETTINGS_UPDATED', details: `Imported data: ${sections.join(', ')}`, ipAddress: getClientIp(req) },
    }).catch(e => console.error('Failed to log import audit:', e));
  }

  res.json({ success: true, message: `Imported ${count} sections: ${sections.join(', ')}` });
});

// POST /api/settings/database/clear — selectively clear database tables (full or partial)
settingsRoutes.post('/database/clear', async (req: Request, res: Response) => {
  const { tables, filters } = req.body as {
    tables: string[];
    filters?: { beforeDate?: string; statuses?: string[] };
  };
  if (!Array.isArray(tables) || tables.length === 0) {
    res.status(400).json({ success: false, message: 'No tables selected.' });
    return;
  }

  const allowed = ['bookings', 'blockedSlots', 'auditLog', 'rooms', 'users'] as const;
  const invalid = tables.filter(t => !(allowed as readonly string[]).includes(t));
  if (invalid.length > 0) {
    res.status(400).json({ success: false, message: `Invalid tables: ${invalid.join(', ')}` });
    return;
  }

  const isPartial = filters && (filters.beforeDate || (filters.statuses && filters.statuses.length > 0));
  const cleared: string[] = [];
  let totalDeleted = 0;

  if (tables.includes('bookings')) {
    if (isPartial) {
      const where: any = {};
      if (filters.beforeDate) where.startTime = { lt: new Date(filters.beforeDate) };
      if (filters.statuses && filters.statuses.length > 0) where.status = { in: filters.statuses };
      const result = await prisma.booking.deleteMany({ where });
      totalDeleted += result.count;
      cleared.push(`Bookings (${result.count} records)`);
    } else {
      const result = await prisma.booking.deleteMany({});
      totalDeleted += result.count;
      cleared.push(`Bookings (${result.count})`);
    }
  }

  if (tables.includes('blockedSlots')) {
    if (isPartial && filters.beforeDate) {
      const result = await prisma.blockedSlot.deleteMany({ where: { startTime: { lt: new Date(filters.beforeDate) } } });
      totalDeleted += result.count;
      cleared.push(`Blocked Slots (${result.count} records)`);
    } else {
      const result = await prisma.blockedSlot.deleteMany({});
      totalDeleted += result.count;
      cleared.push(`Blocked Slots (${result.count})`);
    }
  }

  if (tables.includes('auditLog')) {
    if (isPartial && filters.beforeDate) {
      const result = await prisma.auditLog.deleteMany({ where: { timestamp: { lt: new Date(filters.beforeDate) } } });
      totalDeleted += result.count;
      cleared.push(`Audit Log (${result.count} records)`);
    } else {
      const result = await prisma.auditLog.deleteMany({});
      totalDeleted += result.count;
      cleared.push(`Audit Log (${result.count})`);
    }
  }

  if (tables.includes('rooms')) {
    await prisma.booking.deleteMany({});
    const result = await prisma.room.deleteMany({});
    totalDeleted += result.count;
    cleared.push(`Rooms (${result.count})`);
    if (!cleared.some(c => c.startsWith('Bookings'))) cleared.push('Bookings (cascade)');
  }

  if (tables.includes('users')) {
    await prisma.booking.deleteMany({});
    const result = await prisma.user.deleteMany({});
    totalDeleted += result.count;
    cleared.push(`Users (${result.count})`);
    if (!cleared.some(c => c.startsWith('Bookings'))) cleared.push('Bookings (cascade)');
  }

  // Audit the clear action
  const authUser = (req as any).user;
  if (authUser?.userId) {
    const dbUser = await prisma.user.findUnique({ where: { id: authUser.userId }, select: { name: true } });
    const detail = isPartial
      ? `Partial clear: ${cleared.join(', ')}${filters.beforeDate ? ` (before ${filters.beforeDate})` : ''}${filters.statuses?.length ? ` [${filters.statuses.join(',')}]` : ''}`
      : `Full clear: ${cleared.join(', ')}`;
    await prisma.auditLog.create({
      data: { userId: authUser.userId, userName: dbUser?.name || 'Admin', action: 'SETTINGS_UPDATED', details: detail, ipAddress: getClientIp(req) },
    }).catch(() => {});
  }

  res.json({ success: true, message: `Cleared ${totalDeleted} records: ${cleared.join(', ')}` });
});
