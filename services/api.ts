const API_BASE = '/api';

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = sessionStorage.getItem('smartbook_token');
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers = getAuthHeaders();
  const hadToken = 'Authorization' in headers;
  const res = await fetch(`${API_BASE}${path}`, {
    headers,
    ...options,
  });
  if (res.status === 401 && hadToken) {
    // Only clear stored token if this request actually sent one
    // (prevents wiping a freshly stored token from unrelated 401 responses)
    sessionStorage.removeItem('smartbook_token');
    sessionStorage.removeItem('smartbook_auth');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

// ─── Auth ────────────────────────────────────────────────
export const authApi = {
  login: (domainId: string, password: string) =>
    request('/auth/login', { method: 'POST', body: JSON.stringify({ domainId, password }) }),
  loginSso: (domainId: string) =>
    request('/auth/login-sso', { method: 'POST', body: JSON.stringify({ domainId }) }),
  negotiate: async () => {
    // Use credentials: 'include' to enable NTLM/Kerberos handshake with IIS Windows Auth
    const res = await fetch(`${API_BASE}/auth/negotiate`, { credentials: 'include' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || 'Negotiate failed');
    }
    return res.json();
  },
  me: () =>
    request('/auth/me'),
  updateProfile: (data: Partial<{ companyId: string; departmentId: string; designationId: string }>) =>
    request('/auth/profile', { method: 'PUT', body: JSON.stringify(data) }),
  updateEmail: (email: string) =>
    request('/auth/email', { method: 'PUT', body: JSON.stringify({ email }) }),
};

// ─── Rooms ───────────────────────────────────────────────
export const roomsApi = {
  getAll: () => request<any[]>('/rooms'),
  getById: (id: string) => request<any>(`/rooms/${encodeURIComponent(id)}`),
  create: (room: any, userId: string, userName: string) =>
    request('/rooms', { method: 'POST', body: JSON.stringify({ ...room, userId, userName }) }),
  update: (id: string, room: any, userId: string, userName: string) =>
    request(`/rooms/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify({ ...room, userId, userName }) }),
  delete: (id: string, userId: string, userName: string) =>
    request(`/rooms/${encodeURIComponent(id)}`, { method: 'DELETE', body: JSON.stringify({ userId, userName }) }),
};

// ─── Bookings ────────────────────────────────────────────
export const bookingsApi = {
  getAll: (params?: { userId?: string; roomId?: string; date?: string }) => {
    const qs = new URLSearchParams();
    if (params?.userId) qs.set('userId', params.userId);
    if (params?.roomId) qs.set('roomId', params.roomId);
    if (params?.date) qs.set('date', params.date);
    const q = qs.toString();
    return request<any[]>(`/bookings${q ? `?${q}` : ''}`);
  },
  getById: (id: string) => request<any>(`/bookings/${encodeURIComponent(id)}`),
  create: (booking: any, deferEmail?: boolean) => {
    const url = deferEmail ? '/bookings?deferEmail=1' : '/bookings';
    return request(url, { method: 'POST', body: JSON.stringify(booking) });
  },
  sendConfirmation: (id: string) =>
    request(`/bookings/${encodeURIComponent(id)}/send-confirmation`, { method: 'POST' }),
  update: (id: string, updates: any) =>
    request(`/bookings/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(updates) }),
  updateStatus: (id: string, status: string, userId: string, userName: string, cancellationReason?: string) =>
    request(`/bookings/${encodeURIComponent(id)}/status`, { method: 'PATCH', body: JSON.stringify({ status, userId, userName, cancellationReason }) }),
  updateITStatus: (id: string, status: string, generatedLink: string | undefined, meetingNumber: string | undefined, meetingPassword: string | undefined, userId: string, userName: string) =>
    request(`/bookings/${encodeURIComponent(id)}/it-status`, { method: 'PATCH', body: JSON.stringify({ status, generatedLink, meetingNumber, meetingPassword, userId, userName }) }),
  generateVcLink: (id: string, options?: { lockMeeting?: boolean }) =>
    request<any>(`/bookings/${encodeURIComponent(id)}/generate-vc-link`, { method: 'POST', body: JSON.stringify(options ?? {}) }),
  updateVcLinkTime: (id: string) =>
    request<any>(`/bookings/${encodeURIComponent(id)}/update-vc-link-time`, { method: 'POST' }),
  archiveIT: (id: string, archived: boolean) =>
    request(`/bookings/${encodeURIComponent(id)}/it-archive`, { method: 'PATCH', body: JSON.stringify({ archived }) }),
  cancelSeries: (recurrenceId: string, userId: string, userName: string, fromNow?: boolean, cancellationReason?: string) =>
    request<{ cancelled: number; ids: string[] }>(`/bookings/series/${encodeURIComponent(recurrenceId)}/cancel`, { method: 'PATCH', body: JSON.stringify({ userId, userName, fromNow: fromNow ?? false, cancellationReason }) }),
  checkConflict: (roomId: string, startTime: string, endTime: string, excludeBookingId?: string) => {
    const qs = new URLSearchParams({ roomId, startTime, endTime });
    if (excludeBookingId) qs.set('excludeBookingId', excludeBookingId);
    return request<{ hasConflict: boolean }>(`/bookings/conflicts/check?${qs.toString()}`);
  },
};

