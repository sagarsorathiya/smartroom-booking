import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import prisma from '../prisma.js';
import crypto from 'crypto';

export interface SmtpConfig {
  enabled: boolean;
  host: string;
  port: number;
  useTls: boolean;
  username: string;
  password: string;
  fromAddress: string;
  fromName: string;
  replyToAddress: string;
  sendBookingConfirmation: boolean;
  sendCancellationNotice: boolean;
  sendITTaskNotification: boolean;
  sendDailyDigest: boolean;
  ccReception: boolean;
}

async function getSmtpConfig(): Promise<SmtpConfig | null> {
  const row = await prisma.appSettings.findUnique({ where: { key: 'smtp' } });
  if (!row) return null;
  const config = JSON.parse(row.value) as SmtpConfig;
  return config.enabled ? config : null;
}

function createTransporter(config: SmtpConfig): Transporter {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: config.username ? { user: config.username, pass: config.password } : undefined,
    tls: config.useTls ? { rejectUnauthorized: process.env.TLS_REJECT_UNAUTHORIZED !== 'false' } : undefined,
  });
}



interface EmailAttachment {
  filename: string;    // Original filename shown to recipient
  path: string;        // Absolute path on disk
  contentType: string; // MIME type
}

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  cc?: string[];
  replyTo?: string;
  icalEvent?: { content: string; method: string };
  attachments?: EmailAttachment[];
}

async function sendEmail(options: EmailOptions): Promise<void> {
  const config = await getSmtpConfig();
  if (!config) return; // SMTP disabled, silently skip

  const transporter = createTransporter(config);
  const from = config.fromName ? `"${config.fromName}" <${config.fromAddress}>` : config.fromAddress;

  const mailOptions: any = {
    from,
    to: options.to,
    cc: options.cc?.join(', '),
    replyTo: options.replyTo || config.replyToAddress || undefined,
    subject: options.subject,
    html: options.html,
  };

  // Attach ICS calendar invite if provided
  // Use string content — nodemailer handles charset (UTF-8) and Content-Transfer-Encoding internally.
  // Avoid passing Buffer + encoding:'base64' which can produce malformed MIME that breaks Zimbra ZCO.
  if (options.icalEvent) {
    mailOptions.icalEvent = {
      method: options.icalEvent.method,
      content: options.icalEvent.content,
      charset: 'utf-8',
    };
  }

  // File attachments (sent to booker + invitees only — NOT reception/IT/admin)
  if (options.attachments && options.attachments.length > 0) {
    mailOptions.attachments = options.attachments.map(a => ({
      filename: a.filename,
      path: a.path,
      contentType: a.contentType,
    }));
  }

  await transporter.sendMail(mailOptions);
}

// ─── ICS Calendar Event Generator ───────────────────────

