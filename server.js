const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { db, now } = require('./db');

// ---------- constants ----------
const ROLES = ['Admin', 'Project Manager', 'Hardware Engineer', 'PCB Engineer', 'Firmware Engineer', 'Testing Engineer', 'Reviewer'];
const STATUSES = ['Not Started', 'Pending', 'In Progress', 'Completed'];
const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];
const APPROVALS = ['Not Submitted', 'Awaiting Review', 'Approved', 'Rejected'];
const PROJECT_STATUS = ['Planning', 'Active', 'On Hold', 'Completed'];
const COMP_STATUS = ['Proposed', 'Approved', 'Ordered', 'In Stock', 'Obsolete'];
const COMP_CATEGORIES = ['IC / MCU', 'Resistor', 'Capacitor', 'Inductor', 'Diode / LED', 'Transistor / MOSFET', 'Connector', 'Sensor', 'Crystal / Oscillator', 'Power / Regulator', 'Module', 'Mechanical', 'Other'];
const REVIEW_TYPES = ['Review', 'Issue'];
const REVIEW_STATUS = ['Open', 'Approved', 'Rejected', 'Resolved'];
const GATES = ['N/A', 'Gate A – Schematic review', 'Gate B – PCB layout review', 'Final – Production release'];
const SEVERITIES = ['Low', 'Medium', 'High', 'Critical'];
const MANAGERS = ['Admin', 'Project Manager'];
const STAGES = ['Requirements', 'Architecture', 'Component Selection', 'Schematic Design', 'PCB Layout', 'Design Review',
  'Fabrication', 'Assembly', 'Prototype', 'Testing', 'Production'];
const DELIVERABLES = ['Requirement Spec', 'Block Diagram', 'Power Budget', 'Component Selection', 'Schematic', 'Stack-up',
  'PCB Placement', 'PCB Routing', 'DRC/ERC Report', 'Gerber Files', 'Drill Files', 'BOM', 'Assembly Drawing', 'Review Report',
  'Firmware', 'Test Plan', 'Test Report', 'Datasheet', 'Other'];
const ATTACH_KINDS = ['Schematic', 'PCB Layout', 'Gerber', 'Drill', 'BOM', 'Datasheet', 'Test Report', 'Firmware', 'Spec / Document', 'Other'];

// Standard PCB design workflow (used by "Generate PCB workflow")
const WORKFLOW = [
  { title: 'Requirements & specification', stage: 'Requirements', del: 'Requirement Spec', role: 'hw', days: 3, pri: 'High', desc: 'Capture requirements, scope and specifications.' },
  { title: 'Block diagram & power budget', stage: 'Architecture', del: 'Block Diagram', role: 'hw', days: 3, pri: 'Medium', desc: 'Block diagram, interfaces and power budget.' },
  { title: 'Component selection', stage: 'Component Selection', del: 'Component Selection', role: 'hw', days: 4, pri: 'High', desc: 'Select ICs, passives, connectors and sensors; check availability.' },
  { title: 'Schematic capture', stage: 'Schematic Design', del: 'Schematic', role: 'hw', days: 7, pri: 'High', desc: 'Circuit design and library creation.' },
  { title: 'ERC & library check', stage: 'Schematic Design', del: 'DRC/ERC Report', role: 'hw', days: 2, pri: 'Medium', desc: 'Run electrical rule check and fix violations.' },
  { title: 'Gate A – schematic review', stage: 'Design Review', del: 'Review Report', role: 'rev', days: 2, pri: 'High', desc: 'Gate A approval of the schematic.' },
  { title: 'PCB stack-up & design rules', stage: 'PCB Layout', del: 'Stack-up', role: 'pcb', days: 2, pri: 'Medium', desc: 'Define layer stack-up, impedance and design rules.' },
  { title: 'PCB component placement', stage: 'PCB Layout', del: 'PCB Placement', role: 'pcb', days: 4, pri: 'Medium', desc: 'Place components per mechanical and thermal constraints.' },
  { title: 'PCB routing', stage: 'PCB Layout', del: 'PCB Routing', role: 'pcb', days: 7, pri: 'High', desc: 'Route traces, power planes and critical nets.' },
  { title: 'PCB DRC check', stage: 'PCB Layout', del: 'DRC/ERC Report', role: 'pcb', days: 2, pri: 'Medium', desc: 'Run design rule check and resolve errors.' },
  { title: 'Gate B – PCB layout review', stage: 'Design Review', del: 'Review Report', role: 'rev', days: 2, pri: 'High', desc: 'Gate B approval of the PCB layout.' },
  { title: 'Gerber & drill file generation', stage: 'Fabrication', del: 'Gerber Files', role: 'pcb', days: 2, pri: 'High', desc: 'Generate Gerber, drill and manufacturing files.' },
  { title: 'BOM approval & fabrication release', stage: 'Fabrication', del: 'BOM', role: 'hw', days: 2, pri: 'High', desc: 'Final BOM, procurement and release to fabrication.' },
  { title: 'Prototype bring-up', stage: 'Prototype', del: 'Other', role: 'hw', days: 5, pri: 'High', desc: 'Bring-up, debugging and rework.' },
  { title: 'Prototype testing & validation', stage: 'Testing', del: 'Test Report', role: 'test', days: 7, pri: 'High', desc: 'Electrical, functional and reliability testing.' },
];

// ---------- upload setup ----------
const UPLOAD_DIR = path.join(__dirname, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const ALLOWED_EXT = new Set(['.pdf', '.zip', '.rar', '.7z', '.gbr', '.ger', '.gtl', '.gbl', '.gts', '.gbs', '.gto', '.gbo', '.gko', '.gm1',
  '.drl', '.xln', '.brd', '.sch', '.kicad_pcb', '.kicad_sch', '.kicad_pro', '.pcbdoc', '.schdoc', '.dxf', '.step', '.stp', '.png', '.jpg',
  '.jpeg', '.xlsx', '.xls', '.csv', '.txt', '.md', '.docx', '.doc', '.hex', '.bin', '.elf']);
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => cb(null, Date.now() + '-' + Math.random().toString(36).slice(2, 8) + path.extname(file.originalname).toLowerCase()),
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, ALLOWED_EXT.has(path.extname(file.originalname).toLowerCase())),
});

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SECRET_KEY || 'change-me-in-production',
  resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 12 },
}));

