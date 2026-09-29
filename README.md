# ConferenceHub — Smart Meeting & Conference Room Booking Portal

An internal self-service portal that replaces email-based coordination for booking conference rooms and board rooms. Provides real-time availability, automated IT/VC request workflows, email notifications with calendar invites, and role-based administration.

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

**Prerequisites:** Node.js v18+, PostgreSQL v14+

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

# 5. Start the application
npm start
```

The app starts on **http://localhost:3001** (frontend + API served together).

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
- **IT & VC Workflow** — automated IT task creation for video conferencing, AV setup, and support standby requests
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
npm start            # Production: serve API + built frontend on :3001
npm run migrate      # Apply Prisma migrations (production)
npm run migrate:dev  # Create and apply migrations (development)
npm run zip          # Package production build as conferencehub-production.zip
npm run deploy       # Build + deploy to production server + run migrations
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
