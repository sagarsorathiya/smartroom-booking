# ConferenceHub — Smart Meeting & Conference Room Booking Portal

An internal self-service portal that replaces email-based coordination for booking conference rooms and board rooms. Provides real-time availability, automated IT/VC request workflows, email notifications with calendar invites, and role-based administration.

## Overview

Booking a meeting room usually involves a chain of emails: checking who has the room, asking reception to confirm it, asking IT for a video-conference link, asking administration for tea and stationery. ConferenceHub puts that whole chain in one place.

**How a booking flows through the portal**

1. **Book** — an employee picks a room and time on the availability calendar. The server checks the request against existing bookings and admin-blocked slots in a single transaction, so two people can never book the same slot.
2. **Rules apply** — portal settings can limit weekend bookings, maximum duration and how far ahead people can book, can require approval when a meeting exceeds a participant threshold, and can lock specific rooms to a list of allowed users.
3. **Requests fan out** — video-conference, AV setup, standby support and food or stationery requests are turned into tasks for the IT and Administration queues automatically.
4. **Notify** — the booker, invitees, reception and the relevant support teams get emails with calendar (ICS) invites that update or cancel in place when the booking changes.
5. **Meeting link** — IT can approve a one-click Google Meet or Webex link, or paste one manually. If the meeting is later rescheduled, the same link can be moved to the new time.
6. **Wrap up** — finished bookings close themselves, and every action is recorded in an audit log with the client IP.

**Who it is for**

- **Employees** book rooms, invite colleagues and attach files.
- **Reception, IT and Administration** work from their own queues instead of a shared inbox.
- **Admins** manage rooms, users, companies, departments, notification settings, LDAP/AD and meeting-link integrations, and see utilisation reports.

**Design notes**

- One Node.js process serves both the API and the built React app, which keeps deployment simple on a single Windows Server.
- Sign in with a local password, LDAP/Active Directory, or Windows single sign-on behind IIS.
- Integration credentials (SMTP, LDAP, Google Meet, Webex) are stored in the database and masked in the UI. They are never kept in `.env` or sent back to the browser.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS |
| Backend | Express 5, Node.js |
| Database | PostgreSQL via Prisma ORM |
| Auth | JWT + LDAP/AD + Windows SSO + local passwords |
| Email | Nodemailer with ICS calendar invites |

---

## Quick Start

**Prerequisites:** Node.js v20+, PostgreSQL v14+

```bash
# 1. Install dependencies
npm install

# 2. Create the database
# In psql: CREATE DATABASE crb;

# 3. Configure environment
cp .env.example .env
# Edit .env — set DB_HOST, DB_PASSWORD, DATABASE_URL, JWT_SECRET

# 4. Run database migrations
npx prisma migrate deploy

# 5a. Development (hot reload)
npm run dev
# 5b. Or production-style: build, then start
npm run build && npm run build:server && npm start
```

- **Development:** frontend on **http://localhost:3001**, API on **http://localhost:3002**.
- **Production-style (`npm start`):** the API and the built frontend are served together on **http://localhost:3002** (or `API_PORT`).

**Default admin account:** `admin` / `Admin@123` — change immediately after first login.

For production deployment see [DEPLOYMENT.md](DEPLOYMENT.md).

---

## User Roles

| Role | Access |
|------|--------|
| **EMPLOYEE** | Book rooms, view own bookings |
| **RECEPTION** | All bookings, book on behalf of others, admin services |
| **IT** | IT Queue (VC/AV tasks), book on behalf |
| **ADMINISTRATION** | All bookings, admin services queue, book on behalf |
| **ADMIN** | Full access — room CRUD, user management, all settings |

---

## Key Features

- **Room Availability Calendar** — day/week grid with real-time conflict prevention
- **Room-Level Access Restrictions** — admins can lock specific rooms to selected users; ADMIN/RECEPTION/IT always bypass; enforced at both API and UI level
- **IT & VC Workflow** — automated IT task creation for video conferencing, AV setup, and support standby requests; IT can replace a sent link or reschedule it in place
- **Auto-Generated Meeting Links** — one-click Google Meet (per-company Workspace) or Webex (shared account pool) link generation from the IT Queue, with manual entry as a fallback; credentials are managed in Admin → VC Integration
- **Recurring Bookings** — series with single-occurrence or whole-series cancellation, with an optional cancellation reason emailed to invitees
- **Early Close / Extend** — adjust a booking's end time in place without reopening its IT task
- **Administration Services** — food/stationery/equipment request queue per booking
- **Email + ICS Invites** — booking confirmations, IT notifications, cancellations with calendar attachments
- **LDAP/AD Integration** — Active Directory authentication with group-based role assignment
- **Windows SSO** — Negotiate/Kerberos auth via IIS reverse proxy
- **Audit Log** — 27 action types with IP tracking
- **Reports & Analytics** — 6 KPI cards and 8 chart panels (room utilisation, peak hours, department breakdown, IT demand, etc.)
- **Import / Export** — selective 14-section JSON backup and restore
- **Windows Service** — runs as a native Windows service with auto-restart on boot

---

## Development Commands

```bash
npm run dev          # Start dev servers (frontend :3001 + API :3002, with hot reload)
npm run build        # Build frontend (Vite)
npm run build:server # Build server (TypeScript → dist-server/)
npm start            # Production: serve API + built frontend on :3002
npm run migrate:deploy # Apply Prisma migrations
npm run zip          # Package production build as conferencehub-production.zip
npm run seed         # Load demo data (dev only, API must be running)
npm run service:install   # Install as a Windows service (also service:uninstall, service:status)
npm run deploy       # Build + deploy to the server in DEPLOY_PATH (run migrations on the server)
```

---

## Documentation

| Document | Description |
|----------|-------------|
| [DEPLOYMENT.md](DEPLOYMENT.md) | Production build, Windows service, IIS and deployment guide |

---

## Project Structure

```
├── server/          Express API (routes, services, middleware, validators)
├── components/      React UI components
├── context/         AppContext — global state management
├── services/        API client (api.ts)
├── prisma/          Database schema and migrations
├── scripts/         Build, deploy, and utility scripts
├── dist/            Built frontend (generated)
└── dist-server/     Built API server (generated)
```
