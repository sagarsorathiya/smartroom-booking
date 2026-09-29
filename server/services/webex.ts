import prisma from '../prisma.js';

export interface WebexAccount {
  id: string;
  label: string;
  enabled?: boolean;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

// Webex refresh tokens rotate on every use — the old one is invalidated as soon as
// a new access token is issued. Every call site must persist the returned refreshToken
// or the *next* attempt for this account will fail even though this one succeeded.
async function exchangeRefreshToken(account: WebexAccount): Promise<{ accessToken: string; refreshToken: string }> {
  const res = await fetch('https://webexapis.com/v1/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: account.clientId,
      client_secret: account.clientSecret,
      refresh_token: account.refreshToken,
    }),
  });
  const data: any = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error_description || `Webex token exchange failed (${res.status})`);
  }
  return { accessToken: data.access_token, refreshToken: data.refresh_token };
}

// Persists a rotated refresh token back into the saved vcIntegration settings for this account,
// so the next generation attempt (or test) uses a still-valid token. Best-effort — if the account
// isn't saved yet (e.g. testing a brand-new draft before hitting Save), this is a silent no-op.
async function persistRotatedRefreshToken(accountId: string, newRefreshToken: string): Promise<void> {
  const row = await prisma.appSettings.findUnique({ where: { key: 'vcIntegration' } });
  if (!row) return;
  const settings = JSON.parse(row.value);
  const accounts = settings.webex?.accounts || [];
  const idx = accounts.findIndex((a: any) => a.id === accountId);
  if (idx === -1) return;
  accounts[idx].refreshToken = newRefreshToken;
  await prisma.appSettings.update({ where: { key: 'vcIntegration' }, data: { value: JSON.stringify(settings) } });
}

// Finds a configured Webex account with no other non-cancelled Webex booking overlapping this time range.
export async function pickAvailableWebexAccount(accounts: WebexAccount[], startTime: Date, endTime: Date): Promise<WebexAccount | null> {
  // Disabled accounts are skipped for new meetings (existing meetings on them can still be rescheduled)
  accounts = accounts.filter(a => a.enabled !== false);
  if (accounts.length === 0) return null;
  const busy = await prisma.booking.findMany({
    where: {
      platform: 'Webex',
      vcAccountRef: { not: null },
      itStatus: { not: 'CANCELLED' },
      startTime: { lt: endTime },
      endTime: { gt: startTime },
    },
    select: { vcAccountRef: true },
  });
  const busyIds = new Set(busy.map(b => b.vcAccountRef));
  return accounts.find(a => !busyIds.has(a.id)) || null;
}

// IT chooses per meeting (checkbox in the Approve dialog) whether to lock it. A locked meeting locks as
// soon as it starts, so late/uninvited joiners wait in the lobby until the host admits them.
const WEBEX_LOCK_SETTINGS = { enableAutomaticLock: true, automaticLockMinutes: 0 };

export async function createWebexMeeting(account: WebexAccount, meeting: {
  title: string;
  startTime: Date;
  endTime: Date;
  lockMeeting?: boolean;
}): Promise<{ link: string; meetingNumber?: string; password?: string; externalId: string }> {
  const { accessToken, refreshToken } = await exchangeRefreshToken(account);
  if (refreshToken && refreshToken !== account.refreshToken) {
    persistRotatedRefreshToken(account.id, refreshToken).catch((e: any) => console.error('[WEBEX] Failed to persist rotated refresh token:', e.message));
  }

  const res = await fetch('https://webexapis.com/v1/meetings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: meeting.title,
      start: meeting.startTime.toISOString(),
      end: meeting.endTime.toISOString(),
      ...(meeting.lockMeeting ? WEBEX_LOCK_SETTINGS : { enableAutomaticLock: false }),
    }),
  });
  const data: any = await res.json();
  if (!res.ok) {
    throw new Error(data.message || `Webex meeting creation failed (${res.status})`);
  }
  return { link: data.webLink, meetingNumber: data.meetingNumber, password: data.password, externalId: data.id };
}

// Reschedules an already-created Webex meeting in place — same link/meeting number/password,
// just updates when it happens. Used when a booking's start time changes after a link was already sent,
// so editing the meeting doesn't churn through a brand-new Webex meeting every time.
export async function updateWebexMeetingTime(account: WebexAccount, meetingId: string, meeting: {
  title: string;
  startTime: Date;
  endTime: Date;
}): Promise<void> {
  const { accessToken, refreshToken } = await exchangeRefreshToken(account);
  if (refreshToken && refreshToken !== account.refreshToken) {
    persistRotatedRefreshToken(account.id, refreshToken).catch((e: any) => console.error('[WEBEX] Failed to persist rotated refresh token:', e.message));
  }

  // PUT resets any setting not included in the body, so carry over the meeting's current lock choice
  // (made by IT when the link was generated) rather than silently changing it on reschedule.
  const currentRes = await fetch(`https://webexapis.com/v1/meetings/${encodeURIComponent(meetingId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const current: any = currentRes.ok ? await currentRes.json() : {};
  const lockSettings = current.enableAutomaticLock
    ? { enableAutomaticLock: true, automaticLockMinutes: current.automaticLockMinutes ?? 0 }
    : { enableAutomaticLock: false };

  const res = await fetch(`https://webexapis.com/v1/meetings/${encodeURIComponent(meetingId)}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: meeting.title,
      start: meeting.startTime.toISOString(),
      end: meeting.endTime.toISOString(),
      ...lockSettings,
    }),
  });
  if (!res.ok) {
    const data: any = await res.json().catch(() => ({}));
    throw new Error(data.message || `Webex meeting update failed (${res.status})`);
  }
}

export async function testWebexAccess(account: WebexAccount): Promise<{ success: boolean; message: string; refreshToken?: string }> {
  if (!account.clientId || !account.clientSecret || !account.refreshToken) {
    return { success: false, message: 'Client ID, client secret, and refresh token are all required.' };
  }
  try {
    const { accessToken, refreshToken } = await exchangeRefreshToken(account);
    const res = await fetch('https://webexapis.com/v1/people/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data: any = await res.json();
    if (!res.ok) {
      return { success: false, message: data.message || `Webex access check failed (${res.status})` };
    }
    // The refresh token was rotated as a side effect of this test — persist it if this account
    // is already saved, and also return it so the settings page can update its (possibly unsaved) draft.
    if (refreshToken && refreshToken !== account.refreshToken) {
      persistRotatedRefreshToken(account.id, refreshToken).catch(() => {});
    }
    return { success: true, message: `Connected successfully as ${data.displayName || data.emails?.[0] || 'Webex account'}.`, refreshToken };
  } catch (err: any) {
    return { success: false, message: err.message || 'Failed to authenticate with Webex.' };
  }
}
