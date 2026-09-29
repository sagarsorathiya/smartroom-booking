import 'dotenv/config';
import path from 'path';
import fs from 'fs';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import prisma from './prisma.js';
import { roomRoutes } from './routes/rooms.js';
import { bookingRoutes } from './routes/bookings.js';
import { userRoutes } from './routes/users.js';
import { companyRoutes } from './routes/companies.js';
import { departmentRoutes } from './routes/departments.js';
import { designationRoutes } from './routes/designations.js';
import { auditRoutes } from './routes/audit.js';
import { blockedSlotRoutes } from './routes/blockedSlots.js';
import { settingsRoutes } from './routes/settings.js';
import { vcAvailabilityRoutes } from './routes/vcAvailability.js';
import { authRoutes } from './routes/auth.js';
import { seedRoutes } from './routes/seed.js';
import { blockRoutes } from './routes/blocks.js';
import { facilityRoutes } from './routes/facilities.js';
import { serviceRequestRoutes } from './routes/serviceRequests.js';
import { attachmentRoutes } from './routes/attachments.js';
import { authenticate, requireRole } from './middleware/auth.js';

const app = express();
const PORT = process.env.API_PORT ? parseInt(process.env.API_PORT) : 3002;

// Trust first reverse proxy hop (IIS, nginx, etc.) for correct IP and forwarded headers
app.set('trust proxy', 1);

// Security headers — relax for SPA with CDN Tailwind/Fonts served over HTTP
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://esm.sh"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'"],
      upgradeInsecureRequests: null,
    },
  },
  crossOriginOpenerPolicy: false,
  originAgentCluster: false,
  // Enable HSTS — tells browsers to always use HTTPS (max-age 1 year)
  strictTransportSecurity: {
    maxAge: 31536000,
    includeSubDomains: false,
  },
}));

// Request logging
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// CORS
const corsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',')
  : ['http://localhost:3001', 'http://localhost:3000'];
app.use(cors({ origin: corsOrigins, credentials: true }));
app.use(express.json({ limit: '10mb' }));

// Disable browser caching for all API responses — prevents stale 304 responses after mutations
app.use('/api', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// IIS forwards client IP as "IP:port" — strip port, then delegate to ipKeyGenerator for IPv6 safety
const extractIp = (req: express.Request): string => {
  const raw = (req.ip ?? req.socket.remoteAddress ?? '127.0.0.1').trim();
  // Handle IPv4-mapped IPv6 (::ffff:1.2.3.4) and IP:port
  const withoutPrefix = raw.startsWith('::ffff:') ? raw.slice(7) : raw;
  const colonIdx = withoutPrefix.lastIndexOf(':');
  // If it looks like IP:port (single colon, not a bare IPv6) strip the port
  const ip = colonIdx !== -1 && !withoutPrefix.includes('[') && withoutPrefix.split(':').length === 2
    ? withoutPrefix.slice(0, colonIdx)
    : withoutPrefix;
  return ipKeyGenerator(ip);
};

// Rate limiting for auth endpoints (100 requests per 15 minutes per IP)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many login attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: extractIp,
});

// Strict rate limit for login specifically — 10 attempts per 15 minutes per IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: extractIp,
});

// Public routes (no auth required)
app.post('/api/auth/login', loginLimiter); // stricter limit on login before general authLimiter
app.post('/api/auth/login-sso', loginLimiter); // same strict limit — SSO endpoint must not be brute-forced
app.use('/api/auth', authLimiter, authRoutes);
app.get('/api/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', database: 'connected' });
  } catch {
    res.status(500).json({ status: 'error', database: 'disconnected' });
  }
});

