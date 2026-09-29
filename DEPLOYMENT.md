# Deployment Guide

ConferenceHub runs as a single Node.js process that serves both the API and the built frontend. The reference deployment is a Windows Server running the app as a Windows service, optionally fronted by IIS.

## 1. Requirements

- Node.js 20+
- PostgreSQL 14+
- Windows Server (for the service/IIS setup below); the app itself runs on any OS with Node

## 2. Environment variables

Copy `.env.example` to `.env` on the server and fill it in.

| Variable | Default | Notes |
|----------|---------|-------|
| `NODE_ENV` | - | `production` disables the `/api/seed` route |
| `API_PORT` | `3002` | Port for the Express server |
| `DB_HOST` / `DB_PORT` / `DB_NAME` / `DB_USER` / `DB_PASSWORD` | `localhost` / `5432` / `crb` / `postgres` / - | PostgreSQL connection |
| `DATABASE_URL` | - | Connection string used by the Prisma CLI |
| `DB_POOL_MAX`, `DB_IDLE_TIMEOUT`, `DB_CONN_TIMEOUT` | `10`, `30000`, `5000` | Connection pool tuning |
| `JWT_SECRET` | - | Required. Use 64+ random characters |
| `JWT_EXPIRES_IN` | `8h` | Token lifetime |
| `CORS_ORIGIN` | - | Allowed origin(s), comma-separated |
| `PORTAL_URL` | first `CORS_ORIGIN` | Base URL used in notification emails |
| `TLS_REJECT_UNAUTHORIZED` | `true` | Set `false` only for self-signed LDAP certificates in development |

Never commit `.env`.

## 3. Database

```bash
npx prisma migrate deploy
```

Run this on a machine that can reach the database. The database normally listens only on `localhost`, so run it on the server itself.

**Important:** if a release contains a Prisma schema change, run the migration on the server *before* starting the new code. New code that selects a column the database does not have yet will fail on every request that touches that table.

All three Prisma packages (`prisma`, `@prisma/client`, `@prisma/adapter-pg`) are pinned to the same exact version. Bump them together. A mismatch produces malformed SQL such as `undefined$1undefined`.

## 4. Build

```bash
npm install
npm run zip
```

`npm run zip` (`scripts/build-zip.ps1`) builds the frontend (Vite) and the server (`tsc`), runs `prisma generate`, bundles the generated Prisma client, and produces `conferencehub-production.zip`. The generated client is bundled because the production server should not run `prisma generate`.

## 5. Deploy

Set the target, then run the deploy script from a development machine:

```powershell
$env:DEPLOY_PATH    = '\\SERVER\c$\conferencehub-production'   # UNC or local path
$env:DEPLOY_SERVICE = 'conferencehub.exe'                      # optional, service name
npm run deploy
# after adding/removing dependencies:
powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1 -ForceNpmInstall
```

The script builds, stops the service, backs up `dist/` and `dist-server/` into `.backups/`, copies the new files, preserves the service daemon folder, installs dependencies when needed, copies the bundled Prisma client, and restarts the service. It aborts before restarting if any copy fails or a local migration folder is missing on the target.

`uploads/` (booking attachments) is not touched by deploys.

## 6. Windows service

Install once, on the server, as Administrator:

```powershell
cd C:\conferencehub-production
node scripts/install-service.cjs install
```

This creates the service wrapper under `dist-server\server\daemon\`. Deleting that folder (for example with `robocopy /MIR`) stops the service from starting (`[SC] StartService FAILED 2`). The deploy script preserves it. If it is lost, restore it from `.backups/`.

Other commands:

```powershell
node scripts/install-service.cjs uninstall
sc.exe query conferencehub.exe
```

Logs are in the daemon folder: `conferencehub.out.log`, `conferencehub.err.log`.

## 7. IIS reverse proxy and Windows SSO (optional)

`web.config` in the repo root proxies all requests to `http://127.0.0.1:3002` using URL Rewrite and Application Request Routing.

For Windows SSO, the identity of the signed-in user must reach Node. ARR does not reliably expose `LOGON_USER`, so `/api/auth/negotiate` is rewritten locally to `_authbridge/negotiate.aspx`. That page runs inside IIS, reads the authenticated identity, and calls the Node app on localhost with an `X-Remote-User` header.

- Copy `web.config` and `_authbridge/` to the site root manually. The deploy script does not.
- Enable Windows Authentication only on the `_authbridge` location. Leave Anonymous enabled elsewhere.
- Keep `<httpErrors existingResponse="PassThrough" />` in `web.config`. Without it IIS replaces the `WWW-Authenticate` challenge with a generic error page.
- Register a Kerberos SPN for the site host name on the server's computer account, or authentication falls back to NTLM and can fail with generic "wrong password" errors.
- Enable LDAP in Admin > LDAP Settings. The negotiate route uses it to resolve users.

