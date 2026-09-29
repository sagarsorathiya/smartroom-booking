import { Client } from 'ldapts';
import prisma from '../prisma.js';

export interface LdapConfig {
  enabled: boolean;
  serverUrl: string;
  port: number;
  useSsl: boolean;
  bindDn: string;
  bindPassword: string;
  baseDn: string;
  userSearchFilter: string;
  usernameAttribute: string;
  emailAttribute: string;
  displayNameAttribute: string;
  groupSearchBase: string;
  adminGroupDn: string;
  itGroupDn: string;
  receptionGroupDn: string;
  administrationGroupDn: string;
  connectionTimeout: number;
  searchTimeout: number;
}

export interface LdapAuthResult {
  success: boolean;
  user?: {
    domainId: string;
    name: string;
    email: string;
    role: 'EMPLOYEE' | 'RECEPTION' | 'IT' | 'ADMINISTRATION' | 'ADMIN';
  };
  error?: string;
}

async function getLdapConfig(): Promise<LdapConfig | null> {
  const row = await prisma.appSettings.findUnique({ where: { key: 'ldap' } });
  if (!row) return null;
  const config = JSON.parse(row.value) as LdapConfig;
  return config.enabled ? config : null;
}

function buildUrl(config: LdapConfig): string {
  const protocol = config.useSsl ? 'ldaps' : 'ldap';
  // If serverUrl already has a protocol, use it as-is
  if (config.serverUrl.startsWith('ldap://') || config.serverUrl.startsWith('ldaps://')) {
    return config.serverUrl;
  }
  return `${protocol}://${config.serverUrl}:${config.port}`;
}

/**
 * Authenticate a user against LDAP/AD.
 * 1. Bind with service account
 * 2. Search for user by domainId
 * 3. Bind with user's DN + password to verify credentials
 * 4. Determine role from group membership
 */
export async function authenticateWithLdap(domainId: string, password: string): Promise<LdapAuthResult> {
  const config = await getLdapConfig();
  if (!config) {
    return { success: false, error: 'LDAP is not enabled' };
  }

  const url = buildUrl(config);
  const rejectUnauthorized = process.env.TLS_REJECT_UNAUTHORIZED !== 'false';
  const client = new Client({
    url,
    timeout: config.connectionTimeout,
    connectTimeout: config.connectionTimeout,
    tlsOptions: config.useSsl ? { rejectUnauthorized } : undefined,
  });

  try {
    // Step 1: Bind with service account
    await client.bind(config.bindDn, config.bindPassword);

    // Step 2: Search for user
    const safeDomainId = domainId.replace(/[\\*()\x00]/g, '');
    const searchFilter = config.userSearchFilter.replace('{0}', safeDomainId);
    const { searchEntries } = await client.search(config.baseDn, {
      scope: 'sub',
      filter: searchFilter,
      attributes: [config.usernameAttribute, config.emailAttribute, config.displayNameAttribute, 'dn', 'memberOf'],
      timeLimit: Math.floor(config.searchTimeout / 1000),
    });

    if (searchEntries.length === 0) {
      return { success: false, error: 'User not found in directory' };
    }

    const entry = searchEntries[0];
    const userDn = entry.dn;

    // Step 3: Bind with user credentials to verify password
    const userClient = new Client({
      url,
      timeout: config.connectionTimeout,
      connectTimeout: config.connectionTimeout,
      tlsOptions: config.useSsl ? { rejectUnauthorized } : undefined,
    });

    try {
      await userClient.bind(userDn, password);
    } catch {
      return { success: false, error: 'Invalid credentials' };
    } finally {
      await userClient.unbind().catch(() => {});
    }

    // Extract user attributes
    const getAttr = (attr: string): string => {
      const val = entry[attr];
      if (Array.isArray(val)) return String(val[0] || '');
      return val ? String(val) : '';
    };

    const userName = getAttr(config.displayNameAttribute) || domainId;
    const email = getAttr(config.emailAttribute) || '';

    // Step 4: Determine role from group membership
    const memberOf = entry.memberOf;
    const groups: string[] = Array.isArray(memberOf)
      ? memberOf.map(g => String(g).toLowerCase())
      : memberOf ? [String(memberOf).toLowerCase()] : [];

    let role: 'EMPLOYEE' | 'RECEPTION' | 'IT' | 'ADMIN' = 'EMPLOYEE';
    if (config.adminGroupDn && groups.some(g => g === config.adminGroupDn.toLowerCase())) {
      role = 'ADMIN';
    } else if (config.itGroupDn && groups.some(g => g === config.itGroupDn.toLowerCase())) {
      role = 'IT';
    } else if (config.receptionGroupDn && groups.some(g => g === config.receptionGroupDn.toLowerCase())) {
      role = 'RECEPTION';
    }

    return {
      success: true,
      user: { domainId, name: userName, email, role },
    };
  } catch (err: any) {
    return { success: false, error: `LDAP error: ${err.message}` };
  } finally {
    await client.unbind().catch(() => {});
  }
}

