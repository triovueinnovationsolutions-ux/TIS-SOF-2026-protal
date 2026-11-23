# Triovue Employee Portal (Node.js)

A local-first employee management starter built with native Node.js HTTP APIs and plain HTML/CSS/JavaScript. It includes a dark responsive dashboard, employee directory, attendance punches, task management, projects, leave requests, holidays, timesheets, announcements, CSV exports and a basic audit trail.

## Requirements
- Node.js 18 or newer

## Run locally
```bash
cd triovue-employee-portal
npm start
```
Open http://localhost:3000

For automatic restart while editing (Node.js watch mode):
```bash
npm run dev
```

## Demo sign-in accounts

The starter includes three demo roles for local testing:

| Role | Username | Password |
|---|---|---|
| Employee | `employee` | `employee123` |
| Admin | `admin` | `admin123` |
| Super Admin | `superadmin` | `super123` |

The employee demo account is mapped to Antos Pravin in the sample data. These credentials are hard-coded demo credentials and must be replaced before deployment. Sessions are held in memory and are cleared when the server restarts.

## Role access
- Employee: personal attendance, assigned tasks, own leave and timesheet records, announcements and read-only project information.
- Admin: operational access to employee and HR workspace modules.
- Super Admin: full access to the portal modules and organization-wide reports/audit view.

The Super Admin overview is a separate role-specific landing page. User provisioning and role changes are not yet exposed as an in-app screen.

## Data
The server creates `data.json` on first launch and persists changes there. Back up this file regularly. Delete it only if you want to reset the demo data (the server recreates it on next start).

## Important before production
This is a development starter, not a production HRMS. The included login and role checks are demo scaffolding only: credentials are hard-coded, sessions are in-memory, there is no password reset or user provisioning flow, and there is no CSRF protection, database backup automation, HTTPS configuration, or hardened audit storage. The visible Super Admin label is illustrative only. Do not enter real employee personal, payroll, medical, identity or other sensitive data until authentication, authorization, security review and a proper database are implemented. Use PostgreSQL/MySQL for multi-user production deployment.

## Main API
- `GET /api/health`
- `GET /api/data`
- `GET /api/:collection`
- `POST /api/:collection`
- `PUT /api/:collection/:id`
- `DELETE /api/:collection/:id`
- `POST /api/attendance/punch`
- `GET /api/export/:collection` (CSV)

Collections: employees, attendance, tasks, holidays, leaves, projects, timesheets, announcements.

## Dynamically generated employee login credentials
When an Admin or Super Admin creates a new employee in the Employees section, the server creates a unique username from the employee name (for example, `first.last`; duplicate names receive a numeric suffix) and a cryptographically random temporary password. The Add Employee form explains this before saving. After the employee is saved, both values appear in a one-time confirmation panel; copy and share them with the employee securely. Passwords are stored as scrypt hashes, never plaintext. Accounts are stored in the private `users` collection in `data.json` and are excluded from general API responses. Each account is linked to its employee record by employee ID. Deleting an employee disables their login. Existing sample employees do not automatically receive accounts; add a new employee record to provision a login. The temporary-password flag is recorded, but forced password change is not yet implemented.


## Audit log captures record data
The audit log now stores the record snapshot for creates and deletes, and both before/after snapshots for updates. Attendance punch events also store the updated attendance row and the punch event type. The Reports & audit screen includes a Changed data column alongside the timestamp and action. Passwords and password hashes are not included in audit snapshots.
