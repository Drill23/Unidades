const STATE_SHEET = 'State';
const UNITS_SHEET = 'Units';
const DOCUMENTS_SHEET = 'Documents';
const TASKS_SHEET = 'Tasks';
const MESSAGES_SHEET = 'Messages';
const ACTIVITY_SHEET = 'Activity';
const SESSION_TTL_SECONDS = 21600;
const TRASH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const UNITS = [
  { id: 'jaguapita', name: 'Jaguapitã', password: 'jaguapita' },
  { id: 'palmeiras', name: 'Palmeiras', password: 'palmeiras' },
  { id: 'ipuacu', name: 'Ipuaçu', password: 'ipuacu' },
  { id: 'arapongas', name: 'Arapongas', password: 'arapongas' },
  { id: 'rondon', name: 'Rondon', password: 'rondon' }
];

const DEFAULT_STATE = {
  version: 1,
  updatedAt: new Date().toISOString(),
  settings: {
    adminUser: 'rosa',
    adminPassword: 'gass'
  },
  units: UNITS.reduce((acc, unit) => {
    acc[unit.id] = {
      id: unit.id,
      name: unit.name,
      documents: [],
      activity: []
    };
    return acc;
  }, {}),
  messages: []
};

function doGet(event) {
  if (event && event.parameter && event.parameter.api === '1') {
    return jsonResponse({
      ok: true,
      name: 'Unidades API',
      units: UNITS.map((unit) => unit.id),
      actions: ['loginUnit', 'loginAdmin', 'getState', 'saveUnit', 'sendMessage']
    });
  }

  setupWorkbook();
  return HtmlService
    .createHtmlOutputFromFile('Index')
    .setTitle('Unidades')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function loginUnitServer(unitId, password) {
  const unit = getUnitDefinition(unitId);
  if (!unit || normalizePassword(password) !== unit.password) {
    throw new Error('invalid_unit_password');
  }
  const token = Utilities.getUuid();
  CacheService.getScriptCache().put(sessionKey(token), JSON.stringify({ role: 'unit', unitId: unit.id }), SESSION_TTL_SECONDS);
  return { token, role: 'unit', unitId: unit.id, unitName: unit.name };
}

function loginAdminServer(username, password) {
  setupWorkbook();
  const state = readState();
  const expectedUser = String(state.settings.adminUser || 'rosa').trim().toLowerCase();
  const expectedPassword = String(state.settings.adminPassword || 'gass');
  if (String(username || '').trim().toLowerCase() !== expectedUser || String(password || '') !== expectedPassword) {
    throw new Error('invalid_admin_login');
  }
  const token = Utilities.getUuid();
  CacheService.getScriptCache().put(sessionKey(token), JSON.stringify({ role: 'admin' }), SESSION_TTL_SECONDS);
  return { token, role: 'admin', user: expectedUser };
}

function getStateServer(token) {
  setupWorkbook();
  const session = assertSession(token);
  const state = cleanupTrash(readState());
  writeState(state);
  mirrorReadableSheets(state);
  if (session.role === 'admin') {
    return { role: 'admin', state };
  }
  return {
    role: 'unit',
    unitId: session.unitId,
    unit: state.units[session.unitId],
    messages: messagesForUnit(state, session.unitId)
  };
}

function saveUnitServer(token, unitId, unitState) {
  setupWorkbook();
  const session = assertSession(token);
  if (session.role !== 'admin' && session.unitId !== unitId) {
    throw new Error('forbidden_unit');
  }
  const state = readState();
  ensureStateShape(state);
  state.units[unitId] = normalizeUnitState(unitId, unitState);
  state.updatedAt = new Date().toISOString();
  const clean = cleanupTrash(state);
  writeState(clean);
  mirrorReadableSheets(clean);
  return session.role === 'admin'
    ? { role: 'admin', state: clean }
    : { role: 'unit', unitId, unit: clean.units[unitId], messages: messagesForUnit(clean, unitId) };
}

function sendMessageServer(token, message) {
  setupWorkbook();
  const session = assertSession(token);
  if (session.role !== 'admin') throw new Error('admin_only');
  const state = readState();
  ensureStateShape(state);
  const targets = Array.isArray(message.targets) && message.targets.length ? message.targets : UNITS.map((unit) => unit.id);
  const cleanTargets = targets.filter((target) => Boolean(getUnitDefinition(target)));
  state.messages = [
    {
      id: `msg_${Utilities.getUuid()}`,
      title: String(message.title || 'Mensagem da Rosa').trim(),
      text: String(message.text || '').trim(),
      targets: cleanTargets,
      seenBy: [],
      createdAt: new Date().toISOString()
    },
    ...(state.messages || [])
  ].slice(0, 200);
  state.updatedAt = new Date().toISOString();
  writeState(state);
  mirrorReadableSheets(state);
  return { role: 'admin', state };
}

function markMessageSeenServer(token, messageId) {
  setupWorkbook();
  const session = assertSession(token);
  if (session.role !== 'unit') throw new Error('unit_only');
  const state = readState();
  ensureStateShape(state);
  state.messages = state.messages.map((message) => {
    if (message.id !== messageId) return message;
    const seenBy = new Set(message.seenBy || []);
    seenBy.add(session.unitId);
    return { ...message, seenBy: [...seenBy] };
  });
  writeState(state);
  mirrorReadableSheets(state);
  return {
    role: 'unit',
    unitId: session.unitId,
    unit: state.units[session.unitId],
    messages: messagesForUnit(state, session.unitId)
  };
}

function updateAdminPasswordServer(token, currentPassword, nextPassword) {
  setupWorkbook();
  const session = assertSession(token);
  if (session.role !== 'admin') throw new Error('admin_only');
  const state = readState();
  ensureStateShape(state);
  if (String(currentPassword || '') !== String(state.settings.adminPassword || 'gass')) {
    throw new Error('invalid_current_password');
  }
  if (!String(nextPassword || '').trim()) throw new Error('empty_password');
  state.settings.adminPassword = String(nextPassword);
  state.updatedAt = new Date().toISOString();
  writeState(state);
  mirrorReadableSheets(state);
  return { role: 'admin', state };
}

function emptyTrashServer(token, unitId, password) {
  setupWorkbook();
  const session = assertSession(token);
  const unit = getUnitDefinition(unitId);
  if (!unit) throw new Error('invalid_unit');
  if (session.role !== 'admin') {
    if (session.unitId !== unitId) throw new Error('forbidden_unit');
    if (normalizePassword(password) !== unit.password) throw new Error('invalid_unit_password');
  }
  const state = readState();
  ensureStateShape(state);
  const unitState = state.units[unitId];
  unitState.documents = (unitState.documents || []).filter((document) => !document.deletedAt);
  unitState.activity = pushActivity(unitState.activity, 'trash_emptied', {});
  state.updatedAt = new Date().toISOString();
  writeState(state);
  mirrorReadableSheets(state);
  return session.role === 'admin'
    ? { role: 'admin', state }
    : { role: 'unit', unitId, unit: state.units[unitId], messages: messagesForUnit(state, unitId) };
}

function setupWorkbook() {
  const spreadsheet = SpreadsheetApp.getActive();
  ensureSheet(spreadsheet, STATE_SHEET);
  ensureSheet(spreadsheet, UNITS_SHEET);
  ensureSheet(spreadsheet, DOCUMENTS_SHEET);
  ensureSheet(spreadsheet, TASKS_SHEET);
  ensureSheet(spreadsheet, MESSAGES_SHEET);
  ensureSheet(spreadsheet, ACTIVITY_SHEET);

  const stateSheet = spreadsheet.getSheetByName(STATE_SHEET);
  stateSheet.getRange('A1:B1').setValues([['key', 'value']]).setFontWeight('bold');
  stateSheet.getRange('A2').setValue('state_json');
  if (!stateSheet.getRange('B2').getValue()) {
    stateSheet.getRange('B2').setValue(JSON.stringify(DEFAULT_STATE));
  }

  spreadsheet.getSheetByName(UNITS_SHEET)
    .getRange('A1:E1')
    .setValues([['unitId', 'name', 'activeDocuments', 'pendingDocuments', 'doneDocuments']])
    .setFontWeight('bold');

  spreadsheet.getSheetByName(DOCUMENTS_SHEET)
    .getRange('A1:I1')
    .setValues([['unitId', 'documentId', 'title', 'owner', 'context', 'color', 'createdAt', 'updatedAt', 'deletedAt']])
    .setFontWeight('bold');

  spreadsheet.getSheetByName(TASKS_SHEET)
    .getRange('A1:J1')
    .setValues([['unitId', 'documentId', 'taskId', 'order', 'text', 'done', 'note', 'createdAt', 'updatedAt', 'deletedAt']])
    .setFontWeight('bold');

  spreadsheet.getSheetByName(MESSAGES_SHEET)
    .getRange('A1:F1')
    .setValues([['id', 'title', 'text', 'targets', 'seenBy', 'createdAt']])
    .setFontWeight('bold');

  spreadsheet.getSheetByName(ACTIVITY_SHEET)
    .getRange('A1:E1')
    .setValues([['unitId', 'id', 'action', 'details', 'createdAt']])
    .setFontWeight('bold');
}

function readState() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(STATE_SHEET);
  if (!sheet) return DEFAULT_STATE;
  const raw = sheet.getRange('B2').getValue();
  const state = raw ? JSON.parse(raw) : DEFAULT_STATE;
  ensureStateShape(state);
  return state;
}