// ─── VC Availability (non-secret, any authenticated role) ─
export const vcAvailabilityApi = {
  get: () => request<any>('/vc-availability'),
};

// ─── Users ───────────────────────────────────────────────
export const usersApi = {
  getAll: () => request<any[]>('/users'),
  getById: (id: string) => request<any>(`/users/${encodeURIComponent(id)}`),
  searchDirectory: (q: string) => request<any[]>(`/users/search-directory?q=${encodeURIComponent(q)}`),
  create: (user: any, currentUserId: string, currentUserName: string) =>
    request('/users', { method: 'POST', body: JSON.stringify({ ...user, currentUserId, currentUserName }) }),
  update: (id: string, user: any, currentUserId: string, currentUserName: string) =>
    request(`/users/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify({ ...user, currentUserId, currentUserName }) }),
  delete: (id: string) =>
    request(`/users/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  resetPassword: (id: string, newPassword: string) =>
    request(`/users/${encodeURIComponent(id)}/reset-password`, { method: 'PUT', body: JSON.stringify({ newPassword }) }),
  updateEmail: (id: string, email: string) =>
    request(`/users/${encodeURIComponent(id)}/email`, { method: 'PATCH', body: JSON.stringify({ email }) }),
  syncFromLdap: (id: string) =>
    request<any>(`/users/${encodeURIComponent(id)}/sync-ldap`, { method: 'POST' }),
  syncAllFromLdap: () =>
    request<{ synced: number; failed: number; skipped: number; errors: string[] }>('/users/sync-ldap-all', { method: 'POST' }),
};

// ─── Companies ───────────────────────────────────────────
export const companiesApi = {
  getAll: () => request<any[]>('/companies'),
  create: (company: any, userId: string, userName: string) =>
    request('/companies', { method: 'POST', body: JSON.stringify({ ...company, userId, userName }) }),
  update: (id: string, company: any, userId: string, userName: string) =>
    request(`/companies/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify({ ...company, userId, userName }) }),
  delete: (id: string, userId: string, userName: string) =>
    request(`/companies/${encodeURIComponent(id)}`, { method: 'DELETE', body: JSON.stringify({ userId, userName }) }),
};

// ─── Departments ─────────────────────────────────────────
export const departmentsApi = {
  getAll: (companyId?: string) => {
    const q = companyId ? `?companyId=${encodeURIComponent(companyId)}` : '';
    return request<any[]>(`/departments${q}`);
  },
  create: (dept: any, userId: string, userName: string) =>
    request('/departments', { method: 'POST', body: JSON.stringify({ ...dept, userId, userName }) }),
  update: (id: string, dept: any, userId: string, userName: string) =>
    request(`/departments/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify({ ...dept, userId, userName }) }),
  delete: (id: string, userId: string, userName: string) =>
    request(`/departments/${encodeURIComponent(id)}`, { method: 'DELETE', body: JSON.stringify({ userId, userName }) }),
};

