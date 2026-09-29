import { z } from 'zod';

export const createBookingSchema = z.object({
  roomId: z.string().min(1),
  title: z.string().min(1).max(200),
  startTime: z.string().datetime({ offset: true }).or(z.string().min(1)),
  endTime: z.string().datetime({ offset: true }).or(z.string().min(1)),
  participants: z.number().int().min(1),
  company: z.string().min(1).max(200),
  department: z.string().min(1).max(200),
  chairPerson: z.string().min(1).max(200),
  userId: z.string().optional(),
  userName: z.string().optional(),
  bookForUserId: z.string().optional(),
  recurrenceId: z.string().optional(),
  status: z.enum(['CONFIRMED', 'PENDING', 'CANCELLED']).optional(),
  notifyEmails: z.array(z.string().email()).optional(),
  agenda: z.string().max(5000).optional().nullable(),
  itRequirements: z.object({
    vcRequired: z.boolean().optional(),
    createMeetingLink: z.boolean().optional(),
    existingLink: z.string().url().optional().nullable().or(z.literal('')),
    generatedLink: z.string().optional().nullable(),
    platform: z.string().optional().nullable(),
    meetingNumber: z.string().max(100).optional().nullable(),
    meetingPassword: z.string().max(100).optional().nullable(),
    avSetup: z.boolean().optional(),
    supportStandby: z.boolean().optional(),
    notes: z.string().optional().nullable(),
    status: z.string().optional(),
  }).optional(),
  serviceRequests: z.array(z.object({
    category: z.enum(['FOOD_BEVERAGE', 'STATIONERY', 'EQUIPMENT', 'OTHER']),
    items: z.array(z.string()).optional(),
    quantity: z.number().int().min(1).optional(),
    notes: z.string().optional().nullable(),
  })).optional(),
}).refine(data => {
  const start = new Date(data.startTime);
  const end = new Date(data.endTime);
  return end.getTime() > start.getTime();
}, { message: 'End time must be after start time', path: ['endTime'] })
.refine(data => {
  const start = new Date(data.startTime);
  return start.getTime() > Date.now() - 5 * 60 * 1000; // 5-minute grace period
}, { message: 'Start time must be in the future', path: ['startTime'] });

export const updateBookingSchema = z.object({
  roomId: z.string().min(1).optional(),
  title: z.string().min(1).max(200).optional(),
  startTime: z.string().datetime({ offset: true }).or(z.string().min(1)).optional(),
  endTime: z.string().datetime({ offset: true }).or(z.string().min(1)).optional(),
  participants: z.number().int().min(1).optional(),
  company: z.string().min(1).max(200).optional(),
  department: z.string().min(1).max(200).optional(),
  chairPerson: z.string().min(1).max(200).optional(),
  userId: z.string().optional(),
  userName: z.string().optional(),
  bookForUserId: z.string().optional(),
  status: z.enum(['CONFIRMED', 'PENDING', 'CANCELLED']).optional(),
  notifyEmails: z.array(z.string().email()).optional(),
  agenda: z.string().max(5000).optional().nullable(),
  itRequirements: z.object({
    vcRequired: z.boolean().optional(),
    createMeetingLink: z.boolean().optional(),
    existingLink: z.string().url().optional().nullable().or(z.literal('')),
    generatedLink: z.string().optional().nullable(),
    platform: z.string().optional().nullable(),
    meetingNumber: z.string().max(100).optional().nullable(),
    meetingPassword: z.string().max(100).optional().nullable(),
    avSetup: z.boolean().optional(),
    supportStandby: z.boolean().optional(),
    notes: z.string().optional().nullable(),
    status: z.string().optional(),
  }).optional(),
}).refine(data => {
  if (data.startTime && data.endTime) {
    return new Date(data.endTime).getTime() > new Date(data.startTime).getTime();
  }
  return true;
}, { message: 'End time must be after start time', path: ['endTime'] });