## 8. Auto-generated meeting links (optional)

The IT Queue can create Google Meet or Webex links with one click. Nothing goes in `.env`: configure everything in **Admin > VC Integration**, use **Test Connection**, then **Save**. Secrets are masked after saving and never sent back to the browser. Both providers are free to use with the licences you already have.

Two database columns back this feature (`vcAccountRef`, `vcExternalEventId`), so run `npx prisma migrate deploy` on the server before deploying a release that includes them (section 3).

### Google Meet (one Workspace service account per company)

Requires a Workspace super admin. Repeat once per company.

1. In Google Cloud Console, create or select a project and enable the **Google Calendar API**.
2. Create a service account (no IAM roles needed) and download a **JSON key**. `client_email` is the *Service Account Email* and `private_key` is the *Private Key* (paste the whole PEM block including the BEGIN/END lines).
3. Note the service account's numeric **Client ID** (not the email).
4. In the Workspace admin console, go to Security > API controls > Domain-wide delegation > Add new. Enter the Client ID and the scope `https://www.googleapis.com/auth/calendar.events`. It can take a few minutes to apply.
5. Choose an **Impersonate Email**: a real mailbox in that Workspace, ideally a dedicated shared one. Generated Meet events are created on its calendar.
6. Enter the three values in the company's card, enable it, test, and save.

### Webex (shared pool of accounts)

The pool picks whichever enabled account has no overlapping Webex booking for the requested time. Which companies may use Webex is a separate allowlist ("Available For Companies").

1. At developer.webex.com, create an **Integration** with redirect URI `https://oauth.pstmn.io/v1/callback` and scopes `meeting:schedules_write`, `meeting:schedules_read`, `spark:people_read`. Note the Client ID and Secret (shared by all accounts).
2. For each account, open the Integration's authorization URL in a fresh incognito window, sign in as that account, accept, and copy the `code=` value from the address bar immediately (single use, expires in minutes).
3. Exchange it for tokens right away:
   ```powershell
   $body = @{
     grant_type    = 'authorization_code'
     client_id     = 'YOUR_CLIENT_ID'
     client_secret = 'YOUR_CLIENT_SECRET'
     code          = 'PASTE_CODE_HERE'
     redirect_uri  = 'https://oauth.pstmn.io/v1/callback'
   }
   (Invoke-RestMethod -Uri 'https://webexapis.com/v1/access_token' -Method Post -Body $body).refresh_token
   ```
4. Paste the refresh token, give the account a label, and save. Give every account a label; a blank label shows the internal id in the IT Queue.

**Refresh tokens rotate on every use.** Webex invalidates the old token each time it issues a new one. The app saves the rotated token automatically, so do not keep a separate copy of it. Treat the settings page as the only source of truth. Accounts can be switched off individually with the toggle on the account card; a disabled account gets no new meetings, but its existing meetings can still be rescheduled.

| Error | Cause |
|-------|-------|
| `Request had insufficient authentication scopes` | Delegation scope or Client ID is wrong, or it has not propagated yet |
| Google test fails with no message | Private key is missing or truncated |
| `invalid_grant` during code exchange | The code was truncated, already used, or expired. Get a new one |
| `refresh token ... expired, revoked, malformed, or invalid` | The token was already rotated by another exchange. Re-authorize that account |

If a credential is ever exposed outside the app, rotate it: delete the Google key and create a new one, or reset the Webex client secret and re-authorize the account.

## 9. First run

On first boot the server creates an admin user if none exists (`admin` / `Admin@123`). Change the password immediately.

## 10. Troubleshooting

| Symptom | Likely cause and fix |
|---------|----------------------|
| `GET /api/bookings` returns 500, `undefined$1undefined` | Prisma package versions differ. Pin them and redeploy |
| `GET /api/bookings` returns 500, `column does not exist` | Migration not applied. Run `npx prisma migrate deploy` on the server |
| Service fails with `FAILED 2` | Daemon folder missing. Restore from `.backups/` |
| `Cannot find package ...` after deploy | Corrupted `node_modules`. Redeploy with `-ForceNpmInstall` |
| `P1001` during deploy migration step | Database is not reachable from the dev machine. Run the migration on the server |
| SSO popup loops or `No domain credentials detected` | Check section 7 (auth scoping, SPN, `httpErrors`) |