function formatICSDate(date: Date | string): string {
  const d = new Date(date);
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function generateICS(options: {
  method: 'REQUEST' | 'CANCEL';
  title: string;
  description: string;
  startTime: Date | string;
  endTime: Date | string;
  location: string;
  organizerEmail: string;
  organizerName: string;
  attendees?: string[];
  uid?: string;
}): string {
  const uid = options.uid || crypto.randomUUID() + '@conferencehub';
  const now = formatICSDate(new Date());
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ConferenceHub//Booking//EN',
    `METHOD:${options.method}`,
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    `DTSTART:${formatICSDate(options.startTime)}`,
    `DTEND:${formatICSDate(options.endTime)}`,
    `SUMMARY:${escapeICSText(options.title)}`,
    `DESCRIPTION:${escapeICSText(options.description)}`,
    `LOCATION:${escapeICSText(options.location)}`,
    `ORGANIZER;CN="${escapeICSText(options.organizerName)}":mailto:${options.organizerEmail}`,
    options.method === 'CANCEL' ? 'STATUS:CANCELLED' : 'STATUS:CONFIRMED',
    `SEQUENCE:${options.method === 'CANCEL' ? 1 : 0}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT15M',
    'ACTION:DISPLAY',
    'DESCRIPTION:Meeting in 15 minutes',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  // Add attendees before END:VEVENT
  if (options.attendees && options.attendees.length > 0) {
    const endIdx = lines.indexOf('BEGIN:VALARM');
    for (const email of options.attendees) {
      lines.splice(endIdx, 0, `ATTENDEE;RSVP=TRUE;PARTSTAT=NEEDS-ACTION:mailto:${email}`);
    }
  }

  return lines.map(foldICSLine).join('\r\n') + '\r\n';
}

/**
 * Fold a single ICS line to comply with RFC 5545 Section 3.1:
 * Lines SHOULD NOT be longer than 75 octets. Long lines are split by
 * inserting a CRLF followed by a single SPACE character.
 */
function foldICSLine(line: string): string {
  if (Buffer.byteLength(line, 'utf-8') <= 75) return line;
  const parts: string[] = [];
  let remaining = line;
  let isFirst = true;
  while (Buffer.byteLength(remaining, 'utf-8') > 75) {
    // First line gets 75 octets, continuation lines get 74 (75 minus the leading space)
    const maxBytes = isFirst ? 75 : 74;
    // Find the cut point that doesn't split a multi-byte character
    let cutLen = 0;
    let byteCount = 0;
    for (const ch of remaining) {
      const charBytes = Buffer.byteLength(ch, 'utf-8');
      if (byteCount + charBytes > maxBytes) break;
      byteCount += charBytes;
      cutLen += ch.length; // .length handles surrogate pairs
    }
    parts.push(remaining.substring(0, cutLen));
    remaining = remaining.substring(cutLen);
    isFirst = false;
  }
  if (remaining) parts.push(remaining);
  return parts.join('\r\n ');
}

function escapeICSText(text: string): string {
  return text
    // Strip control characters that are invalid in XML (breaks Zimbra ZCO sync)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // Replace non-ASCII with closest ASCII equivalent or strip
    .replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/[\u2013\u2014]/g, '-').replace(/\u2026/g, '...').replace(/[^\x20-\x7E\t\r\n]/g, '')
    // Collapse tabs to spaces (tabs in ICS text can confuse some parsers)
    .replace(/\t/g, ' ')
    // Standard ICS escaping (order matters: backslash first)
    .replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r\n/g, '\\n').replace(/\r/g, '\\n').replace(/\n/g, '\\n');
}

/** HTML-encode user-provided text to prevent XSS in email templates */
function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Convert plain-text agenda (with newlines) to HTML-safe markup for emails.
 * Email clients strip `white-space: pre-line` CSS, so we convert newlines to <br> tags.
 */
function agendaToHtml(text: string): string {
  return escapeHtml(text).replace(/\n/g, '<br>');
}

// ─── Email Templates ────────────────────────────────────

function formatDateTime(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

async function getPortalName(): Promise<string> {
  const row = await prisma.appSettings.findUnique({ where: { key: 'portal' } });
  if (!row) return 'ConferenceHub';
  try {
    const settings = JSON.parse(row.value);
    return settings.portalName || 'ConferenceHub';
  } catch { return 'ConferenceHub'; }
}

function getPortalUrl(): string {
  // Prefer an explicit PORTAL_URL env var; fall back to the first CORS_ORIGIN entry
  const explicit = process.env.PORTAL_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, '');
  const cors = process.env.CORS_ORIGIN?.split(',')[0]?.trim();
  return cors ? cors.replace(/\/$/, '') : '';
}

function baseTemplate(title: string, body: string, portalName = 'ConferenceHub'): string {
  const portalUrl = getPortalUrl();
  const headerContent = portalUrl
    ? `<a href="${portalUrl}" style="color: white; text-decoration: none;">
        <span style="font-size: 20px; font-weight: 700; letter-spacing: -0.3px;">${portalName}</span>
      </a>`
    : `<span style="font-size: 20px; font-weight: 700; letter-spacing: -0.3px; color: white;">${portalName}</span>`;
  const portalButton = portalUrl
    ? `<table width="100%" cellpadding="0" cellspacing="0" style="margin: 24px 0 8px;">
        <tr>
          <td align="center">
            <a href="${portalUrl}"
               style="display: inline-block; background: #4f46e5; color: #ffffff; text-decoration: none;
                      padding: 12px 32px; border-radius: 8px; font-size: 15px; font-weight: 600;
                      letter-spacing: 0.1px; mso-padding-alt: 0;">
              Open ${portalName} &nbsp;&rarr;
            </a>
          </td>
        </tr>
      </table>`
    : '';
  const portalFooter = portalUrl
    ? `<p style="color: #94a3b8; font-size: 12px; margin: 6px 0 0; text-align: center;">
        or visit: <a href="${portalUrl}" style="color: #6366f1; text-decoration: underline;">${portalUrl}</a>
      </p>`
    : '';
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

        <!-- Header -->
        <tr>
          <td style="background:#4f46e5;padding:20px 28px;border-radius:12px 12px 0 0;">
            ${headerContent}
            <p style="margin:6px 0 0;color:#c7d2fe;font-size:13px;">Room Booking System</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="background:#ffffff;padding:28px 28px 8px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">
            <h2 style="margin:0 0 20px;color:#1e293b;font-size:18px;font-weight:700;">${title}</h2>
            ${body}
          </td>
        </tr>

        <!-- CTA Button -->
        ${portalButton ? `<tr><td style="background:#ffffff;padding:0 28px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">${portalButton}${portalFooter}</td></tr>` : ''}

        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;padding:16px 28px;border:1px solid #e2e8f0;border-top:1px solid #e2e8f0;border-radius:0 0 12px 12px;text-align:center;">
            <p style="color:#94a3b8;font-size:12px;margin:0;line-height:1.6;">
              This is an automated notification from <strong>${portalName}</strong>.<br>
              Please do not reply directly to this email.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─── Public Email Functions ─────────────────────────────

export interface BookingInfo {
  id?: string;
  title: string;
  roomName: string;
  roomBlock?: string;
  startTime: Date | string;
  endTime: Date | string;
  chairPerson: string;
  participants: number;
  company: string;
  department: string;
  userName: string;
  userEmail: string;
  vcRequired?: boolean;
  platform?: string;
  existingLink?: string;
  meetingNumber?: string;
  meetingPassword?: string;
  generatedLink?: string;
  avSetup?: boolean;
  supportStandby?: boolean;
  agenda?: string;
  notifyEmails?: string[];
  roomNotifyEmail?: string;
  /** File attachments to include in booker + invitee emails (NOT reception/IT/admin) */
  emailAttachments?: EmailAttachment[];
  cancellationReason?: string;
}

function splitEmails(field: string): string[] {
  return field.split(/[,;]/).map(e => e.trim()).filter(Boolean);
}

async function getBlockEmails(blockName?: string): Promise<{ itEmails: string[]; receptionEmails: string[]; adminEmails: string[] } | null> {
  if (!blockName) return null;
  const blockConfig = await prisma.roomBlockConfig.findFirst({
    where: { name: blockName, active: true },
    select: { itEmail: true, receptionEmail: true, adminEmail: true },
  });
  if (!blockConfig) return null;
  return {
    itEmails: splitEmails(blockConfig.itEmail),
    receptionEmails: splitEmails(blockConfig.receptionEmail),
    adminEmails: splitEmails(blockConfig.adminEmail),
  };
}

/**
 * Send booking confirmation email to the user who created the booking.
 * Includes an ICS calendar invite as an attachment.
 *
 * Reception rule: reception receives a SEPARATE stripped email (no agenda, no attachments).
 * Booker + invitees get the full email with agenda (HTML-formatted) and file attachments.
 */
export async function sendBookingConfirmation(booking: BookingInfo, isEdit = false, options?: { skipBooker?: boolean; skipReception?: boolean }): Promise<void> {
  const config = await getSmtpConfig();
  if (!config || !config.sendBookingConfirmation) return;
  const pName = await getPortalName();

  // Collect reception emails — they get a separate stripped notification, NOT CC on booker email
  const receptionEmails: string[] = [];
  const blockEmails = await getBlockEmails(booking.roomBlock);
  if (blockEmails) {
    receptionEmails.push(...blockEmails.receptionEmails);
  }
  if (booking.roomNotifyEmail) {
    receptionEmails.push(...splitEmails(booking.roomNotifyEmail));
  }

  // ── Full email body (for booker + invitees) ─────────────
  const bookerBody = `
    <p style="color: #475569; margin: 0 0 20px; font-size: 14px;">${isEdit ? 'Your room booking has been updated.' : 'Your room booking has been confirmed.'}</p>
    <table style="width: 100%; border-collapse: collapse; font-size: 14px; border-radius: 8px; overflow: hidden; border: 1px solid #e2e8f0;">
      <tr style="background:#f8fafc;"><td style="padding: 10px 14px; color: #64748b; font-weight:500; width: 130px; border-bottom:1px solid #e2e8f0;">Meeting</td><td style="padding: 10px 14px; color: #1e293b; font-weight: 600; border-bottom:1px solid #e2e8f0;">${escapeHtml(booking.title)}</td></tr>
      <tr style="background:#ffffff;"><td style="padding: 10px 14px; color: #64748b; font-weight:500; border-bottom:1px solid #e2e8f0;">Room</td><td style="padding: 10px 14px; color: #1e293b; border-bottom:1px solid #e2e8f0;">${escapeHtml(booking.roomName)}${booking.roomBlock ? ` &mdash; <span style="color:#6366f1;">${escapeHtml(booking.roomBlock)}</span>` : ''}</td></tr>
      <tr style="background:#f8fafc;"><td style="padding: 10px 14px; color: #64748b; font-weight:500; border-bottom:1px solid #e2e8f0;">Start</td><td style="padding: 10px 14px; color: #1e293b; border-bottom:1px solid #e2e8f0;">${formatDateTime(booking.startTime)}</td></tr>
      <tr style="background:#ffffff;"><td style="padding: 10px 14px; color: #64748b; font-weight:500; border-bottom:1px solid #e2e8f0;">End</td><td style="padding: 10px 14px; color: #1e293b; border-bottom:1px solid #e2e8f0;">${formatDateTime(booking.endTime)}</td></tr>
      <tr style="background:#f8fafc;"><td style="padding: 10px 14px; color: #64748b; font-weight:500; border-bottom:1px solid #e2e8f0;">Chair</td><td style="padding: 10px 14px; color: #1e293b; border-bottom:1px solid #e2e8f0;">${escapeHtml(booking.chairPerson)}</td></tr>
      <tr style="background:#ffffff;"><td style="padding: 10px 14px; color: #64748b; font-weight:500; border-bottom:1px solid #e2e8f0;">Participants</td><td style="padding: 10px 14px; color: #1e293b; border-bottom:1px solid #e2e8f0;">${booking.participants}</td></tr>
      <tr style="background:#f8fafc;"><td style="padding: 10px 14px; color: #64748b; font-weight:500; border-bottom:1px solid #e2e8f0;">Company</td><td style="padding: 10px 14px; color: #1e293b; border-bottom:1px solid #e2e8f0;">${escapeHtml(booking.company)}</td></tr>
      <tr style="background:#ffffff;"><td style="padding: 10px 14px; color: #64748b; font-weight:500; border-bottom:1px solid #e2e8f0;">Department</td><td style="padding: 10px 14px; color: #1e293b; border-bottom:1px solid #e2e8f0;">${escapeHtml(booking.department)}</td></tr>
      <tr style="background:#f8fafc;"><td style="padding: 10px 14px; color: #64748b; font-weight:500; border-bottom:1px solid #e2e8f0;">Booked By</td><td style="padding: 10px 14px; color: #1e293b; border-bottom:1px solid #e2e8f0;">${escapeHtml(booking.userName)}</td></tr>
      ${booking.agenda ? `<tr style="background:#ffffff;"><td style="padding: 10px 14px; color: #64748b; font-weight:500; border-bottom:1px solid #e2e8f0; vertical-align:top;">Agenda</td><td style="padding: 10px 14px; color: #1e293b; border-bottom:1px solid #e2e8f0; line-height:1.6;">${agendaToHtml(booking.agenda)}</td></tr>` : ''}
      ${booking.vcRequired ? `<tr style="background:#f8fafc;"><td style="padding: 10px 14px; color: #64748b; font-weight:500; border-bottom:1px solid #e2e8f0;">VC Platform</td><td style="padding: 10px 14px; color: #1e293b; border-bottom:1px solid #e2e8f0;">${escapeHtml(booking.platform || 'Requested')}</td></tr>` : ''}
      ${(booking.generatedLink || booking.existingLink) ? `<tr style="background:#ffffff;"><td style="padding: 10px 14px; color: #64748b; font-weight:500; border-bottom:1px solid #e2e8f0;">Meeting Link</td><td style="padding: 10px 14px; border-bottom:1px solid #e2e8f0;"><a href="${escapeHtml((booking.generatedLink || booking.existingLink)!)}" style="color: #4f46e5; word-break:break-all;">${escapeHtml((booking.generatedLink || booking.existingLink)!)}</a></td></tr>` : ''}
      ${booking.meetingNumber ? `<tr style="background:#f8fafc;"><td style="padding: 10px 14px; color: #64748b; font-weight:500; border-bottom:1px solid #e2e8f0;">Meeting No.</td><td style="padding: 10px 14px; color: #1e293b; font-family:monospace; border-bottom:1px solid #e2e8f0;">${escapeHtml(booking.meetingNumber)}</td></tr>` : ''}
      ${booking.meetingPassword ? `<tr style="background:#ffffff;"><td style="padding: 10px 14px; color: #64748b; font-weight:500;">Password</td><td style="padding: 10px 14px; color: #1e293b; font-family:monospace;">${escapeHtml(booking.meetingPassword)}</td></tr>` : ''}
    </table>
    <p style="color: #64748b; font-size: 13px; margin-top: 16px; padding: 12px 14px; background:#f0fdf4; border-left: 3px solid #22c55e; border-radius: 4px;">${isEdit ? 'An updated calendar invite is attached &mdash; open it to update your calendar.' : 'A calendar invite is attached &mdash; open it to add this meeting to your calendar.'}</p>
  `;

  // ── Stripped body for reception (no agenda, no attachments) ─
  const receptionBody = `
    <p style="color: #475569; margin: 0 0 20px; font-size: 14px;">${isEdit ? 'A room booking has been updated.' : 'A room booking has been confirmed.'}</p>
    <table style="width: 100%; border-collapse: collapse; font-size: 14px; border-radius: 8px; overflow: hidden; border: 1px solid #e2e8f0;">
      <tr style="background:#f8fafc;"><td style="padding: 10px 14px; color: #64748b; font-weight:500; width: 130px; border-bottom:1px solid #e2e8f0;">Meeting</td><td style="padding: 10px 14px; color: #1e293b; font-weight: 600; border-bottom:1px solid #e2e8f0;">${escapeHtml(booking.title)}</td></tr>
      <tr style="background:#ffffff;"><td style="padding: 10px 14px; color: #64748b; font-weight:500; border-bottom:1px solid #e2e8f0;">Room</td><td style="padding: 10px 14px; color: #1e293b; border-bottom:1px solid #e2e8f0;">${escapeHtml(booking.roomName)}${booking.roomBlock ? ` &mdash; <span style="color:#6366f1;">${escapeHtml(booking.roomBlock)}</span>` : ''}</td></tr>
      <tr style="background:#f8fafc;"><td style="padding: 10px 14px; color: #64748b; font-weight:500; border-bottom:1px solid #e2e8f0;">Start</td><td style="padding: 10px 14px; color: #1e293b; border-bottom:1px solid #e2e8f0;">${formatDateTime(booking.startTime)}</td></tr>
      <tr style="background:#ffffff;"><td style="padding: 10px 14px; color: #64748b; font-weight:500; border-bottom:1px solid #e2e8f0;">End</td><td style="padding: 10px 14px; color: #1e293b; border-bottom:1px solid #e2e8f0;">${formatDateTime(booking.endTime)}</td></tr>
      <tr style="background:#f8fafc;"><td style="padding: 10px 14px; color: #64748b; font-weight:500; border-bottom:1px solid #e2e8f0;">Chair</td><td style="padding: 10px 14px; color: #1e293b; border-bottom:1px solid #e2e8f0;">${escapeHtml(booking.chairPerson)}</td></tr>
      <tr style="background:#ffffff;"><td style="padding: 10px 14px; color: #64748b; font-weight:500; border-bottom:1px solid #e2e8f0;">Participants</td><td style="padding: 10px 14px; color: #1e293b; border-bottom:1px solid #e2e8f0;">${booking.participants}</td></tr>
      <tr style="background:#f8fafc;"><td style="padding: 10px 14px; color: #64748b; font-weight:500; border-bottom:1px solid #e2e8f0;">Company</td><td style="padding: 10px 14px; color: #1e293b; border-bottom:1px solid #e2e8f0;">${escapeHtml(booking.company)}</td></tr>
      <tr style="background:#ffffff;"><td style="padding: 10px 14px; color: #64748b; font-weight:500; border-bottom:1px solid #e2e8f0;">Department</td><td style="padding: 10px 14px; color: #1e293b; border-bottom:1px solid #e2e8f0;">${escapeHtml(booking.department)}</td></tr>
      <tr style="background:#f8fafc;"><td style="padding: 10px 14px; color: #64748b; font-weight:500; border-bottom:1px solid #e2e8f0;">Booked By</td><td style="padding: 10px 14px; color: #1e293b; border-bottom:1px solid #e2e8f0;">${escapeHtml(booking.userName)}</td></tr>
      ${booking.vcRequired ? `<tr style="background:#ffffff;"><td style="padding: 10px 14px; color: #64748b; font-weight:500; border-bottom:1px solid #e2e8f0;">VC Required</td><td style="padding: 10px 14px; color: #1e293b; border-bottom:1px solid #e2e8f0;">Yes &mdash; ${escapeHtml(booking.platform || 'Platform TBD')}</td></tr>` : ''}
      ${booking.avSetup ? `<tr style="background:#f8fafc;"><td style="padding: 10px 14px; color: #64748b; font-weight:500;">AV Setup</td><td style="padding: 10px 14px; color: #1e293b;">Required</td></tr>` : ''}
    </table>
  `;

  const uid = (booking.id || crypto.randomUUID()) + '@conferencehub';
  const meetingLink = booking.generatedLink || booking.existingLink;
  const description = `Meeting: ${booking.title}\nRoom: ${booking.roomName}\nChair: ${booking.chairPerson}\nCompany: ${booking.company} / ${booking.department}${meetingLink ? `\n\nMeeting Link: ${meetingLink}` : ''}${booking.meetingNumber ? `\nMeeting No: ${booking.meetingNumber}` : ''}${booking.meetingPassword ? `\nPassword: ${booking.meetingPassword}` : ''}${booking.agenda ? `\n\nAgenda:\n${booking.agenda}` : ''}`;
  const allAttendees = [booking.userEmail, ...(booking.notifyEmails || [])];

  const icsContent = generateICS({
    method: 'REQUEST',
    title: booking.title,
    description,
    startTime: booking.startTime,
    endTime: booking.endTime,
    location: booking.roomBlock ? `${booking.roomName} - ${booking.roomBlock}` : booking.roomName,
    organizerEmail: booking.userEmail,
    organizerName: booking.userName,
    attendees: allAttendees,
    uid,
  });

  const finalIcs = isEdit ? icsContent.replace('SEQUENCE:0', 'SEQUENCE:1') : icsContent;

  // ── Send to the booker (skip when only sending to new notify recipients) ──
  if (!options?.skipBooker) {
    await sendEmail({
      to: booking.userEmail,
      subject: `${isEdit ? 'Booking Updated' : 'Booking Confirmed'}: ${booking.title}`,
      html: baseTemplate(isEdit ? 'Booking Updated &#x270E;' : 'Booking Confirmed &#x2713;', bookerBody, pName),
      replyTo: booking.userEmail,
      icalEvent: { content: finalIcs, method: 'REQUEST' },
      attachments: booking.emailAttachments,
    });
  }

  // ── Send separate stripped notification to reception (no agenda, no files) ──
  const uniqueReception = [...new Set(receptionEmails.filter(Boolean))];
  if (uniqueReception.length > 0 && !options?.skipReception) {
    const [primary, ...ccRec] = uniqueReception;
    sendEmail({
      to: primary,
      subject: `${isEdit ? 'Booking Updated' : 'New Booking'}: ${booking.title}`,
      html: baseTemplate(isEdit ? 'Booking Updated &#x270E;' : 'New Booking &#x2713;', receptionBody, pName),
      cc: ccRec.length > 0 ? ccRec : undefined,
      replyTo: booking.userEmail,
    }).catch((e: any) => console.error('[EMAIL][RECEPTION]', e.message));
  }

  // ── Also send calendar invite to notify recipients (full email with agenda + attachments) ──
  if (booking.notifyEmails && booking.notifyEmails.length > 0) {
    const notifyBody = `
      <p style="color: #475569;">You have been invited to a meeting.</p>

      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr><td style="padding: 8px 0; color: #64748b; width: 130px;">Meeting</td><td style="padding: 8px 0; color: #1e293b; font-weight: 500;">${escapeHtml(booking.title)}</td></tr>
        <tr><td style="padding: 8px 0; color: #64748b;">Room</td><td style="padding: 8px 0; color: #1e293b;">${escapeHtml(booking.roomName)}${booking.roomBlock ? ` - ${escapeHtml(booking.roomBlock)}` : ''}</td></tr>
        <tr><td style="padding: 8px 0; color: #64748b;">Start</td><td style="padding: 8px 0; color: #1e293b;">${formatDateTime(booking.startTime)}</td></tr>
        <tr><td style="padding: 8px 0; color: #64748b;">End</td><td style="padding: 8px 0; color: #1e293b;">${formatDateTime(booking.endTime)}</td></tr>
        <tr><td style="padding: 8px 0; color: #64748b;">Chair</td><td style="padding: 8px 0; color: #1e293b;">${escapeHtml(booking.chairPerson)}</td></tr>
        <tr><td style="padding: 8px 0; color: #64748b;">Organized By</td><td style="padding: 8px 0; color: #1e293b;">${escapeHtml(booking.userName)}</td></tr>
        ${booking.agenda ? `<tr><td style="padding: 8px 0; color: #64748b;">Agenda</td><td style="padding: 8px 0; color: #1e293b; line-height:1.6;">${agendaToHtml(booking.agenda)}</td></tr>` : ''}
        ${(booking.generatedLink || booking.existingLink) ? `<tr><td style="padding: 8px 0; color: #64748b;">Meeting Link</td><td style="padding: 8px 0; color: #1e293b;"><a href="${escapeHtml((booking.generatedLink || booking.existingLink)!)}" style="color: #4f46e5;">${escapeHtml((booking.generatedLink || booking.existingLink)!)}</a></td></tr>` : ''}
        ${booking.meetingNumber ? `<tr><td style="padding: 8px 0; color: #64748b;">Meeting No.</td><td style="padding: 8px 0; color: #1e293b;">${escapeHtml(booking.meetingNumber)}</td></tr>` : ''}
        ${booking.meetingPassword ? `<tr><td style="padding: 8px 0; color: #64748b;">Password</td><td style="padding: 8px 0; color: #1e293b;">${escapeHtml(booking.meetingPassword)}</td></tr>` : ''}
      </table>
      <p style="color: #64748b; font-size: 13px; margin-top: 16px;">A calendar invite is attached &mdash; open it to add this meeting to your calendar.</p>
    `;

    for (const email of booking.notifyEmails) {
      sendEmail({
        to: email,
        subject: `${isEdit ? 'Meeting Updated' : 'Meeting Invite'}: ${booking.title}`,
        html: baseTemplate(isEdit ? 'Meeting Updated' : 'Meeting Invitation', notifyBody, pName),
        icalEvent: { content: finalIcs, method: 'REQUEST' },
        attachments: booking.emailAttachments,
      }).catch((e: any) => console.error('[EMAIL]', e.message));
    }
  }
}

/**
 * Send cancellation notice email with a CANCEL ICS to remove from calendar.
 * CC block admin if the booking had service requests, CC block IT if it had VC/IT requirements.
 */
export async function sendCancellationNotice(booking: BookingInfo, options?: { hasServiceRequests?: boolean; hasITRequirements?: boolean }): Promise<void> {
  const config = await getSmtpConfig();
  if (!config || !config.sendCancellationNotice) return;
  const pName = await getPortalName();

  // CC block reception emails always + room-level notify email
  const cc: string[] = [];
  const blockEmails = await getBlockEmails(booking.roomBlock);
  if (blockEmails) {
    cc.push(...blockEmails.receptionEmails);
    // CC block admin if booking had service requests
    if (options?.hasServiceRequests) {
      cc.push(...blockEmails.adminEmails);
    }
    // CC block IT if booking had VC/IT requirements
    if (options?.hasITRequirements) {
      cc.push(...blockEmails.itEmails);
    }
  }
  if (booking.roomNotifyEmail) {
    cc.push(...splitEmails(booking.roomNotifyEmail));
  }

  const reasonRow = booking.cancellationReason
    ? `<tr><td style="padding: 8px 0; color: #64748b; width: 130px; vertical-align: top;">Reason</td><td style="padding: 8px 0; color: #1e293b;">${escapeHtml(booking.cancellationReason)}</td></tr>`
    : '';

  const body = `
    <p style="color: #475569;">A room booking has been cancelled.</p>
    <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
      <tr><td style="padding: 8px 0; color: #64748b; width: 130px;">Meeting</td><td style="padding: 8px 0; color: #1e293b; font-weight: 500;">${escapeHtml(booking.title)}</td></tr>
      <tr><td style="padding: 8px 0; color: #64748b;">Room</td><td style="padding: 8px 0; color: #1e293b;">${escapeHtml(booking.roomName)}${booking.roomBlock ? ` - ${escapeHtml(booking.roomBlock)}` : ''}</td></tr>
      <tr><td style="padding: 8px 0; color: #64748b;">Was Scheduled</td><td style="padding: 8px 0; color: #1e293b;">${formatDateTime(booking.startTime)} &mdash; ${formatDateTime(booking.endTime)}</td></tr>
      <tr><td style="padding: 8px 0; color: #64748b;">Cancelled By</td><td style="padding: 8px 0; color: #1e293b;">${escapeHtml(booking.userName)}</td></tr>
      ${reasonRow}
    </table>
    <p style="color: #64748b; font-size: 13px; margin-top: 16px;">The calendar event will be automatically removed from your calendar.</p>
  `;

  const uid = (booking.id || crypto.randomUUID()) + '@conferencehub';
  const icsContent = generateICS({
    method: 'CANCEL',
    title: booking.title,
    description: `Cancelled: ${booking.title}`,
    startTime: booking.startTime,
    endTime: booking.endTime,
    location: booking.roomBlock ? `${booking.roomName} - ${booking.roomBlock}` : booking.roomName,
    organizerEmail: booking.userEmail,
    organizerName: booking.userName,
    uid,
  });

  await sendEmail({
    to: booking.userEmail,
    subject: `Booking Cancelled: ${booking.title}`,
    html: baseTemplate('Booking Cancelled &#x2717;', body, pName),
    cc,
    replyTo: booking.userEmail,
    icalEvent: { content: icsContent, method: 'CANCEL' },
  });

  // Also notify recipients about cancellation
  if (booking.notifyEmails && booking.notifyEmails.length > 0) {
    for (const email of booking.notifyEmails) {
      sendEmail({
        to: email,
        subject: `Meeting Cancelled: ${booking.title}`,
        html: baseTemplate('Meeting Cancelled', body, pName),
        icalEvent: { content: icsContent, method: 'CANCEL' },
      }).catch((e: any) => console.error('[EMAIL]', e.message));
    }
  }
}

/**
 * Send IT task notification to IT team members.
 */
export async function sendITTaskNotification(booking: BookingInfo): Promise<void> {
  const config = await getSmtpConfig();
  if (!config || !config.sendITTaskNotification) return;
  const pName = await getPortalName();

  // Send to block IT emails only
  const blockEmails = await getBlockEmails(booking.roomBlock);
  const itEmails: string[] = [];
  if (blockEmails) {
    itEmails.push(...blockEmails.itEmails);
  }

  if (itEmails.length === 0) return;

  const body = `
    <p style="color: #475569;">A new IT support request is pending for a room booking.</p>
    <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
      <tr><td style="padding: 8px 0; color: #64748b; width: 130px;">Meeting</td><td style="padding: 8px 0; color: #1e293b; font-weight: 500;">${escapeHtml(booking.title)}</td></tr>
      <tr><td style="padding: 8px 0; color: #64748b;">Room</td><td style="padding: 8px 0; color: #1e293b;">${escapeHtml(booking.roomName)}${booking.roomBlock ? ` - ${escapeHtml(booking.roomBlock)}` : ''}</td></tr>
      <tr><td style="padding: 8px 0; color: #64748b;">Time</td><td style="padding: 8px 0; color: #1e293b;">${formatDateTime(booking.startTime)} &mdash; ${formatDateTime(booking.endTime)}</td></tr>
      <tr><td style="padding: 8px 0; color: #64748b;">Chair</td><td style="padding: 8px 0; color: #1e293b;">${escapeHtml(booking.chairPerson)}</td></tr>
      <tr><td style="padding: 8px 0; color: #64748b;">Requested By</td><td style="padding: 8px 0; color: #1e293b;">${escapeHtml(booking.userName)}</td></tr>
      <tr><td style="padding: 8px 0; color: #64748b;">Company</td><td style="padding: 8px 0; color: #1e293b;">${escapeHtml(booking.company)}</td></tr>
      <tr><td style="padding: 8px 0; color: #64748b;">Department</td><td style="padding: 8px 0; color: #1e293b;">${escapeHtml(booking.department)}</td></tr>
      ${booking.vcRequired ? `<tr><td style="padding: 8px 0; color: #64748b;">VC Platform</td><td style="padding: 8px 0; color: #1e293b;">${escapeHtml(booking.platform || 'To be determined')}</td></tr>` : ''}
      ${(booking.generatedLink || booking.existingLink) ? `<tr><td style="padding: 8px 0; color: #64748b;">${booking.generatedLink ? 'Meeting Link' : 'Existing Link'}</td><td style="padding: 8px 0; color: #1e293b;"><a href="${escapeHtml((booking.generatedLink || booking.existingLink)!)}" style="color: #4f46e5;">${escapeHtml((booking.generatedLink || booking.existingLink)!)}</a></td></tr>` : ''}
      ${booking.meetingNumber ? `<tr><td style="padding: 8px 0; color: #64748b;">Meeting ID</td><td style="padding: 8px 0; color: #1e293b;">${escapeHtml(booking.meetingNumber)}</td></tr>` : ''}
      ${booking.meetingPassword ? `<tr><td style="padding: 8px 0; color: #64748b;">Password</td><td style="padding: 8px 0; color: #1e293b;">${escapeHtml(booking.meetingPassword)}</td></tr>` : ''}
      ${booking.avSetup ? `<tr><td style="padding: 8px 0; color: #64748b;">AV Setup</td><td style="padding: 8px 0; color: #1e293b;">Required</td></tr>` : ''}
      ${booking.supportStandby ? `<tr><td style="padding: 8px 0; color: #64748b;">IT Standby</td><td style="padding: 8px 0; color: #1e293b;">Required</td></tr>` : ''}
    </table>
    <p style="color: #475569; margin-top: 16px;">Please log in to ${pName} to process this request.</p>
  `;

  // Generate ICS calendar invite for IT task
  const uniqueIT = [...new Set(itEmails.filter(Boolean))];
  const uid = (booking.id || crypto.randomUUID()) + '-it@conferencehub';
  const itMeetingLink = booking.generatedLink || booking.existingLink;
  const itDesc = `IT Support Request for: ${booking.title}\nRoom: ${booking.roomName}\nRequested By: ${booking.userName}\nCompany: ${booking.company} / ${booking.department}${booking.vcRequired ? `\nVC Platform: ${booking.platform || 'TBD'}` : ''}${itMeetingLink ? `\nMeeting Link: ${itMeetingLink}` : ''}${booking.meetingNumber ? `\nMeeting No: ${booking.meetingNumber}` : ''}${booking.meetingPassword ? `\nPassword: ${booking.meetingPassword}` : ''}${booking.avSetup ? '\nAV Setup: Required' : ''}${booking.supportStandby ? '\nIT Standby: Required' : ''}`;
  const icsContent = generateICS({
    method: 'REQUEST',
    title: `IT Task: ${booking.title}`,
    description: itDesc,
    startTime: booking.startTime,
    endTime: booking.endTime,
    location: booking.roomBlock ? `${booking.roomName} - ${booking.roomBlock}` : booking.roomName,
    organizerEmail: booking.userEmail,
    organizerName: booking.userName,
    attendees: uniqueIT,
    uid,
  });

  if (uniqueIT.length > 0) {
    const [primary, ...cc] = uniqueIT;
    await sendEmail({
      to: primary,
      subject: `IT Task: ${booking.title}`,
      html: baseTemplate('New IT Support Request', body, pName),
      cc: cc.length > 0 ? cc : undefined,
      replyTo: booking.userEmail,
      icalEvent: { content: icsContent, method: 'REQUEST' },
    });
  }
}

/**
 * Send an updated calendar invite with the meeting link to the booking user
 * when IT completes a VC request.
 */
export async function sendMeetingLinkUpdate(booking: BookingInfo & {
  generatedLink?: string;
  meetingNumber?: string;
  meetingPassword?: string;
}): Promise<void> {
  const config = await getSmtpConfig();
  if (!config) return;
  const pName = await getPortalName();

  const linkInfo = [
    booking.generatedLink ? `Meeting Link: ${booking.generatedLink}` : '',
    booking.meetingNumber ? `Meeting Number: ${booking.meetingNumber}` : '',
    booking.meetingPassword ? `Password: ${booking.meetingPassword}` : '',
  ].filter(Boolean).join('\n');

  const body = `
    <p style="color: #475569;">Your meeting link is ready for the upcoming booking.</p>
    <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
      <tr><td style="padding: 8px 0; color: #64748b; width: 130px;">Meeting</td><td style="padding: 8px 0; color: #1e293b; font-weight: 500;">${escapeHtml(booking.title)}</td></tr>
      <tr><td style="padding: 8px 0; color: #64748b;">Room</td><td style="padding: 8px 0; color: #1e293b;">${escapeHtml(booking.roomName)}${booking.roomBlock ? ` - ${escapeHtml(booking.roomBlock)}` : ''}</td></tr>
      <tr><td style="padding: 8px 0; color: #64748b;">Start</td><td style="padding: 8px 0; color: #1e293b;">${formatDateTime(booking.startTime)}</td></tr>
      <tr><td style="padding: 8px 0; color: #64748b;">End</td><td style="padding: 8px 0; color: #1e293b;">${formatDateTime(booking.endTime)}</td></tr>
      ${booking.platform ? `<tr><td style="padding: 8px 0; color: #64748b;">Platform</td><td style="padding: 8px 0; color: #1e293b;">${escapeHtml(booking.platform)}</td></tr>` : ''}
      <tr><td style="padding: 8px 0; color: #64748b;">Booked By</td><td style="padding: 8px 0; color: #1e293b;">${escapeHtml(booking.userName)}</td></tr>
      <tr><td style="padding: 8px 0; color: #64748b;">Chair</td><td style="padding: 8px 0; color: #1e293b;">${escapeHtml(booking.chairPerson)}</td></tr>
      <tr><td style="padding: 8px 0; color: #64748b;">Company</td><td style="padding: 8px 0; color: #1e293b;">${escapeHtml(booking.company)} / ${escapeHtml(booking.department)}</td></tr>
      ${booking.agenda ? `<tr><td style="padding: 8px 0; color: #64748b;">Agenda</td><td style="padding: 8px 0; color: #1e293b; line-height:1.6;">${agendaToHtml(booking.agenda)}</td></tr>` : ''}
      ${booking.generatedLink ? `<tr><td style="padding: 8px 0; color: #64748b;">Meeting Link</td><td style="padding: 8px 0; color: #1e293b;"><a href="${escapeHtml(booking.generatedLink)}" style="color: #4f46e5;">${escapeHtml(booking.generatedLink)}</a></td></tr>` : ''}
      ${booking.meetingNumber ? `<tr><td style="padding: 8px 0; color: #64748b;">Meeting No.</td><td style="padding: 8px 0; color: #1e293b;">${escapeHtml(booking.meetingNumber)}</td></tr>` : ''}
      ${booking.meetingPassword ? `<tr><td style="padding: 8px 0; color: #64748b;">Password</td><td style="padding: 8px 0; color: #1e293b;">${escapeHtml(booking.meetingPassword)}</td></tr>` : ''}
    </table>
    <p style="color: #64748b; font-size: 13px; margin-top: 16px;">An updated calendar invite is attached with the meeting link details.</p>
  `;

  const uid = (booking.id || crypto.randomUUID()) + '@conferencehub';
  const description = `Meeting: ${booking.title}\nRoom: ${booking.roomName}\nChair: ${booking.chairPerson}\nCompany: ${booking.company} / ${booking.department}${booking.agenda ? `\n\nAgenda:\n${booking.agenda}` : ''}\n\n${linkInfo}`;

  // Keep IT recipients on IT-task calendar only; do not send them meeting-link invites.
  const blockEmails = await getBlockEmails(booking.roomBlock);
  const blockIT = new Set((blockEmails?.itEmails || []).map(e => e.trim().toLowerCase()).filter(Boolean));
  const bookerEmail = booking.userEmail?.trim().toLowerCase();
  const shouldSendToBooker = !!bookerEmail && !blockIT.has(bookerEmail);
  const notifyRecipients = Array.from(new Set((booking.notifyEmails || [])
    .map(e => e.trim().toLowerCase())
    .filter(e => e && !blockIT.has(e) && e !== bookerEmail)));
  const allAttendees = [
    ...(shouldSendToBooker ? [bookerEmail!] : []),
    ...notifyRecipients,
  ];

  const icsContent = generateICS({
    method: 'REQUEST',
    title: booking.title,
    description,
    startTime: booking.startTime,
    endTime: booking.endTime,
    location: booking.roomBlock ? `${booking.roomName} - ${booking.roomBlock}` : booking.roomName,
    organizerEmail: booking.userEmail,
    organizerName: booking.userName,
    attendees: allAttendees,
    uid,
  });

  // Update SEQUENCE to 1 so calendar apps recognize this as an update
  const updatedIcs = icsContent.replace('SEQUENCE:0', 'SEQUENCE:1');

  // Send to the booker (unless the booker is an IT-distribution recipient)
  if (shouldSendToBooker) {
    await sendEmail({
      to: booking.userEmail,
      subject: `Meeting Link Ready: ${booking.title}`,
      html: baseTemplate('Meeting Link Ready 🔗', body, pName),
      replyTo: booking.userEmail,
      icalEvent: { content: updatedIcs, method: 'REQUEST' },
    });
  }

  // Also send to notify recipients
  if (notifyRecipients.length > 0) {
    for (const email of notifyRecipients) {
      sendEmail({
        to: email,
        subject: `Meeting Link: ${booking.title}`,
        html: baseTemplate('Meeting Link Ready 🔗', body, pName),
        icalEvent: { content: updatedIcs, method: 'REQUEST' },
      }).catch((e: any) => console.error('[EMAIL]', e.message));
    }
  }
}

/**
 * Update the existing IT task calendar invite with meeting-link details,
 * keeping the same IT-task UID so mailbox clients update a single event.
 */
export async function sendITTaskLinkUpdate(booking: BookingInfo & {
  generatedLink?: string;
  meetingNumber?: string;
  meetingPassword?: string;
}): Promise<void> {
  const config = await getSmtpConfig();
  if (!config || !config.sendITTaskNotification) return;
  const pName = await getPortalName();

  const blockEmails = await getBlockEmails(booking.roomBlock);
  const itEmails = [...new Set((blockEmails?.itEmails || []).filter(Boolean))];
  if (itEmails.length === 0) return;

  const body = `
    <p style="color: #475569;">Meeting link details are now available for this IT task.</p>
    <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
      <tr><td style="padding: 8px 0; color: #64748b; width: 130px;">Task</td><td style="padding: 8px 0; color: #1e293b; font-weight: 500;">IT Task: ${escapeHtml(booking.title)}</td></tr>
      <tr><td style="padding: 8px 0; color: #64748b;">Room</td><td style="padding: 8px 0; color: #1e293b;">${escapeHtml(booking.roomName)}${booking.roomBlock ? ` - ${escapeHtml(booking.roomBlock)}` : ''}</td></tr>
      <tr><td style="padding: 8px 0; color: #64748b;">Time</td><td style="padding: 8px 0; color: #1e293b;">${formatDateTime(booking.startTime)} &mdash; ${formatDateTime(booking.endTime)}</td></tr>
      <tr><td style="padding: 8px 0; color: #64748b;">Chair</td><td style="padding: 8px 0; color: #1e293b;">${escapeHtml(booking.chairPerson)}</td></tr>
      <tr><td style="padding: 8px 0; color: #64748b;">Requested By</td><td style="padding: 8px 0; color: #1e293b;">${escapeHtml(booking.userName)}</td></tr>
      <tr><td style="padding: 8px 0; color: #64748b;">Company</td><td style="padding: 8px 0; color: #1e293b;">${escapeHtml(booking.company)}</td></tr>
      <tr><td style="padding: 8px 0; color: #64748b;">Department</td><td style="padding: 8px 0; color: #1e293b;">${escapeHtml(booking.department)}</td></tr>
      ${booking.platform ? `<tr><td style="padding: 8px 0; color: #64748b;">Platform</td><td style="padding: 8px 0; color: #1e293b;">${escapeHtml(booking.platform)}</td></tr>` : ''}
      ${booking.generatedLink ? `<tr><td style="padding: 8px 0; color: #64748b;">Meeting Link</td><td style="padding: 8px 0; color: #1e293b;"><a href="${escapeHtml(booking.generatedLink)}" style="color: #4f46e5;">${escapeHtml(booking.generatedLink)}</a></td></tr>` : ''}
      ${booking.meetingNumber ? `<tr><td style="padding: 8px 0; color: #64748b;">Meeting No.</td><td style="padding: 8px 0; color: #1e293b;">${escapeHtml(booking.meetingNumber)}</td></tr>` : ''}
      ${booking.meetingPassword ? `<tr><td style="padding: 8px 0; color: #64748b;">Password</td><td style="padding: 8px 0; color: #1e293b;">${escapeHtml(booking.meetingPassword)}</td></tr>` : ''}
    </table>
    <p style="color: #64748b; font-size: 13px; margin-top: 16px;">This updates the existing IT task calendar item with link details.</p>
  `;

  const linkInfo = [
    booking.generatedLink ? `Meeting Link: ${booking.generatedLink}` : '',
    booking.meetingNumber ? `Meeting Number: ${booking.meetingNumber}` : '',
    booking.meetingPassword ? `Password: ${booking.meetingPassword}` : '',
  ].filter(Boolean).join('\n');

  // Must match UID used in sendITTaskNotification so clients update existing event
  const uid = (booking.id || crypto.randomUUID()) + '-it@conferencehub';
  const itDesc = `IT Support Request for: ${booking.title}\nRoom: ${booking.roomName}\nRequested By: ${booking.userName}\nCompany: ${booking.company} / ${booking.department}${booking.vcRequired ? `\nVC Platform: ${booking.platform || 'TBD'}` : ''}${linkInfo ? `\n\n${linkInfo}` : ''}`;

  const icsContent = generateICS({
    method: 'REQUEST',
    title: `IT Task: ${booking.title}`,
    description: itDesc,
    startTime: booking.startTime,
    endTime: booking.endTime,
    location: booking.roomBlock ? `${booking.roomName} - ${booking.roomBlock}` : booking.roomName,
    organizerEmail: booking.userEmail,
    organizerName: booking.userName,
    attendees: itEmails,
    uid,
  });

  const updatedIcs = icsContent.replace('SEQUENCE:0', 'SEQUENCE:1');
  const [primary, ...cc] = itEmails;

  await sendEmail({
    to: primary,
    subject: `IT Task Updated: ${booking.title}`,
    html: baseTemplate('IT Task Updated 🔗', body, pName),
    cc: cc.length > 0 ? cc : undefined,
    replyTo: booking.userEmail,
    icalEvent: { content: updatedIcs, method: 'REQUEST' },
  });
}

/**
 * Send service request notification to block admin emails.
 * All service categories (FOOD_BEVERAGE, STATIONERY, EQUIPMENT, OTHER) go to block admin.
 */
export async function sendServiceRequestNotification(
  booking: BookingInfo,
  services: { category: string; items: string[]; quantity: number; notes?: string }[],
): Promise<void> {
  const config = await getSmtpConfig();
  if (!config || services.length === 0) return;
  const pName = await getPortalName();

  const blockEmails = await getBlockEmails(booking.roomBlock);

  const categoryLabels: Record<string, string> = {
    FOOD_BEVERAGE: 'Food & Beverage',
    STATIONERY: 'Stationery',
    EQUIPMENT: 'Equipment',
    OTHER: 'Other',
  };

  // Generate ICS calendar invite for service request
  const adminAttendees = blockEmails ? [...new Set(blockEmails.adminEmails.filter(Boolean))] : [];
  const uid = (booking.id || crypto.randomUUID()) + '-svc@conferencehub';
  const svcLabels = services.map(s => categoryLabels[s.category] || s.category).join(', ');
  const icsDescription = `Service Request for: ${booking.title}\nRoom: ${booking.roomName}\nRequested By: ${booking.userName}\nCompany: ${booking.company} / ${booking.department}\nServices: ${svcLabels}`;
  const icsContent = generateICS({
    method: 'REQUEST',
    title: `Service Request: ${booking.title}`,
    description: icsDescription,
    startTime: booking.startTime,
    endTime: booking.endTime,
    location: booking.roomBlock ? `${booking.roomName} - ${booking.roomBlock}` : booking.roomName,
    organizerEmail: config.fromAddress,
    organizerName: config.fromName || pName,
    attendees: adminAttendees,
    uid,
  });

  const buildServiceBody = (svcList: typeof services, label: string) => {
    const serviceRows = svcList.map(s =>
      `<tr>
        <td style="padding: 6px 8px; color: #1e293b; font-weight: 500; border-bottom: 1px solid #f1f5f9;">${categoryLabels[s.category] || s.category}</td>
        <td style="padding: 6px 8px; color: #475569; border-bottom: 1px solid #f1f5f9;">${s.items.join(', ')}</td>
        <td style="padding: 6px 8px; color: #475569; border-bottom: 1px solid #f1f5f9;">${s.category === 'FOOD_BEVERAGE' ? `${s.quantity} people` : ''}</td>
        <td style="padding: 6px 8px; color: #64748b; font-style: italic; border-bottom: 1px solid #f1f5f9;">${s.notes || ''}</td>
      </tr>`
    ).join('');

    return `
      <p style="color: #475569;">A new booking requires ${label}.</p>
      <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin-bottom: 16px;">
        <tr><td style="padding: 8px 0; color: #64748b; width: 130px;">Meeting</td><td style="padding: 8px 0; color: #1e293b; font-weight: 500;">${escapeHtml(booking.title)}</td></tr>
        <tr><td style="padding: 8px 0; color: #64748b;">Room</td><td style="padding: 8px 0; color: #1e293b;">${escapeHtml(booking.roomName)}${booking.roomBlock ? ` - ${escapeHtml(booking.roomBlock)}` : ''}</td></tr>
        <tr><td style="padding: 8px 0; color: #64748b;">Time</td><td style="padding: 8px 0; color: #1e293b;">${formatDateTime(booking.startTime)} &mdash; ${formatDateTime(booking.endTime)}</td></tr>
        <tr><td style="padding: 8px 0; color: #64748b;">Requested By</td><td style="padding: 8px 0; color: #1e293b;">${escapeHtml(booking.userName)}</td></tr>
        <tr><td style="padding: 8px 0; color: #64748b;">Company</td><td style="padding: 8px 0; color: #1e293b;">${escapeHtml(booking.company)} / ${escapeHtml(booking.department)}</td></tr>
        <tr><td style="padding: 8px 0; color: #64748b;">Participants</td><td style="padding: 8px 0; color: #1e293b;">${booking.participants}</td></tr>
      </table>
      <h3 style="color: #1e293b; font-size: 14px; margin: 16px 0 8px;">Requested Services</h3>
      <table style="width: 100%; border-collapse: collapse; font-size: 13px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <tr style="background: #f8fafc;">
          <th style="padding: 8px; text-align: left; color: #64748b; font-weight: 600; border-bottom: 2px solid #e2e8f0;">Category</th>
          <th style="padding: 8px; text-align: left; color: #64748b; font-weight: 600; border-bottom: 2px solid #e2e8f0;">Items</th>
          <th style="padding: 8px; text-align: left; color: #64748b; font-weight: 600; border-bottom: 2px solid #e2e8f0;">Qty</th>
          <th style="padding: 8px; text-align: left; color: #64748b; font-weight: 600; border-bottom: 2px solid #e2e8f0;">Notes</th>
        </tr>
        ${serviceRows}
      </table>
      <p style="color: #475569; margin-top: 16px;">Please log in to ${pName} to manage these requests.</p>
    `;
  };

  // Send single consolidated email to block admin for all service categories
  if (blockEmails && blockEmails.adminEmails.length > 0) {
    const uniqueAdmin = [...new Set(blockEmails.adminEmails)];
    const body = buildServiceBody(services, 'administration services');
    const [primary, ...cc] = uniqueAdmin;
    await sendEmail({
      to: primary,
      subject: `Service Request: ${booking.title}`,
      html: baseTemplate('New Service Request', body, pName),
      cc: cc.length > 0 ? cc : undefined,
      icalEvent: { content: icsContent, method: 'REQUEST' },
    });
  }
}

/**
 * Test SMTP connection with given config (for the settings page "Send Test Email" button).
 */
export async function testSmtpConnection(config: SmtpConfig, recipientEmail: string): Promise<{ success: boolean; message: string }> {
  const transporter = createTransporter(config);
  const from = config.fromName ? `"${config.fromName}" <${config.fromAddress}>` : config.fromAddress;

  try {
    // Verify connection
    await transporter.verify();

    // Send a test email
    await transporter.sendMail({
      from,
      to: recipientEmail,
      subject: `${config.fromName || 'ConferenceHub'} - SMTP Test`,
      html: baseTemplate('SMTP Test Successful', `
        <p style="color: #475569;">This test email confirms that your SMTP settings are correctly configured.</p>
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <tr><td style="padding: 8px 0; color: #64748b; width: 130px;">Server</td><td style="padding: 8px 0; color: #1e293b;">${config.host}:${config.port}</td></tr>
          <tr><td style="padding: 8px 0; color: #64748b;">TLS</td><td style="padding: 8px 0; color: #1e293b;">${config.useTls ? 'Enabled' : 'Disabled'}</td></tr>
          <tr><td style="padding: 8px 0; color: #64748b;">From</td><td style="padding: 8px 0; color: #1e293b;">${from}</td></tr>
        </table>
      `),
    });

    return { success: true, message: `Test email sent to ${recipientEmail}` };
  } catch (err: any) {
    return { success: false, message: `SMTP error: ${err.message}` };
  }
}
