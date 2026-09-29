import { Router, Request, Response } from 'express';
import prisma from '../prisma.js';

export const vcAvailabilityRoutes = Router();

// GET /api/vc-availability — non-secret subset of vcIntegration settings, available to any
// authenticated user (not just ADMIN). Drives the platform picker in the booking form (only show
// Google Meet / Webex for companies each is enabled for) and lets the IT Queue resolve a Webex
// account id to its human-readable label.
vcAvailabilityRoutes.get('/', async (_req: Request, res: Response) => {
  const row = await prisma.appSettings.findUnique({ where: { key: 'vcIntegration' } });
  const settings = row ? JSON.parse(row.value) : { googleMeet: { companies: {} }, webex: { enabled: false, companies: [], accounts: [] } };

  const googleMeetCompanies = Object.entries<any>(settings.googleMeet?.companies || {})
    .filter(([, cfg]) => cfg?.enabled)
    .map(([companyId]) => companyId);

  const webexAccounts = (settings.webex?.accounts || []).map((a: any) => ({ id: a.id, label: a.label }));

  res.json({
    googleMeet: { companies: googleMeetCompanies },
    webex: { enabled: !!settings.webex?.enabled, companies: settings.webex?.companies || [], accounts: webexAccounts },
  });
});
