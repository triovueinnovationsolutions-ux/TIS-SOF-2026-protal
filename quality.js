// Revisions, BOM Excel files, compliance, requirements, test cases, traceability, production batches
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const ExcelJS = require('exceljs');

module.exports = function mount(H) {
  const { app, db, all, get, run, F, formPage, usersOpts, usersByRole, projectOpts, log, now, today, num, nul, denied, notFound,
    loginRequired, rolesRequired, MANAGERS, PRIORITIES, UPLOAD_DIR, upload } = H;

  // ---------- constants ----------
  const REV_TYPES = ['Prototype', 'EVT', 'DVT', 'PVT', 'Production', 'ECO / Rework'];
  const REV_STATUS = ['Draft', 'In Review', 'Released', 'Obsolete'];
  const BOM_STATUS = ['Draft', 'In Review', 'Approved', 'Released', 'Obsolete'];
  const COMPL_STATUS = ['Not Started', 'In Progress', 'Testing', 'Compliant', 'Non-Compliant', 'Waived', 'N/A'];
  const REQ_CATEGORIES = ['Functional', 'Electrical', 'Mechanical', 'Environmental', 'Safety', 'Compliance', 'Manufacturing', 'Firmware', 'Performance'];
  const REQ_STATUS = ['Draft', 'Approved', 'Implemented', 'Verified'];
  const TEST_CATEGORIES = ['Electrical', 'Functional', 'Firmware', 'Environmental', 'EMC / EMI', 'Mechanical', 'Reliability', 'Safety', 'Production test', 'Other'];
  const TEST_PHASES = ['EVT', 'DVT', 'PVT', 'Mass Production'];
  const BUILD_PHASES = ['Prototype', 'EVT', 'DVT', 'PVT', 'Mass Production'];
  const TEST_RESULTS = ['Pass', 'Fail', 'Blocked', 'Skipped'];
  const BATCH_STATUS = ['Planned', 'PCB Fabrication', 'Assembly', 'Testing', 'Completed', 'On Hold'];
  const UNIT_STATUS = ['Built', 'In Test', 'Passed', 'Failed', 'Rework', 'Shipped', 'Scrapped'];
  const EVIDENCE_KINDS = ['Test report', 'Certificate', 'Declaration of conformity', 'Material declaration', 'Other'];
  const REV_ROLES = ['Admin', 'Project Manager', 'Hardware Engineer', 'PCB Engineer', 'Firmware Engineer'];
  const RELEASE_ROLES = ['Admin', 'Project Manager', 'Reviewer'];
  const BOM_ROLES = ['Admin', 'Project Manager', 'Hardware Engineer', 'PCB Engineer'];
  const COMP_ROLES = ['Admin', 'Project Manager', 'Hardware Engineer', 'Testing Engineer', 'Reviewer'];
  const REQ_ROLES = ['Admin', 'Project Manager', 'Hardware Engineer', 'Reviewer'];
  const TEST_ROLES = ['Admin', 'Project Manager', 'Hardware Engineer', 'PCB Engineer', 'Firmware Engineer', 'Testing Engineer'];
  const PROD_ROLES = ['Admin', 'Project Manager', 'Hardware Engineer', 'PCB Engineer', 'Testing Engineer'];

  const STANDARDS = [
    ['RoHS (EU 2011/65/EU + 2015/863)', 'Restricted substances', 'Parts and PCB materials free of restricted substances; keep supplier material declarations.'],
    ['REACH (EC 1907/2006)', 'SVHC declaration', 'Substances of very high concern declared by suppliers; keep records.'],
    ['WEEE (2012/19/EU)', 'Marking and take-back', 'Crossed-out bin marking and end-of-life information.'],
    ['CE – EMC Directive 2014/30/EU', 'EMC conformity', 'Emissions and immunity per harmonised standards; technical file and DoC.'],
    ['CE – Low Voltage Directive 2014/35/EU', 'Electrical safety', 'Applies to products in the LVD voltage range; technical file and DoC.'],
    ['CE – Radio Equipment Directive 2014/53/EU', 'Radio conformity', 'Applies to wireless products (BLE, Wi-Fi, etc.).'],
    ['FCC Part 15 (Subpart B / C)', 'Unintentional / intentional radiators', 'US EMC and radio emissions authorisation.'],
    ['EN 55032 / CISPR 32', 'Emissions', 'Radiated and conducted emission limits for multimedia equipment.'],
    ['EN 55035 / CISPR 35', 'Immunity', 'Immunity requirements for multimedia equipment.'],
    ['IEC 61000-4-2 (ESD immunity)', 'Contact ±4 kV / Air ±8 kV', 'ESD immunity of exposed ports and enclosure.'],
    ['IEC 61000-4-4 (EFT / burst)', 'Fast transient immunity', 'Burst immunity on power and signal lines.'],
    ['IEC 61000-4-5 (Surge)', 'Surge immunity', 'Surge immunity on power and long signal lines.'],
    ['IEC / EN 62368-1', 'Product safety', 'Audio/video, ICT equipment safety standard.'],
    ['IEC 60529 (IP rating)', 'Ingress protection', 'Dust and water ingress protection class.'],
    ['IEC 60068-2 (Environmental testing)', 'Temperature, humidity, vibration', 'Environmental test series per product specification.'],
    ['IPC-2221 / IPC-6012', 'PCB design / fabrication class', 'Generic PCB design and qualification of rigid boards (Class 2 or 3).'],
    ['IPC-A-610', 'Acceptability of assemblies', 'Workmanship acceptance criteria for assembled boards.'],
    ['IPC J-STD-001', 'Soldering requirements', 'Soldered electrical and electronic assemblies.'],
    ['ISO 9001', 'Quality management', 'Quality management system of the manufacturer.'],
    ['BIS CRS (IS 13252-1)', 'India product safety registration', 'Applicable to notified IT/AV products; confirm with the certification body.'],
    ['WPC ETA / TEC MTCTE', 'India wireless / telecom approval', 'Wireless and telecom equipment approvals; confirm applicability.'],
    ['Other', '', ''],
  ];

  const TESTPLAN = [
    ['EVT', 'Electrical', 'Power rail short-circuit check (unpowered)', 'Assembled board, no power applied', 'Measure resistance from every power rail to GND with a multimeter and record the values.', 'No dead short on any rail; readings consistent with the design estimate.', 'Multimeter', 'High'],
    ['EVT', 'Electrical', 'First power-up and idle current', 'Rail short check passed; bench supply current limit set about 120 % of expected idle current', 'Apply nominal input voltage gradually. Record input current and check for abnormal heating.', 'Idle current within the power budget; no smoke or hot components.', 'Bench supply, DMM, thermal camera', 'High'],
    ['EVT', 'Electrical', 'Power rail voltage accuracy and ripple', 'Board powered', 'Measure every regulated rail at no load and at typical / maximum load using an oscilloscope.', 'Each rail within design tolerance; ripple within datasheet limits.', 'Oscilloscope, electronic load', 'High'],
    ['EVT', 'Functional', 'Clock, reset and boot verification', 'Board powered', 'Probe the oscillator, reset line and boot pins; power-cycle the board 10 times.', 'Correct clock frequency, clean reset, MCU boots 10 out of 10 times.', 'Oscilloscope', 'High'],
    ['EVT', 'Firmware', 'Programming and debug interface', 'Debugger connected', 'Erase, flash and verify the firmware image; read back and compare.', 'Flash and verify succeed; read-back matches the image.', 'Debugger / programmer', 'High'],
    ['EVT', 'Functional', 'Peripheral bring-up (I2C / SPI / UART / ADC / GPIO)', 'Bring-up firmware loaded', 'Exercise each peripheral against a known device or loopback.', 'Every peripheral works; ADC readings within tolerance.', 'Logic analyser, signal source', 'Medium'],
    ['DVT', 'Electrical', 'Power consumption by operating mode', 'Final-candidate hardware and firmware', 'Measure current in every mode (active, idle, sleep, transmit) across the input voltage range.', 'Consumption within the power budget in all modes.', 'Power analyser / DMM', 'Medium'],
    ['DVT', 'Electrical', 'Signal integrity on critical nets', 'Board powered and running', 'Probe clocks, high-speed and differential nets; check rise time, overshoot and jitter.', 'Waveforms meet the interface specification; no excessive ringing.', 'Oscilloscope, active probe', 'Medium'],
    ['DVT', 'Functional', 'Functional verification against requirements', 'Requirements baselined', 'Execute each functional requirement scenario end to end and log the result.', 'All functional requirements demonstrated.', 'Test jig, reference setup', 'High'],
    ['DVT', 'Environmental', 'Temperature range test', 'Samples available', 'Operate in a thermal chamber across the specified minimum and maximum temperature with dwell; run a functional check at each extreme.', 'Operates within specification over the whole temperature range.', 'Thermal chamber', 'High'],
    ['DVT', 'Environmental', 'Thermal rise at maximum load', 'Board in a typical enclosure', 'Run at maximum load until thermally stable; measure component temperatures.', 'All components below derated maximum temperatures.', 'Thermal camera, thermocouples', 'High'],
    ['DVT', 'Electrical', 'Brown-out and power interruption', 'Programmable supply', 'Ramp the supply down and up slowly and apply short interruptions; observe reset behaviour.', 'Safe reset and recovery; no latch-up or data corruption.', 'Programmable supply', 'Medium'],
    ['DVT', 'EMC / EMI', 'ESD immunity (IEC 61000-4-2)', 'Compliance plan defines levels', 'Apply contact and air discharges at accessible points at the planned levels.', 'No damage; performance criteria of the standard met.', 'ESD gun', 'High'],
    ['DVT', 'EMC / EMI', 'EMI pre-compliance scan', 'Board in final configuration', 'Perform a near-field / pre-compliance radiated and conducted scan and compare with limits.', 'Emissions below the applicable limit lines with margin.', 'Spectrum analyser, probes, LISN', 'Medium'],
    ['DVT', 'Mechanical', 'Vibration and drop (mechanical robustness)', 'Samples in enclosure', 'Apply the vibration profile and drop tests from the product specification; inspect and functionally test afterwards.', 'No mechanical damage or functional failure.', 'Vibration table, drop tester', 'Medium'],
    ['DVT', 'Firmware', 'Firmware functional regression', 'Release-candidate firmware', 'Run the firmware regression suite on the target hardware.', 'All regression tests pass.', 'Test harness', 'Medium'],
    ['PVT', 'Reliability', 'Burn-in / reliability soak', 'Pilot units available', 'Operate a sample of units at elevated temperature and load for the specified duration with periodic functional checks.', 'No failures during the soak; failure rate within target.', 'Burn-in chamber', 'High'],
    ['PVT', 'Production test', 'Pilot-run yield analysis', 'Pilot batch built', 'Record pass / fail per test station for the pilot batch and categorise the defects.', 'First-pass yield meets target; top defects have corrective actions.', 'Test station data', 'High'],
    ['PVT', 'Safety', 'Insulation and hi-pot test (if applicable)', 'Applicable safety standard identified', 'Perform insulation resistance and dielectric strength tests per the safety standard.', 'No breakdown; leakage below the limit.', 'Hi-pot tester', 'Medium'],
    ['Mass Production', 'Production test', 'Incoming inspection (PCB and components)', 'Approved BOM and drawings', 'Inspect PCBs and sampled components against drawings, BOM and material certificates.', 'Parts match the BOM and approved vendor list; no defects.', 'Calipers, microscope', 'Medium'],
    ['Mass Production', 'Production test', 'SPI / AOI after SMT', 'SMT line running', 'Run solder-paste inspection and automated optical inspection on every board.', 'No paste or placement defects beyond the workmanship class limits.', 'SPI / AOI machine', 'Medium'],
    ['Mass Production', 'Production test', 'In-circuit test (ICT)', 'ICT fixture available', 'Run the ICT programme on every board.', 'All nets and components pass.', 'ICT fixture', 'High'],
    ['Mass Production', 'Production test', 'Functional circuit test (FCT)', 'FCT jig and firmware available', 'Run FCT: power, programming, peripheral and calibration checks; log results against the serial number.', 'All FCT steps pass; results stored against the serial number.', 'FCT jig', 'High'],
    ['Mass Production', 'Production test', 'Firmware programming and version check', 'Release firmware approved', 'Flash the production firmware; read back version and checksum.', 'Correct version and checksum recorded for each serial number.', 'Programmer', 'High'],
    ['Mass Production', 'Production test', 'Final QA, labelling and packing', 'Units passed FCT', 'Check label and serial number, cosmetic quality and packing against the shipping checklist.', 'Label matches serial and revision; packing meets specification.', 'QA checklist', 'Medium'],
  ];

  // ---------- helpers ----------
  const nextCode = (table, col, prefix, pid) => {
    let m = 0;
    all(`SELECT ${col} c FROM ${table} WHERE project_id=?`, pid).forEach((r) => { const n = parseInt(String(r.c || '').replace(/\D/g, ''), 10); if (n > m) m = n; });
    return `${prefix}-${String(m + 1).padStart(3, '0')}`;
  };
  const blank = [['', '— none —']];
  const projLabel = (p) => (p.code ? p.code + ' · ' : '') + p.name;
  const pidFrom = (req) => (req.query.project ? +req.query.project : null);
  const bomOpts = () => blank.concat(all('SELECT b.id,b.version,b.filename,p.name pname FROM bom_files b JOIN projects p ON p.id=b.project_id ORDER BY b.id DESC')
    .map((b) => [b.id, `${b.pname} · ${b.version || ''} · ${b.filename}`]));
  const reqOpts = () => blank.concat(all('SELECT r.id,r.req_id,r.title,p.name pname FROM requirements r JOIN projects p ON p.id=r.project_id ORDER BY p.name,r.req_id')
    .map((r) => [r.id, `${r.pname} · ${r.req_id} ${r.title}`]));
  const complOpts = () => blank.concat(all('SELECT c.id,c.standard,p.name pname FROM compliance c JOIN projects p ON p.id=c.project_id ORDER BY p.name,c.standard')
    .map((c) => [c.id, `${c.pname} · ${c.standard}`]));
  const projects = () => all('SELECT * FROM projects ORDER BY name');
  const rm = (stored) => fs.rmSync(path.join(UPLOAD_DIR, path.basename(stored)), { force: true });

  // Generic create / edit / delete routes
  function crud(c) {
    const newTitle = `New ${c.title}`, editTitle = `Edit ${c.title}`;
    app.get(`${c.base}/new`, rolesRequired(...c.roles), (req, res) => formPage(res, newTitle, c.fields(c.defaults ? c.defaults(req) : {}), c.back || c.base, c.intro || ''));
    app.post(`${c.base}/new`, rolesRequired(...c.roles), (req, res) => {
      const r = c.prep(req.body, req, null);
      if (r.error) { res.locals.flash = r.error; return formPage(res, newTitle, c.fields(req.body), c.back || c.base, c.intro || ''); }
      const ins = run(`INSERT INTO ${c.table}(${c.cols.join(',')},created) VALUES(${c.cols.map(() => '?').join(',')},?)`, ...c.cols.map((k) => r.values[k]), now());
      if (c.after) c.after(req, ins.lastInsertRowid, r.values, true);
      log(req, `Created ${c.title} ${c.label(r.values)}`);
      res.redirect(c.afterUrl ? c.afterUrl(ins.lastInsertRowid, r.values) : c.base);
    });
    app.get(`${c.base}/:id/edit`, rolesRequired(...c.roles), (req, res) => {
      const ex = get(`SELECT * FROM ${c.table} WHERE id=?`, +req.params.id); if (!ex) return notFound(res);
      formPage(res, editTitle, c.fields(ex), c.back || c.base);
    });
    app.post(`${c.base}/:id/edit`, rolesRequired(...c.roles), (req, res) => {
      const ex = get(`SELECT * FROM ${c.table} WHERE id=?`, +req.params.id); if (!ex) return notFound(res);
      const r = c.prep(req.body, req, ex);
      if (r.error) { res.locals.flash = r.error; return formPage(res, editTitle, c.fields(req.body), c.back || c.base); }
      run(`UPDATE ${c.table} SET ${c.cols.map((k) => k + '=?').join(',')} WHERE id=?`, ...c.cols.map((k) => r.values[k]), ex.id);
      if (c.after) c.after(req, ex.id, r.values, false);
      log(req, `Updated ${c.title} ${c.label(r.values)}`);
      res.redirect(c.afterUrl ? c.afterUrl(ex.id, r.values) : c.base);
    });
    app.post(`${c.base}/:id/delete`, rolesRequired(...(c.delRoles || MANAGERS)), (req, res) => {
      const ex = get(`SELECT * FROM ${c.table} WHERE id=?`, +req.params.id); if (!ex) return notFound(res);
      if (c.beforeDelete) c.beforeDelete(ex);
      run(`DELETE FROM ${c.table} WHERE id=?`, ex.id); log(req, `Deleted ${c.title} #${ex.id}`);
      res.redirect(c.back || c.base);
    });
  }

  // =====================================================================
  // REVISIONS (hardware revision history)
  // =====================================================================
  crud({
    base: '/revisions', table: 'revisions', title: 'hardware revision', roles: REV_ROLES, delRoles: MANAGERS,
    cols: ['project_id', 'rev', 'rev_type', 'status', 'summary', 'eco_ref', 'schematic_ver', 'pcb_ver', 'firmware_ver', 'bom_file_id', 'released_date', 'created_by'],
    label: (v) => 'Rev ' + v.rev,
    defaults: (req) => ({ project_id: req.query.project }),
    fields: (v = {}) => [
      F('project_id', 'Project', 'select', projectOpts(), v.project_id),
      F('rev', 'Revision number', 'text', [], v.rev, true, 'e.g. A, B, 1.0, 2.1'),
      F('rev_type', 'Build type', 'select', REV_TYPES, v.rev_type || 'Prototype'),
      F('status', 'Status', 'select', REV_STATUS, v.status || 'Draft', true, 'Only a Project Manager, Reviewer or Admin can mark a revision Released.'),
      F('summary', 'What changed (change log)', 'textarea', [], v.summary, false),
      F('eco_ref', 'ECO / ECN reference', 'text', [], v.eco_ref, false),
      F('schematic_ver', 'Schematic version', 'text', [], v.schematic_ver, false),
      F('pcb_ver', 'PCB layout version', 'text', [], v.pcb_ver, false),
      F('firmware_ver', 'Firmware version', 'text', [], v.firmware_ver, false),
      F('bom_file_id', 'BOM file (Excel) for this revision', 'select', bomOpts(), v.bom_file_id, false),
      F('released_date', 'Release date', 'date', [], v.released_date, false),
    ],
    prep: (f, req, ex) => {
      const rev = String(f.rev || '').trim();
      if (!rev) return { error: 'Revision number is required.' };
      if (f.status === 'Released' && !RELEASE_ROLES.includes(req.user.role)) return { error: 'Only a Project Manager, Reviewer or Admin can mark a revision as Released.' };
      if (get('SELECT 1 FROM revisions WHERE project_id=? AND rev=? AND id!=?', f.project_id, rev, ex ? ex.id : 0)) return { error: `Revision ${rev} already exists for this project.` };
      return { values: { project_id: +f.project_id, rev, rev_type: f.rev_type, status: f.status, summary: f.summary, eco_ref: f.eco_ref, schematic_ver: f.schematic_ver,
        pcb_ver: f.pcb_ver, firmware_ver: f.firmware_ver, bom_file_id: nul(f.bom_file_id), released_date: nul(f.released_date) || (f.status === 'Released' ? today() : null),
        created_by: ex ? ex.created_by : req.user.id } };
    },
    after: (req, id, v) => { if (v.status === 'Released') run('UPDATE projects SET revision=? WHERE id=?', v.rev, v.project_id); },
  });
  app.get('/revisions', loginRequired, (req, res) => {
    const pid = pidFrom(req);
    const rows = all(`SELECT r.*, p.name pname, p.code pcode, u.name uname, b.filename bom_name FROM revisions r JOIN projects p ON p.id=r.project_id
      LEFT JOIN users u ON u.id=r.created_by LEFT JOIN bom_files b ON b.id=r.bom_file_id ${pid ? 'WHERE r.project_id=?' : ''} ORDER BY p.name, r.id DESC`, ...(pid ? [pid] : []));
    res.render('revisions', { rows, projects: projects(), pid, canEdit: REV_ROLES.includes(req.user.role) });
  });

  // =====================================================================
  // BOM FILES (Excel stored on the server)
  // =====================================================================
  const BOM_EXT = new Set(['.xlsx', '.xls', '.xlsm', '.csv']);
  const uploadBom = multer({
    storage: multer.diskStorage({ destination: UPLOAD_DIR, filename: (req, file, cb) => cb(null, 'bom-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + path.extname(file.originalname).toLowerCase()) }),
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter: (req, file, cb) => cb(null, BOM_EXT.has(path.extname(file.originalname).toLowerCase())),
  });
  const HEADERS = {
    designator: ['designator', 'reference', 'ref', 'refdes', 'reference designator', 'ref des', 'references', 'designators'],
    part_number: ['mpn', 'part number', 'part no', 'part #', 'manufacturer part number', 'mfr part number', 'mfg part number', 'p/n', 'pn', 'partnumber', 'manufacturer part no', 'manufacturer part'],
    name: ['description', 'value', 'comment', 'item', 'name', 'component', 'part description'],
    manufacturer: ['manufacturer', 'mfr', 'mfg', 'make', 'brand'],
    supplier: ['supplier', 'vendor', 'distributor'],
    quantity: ['qty', 'quantity', 'count', 'qnty', 'qty per board'],
    unit_cost: ['unit cost', 'unit price', 'price', 'cost', 'unit price usd', 'unit cost usd'],
    package: ['package', 'footprint', 'case', 'pattern'],
    category: ['category', 'type'],
    datasheet_url: ['datasheet', 'datasheet url', 'datasheet link'],
    alt_part: ['alternate', 'alt part', 'alternate part', 'substitute', 'alternative'],
  };
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9# /]/g, '').replace(/\s+/g, ' ').trim();
  const cellText = (v) => {
    if (v === null || v === undefined) return '';
    if (typeof v === 'object') {
      if (v instanceof Date) return v.toISOString().slice(0, 10);
      if (v.result !== undefined) return cellText(v.result);
      if (v.richText) return v.richText.map((t) => t.text).join('');
      if (v.text !== undefined) return cellText(v.text);
      return '';
    }
    return String(v).trim();
  };
  function parseCsv(text) {
    const first = text.split(/\r?\n/)[0] || ''; const delim = [',', ';', '\t'].sort((a, b) => first.split(b).length - first.split(a).length)[0];
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
      else if (ch === '"') q = true;
      else if (ch === delim) { row.push(cell.trim()); cell = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell.trim()); rows.push(row); row = []; cell = ''; }
      else cell += ch;
    }
    if (cell || row.length) { row.push(cell.trim()); rows.push(row); }
    return rows;
  }
  async function readRows(file, ext) {
    if (ext === '.csv') return parseCsv(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
    const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(file);
    const ws = wb.worksheets[0]; if (!ws) return [];
    const rows = []; ws.eachRow({ includeEmpty: false }, (row) => { const v = row.values; rows.push(Array.from({ length: Math.max(0, v.length - 1) }, (_, i) => cellText(v[i + 1]))); });
    return rows;
  }
  async function importBom(projectId, file, ext, replace) {
    const rows = await readRows(file, ext);
    let hi = -1, map = {};
    for (let i = 0; i < Math.min(rows.length, 20); i++) {
      const m = {};
      rows[i].forEach((h, ci) => { const n = norm(h); Object.keys(HEADERS).forEach((k) => { if (m[k] === undefined && HEADERS[k].includes(n)) m[k] = ci; }); });
      if (Object.keys(m).length >= 2 && (m.part_number !== undefined || m.name !== undefined)) { hi = i; map = m; break; }
    }
    if (hi < 0) return { error: 'Could not find a header row. Use columns such as Designator, Part Number / MPN, Description, Manufacturer, Qty, Unit Cost.' };
    const val = (r, k) => (map[k] === undefined ? '' : String(r[map[k]] ?? '').trim());
    const money = (s) => { const n = parseFloat(String(s).replace(/[^0-9.\-]/g, '')); return Number.isFinite(n) ? n : 0; };
    const ins = db.prepare(`INSERT INTO components(project_id,part_number,name,manufacturer,quantity,unit_cost,status,category,designator,package,supplier,datasheet_url,alt_part)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    let imported = 0, skipped = 0;
    db.transaction(() => {
      if (replace) run('DELETE FROM components WHERE project_id=?', projectId);
      rows.slice(hi + 1).forEach((r) => {
        const pn = val(r, 'part_number'), nm = val(r, 'name');
        if (!pn && !nm) { skipped++; return; }
        const url = val(r, 'datasheet_url');
        ins.run(projectId, pn || nm, nm || pn, val(r, 'manufacturer'), Math.max(0, Math.round(money(val(r, 'quantity')) || 1)), Math.max(0, money(val(r, 'unit_cost'))), 'Proposed',
          val(r, 'category'), val(r, 'designator'), val(r, 'package'), val(r, 'supplier'), /^https?:\/\//i.test(url) ? url : '', val(r, 'alt_part'));
        imported++;
      });
    })();
    return { imported, skipped };
  }
  const canImport = (ext) => ext === '.xlsx' || ext === '.csv';

  app.get('/bom', loginRequired, (req, res) => {
    const pid = pidFrom(req);
    const files = all(`SELECT b.*, p.name pname, u.name uname FROM bom_files b JOIN projects p ON p.id=b.project_id LEFT JOIN users u ON u.id=b.uploaded_by
      ${pid ? 'WHERE b.project_id=?' : ''} ORDER BY b.id DESC`, ...(pid ? [pid] : []));
    res.render('bom', { files, projects: projects(), pid, BOM_STATUS, canEdit: BOM_ROLES.includes(req.user.role), canApprove: RELEASE_ROLES.includes(req.user.role), canImport });
  });
  app.post('/bom/upload', rolesRequired(...BOM_ROLES), (req, res, next) => {
    uploadBom.single('file')(req, res, (err) => {
      if (err) { req.session.flash = err.code === 'LIMIT_FILE_SIZE' ? 'File too large (max 20 MB).' : 'Upload failed.'; return res.redirect('/bom'); }
      next();
    });
  }, async (req, res) => {
    const f = req.body;
    if (!req.file) { req.session.flash = 'Please choose an Excel (.xlsx, .xls) or CSV file.'; return res.redirect('/bom'); }
    const p = get('SELECT * FROM projects WHERE id=?', +f.project_id);
    if (!p) { rm(req.file.filename); return notFound(res); }
    const ext = path.extname(req.file.originalname).toLowerCase();
    const count = get('SELECT COUNT(*) c FROM bom_files WHERE project_id=?', p.id).c;
    const status = BOM_STATUS.includes(f.status) && (f.status === 'Draft' || f.status === 'In Review' || RELEASE_ROLES.includes(req.user.role)) ? f.status : 'Draft';
    const r = run('INSERT INTO bom_files(project_id,version,revision,status,filename,stored,size,notes,uploaded_by,created) VALUES(?,?,?,?,?,?,?,?,?,?)',
      p.id, (f.version || '').trim() || 'v' + (count + 1), (f.revision || '').trim() || p.revision || '', status, path.basename(req.file.originalname), req.file.filename, req.file.size, f.notes, req.user.id, now());
    log(req, `Uploaded BOM file '${req.file.originalname}' to '${p.name}'`);
    let msg = `BOM file saved on the server (${req.file.originalname}).`;
    if (f.import === 'on') {
      if (!canImport(ext)) msg += ' Parts were not imported: only .xlsx and .csv files can be imported.';
      else {
        try {
          const out = await importBom(p.id, req.file.path, ext, f.mode === 'replace');
          if (out.error) msg += ' ' + out.error;
          else { run('UPDATE bom_files SET rows_imported=? WHERE id=?', out.imported, r.lastInsertRowid); msg += ` Imported ${out.imported} parts${out.skipped ? ` (${out.skipped} blank rows skipped)` : ''}.`; log(req, `Imported ${out.imported} BOM parts into '${p.name}'`); }
        } catch (e) { msg += ' The file could not be read for import (is it a valid .xlsx?).'; }
      }
    }
    req.session.flash = msg; res.redirect('/bom' + (f.project_id ? '?project=' + p.id : ''));
  });
  app.get('/bom/export', loginRequired, async (req, res) => {
    const pid = pidFrom(req);
    const rows = all(`SELECT c.*, p.name pname, p.code pcode FROM components c JOIN projects p ON p.id=c.project_id ${pid ? 'WHERE c.project_id=?' : ''} ORDER BY p.name, c.designator, c.part_number`, ...(pid ? [pid] : []));
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('BOM');
    ws.columns = [['Project', 'pname', 26], ['Designator', 'designator', 14], ['Part Number', 'part_number', 22], ['Description', 'name', 30], ['Category', 'category', 16], ['Package', 'package', 14],
      ['Manufacturer', 'manufacturer', 20], ['Supplier', 'supplier', 16], ['Qty', 'quantity', 8], ['Unit Cost', 'unit_cost', 11], ['Line Cost', 'line', 11], ['Lead Time (d)', 'lead_time_days', 13], ['Status', 'status', 12], ['Alternate', 'alt_part', 18], ['Datasheet', 'datasheet_url', 30]]
      .map(([header, key, width]) => ({ header, key, width }));
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF43779C' } };
    let total = 0;
    rows.forEach((r) => { const line = (r.quantity || 0) * (r.unit_cost || 0); total += line; ws.addRow({ ...r, line }); });
    ws.addRow({ name: 'TOTAL', line: total }).font = { bold: true };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    const pr = pid ? get('SELECT * FROM projects WHERE id=?', pid) : null;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="BOM_${String((pr && (pr.code || pr.name)) || 'all').replace(/[^A-Za-z0-9_-]+/g, '_')}_${today()}.xlsx"`);
    res.send(Buffer.from(await wb.xlsx.writeBuffer()));
  });
  app.get('/bom/:id/download', loginRequired, (req, res) => {
    const b = get('SELECT * FROM bom_files WHERE id=?', +req.params.id); if (!b) return notFound(res);
    res.download(path.join(UPLOAD_DIR, path.basename(b.stored)), b.filename);
  });
  app.post('/bom/:id/import', rolesRequired(...BOM_ROLES), async (req, res) => {
    const b = get('SELECT * FROM bom_files WHERE id=?', +req.params.id); if (!b) return notFound(res);
    const ext = path.extname(b.filename).toLowerCase();
    if (!canImport(ext)) { req.session.flash = 'Only .xlsx and .csv files can be imported.'; return res.redirect('/bom?project=' + b.project_id); }
    try {
      const out = await importBom(b.project_id, path.join(UPLOAD_DIR, path.basename(b.stored)), ext, req.body.mode === 'replace');
      if (out.error) req.session.flash = out.error;
      else { run('UPDATE bom_files SET rows_imported=? WHERE id=?', out.imported, b.id); req.session.flash = `Imported ${out.imported} parts into the project BOM.`; log(req, `Imported ${out.imported} BOM parts from '${b.filename}'`); }
    } catch (e) { req.session.flash = 'The file could not be read for import.'; }
    res.redirect('/bom?project=' + b.project_id);
  });
  app.post('/bom/:id/status', rolesRequired(...BOM_ROLES), (req, res) => {
    const b = get('SELECT * FROM bom_files WHERE id=?', +req.params.id); if (!b) return notFound(res);
    const s = req.body.status; if (!BOM_STATUS.includes(s)) return denied(res);
    if (['Approved', 'Released'].includes(s) && !RELEASE_ROLES.includes(req.user.role)) return denied(res);
    run('UPDATE bom_files SET status=? WHERE id=?', s, b.id); log(req, `BOM '${b.filename}' -> ${s}`); res.redirect('/bom?project=' + b.project_id);
  });
  app.post('/bom/:id/delete', rolesRequired(...MANAGERS, 'Hardware Engineer'), (req, res) => {
    const b = get('SELECT * FROM bom_files WHERE id=?', +req.params.id); if (!b) return notFound(res);
    rm(b.stored); run('UPDATE revisions SET bom_file_id=NULL WHERE bom_file_id=?', b.id); run('UPDATE batches SET bom_file_id=NULL WHERE bom_file_id=?', b.id);
    run('DELETE FROM bom_files WHERE id=?', b.id); log(req, `Deleted BOM file '${b.filename}'`); res.redirect('/bom?project=' + b.project_id);
  });

  // =====================================================================
  // COMPLIANCE (hardware standards)
  // =====================================================================
  crud({
    base: '/compliance', table: 'compliance', title: 'compliance item', roles: COMP_ROLES, delRoles: MANAGERS,
    cols: ['project_id', 'standard', 'clause', 'description', 'applicable', 'status', 'owner_id', 'test_lab', 'report_no', 'cert_no', 'issue_date', 'expiry_date', 'evidence', 'notes'],
    label: (v) => v.standard,
    defaults: (req) => ({ project_id: req.query.project }),
    fields: (v = {}) => [
      F('project_id', 'Project', 'select', projectOpts(), v.project_id),
      F('standard', 'Standard / regulation', 'select', STANDARDS.map((s) => s[0]), v.standard || STANDARDS[0][0]),
      F('clause', 'Clause / scope', 'text', [], v.clause, false),
      F('applicable', 'Applicable to this product?', 'select', ['Yes', 'No', 'To be confirmed'], v.applicable || 'Yes'),
      F('status', 'Compliance status', 'select', COMPL_STATUS, v.status || 'Not Started'),
      F('owner_id', 'Responsible employee', 'select', usersOpts(true), v.owner_id, false),
      F('test_lab', 'Test lab / certification body', 'text', [], v.test_lab, false),
      F('report_no', 'Test report number', 'text', [], v.report_no, false),
      F('cert_no', 'Certificate / DoC number', 'text', [], v.cert_no, false),
      F('issue_date', 'Issue date', 'date', [], v.issue_date, false),
      F('expiry_date', 'Expiry / renewal date', 'date', [], v.expiry_date, false),
      F('description', 'Requirement / description', 'textarea', [], v.description, false),
      F('evidence', 'Evidence summary', 'textarea', [], v.evidence, false, 'Upload the actual reports and certificates on the item page after saving.'),
      F('notes', 'Notes', 'textarea', [], v.notes, false),
    ],
    prep: (f) => ({ values: { project_id: +f.project_id, standard: f.standard, clause: f.clause, description: f.description, applicable: f.applicable, status: f.status, owner_id: nul(f.owner_id),
      test_lab: f.test_lab, report_no: f.report_no, cert_no: f.cert_no, issue_date: nul(f.issue_date), expiry_date: nul(f.expiry_date), evidence: f.evidence, notes: f.notes } }),
    afterUrl: (id) => '/compliance/' + id,
    beforeDelete: (ex) => { all("SELECT * FROM attachments WHERE ref_type='compliance' AND ref_id=?", ex.id).forEach((a) => rm(a.stored)); run("DELETE FROM attachments WHERE ref_type='compliance' AND ref_id=?", ex.id); run('UPDATE test_cases SET compliance_id=NULL WHERE compliance_id=?', ex.id); },
  });
  app.get('/compliance', loginRequired, (req, res) => {
    const pid = pidFrom(req);
    const rows = all(`SELECT c.*, p.name pname, u.name uname FROM compliance c JOIN projects p ON p.id=c.project_id LEFT JOIN users u ON u.id=c.owner_id
      ${pid ? 'WHERE c.project_id=?' : ''} ORDER BY p.name, c.standard`, ...(pid ? [pid] : []));
    const counts = {}; COMPL_STATUS.forEach((s) => (counts[s] = rows.filter((r) => r.status === s).length));
    res.render('compliance', { rows, counts, projects: projects(), pid, canEdit: COMP_ROLES.includes(req.user.role), soon: new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10) });
  });
  app.get('/compliance/add-standards', rolesRequired(...COMP_ROLES), (req, res) =>
    res.render('compliance_add', { STANDARDS: STANDARDS.filter((s) => s[0] !== 'Other'), projects: projects(), pid: pidFrom(req) }));
  app.post('/compliance/add-standards', rolesRequired(...COMP_ROLES), (req, res) => {
    const pid = +req.body.project_id; if (!get('SELECT 1 FROM projects WHERE id=?', pid)) return notFound(res);
    let picked = req.body.std || []; if (!Array.isArray(picked)) picked = [picked];
    let added = 0;
    picked.forEach((i) => {
      const s = STANDARDS[+i]; if (!s || s[0] === 'Other') return;
      if (get('SELECT 1 FROM compliance WHERE project_id=? AND standard=?', pid, s[0])) return;
      run("INSERT INTO compliance(project_id,standard,clause,description,applicable,status,created) VALUES(?,?,?,?,'To be confirmed','Not Started',?)", pid, s[0], s[1], s[2], now()); added++;
    });
    log(req, `Added ${added} compliance standards`); req.session.flash = `Added ${added} standards. Confirm which ones apply to your product with your certification body.`;
    res.redirect('/compliance?project=' + pid);
  });
  app.get('/compliance/:id', loginRequired, (req, res) => {
    const c = get('SELECT c.*, p.name pname, u.name uname FROM compliance c JOIN projects p ON p.id=c.project_id LEFT JOIN users u ON u.id=c.owner_id WHERE c.id=?', +req.params.id); if (!c) return notFound(res);
    const files = all("SELECT a.*, u.name uname FROM attachments a LEFT JOIN users u ON u.id=a.uploaded_by WHERE a.ref_type='compliance' AND a.ref_id=? ORDER BY a.id DESC", c.id);
    const tests = all(`SELECT tc.*, (SELECT result FROM test_runs WHERE test_case_id=tc.id ORDER BY id DESC LIMIT 1) last_result FROM test_cases tc WHERE compliance_id=?`, c.id);
    res.render('compliance_detail', { c, files, tests, EVIDENCE_KINDS, canEdit: COMP_ROLES.includes(req.user.role) });
  });
  app.post('/compliance/:id/files', rolesRequired(...COMP_ROLES), (req, res, next) => {
    upload.single('file')(req, res, (err) => { if (err) { req.session.flash = err.code === 'LIMIT_FILE_SIZE' ? 'File too large (max 50 MB).' : 'Upload failed.'; return res.redirect('/compliance/' + req.params.id); } next(); });
  }, (req, res) => {
    const c = get('SELECT * FROM compliance WHERE id=?', +req.params.id);
    if (!c) { if (req.file) rm(req.file.filename); return notFound(res); }
    if (!req.file) { req.session.flash = 'No file uploaded, or that file type is not allowed.'; return res.redirect('/compliance/' + c.id); }
    const kind = EVIDENCE_KINDS.includes(req.body.kind) ? req.body.kind : 'Other';
    run("INSERT INTO attachments(task_id,filename,stored,kind,size,uploaded_by,created,ref_type,ref_id,revision) VALUES(NULL,?,?,?,?,?,?,'compliance',?,?)",
      path.basename(req.file.originalname), req.file.filename, kind, req.file.size, req.user.id, now(), c.id, req.body.revision || '');
    log(req, `Uploaded ${kind} '${req.file.originalname}' for ${c.standard}`); res.redirect('/compliance/' + c.id);
  });

  // =====================================================================
  // REQUIREMENTS
  // =====================================================================
  crud({
    base: '/requirements', table: 'requirements', title: 'requirement', roles: REQ_ROLES, delRoles: MANAGERS,
    cols: ['project_id', 'req_id', 'title', 'description', 'category', 'priority', 'source', 'standard_ref', 'status', 'owner_id'],
    label: (v) => v.req_id,
    defaults: (req) => ({ project_id: req.query.project }),
    fields: (v = {}) => [
      F('project_id', 'Project', 'select', projectOpts(), v.project_id),
      F('req_id', 'Requirement ID', 'text', [], v.req_id, false, 'Leave blank to auto-number (REQ-001, REQ-002…).'),
      F('title', 'Requirement title', 'text', [], v.title),
      F('category', 'Category', 'select', REQ_CATEGORIES, v.category || 'Functional'),
      F('priority', 'Priority', 'select', PRIORITIES, v.priority || 'Medium'),
      F('status', 'Status', 'select', REQ_STATUS, v.status || 'Draft'),
      F('source', 'Source', 'select', ['Customer', 'Standard / regulation', 'Internal', 'Market'], v.source || 'Customer'),
      F('standard_ref', 'Standard reference', 'text', [], v.standard_ref, false, 'e.g. IEC 61000-4-2'),
      F('owner_id', 'Owner', 'select', usersOpts(true), v.owner_id, false),
      F('description', 'Description / acceptance criteria', 'textarea', [], v.description, false),
    ],
    prep: (f, req, ex) => ({ values: { project_id: +f.project_id, req_id: (f.req_id || '').trim() || (ex && ex.req_id) || nextCode('requirements', 'req_id', 'REQ', +f.project_id),
      title: f.title, description: f.description, category: f.category, priority: f.priority, source: f.source, standard_ref: f.standard_ref, status: f.status, owner_id: nul(f.owner_id) } }),
    beforeDelete: (ex) => run('UPDATE test_cases SET requirement_id=NULL WHERE requirement_id=?', ex.id),
  });
  const LAST = `(SELECT result FROM test_runs WHERE test_case_id=tc.id ORDER BY id DESC LIMIT 1) last_result,
    (SELECT executed_on FROM test_runs WHERE test_case_id=tc.id ORDER BY id DESC LIMIT 1) last_on,
    (SELECT revision FROM test_runs WHERE test_case_id=tc.id ORDER BY id DESC LIMIT 1) last_rev,
    (SELECT COUNT(*) FROM test_runs WHERE test_case_id=tc.id) run_count`;
  app.get('/requirements', loginRequired, (req, res) => {
    const pid = pidFrom(req);
    const rows = all(`SELECT r.*, p.name pname, u.name uname FROM requirements r JOIN projects p ON p.id=r.project_id LEFT JOIN users u ON u.id=r.owner_id
      ${pid ? 'WHERE r.project_id=?' : ''} ORDER BY p.name, r.req_id`, ...(pid ? [pid] : []));
    const tests = all(`SELECT tc.id, tc.requirement_id, ${LAST} FROM test_cases tc WHERE tc.requirement_id IS NOT NULL`);
    rows.forEach((r) => { const t = tests.filter((x) => x.requirement_id === r.id); r.tests = t.length; r.failing = t.some((x) => x.last_result === 'Fail'); r.verified = t.length > 0 && t.every((x) => x.last_result === 'Pass'); });
    res.render('requirements', { rows, projects: projects(), pid, canEdit: REQ_ROLES.includes(req.user.role) });
  });

  // =====================================================================
  // TEST CASES + RUNS
  // =====================================================================
  crud({
    base: '/testcases', table: 'test_cases', title: 'test case', roles: TEST_ROLES, delRoles: MANAGERS.concat('Testing Engineer'),
    cols: ['project_id', 'tc_id', 'title', 'category', 'phase', 'requirement_id', 'compliance_id', 'preconditions', 'procedure', 'expected', 'equipment', 'owner_id', 'priority'],
    label: (v) => v.tc_id,
    defaults: (req) => ({ project_id: req.query.project }),
    fields: (v = {}) => [
      F('project_id', 'Project', 'select', projectOpts(), v.project_id),
      F('tc_id', 'Test case ID', 'text', [], v.tc_id, false, 'Leave blank to auto-number (TC-001…).'),
      F('title', 'Test title', 'text', [], v.title),
      F('category', 'Category', 'select', TEST_CATEGORIES, v.category || 'Functional'),
      F('phase', 'Development phase', 'select', TEST_PHASES, v.phase || 'EVT'),
      F('priority', 'Priority', 'select', PRIORITIES, v.priority || 'Medium'),
      F('requirement_id', 'Verifies requirement', 'select', reqOpts(), v.requirement_id, false),
      F('compliance_id', 'Supports compliance item', 'select', complOpts(), v.compliance_id, false),
      F('owner_id', 'Test owner', 'select', usersOpts(true), v.owner_id, false),
      F('equipment', 'Equipment / setup', 'text', [], v.equipment, false),
      F('preconditions', 'Preconditions', 'textarea', [], v.preconditions, false),
      F('procedure', 'Test procedure (steps)', 'textarea', [], v.procedure, false),
      F('expected', 'Expected result / pass criteria', 'textarea', [], v.expected, false),
    ],
    prep: (f, req, ex) => ({ values: { project_id: +f.project_id, tc_id: (f.tc_id || '').trim() || (ex && ex.tc_id) || nextCode('test_cases', 'tc_id', 'TC', +f.project_id), title: f.title, category: f.category, phase: f.phase,
      requirement_id: nul(f.requirement_id), compliance_id: nul(f.compliance_id), preconditions: f.preconditions, procedure: f.procedure, expected: f.expected, equipment: f.equipment, owner_id: nul(f.owner_id), priority: f.priority } }),
    afterUrl: (id) => '/testcases/' + id,
    beforeDelete: (ex) => run('DELETE FROM test_runs WHERE test_case_id=?', ex.id),
  });
  app.get('/testcases', loginRequired, (req, res) => {
    const pid = pidFrom(req), phase = TEST_PHASES.includes(req.query.phase) ? req.query.phase : '', result = String(req.query.result || '');
    let rows = all(`SELECT tc.*, p.name pname, u.name uname, r.req_id, ${LAST} FROM test_cases tc JOIN projects p ON p.id=tc.project_id
      LEFT JOIN users u ON u.id=tc.owner_id LEFT JOIN requirements r ON r.id=tc.requirement_id
      WHERE 1=1 ${pid ? 'AND tc.project_id=?' : ''} ${phase ? 'AND tc.phase=?' : ''} ORDER BY p.name, tc.tc_id`, ...(pid ? [pid] : []), ...(phase ? [phase] : []));
    if (result) rows = rows.filter((r) => (result === 'Not Run' ? !r.last_result : r.last_result === result));
    const sum = { total: rows.length, Pass: 0, Fail: 0, Blocked: 0, 'Not Run': 0 };
    rows.forEach((r) => { const k = r.last_result || 'Not Run'; if (sum[k] !== undefined) sum[k]++; });
    res.render('testcases', { rows, sum, projects: projects(), pid, phase, result, TEST_PHASES, canEdit: TEST_ROLES.includes(req.user.role) });
  });
  const generateFields = (v = {}) => [
    F('project_id', 'Project', 'select', projectOpts(), v.project_id),
    F('phase', 'Phases to include', 'select', [['all', 'All phases (EVT → Mass Production)']].concat(TEST_PHASES.map((p) => [p, p + ' only'])), v.phase || 'all'),
    F('owner_id', 'Default test owner', 'select', usersByRole('Testing Engineer'), v.owner_id),
  ];
  const generateIntro = `Creates a standard hardware test plan: EVT bring-up, DVT design validation, PVT production validation and mass-production tests (incoming inspection, SPI/AOI, ICT, FCT, firmware programming, final QA). Each case has a procedure, expected result and equipment list that you can edit. Existing tests with the same title are skipped.`;
  app.get('/testcases/generate', rolesRequired(...TEST_ROLES), (req, res) => formPage(res, 'Generate standard test plan', generateFields({ project_id: pidFrom(req) }), '/testcases', generateIntro));
  app.post('/testcases/generate', rolesRequired(...TEST_ROLES), (req, res) => {
    const pid = +req.body.project_id; if (!get('SELECT 1 FROM projects WHERE id=?', pid)) return notFound(res);
    const only = TEST_PHASES.includes(req.body.phase) ? req.body.phase : null; let added = 0;
    db.transaction(() => {
      TESTPLAN.filter((t) => !only || t[0] === only).forEach((t) => {
        if (get('SELECT 1 FROM test_cases WHERE project_id=? AND title=?', pid, t[2])) return;
        run(`INSERT INTO test_cases(project_id,tc_id,title,category,phase,preconditions,procedure,expected,equipment,owner_id,priority,created) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
          pid, nextCode('test_cases', 'tc_id', 'TC', pid), t[2], t[1], t[0], t[3], t[4], t[5], t[6], nul(req.body.owner_id), t[7], now()); added++;
      });
    })();
    log(req, `Generated ${added} standard test cases`); req.session.flash = `Created ${added} test cases. Link them to requirements to build the traceability matrix.`;
    res.redirect('/testcases?project=' + pid);
  });
  app.get('/testcases/:id', loginRequired, (req, res) => {
    const t = get(`SELECT tc.*, p.name pname, p.revision prev, u.name uname, r.req_id, r.title rtitle, c.standard cstandard FROM test_cases tc JOIN projects p ON p.id=tc.project_id
      LEFT JOIN users u ON u.id=tc.owner_id LEFT JOIN requirements r ON r.id=tc.requirement_id LEFT JOIN compliance c ON c.id=tc.compliance_id WHERE tc.id=?`, +req.params.id);
    if (!t) return notFound(res);
    const runs = all('SELECT r.*, u.name uname FROM test_runs r LEFT JOIN users u ON u.id=r.executed_by WHERE test_case_id=? ORDER BY r.id DESC', t.id);
    res.render('testcase_detail', { t, runs, TEST_RESULTS, canRun: TEST_ROLES.includes(req.user.role), canEdit: TEST_ROLES.includes(req.user.role) });
  });
  app.post('/testcases/:id/run', rolesRequired(...TEST_ROLES), (req, res) => {
    const t = get('SELECT * FROM test_cases WHERE id=?', +req.params.id); if (!t) return notFound(res);
    const f = req.body; if (!TEST_RESULTS.includes(f.result)) return denied(res);
    const serial = String(f.serial || '').trim(); const unit = serial ? get('SELECT * FROM units WHERE serial=?', serial) : null;
    if (serial && !unit) { req.session.flash = `Serial number "${serial}" was not found in production batches. Leave it blank or create the batch first.`; return res.redirect('/testcases/' + t.id); }
    run('INSERT INTO test_runs(test_case_id,result,revision,unit_id,serial,measured,notes,executed_by,executed_on) VALUES(?,?,?,?,?,?,?,?,?)',
      t.id, f.result, (f.revision || '').trim(), unit ? unit.id : null, serial, f.measured, f.notes, req.user.id, now());
    if (unit && f.result === 'Fail') run("UPDATE units SET status='Failed' WHERE id=?", unit.id);
    else if (unit && unit.status === 'Built') run("UPDATE units SET status='In Test' WHERE id=?", unit.id);
    if (f.result === 'Fail') {
      run("INSERT INTO reviews(project_id,kind,title,reviewer_id,status,notes,created,gate,severity) VALUES(?,'Issue',?,?,'Open',?,?,'N/A','High')",
        t.project_id, `Test failed: ${t.tc_id} ${t.title}`, t.owner_id || req.user.id, `Revision ${f.revision || '-'}${serial ? ', serial ' + serial : ''}. Measured: ${f.measured || '-'}. ${f.notes || ''}`.trim(), now());
      req.session.flash = 'Failure recorded and an Issue was opened under Reviews & Issues.';
    }
    log(req, `Test ${t.tc_id} -> ${f.result}${serial ? ' (' + serial + ')' : ''}`); res.redirect('/testcases/' + t.id);
  });

  // =====================================================================
  // TRACEABILITY (requirements ↔ tests ↔ revisions ↔ units)
  // =====================================================================
  app.get('/traceability', loginRequired, (req, res) => {
    const ps = projects(); const pid = pidFrom(req) || (ps[0] && ps[0].id) || null;
    const q = String(req.query.serial || '').trim();
    let matrix = [], unlinked = [], stats = null, revs = [], compl = [], batches = [];
    if (pid) {
      const reqs = all('SELECT r.*, u.name uname FROM requirements r LEFT JOIN users u ON u.id=r.owner_id WHERE project_id=? ORDER BY req_id', pid);
      const tests = all(`SELECT tc.*, ${LAST} FROM test_cases tc WHERE project_id=? ORDER BY tc_id`, pid);
      matrix = reqs.map((r) => { const t = tests.filter((x) => x.requirement_id === r.id); return { ...r, tests: t, verified: t.length > 0 && t.every((x) => x.last_result === 'Pass'), failing: t.some((x) => x.last_result === 'Fail') }; });
      unlinked = tests.filter((x) => !x.requirement_id);
      stats = { reqs: reqs.length, covered: matrix.filter((m) => m.tests.length).length, verified: matrix.filter((m) => m.verified).length, tests: tests.length,
        pass: tests.filter((x) => x.last_result === 'Pass').length, fail: tests.filter((x) => x.last_result === 'Fail').length, notRun: tests.filter((x) => !x.last_result).length };
      revs = all('SELECT * FROM revisions WHERE project_id=? ORDER BY id DESC', pid);
      compl = all('SELECT * FROM compliance WHERE project_id=? ORDER BY standard', pid);
      batches = all('SELECT b.*, (SELECT COUNT(*) FROM units WHERE batch_id=b.id) units, (SELECT COUNT(*) FROM units WHERE batch_id=b.id AND status=\'Passed\') passed FROM batches b WHERE project_id=? ORDER BY id DESC', pid);
    }
    let found = [], unit = null, unitRuns = [];
    if (q) {
      found = all(`SELECT u.*, b.batch_no, b.phase, b.revision, b.date_code, b.pcb_vendor, b.assembly_vendor, b.bom_file_id, p.name pname, bf.filename bom_name, bf.version bom_version
        FROM units u JOIN batches b ON b.id=u.batch_id JOIN projects p ON p.id=b.project_id LEFT JOIN bom_files bf ON bf.id=b.bom_file_id
        WHERE instr(lower(u.serial), lower(?))>0 OR instr(lower(b.batch_no), lower(?))>0 ORDER BY u.serial LIMIT 50`, q, q);
      unit = found.find((u) => u.serial.toLowerCase() === q.toLowerCase()) || (found.length === 1 ? found[0] : null);
      if (unit) unitRuns = all('SELECT r.*, tc.tc_id, tc.title, tc.phase, u.name uname FROM test_runs r JOIN test_cases tc ON tc.id=r.test_case_id LEFT JOIN users u ON u.id=r.executed_by WHERE r.unit_id=? ORDER BY r.id DESC', unit.id);
    }
    res.render('traceability', { projects: ps, pid, q, matrix, unlinked, stats, revs, compl, batches, found, unit, unitRuns });
  });

  // =====================================================================
  // PRODUCTION BATCHES + UNITS (serial-number back-tracking)
  // =====================================================================
  const serialOf = (prefix, i) => `${prefix}${String(i).padStart(4, '0')}`;
  crud({
    base: '/production', table: 'batches', title: 'production batch', roles: PROD_ROLES, delRoles: MANAGERS,
    cols: ['project_id', 'batch_no', 'phase', 'revision', 'bom_file_id', 'quantity', 'serial_prefix', 'pcb_vendor', 'assembly_vendor', 'date_code', 'start_date', 'due_date', 'status', 'notes'],
    label: (v) => v.batch_no,
    defaults: (req) => ({ project_id: req.query.project, start_date: today() }),
    fields: (v = {}) => [
      F('project_id', 'Project', 'select', projectOpts(), v.project_id),
      F('batch_no', 'Batch / lot number', 'text', [], v.batch_no, false, 'Leave blank to auto-number (B-001…).'),
      F('phase', 'Build phase', 'select', BUILD_PHASES, v.phase || 'Prototype'),
      F('revision', 'Hardware revision built', 'text', [], v.revision, true, 'e.g. A or 1.0 — see Revisions.'),
      F('bom_file_id', 'BOM file used (Excel)', 'select', bomOpts(), v.bom_file_id, false),
      F('quantity', 'Quantity (boards)', 'number', [], v.quantity ?? 10, true, 'Serial numbers are generated automatically when the batch is created (max 1000).'),
      F('serial_prefix', 'Serial number prefix', 'text', [], v.serial_prefix, true, 'e.g. SSB-A-  → SSB-A-0001, SSB-A-0002… (cannot be changed later)'),
      F('pcb_vendor', 'PCB fabrication vendor', 'text', [], v.pcb_vendor, false),
      F('assembly_vendor', 'Assembly vendor', 'text', [], v.assembly_vendor, false),
      F('date_code', 'PCB date code / lot', 'text', [], v.date_code, false),
      F('status', 'Status', 'select', BATCH_STATUS, v.status || 'Planned'),
      F('start_date', 'Start date', 'date', [], v.start_date, false),
      F('due_date', 'Planned completion', 'date', [], v.due_date, false),
      F('notes', 'Notes', 'textarea', [], v.notes, false),
    ],
    prep: (f, req, ex) => {
      const pid = +f.project_id; let qty = Math.round(num(f.quantity)); let prefix = ex ? ex.serial_prefix : String(f.serial_prefix || '').trim();
      if (!ex) {
        if (!prefix) return { error: 'Serial number prefix is required.' };
        if (qty < 1 || qty > 1000) return { error: 'Quantity must be between 1 and 1000.' };
        for (let i = 1; i <= qty; i++) if (get('SELECT 1 FROM units WHERE serial=?', serialOf(prefix, i))) return { error: `Serial ${serialOf(prefix, i)} already exists. Choose a different prefix.` };
      } else qty = ex.quantity;
      return { values: { project_id: pid, batch_no: (f.batch_no || '').trim() || (ex && ex.batch_no) || nextCode('batches', 'batch_no', 'B', pid), phase: f.phase, revision: (f.revision || '').trim(),
        bom_file_id: nul(f.bom_file_id), quantity: qty, serial_prefix: prefix, pcb_vendor: f.pcb_vendor, assembly_vendor: f.assembly_vendor, date_code: f.date_code,
        start_date: nul(f.start_date), due_date: nul(f.due_date), status: f.status, notes: f.notes } };
    },
    after: (req, id, v, isNew) => { if (isNew) { const ins = db.prepare("INSERT INTO units(batch_id,serial,status) VALUES(?,?,'Built')"); db.transaction(() => { for (let i = 1; i <= v.quantity; i++) ins.run(id, serialOf(v.serial_prefix, i)); })(); } },
    afterUrl: (id) => '/production/' + id,
    beforeDelete: (ex) => { run('UPDATE test_runs SET unit_id=NULL WHERE unit_id IN (SELECT id FROM units WHERE batch_id=?)', ex.id); run('DELETE FROM units WHERE batch_id=?', ex.id); },
  });
  app.get('/production', loginRequired, (req, res) => {
    const pid = pidFrom(req);
    const rows = all(`SELECT b.*, p.name pname, bf.filename bom_name,
      (SELECT COUNT(*) FROM units WHERE batch_id=b.id AND status='Passed') passed, (SELECT COUNT(*) FROM units WHERE batch_id=b.id AND status='Failed') failed,
      (SELECT COUNT(*) FROM units WHERE batch_id=b.id AND status='Shipped') shipped FROM batches b JOIN projects p ON p.id=b.project_id LEFT JOIN bom_files bf ON bf.id=b.bom_file_id
      ${pid ? 'WHERE b.project_id=?' : ''} ORDER BY b.id DESC`, ...(pid ? [pid] : []));
    res.render('production', { rows, projects: projects(), pid, canEdit: PROD_ROLES.includes(req.user.role) });
  });
  app.get('/production/:id', loginRequired, (req, res) => {
    const b = get(`SELECT b.*, p.name pname, bf.filename bom_name, bf.version bom_version FROM batches b JOIN projects p ON p.id=b.project_id LEFT JOIN bom_files bf ON bf.id=b.bom_file_id WHERE b.id=?`, +req.params.id);
    if (!b) return notFound(res);
    const units = all('SELECT u.*, (SELECT COUNT(*) FROM test_runs WHERE unit_id=u.id) runs, (SELECT result FROM test_runs WHERE unit_id=u.id ORDER BY id DESC LIMIT 1) last_result FROM units u WHERE batch_id=? ORDER BY serial', b.id);
    const stat = {}; UNIT_STATUS.forEach((s) => (stat[s] = units.filter((u) => u.status === s).length));
    const tested = stat.Passed + stat.Failed; const yieldPct = tested ? Math.round((stat.Passed * 100) / tested) : null;
    res.render('batch_detail', { b, units, stat, yieldPct, UNIT_STATUS, canEdit: PROD_ROLES.includes(req.user.role) });
  });
  app.post('/units/:id', rolesRequired(...PROD_ROLES), (req, res) => {
    const u = get('SELECT * FROM units WHERE id=?', +req.params.id); if (!u) return notFound(res);
    if (!UNIT_STATUS.includes(req.body.status)) return denied(res);
    run('UPDATE units SET status=?, notes=? WHERE id=?', req.body.status, req.body.notes || '', u.id);
    log(req, `Unit ${u.serial} -> ${req.body.status}`); res.redirect('/production/' + u.batch_id);
  });
};
