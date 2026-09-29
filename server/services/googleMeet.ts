import jwt from 'jsonwebtoken';

export interface GoogleMeetConfig {
  enabled: boolean;
  serviceAccountEmail: string;
  privateKey: string;
  impersonateEmail: string;
}

async function getAccessToken(cfg: GoogleMeetConfig): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const assertion = jwt.sign(
    {
      iss: cfg.serviceAccountEmail,
      sub: cfg.impersonateEmail,
      scope: 'https://www.googleapis.com/auth/calendar.events',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    },
    cfg.privateKey.replace(/\\n/g, '\n'),
    { algorithm: 'RS256' }
  );

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const data: any = await res.json();
  if (!res.ok) {
    throw new Error(data.error_description || data.error || `Google token exchange failed (${res.status})`);
  }
  return data.access_token;
}

export async function createGoogleMeetLink(cfg: GoogleMeetConfig, meeting: {
  title: string;
  startTime: Date;
  endTime: Date;
}): Promise<{ link: string; externalId: string }> {
  const accessToken = await getAccessToken(cfg);

  const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      summary: meeting.title,
      start: { dateTime: meeting.startTime.toISOString() },
      end: { dateTime: meeting.endTime.toISOString() },
      conferenceData: {
        createRequest: {
          requestId: `chub-${Date.now()}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      },
    }),
  });
  const data: any = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.message || `Google Calendar event creation failed (${res.status})`);
  }
  const link = data.hangoutLink || data.conferenceData?.entryPoints?.find((e: any) => e.entryPointType === 'video')?.uri;
  if (!link) throw new Error('Google Calendar did not return a Meet link.');
  return { link, externalId: data.id };
}

// Reschedules the calendar event backing an already-generated Meet link — patching only start/end
// leaves conferenceData (and therefore the Meet link) untouched, so editing the meeting's time
// doesn't churn through a brand-new Meet link every time.
export async function updateGoogleMeetEventTime(cfg: GoogleMeetConfig, eventId: string, meeting: {
  startTime: Date;
  endTime: Date;
}): Promise<void> {
  const accessToken = await getAccessToken(cfg);

  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      start: { dateTime: meeting.startTime.toISOString() },
      end: { dateTime: meeting.endTime.toISOString() },
    }),
  });
  if (!res.ok) {
    const data: any = await res.json().catch(() => ({}));
    throw new Error(data.error?.message || `Google Calendar event update failed (${res.status})`);
  }
}

export async function testGoogleMeetAccess(cfg: GoogleMeetConfig): Promise<{ success: boolean; message: string }> {
  if (!cfg.serviceAccountEmail || !cfg.privateKey || !cfg.impersonateEmail) {
    return { success: false, message: 'Service account email, private key, and impersonate email are all required.' };
  }
  try {
    const accessToken = await getAccessToken(cfg);
    // Use an events.list call, not calendars.get — calendars.get needs the broader
    // "calendar"/"calendar.readonly" scope, while link generation only requests
    // "calendar.events". Testing against calendars.get would falsely fail with
    // "insufficient authentication scopes" even when delegation is set up correctly.
    const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=1', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      const data: any = await res.json().catch(() => ({}));
      return { success: false, message: data.error?.message || `Calendar access check failed (${res.status})` };
    }
    return { success: true, message: `Connected successfully as ${cfg.impersonateEmail}.` };
  } catch (err: any) {
    return { success: false, message: err.message || 'Failed to authenticate with Google.' };
  }
}
