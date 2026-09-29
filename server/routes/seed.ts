import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../prisma.js';
import pkg from '@prisma/client';
const { RoomType } = pkg;
import { addHours } from 'date-fns';

export const seedRoutes = Router();

const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS) || 12;

// POST /api/seed — populate database with initial mock data
seedRoutes.post('/', async (_req: Request, res: Response) => {
  // Check if data already exists
  const existingUsers = await prisma.user.count();
  if (existingUsers > 0) {
    res.json({ message: 'Database already seeded', skipped: true });
    return;
  }

  // Hash passwords for seed users
  const defaultHash = await bcrypt.hash('Welcome@123', BCRYPT_ROUNDS);
  const adminHash = await bcrypt.hash('Admin@123', BCRYPT_ROUNDS);

  // Companies
  const c1 = await prisma.company.create({ data: { id: 'c1', name: 'TechCorp', code: 'TC', active: true } });
  const c2 = await prisma.company.create({ data: { id: 'c2', name: 'Acme Solutions', code: 'AS', active: true } });

  // Departments (shared across companies)
  await prisma.department.createMany({ data: [
    { id: 'd1', companyIds: [c1.id], name: 'Engineering', code: 'ENG', active: true },
    { id: 'd2', companyIds: [c1.id], name: 'Operations', code: 'OPS', active: true },
    { id: 'd3', companyIds: [c1.id, c2.id], name: 'IT', code: 'IT', active: true },
    { id: 'd4', companyIds: [c1.id], name: 'Sales', code: 'SAL', active: true },
    { id: 'd5', companyIds: [c2.id], name: 'Marketing', code: 'MKT', active: true },
    { id: 'd6', companyIds: [c1.id, c2.id], name: 'Finance', code: 'FIN', active: true },
  ]});

  // Designations (shared across companies)
  await prisma.designation.createMany({ data: [
    { id: 'dg1', companyIds: [c1.id, c2.id], name: 'Manager', code: 'MGR', active: true },
    { id: 'dg2', companyIds: [c1.id, c2.id], name: 'Senior Engineer', code: 'SE', active: true },
    { id: 'dg3', companyIds: [c1.id, c2.id], name: 'Team Lead', code: 'TL', active: true },
    { id: 'dg4', companyIds: [c1.id], name: 'Director', code: 'DIR', active: true },
    { id: 'dg5', companyIds: [c2.id], name: 'Analyst', code: 'ANL', active: true },
  ]});

  // Users
  await prisma.user.createMany({ data: [
    { id: 'u1', name: 'Sarah Jenkins', domainId: 'sarah.jenkins', email: 'sarah.j@company.com', role: 'EMPLOYEE', companyId: c1.id, departmentId: 'd1', designationId: 'dg2', passwordHash: defaultHash },
    { id: 'u2', name: 'Reception Desk', domainId: 'reception', email: 'reception@company.com', role: 'RECEPTION', companyId: c1.id, departmentId: 'd2', designationId: 'dg1', passwordHash: defaultHash },
    { id: 'u3', name: 'IT Support Team', domainId: 'it.support', email: 'it.support@company.com', role: 'IT', companyId: c1.id, departmentId: 'd3', designationId: 'dg3', passwordHash: defaultHash },
    { id: 'u5', name: 'Administration Team', domainId: 'administration', email: 'administration@company.com', role: 'ADMINISTRATION', companyId: c1.id, departmentId: 'd2', designationId: 'dg1', passwordHash: defaultHash },
    { id: 'u4', name: 'System Admin', domainId: 'admin', email: 'admin@company.com', role: 'ADMIN', companyId: c1.id, departmentId: 'd3', designationId: 'dg4', passwordHash: adminHash },
  ]});

  // Rooms
  await prisma.room.createMany({ data: [
    { id: 'r1', name: 'Summit (A1)', type: RoomType.CONFERENCE, block: 'Block A', capacity: 12, facilities: ['Projector', 'Whiteboard', 'HDMI'], imageUrl: 'https://picsum.photos/400/300?random=1' },
    { id: 'r2', name: 'Pinnacle (A2)', type: RoomType.BOARD, block: 'Block A', capacity: 20, facilities: ['Video Conf', 'TV Screen', 'Speakerphone', 'Whiteboard'], imageUrl: 'https://picsum.photos/400/300?random=2' },
    { id: 'r3', name: 'Basecamp (A3)', type: RoomType.CONFERENCE, block: 'Block A', capacity: 8, facilities: ['TV Screen', 'HDMI'], imageUrl: 'https://picsum.photos/400/300?random=3' },
    { id: 'r4', name: 'Horizon (B1)', type: RoomType.BOARD, block: 'Block B', capacity: 25, facilities: ['Video Conf', 'Projector', 'Mic System', 'Speakerphone'], imageUrl: 'https://picsum.photos/400/300?random=4' },
    { id: 'r5', name: 'Vista (B2)', type: RoomType.CONFERENCE, block: 'Block B', capacity: 10, facilities: ['TV Screen', 'Whiteboard'], imageUrl: 'https://picsum.photos/400/300?random=5' },
    { id: 'r6', name: 'Outlook (B3)', type: RoomType.CONFERENCE, block: 'Block B', capacity: 6, facilities: ['Whiteboard'], imageUrl: 'https://picsum.photos/400/300?random=6' },
  ]});

  // Room Block Configs
  await prisma.roomBlockConfig.createMany({ data: [
    { name: 'Block A', code: 'A', active: true, itEmail: '', receptionEmail: '', adminEmail: '' },
    { name: 'Block B', code: 'B', active: true, itEmail: '', receptionEmail: '', adminEmail: '' },
  ]});

  // Facilities
  await prisma.facility.createMany({ data: [
    { name: 'Projector', active: true },
    { name: 'Whiteboard', active: true },
    { name: 'Video Conf', active: true },
    { name: 'TV Screen', active: true },
    { name: 'Speakerphone', active: true },
    { name: 'HDMI', active: true },
    { name: 'Mic System', active: true },
  ]});

  // Bookings
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  await prisma.booking.createMany({ data: [
    {
      id: 'b1', roomId: 'r2', userId: 'u1', userName: 'Sarah Jenkins',
      title: 'Q3 Strategy Review',
      startTime: addHours(today, 10), endTime: addHours(today, 12),
      status: 'CONFIRMED', participants: 12, company: 'TechCorp',
      department: 'Strategy', chairPerson: 'Sarah Jenkins',
      vcRequired: true, createMeetingLink: true, platform: 'Teams',
      avSetup: true, supportStandby: false, itStatus: 'PENDING',
    },
    {
      id: 'b2', roomId: 'r4', userId: 'u1', userName: 'Sarah Jenkins',
      title: 'Client Pitch',
      startTime: addHours(today, 14), endTime: addHours(today, 15),
      status: 'CONFIRMED', participants: 5, company: 'TechCorp',
      department: 'Sales', chairPerson: 'Mike Ross',
      vcRequired: true, createMeetingLink: true, platform: 'Zoom',
      avSetup: false, supportStandby: true, itStatus: 'PENDING',
    },
    {
      id: 'b3', roomId: 'r1', userId: 'u4', userName: 'System Admin',
      title: 'Internal Audit',
      startTime: addHours(today, 9), endTime: addHours(today, 10),
      status: 'CONFIRMED', participants: 3, company: 'TechCorp',
      department: 'Internal Audit', chairPerson: 'Admin',
      vcRequired: false, createMeetingLink: false,
      avSetup: false, supportStandby: false, itStatus: 'COMPLETED',
    },
  ]});

  // Default settings
  await prisma.appSettings.createMany({ data: [
    { id: 'portal', key: 'portal', value: JSON.stringify({
      portalName: 'ConferenceHub',
      maxBookingDuration: 10, maxAdvanceBookingDays: 365, autoApproveBookings: true,
      requireApprovalAboveCapacity: 0, allowWeekendBookings: true, maintenanceMode: false,
      maintenanceMessage: '', emailNotifications: true, itAutoAssign: true,
    })},
    { id: 'ldap', key: 'ldap', value: JSON.stringify({
      enabled: false, serverUrl: '', port: 389, useSsl: false,
      bindDn: '', bindPassword: '', baseDn: '', userSearchFilter: '(sAMAccountName={0})',
      usernameAttribute: 'sAMAccountName', emailAttribute: 'mail', displayNameAttribute: 'displayName',
      groupSearchBase: '', adminGroupDn: '', itGroupDn: '', receptionGroupDn: '',
      connectionTimeout: 5000, searchTimeout: 10000,
    })},
    { id: 'smtp', key: 'smtp', value: JSON.stringify({
      enabled: false, host: '', port: 587, useTls: true,
      username: '', password: '', fromAddress: '', fromName: 'ConferenceHub',
      replyToAddress: '', sendBookingConfirmation: true, sendCancellationNotice: true,
      sendITTaskNotification: true, sendDailyDigest: false, ccReception: true,
    })},
    { id: 'database', key: 'database', value: JSON.stringify({
      enabled: true, host: 'localhost', port: 5432, database: 'crb',
      username: 'postgres', password: '********',
    })},
  ]});

  res.json({ message: 'Database seeded successfully', seeded: true });
});