function writeState(state) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(STATE_SHEET);
  sheet.getRange('B2').setValue(JSON.stringify(state));
  sheet.getRange('B3').setValue(new Date().toISOString());
}

function mirrorReadableSheets(state) {
  const spreadsheet = SpreadsheetApp.getActive();
  const unitsRows = UNITS.map((unit) => {
    const unitState = state.units[unit.id] || { documents: [] };
    const docs = unitState.documents || [];
    return [
      unit.id,
      unit.name,
      docs.filter((doc) => !doc.deletedAt).length,
      docs.filter((doc) => !doc.deletedAt && !isComplete(doc)).length,
      docs.filter((doc) => !doc.deletedAt && isComplete(doc)).length
    ];
  });

  const documentRows = [];
  const taskRows = [];
  const activityRows = [];
  UNITS.forEach((unit) => {
    const unitState = state.units[unit.id] || { documents: [], activity: [] };
    (unitState.documents || []).forEach((document) => {
      documentRows.push([
        unit.id,
        document.id,
        document.title,
        document.owner || '',
        document.context || '',
        document.color || '',
        document.createdAt || '',
        document.updatedAt || '',
        document.deletedAt || ''
      ]);
      (document.tasks || []).forEach((task) => {
        taskRows.push([
          unit.id,
          document.id,
          task.id,
          task.order,
          task.text,
          task.done,
          task.note || '',
          task.createdAt || '',
          task.updatedAt || '',
          task.deletedAt || ''
        ]);
      });
    });
    (unitState.activity || []).forEach((item) => {
      activityRows.push([unit.id, item.id, item.action, JSON.stringify(item.details || {}), item.createdAt || '']);
    });
  });

  const messageRows = (state.messages || []).map((message) => [
    message.id,
    message.title,
    message.text,
    (message.targets || []).join(', '),
    (message.seenBy || []).join(', '),
    message.createdAt || ''
  ]);

  replaceRows(spreadsheet.getSheetByName(UNITS_SHEET), unitsRows, 5);
  replaceRows(spreadsheet.getSheetByName(DOCUMENTS_SHEET), documentRows, 9);
  replaceRows(spreadsheet.getSheetByName(TASKS_SHEET), taskRows, 10);
  replaceRows(spreadsheet.getSheetByName(MESSAGES_SHEET), messageRows, 6);
  replaceRows(spreadsheet.getSheetByName(ACTIVITY_SHEET), activityRows, 5);
}