// ---------- helpers ----------
const MS = 86400000;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const today = () => new Date().toISOString().slice(0, 10);
const dnum = (s) => Math.floor(Date.parse(s + 'T00:00:00Z') / MS);
const dstr = (n) => new Date(n * MS).toISOString().slice(0, 10);
const dlabel = (n) => { const d = new Date(n * MS); return `${MON[d.getUTCMonth()]} ${d.getUTCDate()}`; };
const slug = (s) => 'b-' + String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
const fmtSize = (b) => (b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');
const log = (req, action) =>
  db.prepare('INSERT INTO activity(user_id,action,created) VALUES(?,?,?)').run(req.session.uid || null, action, now());
const all = (sql, ...a) => db.prepare(sql).all(...a);
const get = (sql, ...a) => db.prepare(sql).get(...a);
const run = (sql, ...a) => db.prepare(sql).run(...a);
const F = (name, label, type = 'text', options = [], value = '', required = true, hint = '') => ({
  name, label, type, value: value ?? '', required, hint,
  options: options.map((o) => (Array.isArray(o) ? o : [o, o])),
});
const blank = [['', '— none —']];
const usersOpts = (withBlank, keep) => (withBlank ? blank : []).concat(all('SELECT * FROM users WHERE active IS NOT 0 OR id=? ORDER BY name', keep || 0)
  .map((u) => [u.id, `${u.name} (${u.role})${u.active === 0 ? ' — inactive' : ''}`]));
const usersByRole = (...roles) => {
  const every = all('SELECT * FROM users WHERE active IS NOT 0 ORDER BY name');
  const m = every.filter((u) => roles.includes(u.role));
  return (m.length ? m : every).map((u) => [u.id, `${u.name} (${u.role})`]);
};
const projectOpts = () => all('SELECT * FROM projects ORDER BY name').map((p) => [p.id, p.name]);
const teamOpts = (withBlank) => (withBlank ? blank : []).concat(all('SELECT * FROM teams ORDER BY name').map((t) => [t.id, t.name]));
const formPage = (res, title, fields, back, intro = '') => res.render('form', { title, fields, back, intro });
const safeUrl = (u) => (/^https?:\/\//i.test(String(u || '').trim()) ? String(u).trim() : '');
const num = (v, d = 0) => (Number.isFinite(+v) && v !== '' ? +v : d);
const nul = (v) => (v === '' || v === undefined ? null : v);
const denied = (res) => res.status(403).render('error', { msg: "You don't have permission for this action." });
const notFound = (res) => res.status(404).render('error', { msg: 'Not found.' });

app.use((req, res, next) => {
  req.user = req.session.uid ? get('SELECT * FROM users WHERE id=?', req.session.uid) : null;
  if (req.user && req.user.active === 0) { req.user = null; delete req.session.uid; }
  Object.assign(res.locals, {
    me: req.user, today: today(), MANAGERS, slug, fmtSize, path: req.path,
    flash: req.session.flash || null,
  });
  delete req.session.flash;
  next();
});
const loginRequired = (req, res, next) => (req.user ? next() : res.redirect('/login'));
const rolesRequired = (...roles) => (req, res, next) => {
  if (!req.user) return res.redirect('/login');
  if (!roles.includes(req.user.role)) return denied(res);
  next();
};

// ---------- auth ----------
app.get('/login', (req, res) => res.render('login'));
app.post('/login', (req, res) => {
  const u = get('SELECT * FROM users WHERE email=?', String(req.body.email || '').trim().toLowerCase());
  if (u && bcrypt.compareSync(req.body.password || '', u.password_hash)) {
    if (u.active === 0) { req.session.flash = 'This account is inactive. Please contact an administrator.'; return res.redirect('/login'); }
    req.session.regenerate(() => { req.session.uid = u.id; log(req, 'Logged in'); res.redirect('/'); });
  } else { req.session.flash = 'Invalid email or password.'; res.redirect('/login'); }
});
app.get('/logout', (req, res) => req.session.destroy(() => res.redirect('/login')));

// ---------- task query helper ----------
const TASK_SELECT = `SELECT t.*, u.name aname, p.name pname, tm.name tname, rv.name rvname
  FROM tasks t LEFT JOIN users u ON u.id=t.assignee_id JOIN projects p ON p.id=t.project_id
  LEFT JOIN teams tm ON tm.id=t.team_id LEFT JOIN users rv ON rv.id=t.reviewer_id`;
function taskRows({ pid, assignee, team } = {}) {
  const cond = [], args = [];
  if (pid) { cond.push('t.project_id=?'); args.push(pid); }
  if (assignee) { cond.push('t.assignee_id=?'); args.push(assignee); }
  if (team) { cond.push('t.team_id=?'); args.push(team); }
  return all(`${TASK_SELECT} ${cond.length ? 'WHERE ' + cond.join(' AND ') : ''} ORDER BY t.start_date, t.deadline`, ...args);
}

// ---------- dashboard ----------
app.get('/', loginRequired, (req, res) => {
  const projects = all(`SELECT p.*, COUNT(t.id) total, COALESCE(SUM(t.status='Completed'),0) done
                        FROM projects p LEFT JOIN tasks t ON t.project_id=p.id GROUP BY p.id`);
  const stats = {};
  STATUSES.forEach((s) => (stats[s] = get('SELECT COUNT(*) c FROM tasks WHERE status=?', s).c));
  const overdue = all(`SELECT t.*, u.name aname FROM tasks t LEFT JOIN users u ON u.id=t.assignee_id
                       WHERE t.deadline<? AND t.status!='Completed' ORDER BY t.deadline`, today());
  const upcoming = all(`SELECT t.*, u.name aname FROM tasks t LEFT JOIN users u ON u.id=t.assignee_id
                        WHERE t.deadline>=? AND t.deadline<=? AND t.status!='Completed' ORDER BY t.deadline`, today(), dstr(dnum(today()) + 7));
  const mine = all(`SELECT t.*, p.name pname FROM tasks t JOIN projects p ON p.id=t.project_id
                    WHERE t.assignee_id=? AND t.status!='Completed' ORDER BY t.deadline`, req.user.id);
  const teamPerf = all(`SELECT tm.name, COUNT(t.id) total, COALESCE(SUM(t.status='Completed'),0) done,
                        COALESCE(SUM(t.est_hours),0) est, COALESCE(SUM(t.actual_hours),0) actual
                        FROM teams tm LEFT JOIN tasks t ON t.team_id=tm.id GROUP BY tm.id ORDER BY tm.name`);
  const openIssues = get("SELECT COUNT(*) c FROM reviews WHERE status='Open'").c;
  const failedTests = get(`SELECT COUNT(*) c FROM test_cases tc WHERE (SELECT result FROM test_runs WHERE test_case_id=tc.id ORDER BY id DESC LIMIT 1)='Fail'`).c;
  const complianceOpen = get("SELECT COUNT(*) c FROM compliance WHERE applicable!='No' AND status NOT IN ('Compliant','Waived','N/A')").c;
  res.render('dashboard', { projects, stats, overdue, upcoming, mine, teamPerf, openIssues, failedTests, complianceOpen });
});

// ---------- projects ----------
const projectFields = (v = {}, me) => [
  F('name', 'Project name', 'text', [], v.name),
  F('code', 'Project code', 'text', [], v.code, false, 'e.g. TV-SSB-001'),
  F('client', 'Client / customer', 'text', [], v.client, false),
  F('product_type', 'Product type', 'text', [], v.product_type, false, 'e.g. IoT sensor board'),
  F('description', 'Description / scope', 'textarea', [], v.description, false),
  F('status', 'Status', 'select', PROJECT_STATUS, v.status || 'Planning'),
  F('priority', 'Priority', 'select', PRIORITIES, v.priority || 'Medium'),
  F('current_stage', 'Current stage', 'select', STAGES, v.current_stage || 'Requirements'),
  F('revision', 'Hardware revision', 'text', [], v.revision || 'A', false),
  F('pcb_layers', 'PCB layers', 'number', [], v.pcb_layers, false),
  F('board_size', 'Board size', 'text', [], v.board_size, false, 'e.g. 60 x 40 mm'),
  F('mcu', 'Main MCU / SoC', 'text', [], v.mcu, false),
  F('budget', 'Budget (USD)', 'number', [], v.budget, false),
  F('manager_id', 'Project manager', 'select', usersOpts(false, v.manager_id), v.manager_id || me.id, true, 'Only an Admin can change the project manager.'),
  F('start_date', 'Start date', 'date', [], v.start_date || today()),
  F('deadline', 'Deadline', 'date', [], v.deadline),
].filter((f) => f.name !== 'manager_id' || (me && me.role === 'Admin'));
app.get('/projects', loginRequired, (req, res) => {
  const projects = all(`SELECT p.*, u.name mname, COUNT(t.id) total, COALESCE(SUM(t.status='Completed'),0) done
                        FROM projects p LEFT JOIN users u ON u.id=p.manager_id
                        LEFT JOIN tasks t ON t.project_id=p.id GROUP BY p.id`);
  res.render('projects', { projects });
});
app.get('/projects/new', rolesRequired(...MANAGERS), (req, res) => formPage(res, 'New project', projectFields({}, req.user), '/projects'));
const projectArgs = (f) => [f.name, f.description, f.status, f.start_date, f.deadline, f.manager_id, f.code, f.client, f.product_type,
  nul(f.pcb_layers) && +f.pcb_layers, f.board_size, f.mcu, f.revision, nul(f.budget) && +f.budget, f.priority, f.current_stage];
const PROJ_COLS = 'name,description,status,start_date,deadline,manager_id,code,client,product_type,pcb_layers,board_size,mcu,revision,budget,priority,current_stage';
app.post('/projects/new', rolesRequired(...MANAGERS), (req, res) => {
  const f = req.body;
  if (req.user.role !== 'Admin') f.manager_id = req.user.id;
  if (f.deadline < f.start_date) { res.locals.flash = 'Deadline cannot be before the start date.'; return formPage(res, 'New project', projectFields(f, req.user), '/projects'); }
  const r = run(`INSERT INTO projects(${PROJ_COLS}) VALUES(${PROJ_COLS.split(',').map(() => '?').join(',')})`, ...projectArgs(f));
  log(req, `Created project '${f.name}'`);
  res.redirect('/projects/' + r.lastInsertRowid);
});
app.get('/projects/:id/edit', rolesRequired(...MANAGERS), (req, res) => {
  const p = get('SELECT * FROM projects WHERE id=?', +req.params.id); if (!p) return notFound(res);
  formPage(res, 'Edit project', projectFields(p, req.user), '/projects/' + p.id);
});
app.post('/projects/:id/edit', rolesRequired(...MANAGERS), (req, res) => {
  const p = get('SELECT * FROM projects WHERE id=?', +req.params.id); if (!p) return notFound(res);
  const f = req.body;
  if (req.user.role !== 'Admin') f.manager_id = p.manager_id;
  if (f.deadline < f.start_date) { res.locals.flash = 'Deadline cannot be before the start date.'; return formPage(res, 'Edit project', projectFields(f, req.user), '/projects/' + p.id); }
  run(`UPDATE projects SET ${PROJ_COLS.split(',').map((c) => c + '=?').join(',')} WHERE id=?`, ...projectArgs(f), p.id);
  log(req, `Updated project '${f.name}'`); res.redirect('/projects/' + p.id);
});
app.get('/projects/:id', loginRequired, (req, res) => {
  const pid = +req.params.id;
  const p = get('SELECT p.*, u.name mname FROM projects p LEFT JOIN users u ON u.id=p.manager_id WHERE p.id=?', pid);
  if (!p) return notFound(res);
  const tasks = taskRows({ pid });
  const comps = all('SELECT * FROM components WHERE project_id=?', pid);
  const revs = all('SELECT r.*, u.name rname FROM reviews r LEFT JOIN users u ON u.id=r.reviewer_id WHERE project_id=?', pid);
  const docs = all(`SELECT a.*, t.title ttitle, u.name uname FROM attachments a JOIN tasks t ON t.id=a.task_id
                    LEFT JOIN users u ON u.id=a.uploaded_by WHERE t.project_id=? ORDER BY a.id DESC`, pid);
  const stages = STAGES.map((s) => {
    const ts = tasks.filter((t) => t.stage === s); const done = ts.filter((t) => t.status === 'Completed').length;
    const status = !ts.length ? 'No tasks' : done === ts.length ? 'Completed' : ts.some((t) => t.status === 'In Progress' || t.status === 'Completed') ? 'In Progress' : 'Not Started';
    const starts = ts.map((t) => t.start_date).filter(Boolean).sort(), ends = ts.map((t) => t.deadline).filter(Boolean).sort();
    return { name: s, count: ts.length, done, status, from: starts[0], to: ends[ends.length - 1] };
  });
  const cost = comps.reduce((s, c) => s + (c.quantity || 0) * (c.unit_cost || 0), 0);
  const hours = tasks.reduce((s, t) => s + (t.est_hours || 0), 0), actual = tasks.reduce((s, t) => s + (t.actual_hours || 0), 0);
  const revisions = all('SELECT r.*, b.filename bom_name FROM revisions r LEFT JOIN bom_files b ON b.id=r.bom_file_id WHERE r.project_id=? ORDER BY r.id DESC', pid);
  const compl = all('SELECT * FROM compliance WHERE project_id=? ORDER BY standard', pid);
  const bomFiles = all('SELECT * FROM bom_files WHERE project_id=? ORDER BY id DESC', pid);
  const tcSum = get(`SELECT COUNT(*) total, COALESCE(SUM(lr='Pass'),0) pass, COALESCE(SUM(lr='Fail'),0) fail, COALESCE(SUM(lr IS NULL),0) notrun FROM
    (SELECT (SELECT result FROM test_runs WHERE test_case_id=tc.id ORDER BY id DESC LIMIT 1) lr FROM test_cases tc WHERE project_id=?)`, pid);
  const batches = all("SELECT b.*, (SELECT COUNT(*) FROM units WHERE batch_id=b.id) units, (SELECT COUNT(*) FROM units WHERE batch_id=b.id AND status='Passed') passed FROM batches b WHERE project_id=? ORDER BY id DESC", pid);
  res.render('project_detail', { p, tasks, comps, revs, docs, stages, cost, hours, actual, revisions, compl, bomFiles, tcSum, batches });
});

// ---- generate standard PCB workflow with timeline (fully customisable) ----
const defaultUser = (role) => (get('SELECT id FROM users WHERE role=? ORDER BY id LIMIT 1', role) || {}).id;
const ROLE_LABEL = { hw: 'Hardware engineer', pcb: 'PCB engineer', rev: 'Reviewer', test: 'Testing engineer' };
const ROLE_NAME = { hw: 'Hardware Engineer', pcb: 'PCB Engineer', rev: 'Reviewer', test: 'Testing Engineer' };
const workflowPage = (res, p) => res.render('workflow', {
  p, WORKFLOW, ROLE_LABEL, employees: usersOpts(),
  defaults: { pm: p.manager_id || defaultUser('Project Manager'), hw: defaultUser('Hardware Engineer'), pcb: defaultUser('PCB Engineer'), rev: defaultUser('Reviewer'), test: defaultUser('Testing Engineer') },
});
app.get('/projects/:id/workflow', rolesRequired(...MANAGERS), (req, res) => {
  const p = get('SELECT * FROM projects WHERE id=?', +req.params.id); if (!p) return notFound(res);
  workflowPage(res, p);
});
app.post('/projects/:id/workflow', rolesRequired(...MANAGERS), (req, res) => {
  const p = get('SELECT * FROM projects WHERE id=?', +req.params.id); if (!p) return notFound(res);
  const f = req.body; let cursor = dnum(f.start_date);
  const fail = (m) => { req.session.flash = m; res.redirect(`/projects/${p.id}/workflow`); };
  if (Number.isNaN(cursor)) return fail('Please choose a valid start date.');
  const exists = (id) => !!get('SELECT 1 FROM users WHERE id=?', +id);
  const who = { hw: +f.hw_id, pcb: +f.pcb_id, rev: +f.rev_id, test: +f.test_id };
  if (!Object.values(who).every(exists)) return fail('Please choose an employee for every role.');
  const steps = WORKFLOW.map((w, i) => ({
    w, on: f['inc_' + i] === 'on', title: String(f['title_' + i] || '').trim() || w.title,
    days: Math.max(1, Math.min(120, Math.round(num(f['days_' + i], w.days)))), uid: f['who_' + i] ? +f['who_' + i] : who[w.role],
  })).filter((x) => x.on);
  if (!steps.length) return fail('Select at least one step.');
  if (!steps.every((x) => exists(x.uid))) return fail('One of the selected employees no longer exists.');
  const ins = db.prepare(`INSERT INTO tasks(project_id,title,description,assignee_id,status,priority,start_date,deadline,created,stage,deliverable,team_id,reviewer_id,est_hours,revision)
                          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  db.transaction(() => {
    if (req.user.role === 'Admin' && exists(f.manager_id)) run('UPDATE projects SET manager_id=? WHERE id=?', +f.manager_id, p.id);
    steps.forEach((x) => {
      const start = cursor, end = cursor + x.days - 1;
      const team = (get('SELECT team_id FROM users WHERE id=?', x.uid) || {}).team_id || null;
      ins.run(p.id, x.title, x.w.desc, x.uid, 'Not Started', x.w.pri, dstr(start), dstr(end), now(), x.w.stage, x.w.del, team, who.rev, x.days * 6, p.revision || 'A');
      cursor = end + 1;
    });
  })();
  log(req, `Generated PCB workflow (${steps.length} tasks) for '${p.name}'`);
  req.session.flash = `Created ${steps.length} tasks. Review them on the timeline.`;
  res.redirect('/timeline?project=' + p.id);
});

// ---------- tasks ----------
const taskFields = (v = {}) => [
  F('project_id', 'Project', 'select', projectOpts(), v.project_id),
  F('stage', 'Development stage', 'select', STAGES, v.stage || 'Schematic Design'),
  F('title', 'Task title', 'text', [], v.title),
  F('deliverable', 'Deliverable', 'select', DELIVERABLES, v.deliverable || 'Schematic'),
  F('description', 'Description / scope', 'textarea', [], v.description, false),
  F('assignee_id', 'Assigned employee', 'select', usersOpts(false, v.assignee_id), v.assignee_id),
  F('team_id', 'Team', 'select', teamOpts(true), v.team_id, false, 'Leave blank to use the employee’s team.'),
  F('reviewer_id', 'Reviewer / approver', 'select', usersOpts(true, v.reviewer_id), v.reviewer_id, false),
  F('priority', 'Priority', 'select', PRIORITIES, v.priority || 'Medium'),
  F('status', 'Status', 'select', STATUSES, v.status || 'Not Started'),
  F('start_date', 'Start date', 'date', [], v.start_date || today()),
  F('deadline', 'Deadline', 'date', [], v.deadline),
  F('est_hours', 'Estimated hours', 'number', [], v.est_hours, false),
  F('revision', 'Revision', 'text', [], v.revision || 'A', false),
];
const taskArgs = (f) => [f.project_id, f.title, f.description, f.assignee_id, f.status, f.priority, f.start_date, f.deadline, f.stage, f.deliverable,
  nul(f.team_id) || (get('SELECT team_id FROM users WHERE id=?', f.assignee_id) || {}).team_id || null, nul(f.reviewer_id), num(f.est_hours), f.revision || 'A'];
const TASK_COLS = 'project_id,title,description,assignee_id,status,priority,start_date,deadline,stage,deliverable,team_id,reviewer_id,est_hours,revision';

app.get('/tasks', loginRequired, (req, res) => {
  const pid = req.query.project ? +req.query.project : null, assignee = req.query.assignee ? +req.query.assignee : null;
  const rows = taskRows({ pid, assignee });
  const board = {}; STATUSES.forEach((s) => (board[s] = rows.filter((r) => r.status === s)));
  res.render('tasks', { board, projects: all('SELECT * FROM projects'), users: all('SELECT id,name FROM users ORDER BY name'), pid, assignee });
});
app.get('/tasks/new', rolesRequired(...MANAGERS), (req, res) =>
  formPage(res, 'New task', taskFields({ project_id: req.query.project, assignee_id: req.query.assignee }), '/tasks'));
app.post('/tasks/new', rolesRequired(...MANAGERS), (req, res) => {
  const f = req.body;
  if (f.deadline < f.start_date) { res.locals.flash = 'Deadline cannot be before the start date.'; return formPage(res, 'New task', taskFields(f), '/tasks'); }
  const r = run(`INSERT INTO tasks(${TASK_COLS},created) VALUES(${TASK_COLS.split(',').map(() => '?').join(',')},?)`, ...taskArgs(f), now());
  log(req, `Created task '${f.title}'`); res.redirect('/tasks/' + r.lastInsertRowid);
});
app.get('/tasks/:id/edit', rolesRequired(...MANAGERS), (req, res) => {
  const t = get('SELECT * FROM tasks WHERE id=?', +req.params.id); if (!t) return notFound(res);
  formPage(res, 'Edit / reassign task', taskFields(t), '/tasks/' + t.id);
});
app.post('/tasks/:id/edit', rolesRequired(...MANAGERS), (req, res) => {
  const t = get('SELECT * FROM tasks WHERE id=?', +req.params.id); if (!t) return notFound(res);
  const f = req.body;
  if (f.deadline < f.start_date) { res.locals.flash = 'Deadline cannot be before the start date.'; return formPage(res, 'Edit / reassign task', taskFields(f), '/tasks/' + t.id); }
  run(`UPDATE tasks SET ${TASK_COLS.split(',').map((c) => c + '=?').join(',')} WHERE id=?`, ...taskArgs(f), t.id);
  log(req, `Updated task '${f.title}'`); res.redirect('/tasks/' + t.id);
});
const getTask = (tid) => get(`${TASK_SELECT} WHERE t.id=?`, tid);
app.get('/tasks/:id', loginRequired, (req, res) => {
  const t = getTask(+req.params.id); if (!t) return notFound(res);
  const u = req.user, isMgr = MANAGERS.includes(u.role);
  const comments = all('SELECT c.*, u.name uname FROM comments c JOIN users u ON u.id=c.user_id WHERE task_id=? ORDER BY c.id', t.id);
  const files = all('SELECT a.*, u.name uname FROM attachments a LEFT JOIN users u ON u.id=a.uploaded_by WHERE task_id=? ORDER BY a.id DESC', t.id);
  res.render('task_detail', {
    t, comments, files, STATUSES, APPROVALS, ATTACH_KINDS, isMgr,
    canStatus: isMgr || t.assignee_id === u.id,
    canReview: isMgr || u.role === 'Reviewer' || t.reviewer_id === u.id,
    canUpload: isMgr || t.assignee_id === u.id || t.reviewer_id === u.id || u.role === 'Reviewer',
  });
});
app.post('/tasks/:id', loginRequired, (req, res) => {
  const t = getTask(+req.params.id); if (!t) return notFound(res);
  const u = req.user, isMgr = MANAGERS.includes(u.role);
  const canStatus = isMgr || t.assignee_id === u.id, canReview = isMgr || u.role === 'Reviewer' || t.reviewer_id === u.id;
  const { action } = req.body;
  if (action === 'comment') {
    const body = (req.body.body || '').trim();
    if (body) { run('INSERT INTO comments(task_id,user_id,body,created) VALUES(?,?,?,?)', t.id, u.id, body, now()); log(req, `Commented on '${t.title}'`); }
  } else if (action === 'progress' && canStatus) {
    let { status } = req.body; let progress = Math.min(100, Math.max(0, Math.round(num(req.body.progress))));
    if (!STATUSES.includes(status)) return denied(res);
    if (status === 'Completed') progress = 100;
    else if (progress === 100) status = 'Completed';
    else if (progress > 0 && ['Not Started', 'Pending'].includes(status)) status = 'In Progress';
    run('UPDATE tasks SET status=?, progress=?, actual_hours=?, revision=? WHERE id=?', status, progress, Math.max(0, num(req.body.actual_hours)), req.body.revision || t.revision, t.id);
    if (status === 'Completed' && t.approval === 'Not Submitted') run("UPDATE tasks SET approval='Awaiting Review' WHERE id=?", t.id);
    log(req, `Task '${t.title}' -> ${status} (${progress}%)`);
  } else if (action === 'approval' && canReview) {
    if (!APPROVALS.includes(req.body.approval)) return denied(res);
    run('UPDATE tasks SET approval=? WHERE id=?', req.body.approval, t.id);
    log(req, `Task '${t.title}' approval -> ${req.body.approval}`);
  } else if (action === 'delete' && isMgr) {
    all('SELECT * FROM attachments WHERE task_id=?', t.id).forEach((a) => fs.rmSync(path.join(UPLOAD_DIR, path.basename(a.stored)), { force: true }));
    run('DELETE FROM attachments WHERE task_id=?', t.id); run('DELETE FROM comments WHERE task_id=?', t.id); run('DELETE FROM tasks WHERE id=?', t.id);
    log(req, `Deleted task '${t.title}'`); return res.redirect('/tasks');
  } else return denied(res);
  res.redirect('/tasks/' + t.id);
});

// ---- attachments (schematic / PCB / Gerber / datasheet files) ----
app.post('/tasks/:id/attachments', loginRequired, (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) { req.session.flash = err.code === 'LIMIT_FILE_SIZE' ? 'File too large (max 50 MB).' : 'Upload failed.'; return res.redirect('/tasks/' + req.params.id); }
    next();
  });
}, (req, res) => {
  const t = getTask(+req.params.id); const u = req.user;
  const allowed = t && (MANAGERS.includes(u.role) || t.assignee_id === u.id || t.reviewer_id === u.id || u.role === 'Reviewer');
  if (!t || !allowed) { if (req.file) fs.rmSync(req.file.path, { force: true }); return t ? denied(res) : notFound(res); }
  if (!req.file) { req.session.flash = 'No file uploaded, or that file type is not allowed.'; return res.redirect('/tasks/' + t.id); }
  const kind = ATTACH_KINDS.includes(req.body.kind) ? req.body.kind : 'Other';
  run("INSERT INTO attachments(task_id,filename,stored,kind,size,uploaded_by,created,ref_type,ref_id,revision) VALUES(?,?,?,?,?,?,?,'task',?,?)",
    t.id, path.basename(req.file.originalname), req.file.filename, kind, req.file.size, u.id, now(), t.id, String(req.body.revision || '').trim());
  log(req, `Uploaded ${kind} file '${req.file.originalname}' to '${t.title}'`);
  res.redirect('/tasks/' + t.id);
});
app.get('/attachments/:id', loginRequired, (req, res) => {
  const a = get('SELECT * FROM attachments WHERE id=?', +req.params.id); if (!a) return notFound(res);
  res.download(path.join(UPLOAD_DIR, path.basename(a.stored)), a.filename);
});
app.post('/attachments/:id/delete', loginRequired, (req, res) => {
  const a = get('SELECT * FROM attachments WHERE id=?', +req.params.id); if (!a) return notFound(res);
  if (!MANAGERS.includes(req.user.role) && a.uploaded_by !== req.user.id) return denied(res);
  fs.rmSync(path.join(UPLOAD_DIR, path.basename(a.stored)), { force: true });
  run('DELETE FROM attachments WHERE id=?', a.id); log(req, `Deleted file '${a.filename}'`);
  res.redirect(a.task_id ? '/tasks/' + a.task_id : a.ref_type === 'compliance' ? '/compliance/' + a.ref_id : '/');
});

// ---------- timeline (Gantt) ----------
app.get('/timeline', loginRequired, (req, res) => {
  const pid = req.query.project ? +req.query.project : null;
  const group = ['assignee', 'stage', 'team'].includes(req.query.group) ? req.query.group : 'assignee';
  const base = { projects: all('SELECT * FROM projects ORDER BY name'), pid, group, empty: false };
  const rows = taskRows({ pid }).map((t) => ({ ...t, s: dnum(t.start_date), e: dnum(t.deadline) }))
    .filter((t) => !Number.isNaN(t.s) && !Number.isNaN(t.e)).map((t) => ({ ...t, e: Math.max(t.s, t.e) }));
  if (!rows.length) return res.render('timeline', { ...base, empty: true });
  const td = dnum(today());
  const min = Math.min(td, ...rows.map((r) => r.s)) - 2, max = Math.max(td, ...rows.map((r) => r.e)) + 2, total = max - min + 1;
  const keyOf = { assignee: (r) => r.aname || 'Unassigned', stage: (r) => r.stage || 'No stage', team: (r) => r.tname || 'No team' }[group];
  const map = new Map();
  rows.forEach((r) => {
    const k = keyOf(r); if (!map.has(k)) map.set(k, []);
    map.get(k).push({ ...r, left: ((r.s - min) / total) * 100, width: ((r.e - r.s + 1) / total) * 100, late: r.e < td && r.status !== 'Completed',
      range: `${dlabel(r.s)} → ${dlabel(r.e)}` });
  });
  let names = [...map.keys()];
  names = group === 'stage' ? names.sort((a, b) => STAGES.indexOf(a) - STAGES.indexOf(b)) : names.sort();
  const groups = names.map((n) => {
    const rs = map.get(n); return { name: n, rows: rs, range: `${dlabel(Math.min(...rs.map((r) => r.s)))} → ${dlabel(Math.max(...rs.map((r) => r.e)))}` };
  });
  const weeks = []; for (let d = min; d <= max; d += 7) weeks.push({ left: ((d - min) / total) * 100, label: dlabel(d) });
  res.render('timeline', { ...base, groups, weeks, todayPct: ((td - min) / total) * 100, weekPct: (7 / total) * 100, count: rows.length });
});

// ---------- team ----------
const userFields = (v = {}, isEdit = false) => [
  F('name', 'Full name', 'text', [], v.name),
  F('employee_id', 'Employee ID', 'text', [], v.employee_id, false),
  F('email', 'Email', 'email', [], v.email),
  F('phone', 'Phone', 'text', [], v.phone, false),
  F('role', 'Role', 'select', ROLES, v.role || 'Hardware Engineer'),
  F('team_id', 'Team', 'select', teamOpts(true), v.team_id, false),
  F('designation', 'Designation', 'text', [], v.designation, false, 'e.g. Senior PCB Design Engineer'),
  F('password', isEdit ? 'New password' : 'Password', 'password', [], '', !isEdit, isEdit ? 'Leave blank to keep the current password.' : ''),
  F('skills', 'Skills / tools', 'textarea', [], v.skills, false, 'e.g. Altium, KiCad, Allegro, SI/PI, STM32'),
];
app.get('/team', loginRequired, (req, res) => {
  const users = all(`SELECT u.*, (SELECT COUNT(*) FROM tasks WHERE assignee_id=u.id AND status!='Completed') open_tasks,
    (SELECT COALESCE(SUM(est_hours),0) FROM tasks WHERE assignee_id=u.id AND status!='Completed') open_hours
    FROM users u ORDER BY u.name`);
  const teams = all('SELECT tm.*, l.name lead_name FROM teams tm LEFT JOIN users l ON l.id=tm.lead_id ORDER BY tm.name')
    .map((t) => ({ ...t, members: users.filter((u) => u.team_id === t.id) }));
  const ids = new Set(teams.map((t) => t.id));
  res.render('team', { teams, loose: users.filter((u) => !u.team_id || !ids.has(u.team_id)) });
});
app.get('/team/new', rolesRequired('Admin'), (req, res) => formPage(res, 'New team member', userFields({ role: ROLES.includes(req.query.role) ? req.query.role : undefined }), '/team'));
app.post('/team/new', rolesRequired('Admin'), (req, res) => {
  const f = req.body;
  if (!ROLES.includes(f.role)) return res.status(400).render('error', { msg: 'Invalid role.' });
  if (String(f.password || '').length < 6) { res.locals.flash = 'Password must be at least 6 characters.'; return formPage(res, 'New team member', userFields(f), '/team'); }
  try {
    run('INSERT INTO users(name,email,password_hash,role,team_id,employee_id,designation,phone,skills) VALUES(?,?,?,?,?,?,?,?,?)',
      f.name, f.email.trim().toLowerCase(), bcrypt.hashSync(f.password, 10), f.role, nul(f.team_id), f.employee_id, f.designation || f.role, f.phone, f.skills);
    log(req, `Created user ${f.name} (${f.role})`); res.redirect('/team');
  } catch (e) { res.locals.flash = 'A user with that email already exists.'; formPage(res, 'New team member', userFields(f), '/team'); }
});
app.get('/team/:id/edit', rolesRequired('Admin'), (req, res) => {
  const u = get('SELECT * FROM users WHERE id=?', +req.params.id); if (!u) return notFound(res);
  formPage(res, `Edit ${u.name}`, userFields(u, true), '/team');
});
app.post('/team/:id/edit', rolesRequired('Admin'), (req, res) => {
  const u = get('SELECT * FROM users WHERE id=?', +req.params.id); if (!u) return notFound(res);
  const f = req.body; const role = u.id === req.user.id ? u.role : f.role;
  if (!ROLES.includes(role)) return res.status(400).render('error', { msg: 'Invalid role.' });
  if (f.password && f.password.length < 6) { res.locals.flash = 'Password must be at least 6 characters.'; return formPage(res, `Edit ${u.name}`, userFields({ ...f, id: u.id }, true), '/team'); }
  try {
    run('UPDATE users SET name=?,email=?,role=?,team_id=?,employee_id=?,designation=?,phone=?,skills=? WHERE id=?',
      f.name, f.email.trim().toLowerCase(), role, nul(f.team_id), f.employee_id, f.designation, f.phone, f.skills, u.id);
    if (f.password) run('UPDATE users SET password_hash=? WHERE id=?', bcrypt.hashSync(f.password, 10), u.id);
    log(req, `Updated user ${f.name}`); res.redirect('/team');
  } catch (e) { res.locals.flash = 'That email is already used by another user.'; formPage(res, `Edit ${u.name}`, userFields({ ...f, id: u.id }, true), '/team'); }
});
app.post('/team/:id/delete', rolesRequired('Admin'), (req, res) => {
  const id = +req.params.id;
  if (id === req.user.id) req.session.flash = 'You cannot delete yourself.';
  else if (get('SELECT 1 FROM tasks WHERE assignee_id=? AND status!=\'Completed\'', id)) req.session.flash = 'This employee still has open tasks. Reassign them first.';
  else { run('DELETE FROM users WHERE id=?', id); log(req, `Deleted user #${id}`); }
  res.redirect('/team');
});
const teamFields = (v = {}) => [F('name', 'Team name', 'text', [], v.name), F('lead_id', 'Team lead', 'select', usersOpts(true), v.lead_id, false),
  F('description', 'Responsibilities', 'textarea', [], v.description, false)];
app.get('/teams/new', rolesRequired(...MANAGERS), (req, res) => formPage(res, 'New team', teamFields(), '/team'));
app.post('/teams/new', rolesRequired(...MANAGERS), (req, res) => {
  try { run('INSERT INTO teams(name,description,lead_id) VALUES(?,?,?)', req.body.name, req.body.description, nul(req.body.lead_id)); log(req, `Created team '${req.body.name}'`); res.redirect('/team'); }
  catch (e) { res.locals.flash = 'A team with that name already exists.'; formPage(res, 'New team', teamFields(req.body), '/team'); }
});
app.get('/teams/:id/edit', rolesRequired(...MANAGERS), (req, res) => {
  const t = get('SELECT * FROM teams WHERE id=?', +req.params.id); if (!t) return notFound(res);
  formPage(res, `Edit team — ${t.name}`, teamFields(t), '/team');
});
app.post('/teams/:id/edit', rolesRequired(...MANAGERS), (req, res) => {
  const t = get('SELECT * FROM teams WHERE id=?', +req.params.id); if (!t) return notFound(res);
  try { run('UPDATE teams SET name=?,description=?,lead_id=? WHERE id=?', req.body.name, req.body.description, nul(req.body.lead_id), t.id); log(req, `Updated team '${req.body.name}'`); res.redirect('/team'); }
  catch (e) { res.locals.flash = 'A team with that name already exists.'; formPage(res, `Edit team — ${t.name}`, teamFields(req.body), '/team'); }
});

// ---------- components & BOM ----------
const COMP_ROLES = ['Admin', 'Project Manager', 'Hardware Engineer', 'PCB Engineer'];
const compFields = (v = {}) => [
  F('project_id', 'Project', 'select', projectOpts(), v.project_id),
  F('category', 'Category', 'select', COMP_CATEGORIES, v.category || 'IC / MCU'),
  F('part_number', 'Manufacturer part number', 'text', [], v.part_number),
  F('name', 'Description', 'text', [], v.name),
  F('manufacturer', 'Manufacturer', 'text', [], v.manufacturer, false),
  F('supplier', 'Supplier / distributor', 'text', [], v.supplier, false, 'e.g. Digi-Key, Mouser, LCSC'),
  F('designator', 'Reference designator', 'text', [], v.designator, false, 'e.g. U1, R1-R10, C5'),
  F('package', 'Package / footprint', 'text', [], v.package, false, 'e.g. LQFP-48, 0603'),
  F('quantity', 'Quantity', 'number', [], v.quantity ?? 1),
  F('unit_cost', 'Unit cost (USD)', 'number', [], v.unit_cost ?? 0),
  F('lead_time_days', 'Lead time (days)', 'number', [], v.lead_time_days, false),
  F('status', 'Status', 'select', COMP_STATUS, v.status || 'Proposed'),
  F('alt_part', 'Alternate part', 'text', [], v.alt_part, false),
  F('datasheet_url', 'Datasheet URL', 'text', [], v.datasheet_url, false, 'Must start with http:// or https://'),
];
app.get('/components', loginRequired, (req, res) => {
  const pid = req.query.project ? +req.query.project : null;
  const rows = all(`SELECT c.*, p.name pname FROM components c JOIN projects p ON p.id=c.project_id
                    ${pid ? 'WHERE c.project_id=?' : ''} ORDER BY c.designator, c.part_number`, ...(pid ? [pid] : []));
  const total = rows.reduce((s, r) => s + (r.quantity || 0) * (r.unit_cost || 0), 0);
  res.render('components', { rows, total, projects: all('SELECT * FROM projects'), pid });
});
const compArgs = (f) => [f.project_id, f.part_number, f.name, f.manufacturer, Math.max(0, Math.round(num(f.quantity))), Math.max(0, num(f.unit_cost)), f.status,
  f.category, f.designator, f.package, f.supplier, nul(f.lead_time_days) && Math.max(0, Math.round(num(f.lead_time_days))), safeUrl(f.datasheet_url), f.alt_part];
const COMP_COLS = 'project_id,part_number,name,manufacturer,quantity,unit_cost,status,category,designator,package,supplier,lead_time_days,datasheet_url,alt_part';
app.get('/components/new', rolesRequired(...COMP_ROLES), (req, res) => formPage(res, 'Add component to BOM', compFields({ project_id: req.query.project }), '/components'));
app.post('/components/new', rolesRequired(...COMP_ROLES), (req, res) => {
  run(`INSERT INTO components(${COMP_COLS}) VALUES(${COMP_COLS.split(',').map(() => '?').join(',')})`, ...compArgs(req.body));
  log(req, `Added component ${req.body.part_number}`); res.redirect('/components');
});
app.get('/components/:id/edit', rolesRequired(...COMP_ROLES), (req, res) => {
  const c = get('SELECT * FROM components WHERE id=?', +req.params.id); if (!c) return notFound(res);
  formPage(res, 'Edit component', compFields(c), '/components');
});
app.post('/components/:id/edit', rolesRequired(...COMP_ROLES), (req, res) => {
  const c = get('SELECT * FROM components WHERE id=?', +req.params.id); if (!c) return notFound(res);
  run(`UPDATE components SET ${COMP_COLS.split(',').map((x) => x + '=?').join(',')} WHERE id=?`, ...compArgs(req.body), c.id);
  log(req, `Updated component ${req.body.part_number}`); res.redirect('/components');
});
app.post('/components/:id/delete', rolesRequired('Admin', 'Project Manager', 'Hardware Engineer'), (req, res) => {
  run('DELETE FROM components WHERE id=?', +req.params.id); log(req, `Deleted component #${req.params.id}`); res.redirect('/components');
});

// ---------- reviews & issues ----------
app.get('/reviews', loginRequired, (req, res) => {
  const rows = all(`SELECT r.*, p.name pname, u.name rname FROM reviews r JOIN projects p ON p.id=r.project_id
                    LEFT JOIN users u ON u.id=r.reviewer_id ORDER BY r.id DESC`);
  res.render('reviews', { rows, REVIEW_STATUS });
});
app.get('/reviews/new', loginRequired, (req, res) =>
  formPage(res, 'New review / issue', [
    F('project_id', 'Project', 'select', projectOpts()), F('kind', 'Type', 'select', REVIEW_TYPES),
    F('gate', 'Review gate', 'select', GATES, 'N/A'), F('severity', 'Severity (issues)', 'select', SEVERITIES, 'Medium'),
    F('title', 'Title'), F('reviewer_id', 'Reviewer / owner', 'select', usersOpts()),
    F('due_date', 'Due date', 'date', [], '', false), F('notes', 'Details / notes', 'textarea', [], '', false),
  ], '/reviews'));
app.post('/reviews/new', loginRequired, (req, res) => {
  const f = req.body;
  run('INSERT INTO reviews(project_id,kind,title,reviewer_id,status,notes,created,gate,severity,due_date) VALUES(?,?,?,?,?,?,?,?,?,?)',
    f.project_id, f.kind, f.title, f.reviewer_id, 'Open', f.notes, now(), f.gate, f.severity, nul(f.due_date));
  log(req, `Raised ${String(f.kind).toLowerCase()} '${f.title}'`); res.redirect('/reviews');
});
app.post('/reviews/:id/status', loginRequired, (req, res) => {
  const r = get('SELECT * FROM reviews WHERE id=?', +req.params.id); if (!r) return notFound(res);
  const allowed = MANAGERS.includes(req.user.role) || req.user.role === 'Reviewer' || r.reviewer_id === req.user.id;
  if (!allowed || !REVIEW_STATUS.includes(req.body.status)) return denied(res);
  run('UPDATE reviews SET status=? WHERE id=?', req.body.status, r.id);
  log(req, `${r.kind} '${r.title}' -> ${req.body.status}`); res.redirect('/reviews');
});

// ---------- activity ----------
app.get('/activity', loginRequired, (req, res) =>
  res.render('activity', { rows: all('SELECT a.*, u.name uname FROM activity a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.id DESC LIMIT 200') }));


// ---------- admin console (Admin only): employees, project managers, passwords, activation ----------
app.get('/admin', rolesRequired('Admin'), (req, res) => {
  const users = all(`SELECT u.*, (SELECT COUNT(*) FROM tasks WHERE assignee_id=u.id AND status!='Completed') open_tasks FROM users u ORDER BY (u.active=0), u.name`);
  const projectsList = all('SELECT p.*, u.name mname FROM projects p LEFT JOIN users u ON u.id=p.manager_id ORDER BY p.name');
  res.render('admin', { users, projectsList, ROLES, teams: all('SELECT * FROM teams ORDER BY name'),
    managers: all('SELECT id,name,role FROM users WHERE active IS NOT 0 ORDER BY name') });
});
app.post('/admin/users/:id', rolesRequired('Admin'), (req, res) => {
  const u = get('SELECT * FROM users WHERE id=?', +req.params.id); if (!u) return notFound(res);
  const f = req.body; const name = String(f.name || '').trim().slice(0, 100);
  const role = u.id === req.user.id ? u.role : f.role;
  if (!name) { req.session.flash = 'Name cannot be empty.'; return res.redirect('/admin'); }
  if (!ROLES.includes(role)) return res.status(400).render('error', { msg: 'Invalid role.' });
  const team = nul(f.team_id); if (team && !get('SELECT 1 FROM teams WHERE id=?', +team)) return res.status(400).render('error', { msg: 'Invalid team.' });
  run('UPDATE users SET name=?, designation=?, role=?, team_id=? WHERE id=?', name, String(f.designation || '').trim().slice(0, 100), role, team, u.id);
  log(req, `Admin updated employee '${name}' (${role})`); req.session.flash = `Saved ${name}.`; res.redirect('/admin');
});
app.post('/admin/users/:id/password', rolesRequired('Admin'), (req, res) => {
  const u = get('SELECT * FROM users WHERE id=?', +req.params.id); if (!u) return notFound(res);
  if (String(req.body.password || '').length < 6) { req.session.flash = 'Password must be at least 6 characters.'; return res.redirect('/admin'); }
  run('UPDATE users SET password_hash=? WHERE id=?', bcrypt.hashSync(req.body.password, 10), u.id);
  log(req, `Admin reset password for ${u.name}`); req.session.flash = `Password reset for ${u.name}.`; res.redirect('/admin');
});
app.post('/admin/users/:id/active', rolesRequired('Admin'), (req, res) => {
  const u = get('SELECT * FROM users WHERE id=?', +req.params.id); if (!u) return notFound(res);
  if (u.id === req.user.id) { req.session.flash = 'You cannot deactivate your own account.'; return res.redirect('/admin'); }
  const to = u.active === 0 ? 1 : 0; run('UPDATE users SET active=? WHERE id=?', to, u.id);
  const open = get("SELECT COUNT(*) c FROM tasks WHERE assignee_id=? AND status!='Completed'", u.id).c;
  log(req, `Admin ${to ? 'reactivated' : 'deactivated'} ${u.name}`);
  req.session.flash = to ? `${u.name} is active again.` : `${u.name} can no longer sign in.${open ? ` They still have ${open} open task(s) — reassign them.` : ''}`;
  res.redirect('/admin');
});
app.post('/admin/projects/:id/manager', rolesRequired('Admin'), (req, res) => {
  const p = get('SELECT * FROM projects WHERE id=?', +req.params.id); if (!p) return notFound(res);
  const m = get('SELECT * FROM users WHERE id=? AND active IS NOT 0', +req.body.manager_id);
  if (!m) { req.session.flash = 'Please choose an active employee.'; return res.redirect('/admin'); }
  run('UPDATE projects SET manager_id=? WHERE id=?', m.id, p.id);
  log(req, `Admin set '${m.name}' as project manager of '${p.name}'`); req.session.flash = `${m.name} is now the project manager of ${p.name}.`; res.redirect('/admin');
});

require('./quality')({ app, db, all, get, run, F, formPage, usersOpts, usersByRole, projectOpts, log, now, today, num, nul, denied, notFound,
  loginRequired, rolesRequired, MANAGERS, PRIORITIES, UPLOAD_DIR, upload });

const PORT = process.env.PORT || 3000;
app.listen(PORT, '127.0.0.1', () => console.log(`Hardware Project Manager running at http://localhost:${PORT}`));
