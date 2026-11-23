# Triovue Hardware Project Manager (Node.js)

Express + EJS + SQLite app for hardware / PCB project management.

## Run on localhost
Requires Node.js 18+ (22 LTS recommended).

    npm install
    npm start

Open http://localhost:3000  (other port: `PORT=4000 npm start`; PowerShell: `$env:PORT=4000; npm start`)

The database (`hardware_pm.db`) is created and seeded on first run. **Upgrading from an earlier zip?** Just copy the new
files over the old ones and run `npm install` again — the app migrates your existing database automatically (no data loss).
Uploaded files are stored in the `uploads/` folder.

## Features
**Planning**
- **Dashboard** – project progress, team performance, my tasks, due-this-week, overdue, failing tests, open compliance items.
- **Projects** – code, client, product type, revision, PCB layers, board size, MCU, budget, priority, 11-stage lifecycle tracker.
  Any employee can be the project manager.
- **Generate PCB workflow** – creates up to 15 linked tasks (requirements → schematic → Gate A → layout → Gate B → Gerber → BOM →
  bring-up → testing). Choose the project manager and the employee for each role, then customise every step (title, days,
  a different employee, or skip it).
- **Task Board / Timeline (Gantt) / Teams & employees / file attachments with revision**.

**Design data**
- **Components & BOM** – category, designator, package, supplier, lead time, datasheet, alternate part. Export to Excel.
- **BOM Excel Files** – upload the BOM `.xlsx` / `.xls` / `.csv` to the server with a version, revision and status
  (Draft → In Review → Approved → Released). `.xlsx` / `.csv` files can be imported into the parts list automatically.
- **Revisions** – hardware revision history: change log, ECO/ECN, schematic / PCB / firmware versions, BOM file, release control.

**Quality & compliance**
- **Requirements** – auto-numbered (REQ-001…), category, source, standard reference, verification status.
- **Test Cases** – "Generate standard test plan" creates 25 tests for EVT, DVT, PVT and mass production (power-up, boot,
  ESD/EMI, thermal, burn-in, ICT, FCT, firmware programming, final QA…). Record runs per revision and serial number; a failed run
  opens an Issue automatically.
- **Compliance** – track standards (RoHS, REACH, CE, FCC, IEC 61000-4-x, IEC 62368-1, IPC, ISO 9001, BIS, WPC…) with status,
  lab, report/certificate numbers, expiry warnings and evidence file uploads. *The list is a starting checklist — confirm
  applicability with your test lab / certification body.*
- **Traceability** – requirement ↔ test matrix with coverage, plus serial-number back-tracking.

**Manufacturing**
- **Production Batches** – batch / lot, build phase (Prototype, EVT, DVT, PVT, Mass Production), revision, BOM file, vendors,
  PCB date code. Serial numbers are generated automatically and each unit has a status and test history.
- **Trace any serial number** back to its batch, revision, BOM file, vendors and test results.

## Admin console (Admin only)
Sidebar → **Admin Console**. Add and rename employees and project managers (name, designation, role, team), reset passwords,
deactivate leavers (they cannot sign in; history is kept) and set the project manager of every project.
Only Admins can change a project's manager; Project Managers who create a project become its manager automatically.
Passwords must be at least 6 characters.

## Demo logins (change before real use)
| Role | Email | Password |
|---|---|---|
| Admin | admin@example.com | admin123 |
| Project Manager | pm@example.com | pm123 |
| Hardware Engineer | hw@example.com | hw123 |
| PCB Engineer | pcb@example.com | pcb123 |
| Firmware Engineer | fw@example.com | fw123 |
| Testing Engineer | test@example.com | test123 |
| Reviewer | rev@example.com | rev123 |

Set the `SECRET_KEY` env var for anything beyond local use. Theme colours: top of `public/style.css`.

## Troubleshooting
If `npm install` fails building `better-sqlite3`, use Node 22 LTS or install build tools (Windows: Visual Studio Build
Tools "Desktop development with C++"; macOS: `xcode-select --install`; Linux: `build-essential python3`).

## Notes
- Uploaded files (attachments, BOM Excel files, compliance evidence) are stored in `uploads/` — back this folder up with `hardware_pm.db`.
- Rename the demo employees under **Team → Edit** and set real emails / passwords.

## Still to build
Email/deadline notifications, formal ECO/ECN approval workflow, procurement tracking, attendance, advanced reports.
