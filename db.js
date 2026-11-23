const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

const db = new Database(path.join(__dirname, 'hardware_pm.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, name TEXT, email TEXT UNIQUE, password_hash TEXT, role TEXT);
CREATE TABLE IF NOT EXISTS projects(id INTEGER PRIMARY KEY, name TEXT, description TEXT, status TEXT, start_date TEXT, deadline TEXT, manager_id INTEGER);
CREATE TABLE IF NOT EXISTS tasks(id INTEGER PRIMARY KEY, project_id INTEGER, title TEXT, description TEXT, assignee_id INTEGER, status TEXT, priority TEXT, start_date TEXT, deadline TEXT, approval TEXT DEFAULT 'Not Submitted', created TEXT);
CREATE TABLE IF NOT EXISTS comments(id INTEGER PRIMARY KEY, task_id INTEGER, user_id INTEGER, body TEXT, created TEXT);
CREATE TABLE IF NOT EXISTS components(id INTEGER PRIMARY KEY, project_id INTEGER, part_number TEXT, name TEXT, manufacturer TEXT, quantity INTEGER, unit_cost REAL, status TEXT);
CREATE TABLE IF NOT EXISTS reviews(id INTEGER PRIMARY KEY, project_id INTEGER, kind TEXT, title TEXT, reviewer_id INTEGER, status TEXT, notes TEXT, created TEXT);
CREATE TABLE IF NOT EXISTS activity(id INTEGER PRIMARY KEY, user_id INTEGER, action TEXT, created TEXT);
CREATE TABLE IF NOT EXISTS teams(id INTEGER PRIMARY KEY, name TEXT UNIQUE, description TEXT, lead_id INTEGER);
CREATE TABLE IF NOT EXISTS attachments(id INTEGER PRIMARY KEY, task_id INTEGER, filename TEXT, stored TEXT, kind TEXT, size INTEGER, uploaded_by INTEGER, created TEXT);
CREATE TABLE IF NOT EXISTS revisions(id INTEGER PRIMARY KEY, project_id INTEGER, rev TEXT, rev_type TEXT, status TEXT, summary TEXT, eco_ref TEXT, schematic_ver TEXT, pcb_ver TEXT, firmware_ver TEXT, bom_file_id INTEGER, released_date TEXT, created_by INTEGER, created TEXT);
CREATE TABLE IF NOT EXISTS bom_files(id INTEGER PRIMARY KEY, project_id INTEGER, version TEXT, revision TEXT, status TEXT, filename TEXT, stored TEXT, size INTEGER, notes TEXT, rows_imported INTEGER DEFAULT 0, uploaded_by INTEGER, created TEXT);
CREATE TABLE IF NOT EXISTS compliance(id INTEGER PRIMARY KEY, project_id INTEGER, standard TEXT, clause TEXT, description TEXT, applicable TEXT, status TEXT, owner_id INTEGER, test_lab TEXT, report_no TEXT, cert_no TEXT, issue_date TEXT, expiry_date TEXT, evidence TEXT, notes TEXT, created TEXT);
CREATE TABLE IF NOT EXISTS requirements(id INTEGER PRIMARY KEY, project_id INTEGER, req_id TEXT, title TEXT, description TEXT, category TEXT, priority TEXT, source TEXT, standard_ref TEXT, status TEXT, owner_id INTEGER, created TEXT);
CREATE TABLE IF NOT EXISTS test_cases(id INTEGER PRIMARY KEY, project_id INTEGER, tc_id TEXT, title TEXT, category TEXT, phase TEXT, requirement_id INTEGER, compliance_id INTEGER, preconditions TEXT, procedure TEXT, expected TEXT, equipment TEXT, owner_id INTEGER, priority TEXT, created TEXT);
CREATE TABLE IF NOT EXISTS test_runs(id INTEGER PRIMARY KEY, test_case_id INTEGER, result TEXT, revision TEXT, unit_id INTEGER, serial TEXT, measured TEXT, notes TEXT, executed_by INTEGER, executed_on TEXT);
CREATE TABLE IF NOT EXISTS batches(id INTEGER PRIMARY KEY, project_id INTEGER, batch_no TEXT, phase TEXT, revision TEXT, bom_file_id INTEGER, quantity INTEGER, serial_prefix TEXT, pcb_vendor TEXT, assembly_vendor TEXT, date_code TEXT, start_date TEXT, due_date TEXT, status TEXT, notes TEXT, created TEXT);
CREATE TABLE IF NOT EXISTS units(id INTEGER PRIMARY KEY, batch_id INTEGER, serial TEXT UNIQUE, status TEXT, notes TEXT);
`);

// ---- lightweight migrations (safe on existing databases) ----
const addCol = (t, c, def) => {
  if (!db.prepare(`PRAGMA table_info(${t})`).all().some((x) => x.name === c)) db.exec(`ALTER TABLE ${t} ADD COLUMN ${c} ${def}`);
};
[['team_id', 'INTEGER'], ['employee_id', 'TEXT'], ['designation', 'TEXT'], ['phone', 'TEXT'], ['skills', 'TEXT'], ['active', 'INTEGER DEFAULT 1']].forEach(([c, d]) => addCol('users', c, d));
[['code', 'TEXT'], ['client', 'TEXT'], ['product_type', 'TEXT'], ['pcb_layers', 'INTEGER'], ['board_size', 'TEXT'],
 ['mcu', 'TEXT'], ['revision', 'TEXT'], ['budget', 'REAL'], ['priority', 'TEXT'], ['current_stage', 'TEXT']].forEach(([c, d]) => addCol('projects', c, d));
[['stage', 'TEXT'], ['deliverable', 'TEXT'], ['team_id', 'INTEGER'], ['reviewer_id', 'INTEGER'], ['est_hours', 'REAL DEFAULT 0'],
 ['actual_hours', 'REAL DEFAULT 0'], ['progress', 'INTEGER DEFAULT 0'], ['revision', 'TEXT']].forEach(([c, d]) => addCol('tasks', c, d));
[['category', 'TEXT'], ['designator', 'TEXT'], ['package', 'TEXT'], ['supplier', 'TEXT'], ['lead_time_days', 'INTEGER'],
 ['datasheet_url', 'TEXT'], ['alt_part', 'TEXT']].forEach(([c, d]) => addCol('components', c, d));
[['gate', 'TEXT'], ['severity', 'TEXT'], ['due_date', 'TEXT']].forEach(([c, d]) => addCol('reviews', c, d));

[['ref_type', 'TEXT'], ['ref_id', 'INTEGER'], ['revision', 'TEXT']].forEach(([c, d]) => addCol('attachments', c, d));

const now = () => new Date().toISOString().slice(0, 16).replace('T', ' ');

// ---- seed: users / project / tasks (fresh database only) ----
if (!db.prepare('SELECT 1 FROM users').get()) {
  const addUser = db.prepare('INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,?)');
  [
    ['Admin', 'admin@example.com', 'admin123', 'Admin'],
    ['Priya Manager', 'pm@example.com', 'pm123', 'Project Manager'],
    ['Hari Hardware', 'hw@example.com', 'hw123', 'Hardware Engineer'],
    ['Pavan PCB', 'pcb@example.com', 'pcb123', 'PCB Engineer'],
    ['Fiona Firmware', 'fw@example.com', 'fw123', 'Firmware Engineer'],
    ['Tara Tester', 'test@example.com', 'test123', 'Testing Engineer'],
    ['Rita Reviewer', 'rev@example.com', 'rev123', 'Reviewer'],
  ].forEach(([n, e, p, r]) => addUser.run(n, e, bcrypt.hashSync(p, 10), r));

  db.prepare('INSERT INTO projects(name,description,status,start_date,deadline,manager_id) VALUES(?,?,?,?,?,2)')
    .run('Smart Sensor Board v1', 'IoT sensor board with MCU, power supply and BLE.', 'Active', '2026-11-01', '2026-12-31');

  const addTask = db.prepare('INSERT INTO tasks(project_id,title,description,assignee_id,status,priority,start_date,deadline,created) VALUES(1,?,?,?,?,?,?,?,?)');
  [
    ['Power supply schematic', 3, 'In Progress', 'High'],
    ['MCU component selection', 3, 'Completed', 'High'],
    ['PCB component placement', 4, 'Pending', 'Medium'],
    ['PCB routing', 4, 'Not Started', 'Medium'],
    ['Prototype testing', 6, 'Pending', 'High'],
  ].forEach(([t, a, s, p]) => addTask.run(t, '', a, s, p, '2026-11-05', '2026-12-10', now()));

  const addComp = db.prepare('INSERT INTO components(project_id,part_number,name,manufacturer,quantity,unit_cost,status) VALUES(1,?,?,?,?,?,?)');
  addComp.run('STM32F103C8T6', 'ARM Cortex-M3 MCU', 'STMicroelectronics', 10, 2.5, 'Approved');
  addComp.run('AMS1117-3.3', '3.3V LDO Regulator', 'AMS', 20, 0.2, 'Proposed');
}

// ---- seed / backfill: teams ----
if (!db.prepare('SELECT 1 FROM teams').get()) {
  const addTeam = db.prepare('INSERT INTO teams(name,description) VALUES(?,?)');
  [
    ['Hardware Design', 'Architecture, component selection and schematic capture'],
    ['PCB Design & Layout', 'Stack-up, placement, routing, DRC and Gerber/manufacturing files'],
    ['Firmware', 'Embedded firmware and board bring-up'],
    ['Testing & Validation', 'Electrical, functional, reliability and validation testing'],
    ['Review & Quality', 'Design reviews, Gate A / Gate B approvals'],
    ['Project Management', 'Planning, scheduling and delivery'],
  ].forEach(([n, d]) => addTeam.run(n, d));
}
const teamId = (n) => (db.prepare('SELECT id FROM teams WHERE name=?').get(n) || {}).id;
const roleTeam = { 'Hardware Engineer': 'Hardware Design', 'PCB Engineer': 'PCB Design & Layout', 'Firmware Engineer': 'Firmware',
  'Testing Engineer': 'Testing & Validation', 'Reviewer': 'Review & Quality', 'Project Manager': 'Project Management' };
db.prepare('SELECT * FROM users').all().forEach((u) => {
  if (!u.team_id && roleTeam[u.role]) db.prepare('UPDATE users SET team_id=? WHERE id=?').run(teamId(roleTeam[u.role]), u.id);
  if (!u.employee_id) db.prepare('UPDATE users SET employee_id=? WHERE id=?').run('TV-' + String(u.id).padStart(3, '0'), u.id);
  if (!u.designation) db.prepare('UPDATE users SET designation=? WHERE id=?').run(u.role, u.id);
});
db.prepare('SELECT t.id, t.name FROM teams t WHERE lead_id IS NULL').all().forEach((t) => {
  const role = Object.keys(roleTeam).find((r) => roleTeam[r] === t.name);
  const lead = role && db.prepare('SELECT id FROM users WHERE role=? ORDER BY id LIMIT 1').get(role);
  if (lead) db.prepare('UPDATE teams SET lead_id=? WHERE id=?').run(lead.id, t.id);
});

// ---- backfill: demo project + demo tasks with the richer fields ----
db.prepare(`UPDATE projects SET code='TV-SSB-001', client='Internal R&D', product_type='IoT Sensor Board', pcb_layers=4,
  board_size='60 x 40 mm', mcu='STM32F103C8T6', revision='A', budget=5000, priority='High', current_stage='Schematic Design'
  WHERE id=1 AND code IS NULL AND name='Smart Sensor Board v1'`).run();
const demo = {
  'MCU component selection': ['Component Selection', 'Component Selection', 'Hardware Design', '2026-11-02', '2026-11-08', 100, 24],
  'Power supply schematic': ['Schematic Design', 'Schematic', 'Hardware Design', '2026-11-09', '2026-11-27', 60, 40],
  'PCB component placement': ['PCB Layout', 'PCB Placement', 'PCB Design & Layout', '2026-11-28', '2026-12-08', 0, 32],
  'PCB routing': ['PCB Layout', 'PCB Routing', 'PCB Design & Layout', '2026-12-09', '2026-12-20', 0, 48],
  'Prototype testing': ['Testing', 'Test Report', 'Testing & Validation', '2026-12-21', '2026-12-31', 0, 40],
};
db.prepare('SELECT * FROM tasks WHERE stage IS NULL').all().forEach((t) => {
  const d = demo[t.title]; if (!d) return;
  db.prepare('UPDATE tasks SET stage=?, deliverable=?, team_id=?, start_date=?, deadline=?, progress=?, est_hours=?, revision=?, reviewer_id=7 WHERE id=?')
    .run(d[0], d[1], teamId(d[2]), d[3], d[4], d[5], d[6], 'A', t.id);
});
db.prepare("UPDATE components SET category='IC', package='LQFP-48', supplier='Digi-Key', lead_time_days=14, designator='U1' WHERE part_number='STM32F103C8T6' AND category IS NULL").run();
db.prepare("UPDATE components SET category='IC', package='SOT-223', supplier='Mouser', lead_time_days=7, designator='U2' WHERE part_number='AMS1117-3.3' AND category IS NULL").run();

// ---- demo data for revisions / requirements / compliance (only when empty) ----
if (db.prepare("SELECT 1 FROM projects WHERE id=1 AND code='TV-SSB-001'").get()) {
  if (!db.prepare('SELECT 1 FROM revisions').get()) {
    db.prepare(`INSERT INTO revisions(project_id,rev,rev_type,status,summary,eco_ref,schematic_ver,pcb_ver,firmware_ver,created_by,created)
      VALUES(1,'A','Prototype','Draft','Initial prototype release: MCU, LDO power supply and BLE module.','','v0.1','v0.1','v0.0.1',2,?)`).run(now());
  }
  if (!db.prepare('SELECT 1 FROM requirements').get()) {
    const r = db.prepare('INSERT INTO requirements(project_id,req_id,title,description,category,priority,source,standard_ref,status,owner_id,created) VALUES(1,?,?,?,?,?,?,?,?,3,?)');
    r.run('REQ-001', 'Operating supply range', 'Board shall operate from 3.3 V regulated rail fed by 5 V input (4.5–5.5 V).', 'Electrical', 'High', 'Customer', '', 'Approved', now());
    r.run('REQ-002', 'Operating temperature', 'Board shall operate from -20 °C to +60 °C.', 'Environmental', 'High', 'Customer', 'IEC 60068-2', 'Approved', now());
    r.run('REQ-003', 'ESD protection', 'Exposed connectors shall withstand ±4 kV contact discharge.', 'Compliance', 'Medium', 'Standard', 'IEC 61000-4-2', 'Draft', now());
  }
  if (!db.prepare('SELECT 1 FROM compliance').get()) {
    const c = db.prepare("INSERT INTO compliance(project_id,standard,clause,description,applicable,status,created) VALUES(1,?,?,?,'Yes',?,?)");
    c.run('RoHS (EU 2011/65/EU + 2015/863)', 'Restricted substances', 'All parts and PCB materials free of restricted substances; supplier declarations on file.', 'In Progress', now());
    c.run('IEC 61000-4-2 (ESD immunity)', 'Contact ±4 kV / Air ±8 kV', 'ESD immunity of exposed ports.', 'Not Started', now());
  }
}

module.exports = { db, now };