function replaceRows(sheet, rows, width) {
  const maxRows = Math.max(sheet.getMaxRows() - 1, 1);
  sheet.getRange(2, 1, maxRows, width).clearContent();
  if (rows.length) {
    sheet.getRange(2, 1, rows.length, width).setValues(rows);
  }
  sheet.autoResizeColumns(1, width);
}

function ensureStateShape(state) {
  state.version = Number(state.version || 1);
  state.updatedAt = state.updatedAt || new Date().toISOString();
  state.settings = state.settings || { adminUser: 'rosa', adminPassword: 'gass' };
  state.settings.adminUser = state.settings.adminUser || 'rosa';
  state.settings.adminPassword = state.settings.adminPassword || 'gass';
  state.messages = Array.isArray(state.messages) ? state.messages : [];
  state.units = state.units || {};
  UNITS.forEach((unit) => {
    state.units[unit.id] = normalizeUnitState(unit.id, state.units[unit.id] || {});
  });
}

function normalizeUnitState(unitId, unitState) {
  const definition = getUnitDefinition(unitId);
  return {
    id: unitId,
    name: definition ? definition.name : unitId,
    documents: Array.isArray(unitState.documents) ? unitState.documents : [],
    activity: Array.isArray(unitState.activity) ? unitState.activity : []
  };
}

function cleanupTrash(state) {
  ensureStateShape(state);
  const cutoff = Date.now() - TRASH_TTL_MS;
  UNITS.forEach((unit) => {
    state.units[unit.id].documents = (state.units[unit.id].documents || []).filter((document) => {
      if (!document.deletedAt) return true;
      return new Date(document.deletedAt).getTime() > cutoff;
    });
  });
  return state;
}

function messagesForUnit(state, unitId) {
  return (state.messages || []).filter((message) => (message.targets || []).includes(unitId));
}

function assertSession(token) {
  if (!token) throw new Error('unauthorized');
  const raw = CacheService.getScriptCache().get(sessionKey(token));
  if (!raw) throw new Error('unauthorized');
  CacheService.getScriptCache().put(sessionKey(token), raw, SESSION_TTL_SECONDS);
  return JSON.parse(raw);
}

function sessionKey(token) {
  return `session:${token}`;
}

function getUnitDefinition(unitId) {
  return UNITS.find((unit) => unit.id === unitId);
}

function normalizePassword(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function isComplete(document) {
  return (document.tasks || []).length > 0 && (document.tasks || []).every((task) => task.done);
}

function pushActivity(activity, action, details) {
  return [
    {
      id: `act_${Utilities.getUuid()}`,
      action,
      details: details || {},
      createdAt: new Date().toISOString()
    },
    ...(activity || [])
  ].slice(0, 120);
}

function ensureSheet(spreadsheet, name) {
  return spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
}

function jsonResponse(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