/**
 * Look up a user in LDAP by domainId using the service account only (no user password required).
 * Used for SSO flows where the user is already authenticated by the domain.
 */
export async function lookupLdapUser(domainId: string): Promise<LdapAuthResult> {
  const config = await getLdapConfig();
  if (!config) {
    return { success: false, error: 'LDAP is not enabled' };
  }

  const url = buildUrl(config);
  const rejectUnauthorized = process.env.TLS_REJECT_UNAUTHORIZED !== 'false';
  const client = new Client({
    url,
    timeout: config.connectionTimeout,
    connectTimeout: config.connectionTimeout,
    tlsOptions: config.useSsl ? { rejectUnauthorized } : undefined,
  });

  try {
    // Bind with service account
    await client.bind(config.bindDn, config.bindPassword);

    // Search for user
    const safeDomainId = domainId.replace(/[\\*()\x00]/g, '');
    const searchFilter = config.userSearchFilter.replace('{0}', safeDomainId);
    const { searchEntries } = await client.search(config.baseDn, {
      scope: 'sub',
      filter: searchFilter,
      attributes: [config.usernameAttribute, config.emailAttribute, config.displayNameAttribute, 'dn', 'memberOf'],
      timeLimit: Math.floor(config.searchTimeout / 1000),
    });

    if (searchEntries.length === 0) {
      return { success: false, error: 'User not found in directory' };
    }

    const entry = searchEntries[0];

    const getAttr = (attr: string): string => {
      const val = entry[attr];
      if (Array.isArray(val)) return String(val[0] || '');
      return val ? String(val) : '';
    };

    const userName = getAttr(config.displayNameAttribute) || domainId;
    const email = getAttr(config.emailAttribute) || '';

    const memberOf = entry.memberOf;
    const groups: string[] = Array.isArray(memberOf)
      ? memberOf.map(g => String(g).toLowerCase())
      : memberOf ? [String(memberOf).toLowerCase()] : [];

    let role: 'EMPLOYEE' | 'RECEPTION' | 'IT' | 'ADMINISTRATION' | 'ADMIN' = 'EMPLOYEE';
    if (config.adminGroupDn && groups.some(g => g === config.adminGroupDn.toLowerCase())) {
      role = 'ADMIN';
    } else if (config.itGroupDn && groups.some(g => g === config.itGroupDn.toLowerCase())) {
      role = 'IT';
    } else if (config.administrationGroupDn && groups.some(g => g === config.administrationGroupDn.toLowerCase())) {
      role = 'ADMINISTRATION';
    } else if (config.receptionGroupDn && groups.some(g => g === config.receptionGroupDn.toLowerCase())) {
      role = 'RECEPTION';
    }

    return {
      success: true,
      user: { domainId, name: userName, email, role },
    };
  } catch (err: any) {
    return { success: false, error: `LDAP error: ${err.message}` };
  } finally {
    await client.unbind().catch(() => {});
  }
}

/**
 * Search LDAP directory for users matching a query string.
 * Returns up to `limit` results matching by displayName, email, or sAMAccountName.
 */