// All routes below require authentication
app.use('/api/rooms', authenticate, roomRoutes);
// Room CUD operations are protected at the route level (POST/PUT/DELETE check ADMIN role)
app.use('/api/bookings', authenticate, bookingRoutes);
// search-directory is accessible by IT/RECEPTION/ADMIN (registered before admin-only users routes)
app.use('/api/users', authenticate, userRoutes);
app.use('/api/companies', authenticate, companyRoutes);
app.use('/api/departments', authenticate, departmentRoutes);
app.use('/api/designations', authenticate, designationRoutes);
app.use('/api/audit', authenticate, auditRoutes);
app.use('/api/blocked-slots', authenticate, blockedSlotRoutes);
app.use('/api/settings', authenticate, requireRole('ADMIN'), settingsRoutes);
// Non-secret subset of VC integration settings — any authenticated role (drives the booking form's platform picker)
app.use('/api/vc-availability', authenticate, vcAvailabilityRoutes);
app.use('/api/blocks', authenticate, blockRoutes);
app.use('/api/facilities', authenticate, facilityRoutes);
app.use('/api/service-requests', authenticate, serviceRequestRoutes);
// Attachment upload/download/delete (auth checked inside route handlers for creator vs admin logic)
app.use('/api/bookings', authenticate, attachmentRoutes);
app.use('/api/attachments', authenticate, attachmentRoutes);
// Seed route — disabled in production, admin-only in dev
if (process.env.NODE_ENV !== 'production') {
  app.use('/api/seed', authenticate, requireRole('ADMIN'), seedRoutes);
}

// Serve frontend static files — single process serves both API and UI
// Use import.meta.url to get the absolute path to the compiled server file,
// then resolve up two levels (dist-server/server/ → project root) to find dist/.
// Falls back to process.cwd()/dist for local dev (tsx server/index.ts).
import { fileURLToPath } from 'url';
const __serverDir = path.dirname(fileURLToPath(import.meta.url));
// In production: __serverDir = <root>/dist-server/server  → ../../dist = <root>/dist
// In dev (tsx):  __serverDir = <root>/server              → ../../dist would be wrong, use cwd fallback
const isCompiled = __serverDir.includes('dist-server');
const frontendPath = isCompiled
  ? path.resolve(__serverDir, '../../dist')
  : path.join(process.cwd(), 'dist');
app.use(express.static(frontendPath));
app.get('{*path}', (_req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// Global error handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[ERROR]', err.stack || err.message || err);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : (err.message || 'Internal server error'),
  });
});

// Graceful shutdown
const gracefulShutdown = async () => {
  console.log('Shutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
};
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED_REJECTION]', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT_EXCEPTION]', err);
  process.exit(1);
});

app.listen(PORT, '0.0.0.0', async () => {
  console.log(`ConferenceHub API running on http://0.0.0.0:${PORT}`);

  // Ensure uploads directory exists
  const uploadsDir = path.join(process.cwd(), 'uploads', 'bookings');
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log(`[STARTUP] Uploads directory ready: ${uploadsDir}`);

  // Bootstrap: ensure an ADMIN user with a passwordHash always exists
  try {
    const adminUser = await prisma.user.findFirst({
      where: { role: 'ADMIN', passwordHash: { not: null } },
    });
    if (!adminUser) {
      const hash = await bcrypt.hash('Admin@123', 12);
      // Check if an ADMIN user exists without a passwordHash (e.g., created via LDAP)
      const existingAdmin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
      if (existingAdmin) {
        await prisma.user.update({
          where: { id: existingAdmin.id },
          data: { passwordHash: hash, active: true },
        });
        console.log('═══════════════════════════════════════════════');
        console.log('  Admin password set for: ' + existingAdmin.domainId);
        console.log('  Password: Admin@123');
        console.log('  ⚠ Change this password after first login!');
        console.log('═══════════════════════════════════════════════');
      } else {
        await prisma.user.create({
          data: {
            name: 'Administrator',
            domainId: 'admin',
            email: 'admin@conferencehub.local',
            role: 'ADMIN',
            passwordHash: hash,
            active: true,
            manualRole: true,
          },
        });
        console.log('═══════════════════════════════════════════════');
        console.log('  Default admin created — first-time setup');
        console.log('  Login:    admin');
        console.log('  Password: Admin@123');
        console.log('  ⚠ Change this password after first login!');
        console.log('═══════════════════════════════════════════════');
      }
    }
  } catch (err) {
    console.error('Bootstrap check failed:', err);
  }
});
