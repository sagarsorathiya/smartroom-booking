import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import prisma from '../prisma.js';
import { requireRole } from '../middleware/auth.js';
import { toFrontendAttachment } from '../mappers.js';

export const attachmentRoutes = Router();

// ─── Upload directory ────────────────────────────────────
// Resolved relative to the server process cwd (the production root or project root in dev).
// The deploy script preserves this folder across deployments.
function getUploadDir(): string {
  return path.join(process.cwd(), 'uploads', 'bookings');
}

function ensureUploadDir(): string {
  const dir = getUploadDir();
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// ─── Multer configuration ────────────────────────────────
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'text/plain',
]);

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB
const MAX_FILES_PER_BOOKING = 10;

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, ensureUploadDir());
  },
  filename: (_req, file, cb) => {
    // Store with UUID to avoid collisions; keep original extension
    const ext = path.extname(file.originalname).toLowerCase().replace(/[^a-z0-9.]/g, '');
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES_PER_BOOKING },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type not allowed: ${file.mimetype}`));
    }
  },
});

// ─── POST /api/bookings/:id/attachments ─────────────────
// Upload one or more files for a booking. Creator or Admin only.
attachmentRoutes.post('/:id/attachments', upload.array('files', MAX_FILES_PER_BOOKING), async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const userId = req.user!.userId;
  const userRole = req.user!.role;

  const booking = await prisma.booking.findUnique({ where: { id }, select: { id: true, userId: true } });
  if (!booking) {
    // Clean up uploaded files if booking not found
    cleanupMulterFiles(req.files as Express.Multer.File[]);
    res.status(404).json({ error: 'Booking not found' });
    return;
  }

  // Only the booking creator or an Admin can attach files
  if (booking.userId !== userId && userRole !== 'ADMIN') {
    cleanupMulterFiles(req.files as Express.Multer.File[]);
    res.status(403).json({ error: 'Only the booking creator or admin can add attachments' });
    return;
  }

  // Check current attachment count to enforce per-booking limit
  const existingCount = await prisma.bookingAttachment.count({ where: { bookingId: id } });
  const incoming = (req.files as Express.Multer.File[]) || [];
  if (existingCount + incoming.length > MAX_FILES_PER_BOOKING) {
    cleanupMulterFiles(incoming);
    res.status(400).json({ error: `Attachment limit is ${MAX_FILES_PER_BOOKING} files per booking` });
    return;
  }

  const created = await prisma.$transaction(
    incoming.map(f =>
      prisma.bookingAttachment.create({
        data: {
          bookingId: id,
          filename: f.filename,
          originalName: f.originalname,
          size: f.size,
          mimeType: f.mimetype,
          uploadedBy: userId,
        },
      })
    )
  );

  res.status(201).json(created.map(toFrontendAttachment));
});

// ─── GET /api/attachments/:attachmentId ─────────────────
// Download a specific attachment. Authenticated users with access to the booking.
attachmentRoutes.get('/:attachmentId/download', async (req: Request, res: Response) => {
  const attachmentId = String(req.params.attachmentId);
  const userId = req.user!.userId;
  const userRole = req.user!.role;

  const attachment = await prisma.bookingAttachment.findUnique({
    where: { id: attachmentId },
    include: { booking: { select: { userId: true } } },
  });
  if (!attachment) {
    res.status(404).json({ error: 'Attachment not found' });
    return;
  }

  // Only the booking owner or elevated roles can download
  const elevatedRoles = ['IT', 'RECEPTION', 'ADMINISTRATION', 'ADMIN'];
  if (attachment.booking.userId !== userId && !elevatedRoles.includes(userRole)) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }

  const filePath = path.join(getUploadDir(), attachment.filename);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'File not found on disk' });
    return;
  }

  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(attachment.originalName)}"`);
  res.setHeader('Content-Type', attachment.mimeType);
  res.sendFile(filePath);
});

// ─── DELETE /api/bookings/:id/attachments/:attachmentId ─
// Delete an attachment. Creator or Admin only.
attachmentRoutes.delete('/:id/attachments/:attachmentId', async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const attachmentId = String(req.params.attachmentId);
  const userId = req.user!.userId;
  const userRole = req.user!.role;

  const booking = await prisma.booking.findUnique({ where: { id }, select: { userId: true } });
  if (!booking) {
    res.status(404).json({ error: 'Booking not found' });
    return;
  }

  const canDelete = booking.userId === userId || ['RECEPTION', 'ADMINISTRATION', 'ADMIN'].includes(userRole);
  if (!canDelete) {
    res.status(403).json({ error: 'Only the booking creator, reception, or admin can delete attachments' });
    return;
  }

  const attachment = await prisma.bookingAttachment.findUnique({ where: { id: attachmentId } });
  if (!attachment || attachment.bookingId !== id) {
    res.status(404).json({ error: 'Attachment not found' });
    return;
  }

  // Delete from DB first, then disk
  await prisma.bookingAttachment.delete({ where: { id: attachmentId } });

  const filePath = path.join(getUploadDir(), attachment.filename);
  fs.unlink(filePath, err => {
    if (err) console.error('[ATTACHMENT] Could not delete file from disk:', err.message);
  });

  res.json({ success: true });
});

// ─── Helpers ─────────────────────────────────────────────

function cleanupMulterFiles(files?: Express.Multer.File[]) {
  if (!files) return;
  for (const f of files) {
    fs.unlink(f.path, () => {});
  }
}