export async function searchLdapUsers(query: string, limit = 20): Promise<{ success: boolean; users: Array<{ domainId: string; name: string; email: string; role: 'EMPLOYEE' | 'RECEPTION' | 'IT' | 'ADMINISTRATION' | 'ADMIN' }>; error?: string }> {
  const config = await getLdapConfig();
  if (!config) {
    return { success: false, users: [], error: 'LDAP is not enabled' };
  }

  const url = buildUrl(config);
  const rejectUnauthorized = process.env.TLS_REJECT_UNAUTHORIZED !== 'false';
  const client = new Client({
    url,
    timeout: config.connectionTimeout,
    connectTimeout: config.connectionTimeout,
    tlsOptions: config.useSsl ? { rejectUnauthorized } : undefined,
  });

  try {
    await client.bind(config.bindDn, config.bindPassword);

    // Sanitize the query for LDAP filter
    const safeQuery = query.replace(/[\\*()\x00]/g, '');
    // Search by displayName, mail, or sAMAccountName
    const filter = `(&(objectClass=user)(objectCategory=person)(|(${config.displayNameAttribute}=*${safeQuery}*)(${config.emailAttribute}=*${safeQuery}*)(${config.usernameAttribute}=*${safeQuery}*)))`;

    const { searchEntries } = await client.search(config.baseDn, {
      scope: 'sub',
      filter,
      attributes: [config.usernameAttribute, config.emailAttribute, config.displayNameAttribute, 'memberOf'],
      sizeLimit: limit,
      timeLimit: Math.floor(config.searchTimeout / 1000),
    });

    const users = searchEntries.map(entry => {
      const getAttr = (attr: string): string => {
        const val = entry[attr];
        if (Array.isArray(val)) return String(val[0] || '');
        return val ? String(val) : '';
      };

      const domainId = getAttr(config.usernameAttribute);
      const name = getAttr(config.displayNameAttribute) || domainId;
      const email = getAttr(config.emailAttribute) || '';

      const memberOf = entry.memberOf;
      const groups: string[] = Array.isArray(memberOf)
        ? memberOf.map(g => String(g).toLowerCase())
        : memberOf ? [String(memberOf).toLowerCase()] : [];

      let role: 'EMPLOYEE' | 'RECEPTION' | 'IT' | 'ADMINISTRATION' | 'ADMIN' = 'EMPLOYEE';
      if (config.adminGroupDn && groups.some(g => g === config.adminGroupDn.toLowerCase())) {
        role = 'ADMIN';
      } else if (config.itGroupDn && groups.some(g => g === config.itGroupDn.toLowerCase())) {
        role = 'IT';
      } else if (config.administrationGroupDn && groups.some(g => g === config.administrationGroupDn.toLowerCase())) {
        role = 'ADMINISTRATION';
      } else if (config.receptionGroupDn && groups.some(g => g === config.receptionGroupDn.toLowerCase())) {
        role = 'RECEPTION';
      }

      return { domainId, name, email, role };
    }).filter(u => u.domainId); // filter out entries without a domainId

    return { success: true, users };
  } catch (err: any) {
    return { success: false, users: [], error: `LDAP search error: ${err.message}` };
  } finally {
    await client.unbind().catch(() => {});
  }
}

/**
 * Test LDAP connection with given config (for the settings page "Test Connection" button).
 */
export async function testLdapConnection(config: LdapConfig): Promise<{ success: boolean; message: string }> {
  const url = buildUrl(config);
  const rejectUnauthorized = process.env.TLS_REJECT_UNAUTHORIZED !== 'false';
  const client = new Client({
    url,
    timeout: config.connectionTimeout || 5000,
    connectTimeout: config.connectionTimeout || 5000,
    tlsOptions: config.useSsl ? { rejectUnauthorized } : undefined,
  });

  try {
    await client.bind(config.bindDn, config.bindPassword);

    // Try a basic search to verify baseDn is accessible
    const { searchEntries } = await client.search(config.baseDn, {
      scope: 'base',
      filter: '(objectClass=*)',
      attributes: ['dn'],
      sizeLimit: 1,
    });

    await client.unbind().catch(() => {});

    return {
      success: true,
      message: `Connected to ${url} — Base DN "${config.baseDn}" accessible (${searchEntries.length} entry found)`,
    };
  } catch (err: any) {
    await client.unbind().catch(() => {});
    return { success: false, message: `Connection failed: ${err.message}` };
  }
}