// ─── Designations ────────────────────────────────────────
export const designationsApi = {
  getAll: (companyId?: string) => {
    const q = companyId ? `?companyId=${encodeURIComponent(companyId)}` : '';
    return request<any[]>(`/designations${q}`);
  },
  create: (desig: any, userId: string, userName: string) =>
    request('/designations', { method: 'POST', body: JSON.stringify({ ...desig, userId, userName }) }),
  update: (id: string, desig: any, userId: string, userName: string) =>
    request(`/designations/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify({ ...desig, userId, userName }) }),
  delete: (id: string, userId: string, userName: string) =>
    request(`/designations/${encodeURIComponent(id)}`, { method: 'DELETE', body: JSON.stringify({ userId, userName }) }),
};

// ─── Blocks ──────────────────────────────────────────────
export const blocksApi = {
  getAll: () => request<any[]>('/blocks'),
  create: (block: any) =>
    request('/blocks', { method: 'POST', body: JSON.stringify(block) }),
  update: (id: string, block: any) =>
    request(`/blocks/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(block) }),
  delete: (id: string) =>
    request(`/blocks/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};

// ─── Facilities ──────────────────────────────────────────
export const facilitiesApi = {
  getAll: () => request<any[]>('/facilities'),
  create: (facility: any) =>
    request('/facilities', { method: 'POST', body: JSON.stringify(facility) }),
  update: (id: string, facility: any) =>
    request(`/facilities/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(facility) }),
  delete: (id: string) =>
    request(`/facilities/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};

// ─── Blocked Slots ───────────────────────────────────────
export const blockedSlotsApi = {
  getAll: (roomId?: string) => {
    const q = roomId ? `?roomId=${encodeURIComponent(roomId)}` : '';
    return request<any[]>(`/blocked-slots${q}`);
  },
  create: (slot: any, userId: string, userName: string) =>
    request('/blocked-slots', { method: 'POST', body: JSON.stringify({ ...slot, userId, userName }) }),
  delete: (id: string, userId: string, userName: string) =>
    request(`/blocked-slots/${encodeURIComponent(id)}`, { method: 'DELETE', body: JSON.stringify({ userId, userName }) }),
};

// ─── Audit ───────────────────────────────────────────────
export const auditApi = {
  getAll: (limit?: number, offset?: number) => {
    const qs = new URLSearchParams();
    if (limit) qs.set('limit', String(limit));
    if (offset) qs.set('offset', String(offset));
    const q = qs.toString();
    return request<any[]>(`/audit${q ? `?${q}` : ''}`);
  },
};

// ─── Settings ────────────────────────────────────────────
export const settingsApi = {
  getPortal: () => request<any>('/settings/portal'),
  updatePortal: (settings: any, userId: string, userName: string) =>
    request('/settings/portal', { method: 'PUT', body: JSON.stringify({ ...settings, userId, userName }) }),
  getLdap: () => request<any>('/settings/ldap'),
  updateLdap: (settings: any, userId: string, userName: string) =>
    request('/settings/ldap', { method: 'PUT', body: JSON.stringify({ ...settings, userId, userName }) }),
  testLdapConnection: (settings: any) =>
    request<{ success: boolean; message: string }>('/settings/ldap/test', { method: 'POST', body: JSON.stringify(settings) }),
  getSmtp: () => request<any>('/settings/smtp'),
  updateSmtp: (settings: any, userId: string, userName: string) =>
    request('/settings/smtp', { method: 'PUT', body: JSON.stringify({ ...settings, userId, userName }) }),
  testSmtp: (settings: any, recipientEmail: string) =>
    request<{ success: boolean; message: string }>('/settings/smtp/test', { method: 'POST', body: JSON.stringify({ ...settings, recipientEmail }) }),
  getDatabase: () => request<any>('/settings/database'),
  testDatabaseConnection: () =>
    request<{ success: boolean; message: string }>('/settings/database/test', { method: 'POST' }),
  clearDatabaseTables: (tables: string[], filters?: { beforeDate?: string; statuses?: string[] }) =>
    request<{ success: boolean; message: string }>('/settings/database/clear', { method: 'POST', body: JSON.stringify({ tables, filters }) }),
  exportData: (sections: string[], userId: string, userName: string) =>
    request('/settings/export', { method: 'POST', body: JSON.stringify({ sections, userId, userName }) }),
  importData: (data: any) =>
    request<{ success: boolean; message: string }>('/settings/import', { method: 'POST', body: JSON.stringify(data) }),
  getVcIntegration: () => request<any>('/settings/vc-integration'),
  updateVcIntegration: (settings: any) =>
    request<any>('/settings/vc-integration', { method: 'PUT', body: JSON.stringify(settings) }),
  testGoogleMeet: (config: any) =>
    request<{ success: boolean; message: string }>('/settings/vc-integration/test-google', { method: 'POST', body: JSON.stringify(config) }),
  testWebex: (account: any) =>
    request<{ success: boolean; message: string; refreshToken?: string }>('/settings/vc-integration/test-webex', { method: 'POST', body: JSON.stringify(account) }),
};

// ─── Seed ────────────────────────────────────────────────
export const seedApi = {
  seed: () => request('/seed', { method: 'POST' }),
};

// ─── Service Requests ────────────────────────────────────
export const serviceRequestsApi = {
  getAll: (params?: { status?: string; bookingId?: string }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    if (params?.bookingId) qs.set('bookingId', params.bookingId);
    const q = qs.toString();
    return request<any[]>(`/service-requests${q ? `?${q}` : ''}`);
  },
  updateStatus: (id: string, status: string) =>
    request(`/service-requests/${encodeURIComponent(id)}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
};

// ─── Attachments ─────────────────────────────────────────
export const attachmentsApi = {
  /**
   * Upload files for a booking. Returns the created attachment records.
   * Must be called after the booking is created (we need the booking id).
   */
  upload: async (bookingId: string, files: File[]): Promise<any[]> => {
    const token = sessionStorage.getItem('smartbook_token');
    const formData = new FormData();
    for (const file of files) {
      formData.append('files', file);
    }
    const res = await fetch(`${API_BASE}/bookings/${encodeURIComponent(bookingId)}/attachments`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `Upload failed: ${res.status}`);
    }
    return res.json();
  },

  /** Delete an attachment by its id. Booking id required for authorization check. */
  delete: (bookingId: string, attachmentId: string) =>
    request(`/bookings/${encodeURIComponent(bookingId)}/attachments/${encodeURIComponent(attachmentId)}`, { method: 'DELETE' }),

  /**
   * Returns the URL that streams / downloads an attachment file.
   * The server requires a valid JWT token in the Authorization header,
   * so this URL is not directly usable as an <a href> without custom fetch.
   * Use downloadFile() instead for programmatic downloads.
   */
  downloadUrl: (attachmentId: string) => `${API_BASE}/attachments/${encodeURIComponent(attachmentId)}/download`,

  /** Programmatically download a file by triggering a browser download. */
  downloadFile: async (attachmentId: string, filename: string): Promise<void> => {
    const token = sessionStorage.getItem('smartbook_token');
    const res = await fetch(`${API_BASE}/attachments/${encodeURIComponent(attachmentId)}/download`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error(`Download failed: ${res.status}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },
};
