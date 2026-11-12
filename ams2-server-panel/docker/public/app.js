'use strict';
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

let config = null;      // parsed server.cfg
let sess = {};          // working copy of sessionAttributes
let lists = {};         // cached lists from the dedicated server
let state = null;
let display = { dateFormat: 'iso', timeFormat: '24h' };
let logLast = 0;

// ------------------------------------------------------------------ helpers --

async function api(method, url, body) {
  const res = await fetch(url, {
    method, headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && url !== '/api/auth/login') { showLogin(); throw new Error(data.error || 'Please sign in.'); }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

let toastTimer;
function toast(msg, bad) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.toggle('bad', !!bad);
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), bad ? 7000 : 3500);
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pretty = (name) => String(name ?? '').replace(/_/g, ' ');
const idOf = (x) => (x.id !== undefined ? x.id : x.value);
const carCount = (n) => `${n} car${n === 1 ? '' : 's'}`;
const byName = (a, b) => String(a.name).localeCompare(String(b.name));

// Lists from the server API come as {list:[...]} or as plain arrays.
function listOf(x) {
  if (!x) return [];
  if (Array.isArray(x)) return x;
  if (Array.isArray(x.list)) return x.list;
  return [];
}
const tracks = () => listOf(lists.tracks).slice().sort(byName);
const classes = () => listOf(lists.vehicle_classes).slice().sort(byName);
const vehicles = () => listOf(lists.vehicles).slice().sort(byName);
const classOfVehicle = (v) => classes().find((c) => v && (v.class === c.name || v.class === idOf(c)));
const vehiclesInClass = (c) => (c ? vehicles().filter((v) => v.class === c.name || v.class === idOf(c)) : []);

// --------------------------------------------------------- date and time --

const pad = (n) => String(n).padStart(2, '0');
function fmtDate(ms) {
  const d = new Date(ms);
  const Y = d.getFullYear(), M = pad(d.getMonth() + 1), D = pad(d.getDate());
  return { iso: `${Y}-${M}-${D}`, eu: `${D}.${M}.${Y}`, uk: `${D}/${M}/${Y}`, us: `${M}/${D}/${Y}` }[display.dateFormat] || `${Y}-${M}-${D}`;
}
function fmtTime(ms, seconds) {
  const d = new Date(ms);
  const s = seconds ? ':' + pad(d.getSeconds()) : '';
  if (display.timeFormat === '12h') {
    const h = d.getHours() % 12 || 12;
    return `${h}:${pad(d.getMinutes())}${s} ${d.getHours() < 12 ? 'AM' : 'PM'}`;
  }
  return `${pad(d.getHours())}:${pad(d.getMinutes())}${s}`;
}
const fmtDateTime = (ms) => `${fmtDate(ms)} ${fmtTime(ms)}`;

// ------------------------------------------------------------------- login --

function showLogin() {
  $('#app').hidden = true;
  $('#login').hidden = false;
  $('#loginPw').focus();
}

$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#loginErr').textContent = '';
  try {
    await api('POST', '/api/auth/login', { password: $('#loginPw').value });
    $('#loginPw').value = '';
    start();
  } catch (err) { $('#loginErr').textContent = err.message; }
});

$('#logout').addEventListener('click', async () => { await api('POST', '/api/auth/logout'); showLogin(); });

// -------------------------------------------------------------------- tabs --

$$('.tabs [data-tab]').forEach((b) => b.addEventListener('click', () => {
  $$('.tabs [data-tab]').forEach((x) => x.setAttribute('aria-selected', x === b));
  $$('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== b.dataset.tab; });
  if (b.dataset.tab === 'log') scrollLog();
  if (b.dataset.tab === 'raw') loadRaw();
  if (b.dataset.tab === 'panel') loadPanelSettings();
}));

// ------------------------------------------------------------------- state --

const STATE_EN = { running: 'Running', stopped: 'Stopped', starting: 'Starting', stopping: 'Stopping' };
const STAGE_EN = { Idle: 'Idle', Lobby: 'Lobby', Loading: 'Loading', Practice1: 'Practice', Practice: 'Practice', Qualifying: 'Qualifying', Race: 'Race', PostRace: 'After the race', Returning: 'Returning', Allocating: 'Preparing' };

async function refreshState() {
  try { state = await api('GET', '/api/state'); } catch { return; }
  const formatChanged = state.display && (state.display.dateFormat !== display.dateFormat || state.display.timeFormat !== display.timeFormat);
  if (state.display) display = state.display;
  if (formatChanged) { renderLog(); loadPresets(); updateListsInfo(); }

  const p = state.process;
  $('#strip').dataset.state = p.busy === 'update' ? 'busy' : p.state;
  $('#stripState').textContent = p.busy === 'update' ? 'Updating' : (STATE_EN[p.state] || p.state);
  const sub = [];
  if (p.state === 'running' && p.startedAt) sub.push('started ' + fmtDateTime(Date.parse(p.startedAt)));
  if (p.external) sub.push('was already running when the panel started');
  if (!state.installed) sub.push('server not installed');
  if (state.dsError) sub.push('API not answering');
  $('#stripSub').textContent = sub.join(', ') || (p.state === 'stopped' ? 'not running' : '');

  const s = state.status;
  const attrs = s?.attributes || {};
  const track = listOf(lists.tracks).find((t) => idOf(t) === attrs.TrackId);
  $('#factTrack').textContent = s ? (track ? pretty(track.name) : (attrs.TrackId ?? '–')) : '–';
  const stage = s?.attributes?.SessionStage || s?.state;
  $('#factStage').textContent = s ? (STAGE_EN[stage] || stage || '–') : '–';
  const members = s?.members || [];
  $('#factPlayers').textContent = s ? `${members.length} / ${attrs.MaxPlayers ?? '?'}` : '–';

  $('[data-action="start"]').disabled = p.state !== 'stopped' || !!p.busy;
  $('[data-action="stop"]').disabled = p.state !== 'running';
  $('[data-action="restart"]').disabled = p.state !== 'running';
  $('[data-action="update"]').disabled = p.state !== 'stopped' || !!p.busy;
  const dir = state.cfgPath.replace(/[\\/]server\.cfg$/, '');
  $('#installInfo').textContent = state.installed ? 'Installed in ' + dir : 'Not installed yet. Target folder: ' + dir;

  const w = [...state.warnings];
  if (state.cfgError && state.cfgError !== 'missing') w.unshift('server.cfg cannot be read: ' + state.cfgError + '. Fix it on the Config file tab.');
  $('#warnings').innerHTML = w.map((x, i) => `<div class="warn${i === 0 && state.cfgError ? ' bad' : ''}">${esc(x)}</div>`).join('');

  renderPlayers(members);
}

function renderPlayers(members) {
  const tb = $('#players tbody');
  tb.innerHTML = members.map((m) => `
    <tr><td>${esc(m.name)}</td><td>${esc(m.steamid ?? '')}</td><td>${esc(m.ping ?? m.attributes?.Ping ?? '')}</td>
    <td><button class="btn small" data-kick="${esc(m.refid)}">Kick</button>
        <button class="btn small stop" data-ban="${esc(m.refid)}">Ban</button></td></tr>`).join('');
  $('#players').hidden = !members.length;
  $('#playersEmpty').hidden = !!members.length;
}

$('#players').addEventListener('click', async (e) => {
  const kick = e.target.dataset.kick, ban = e.target.dataset.ban;
  if (!kick && !ban) return;
  if (ban && !confirm('Ban this player from the server?')) return;
  try {
    await api('POST', '/api/session/kick', { refid: kick || ban, ban: ban ? 1 : 0 });
    toast(ban ? 'Player banned.' : 'Player kicked.');
    refreshState();
  } catch (err) { toast(err.message, true); }
});

$('#chatForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try { await api('POST', '/api/session/chat', { message: $('#chatMsg').value }); $('#chatMsg').value = ''; toast('Message sent.'); }
  catch (err) { toast(err.message, true); }
});

$$('[data-action]').forEach((b) => b.addEventListener('click', async () => {
  const a = b.dataset.action;
  const msgs = { start: 'Starting the server…', stop: 'Stopping the server…', restart: 'Restarting the server…', update: 'Update started. Follow it on the Log tab.' };
  if (a === 'stop' && (state?.status?.members || []).length && !confirm('There are players on the server. Stop it anyway?')) return;
  b.disabled = true;
  toast(msgs[a]);
  try {
    await api('POST', '/api/server/' + a);
    if (a === 'start' || a === 'restart') setTimeout(() => loadLists(true, true), 8000);
  } catch (err) { toast(err.message, true); }
  refreshState();
}));

// ------------------------------------------------------------------- lists --

function updateListsInfo() {
  const has = listOf(lists.tracks).length;
  $('#listsInfo').innerHTML = has
    ? `Track and car lists from ${esc(fmtDateTime(Date.parse(lists.fetchedAt)))} <button class="btn small" id="listsRefresh">Refresh</button>`
    : 'The panel loads the tracks and cars from the running server. Start the server once; until then the IDs show as numbers.';
  $('#listsRefresh')?.addEventListener('click', () => loadLists(true).then(() => toast('Lists refreshed.')));
}

async function loadLists(refresh, quiet) {
  try {
    lists = await api('GET', '/api/lists' + (refresh ? '?refresh' : ''));
    if (lists.error && !quiet) toast(lists.error, true);
  } catch (err) { if (!quiet) toast(err.message, true); }
  updateListsInfo();
  if (config) renderSession();
}

// ------------------------------------------------------------ choice cards --

function fillSelect(sel, items, current) {
  const opts = items.map((x) => `<option value="${esc(idOf(x))}">${esc(pretty(x.name))}</option>`);
  if (current !== undefined && !items.some((x) => idOf(x) === current)) opts.unshift(`<option value="${esc(current)}">Value: ${esc(current)}</option>`);
  sel.innerHTML = opts.join('');
  if (current !== undefined) sel.value = String(current);
}

function renderChoices() {
  const t = tracks().map((x) => ({ ...x, name: pretty(x.name) + (x.gridsize ? ` (up to ${x.gridsize} cars)` : '') }));
  fillSelect($('#s_TrackId'), t, sess.TrackId);
  fillSelect($('#s_VehicleClassId'), classes(), sess.VehicleClassId);
  const c = classes().find((x) => idOf(x) === sess.VehicleClassId);
  const cars = vehiclesInClass(c);
  fillSelect($('#s_VehicleModelId'), cars.length ? cars : vehicles(), sess.VehicleModelId);
}

// ----------------------------------------------------------------- session --

function renderSession() {
  renderChoices();

  $$('#sessionForm select[data-enum]').forEach((sel) => fillSelect(sel, getEnum(sel.dataset.enum), sess[sel.dataset.attr]));
  $$('#sessionForm [data-attr]').forEach((el) => {
    if (el.tagName === 'SELECT') return;
    const v = sess[el.dataset.attr];
    if (el.type === 'checkbox') el.checked = Number(v) === 1;
    else el.value = v ?? '';
  });
  $('#weatherCount').value = String(sess.RaceWeatherSlots || 1);

  renderWeather();
  renderFlags();
  renderOtherAttrs();
  updateGridHint();
}

// Enums come as a map of name -> {list:[{value,name}]}; names differ a bit between versions.
const ENUM_ALIASES = {
  damage: ['damage', 'damage_type'],
  tire_wear: ['tire_wear', 'tirewear', 'tire_wear_type'],
  fuel_usage: ['fuel_usage', 'fuelusage', 'fuel_usage_type'],
  penalties: ['penalties', 'penalties_type'],
  allowed_views: ['allowed_views', 'allowed_view', 'allowedviews'],
  weather: ['weather'],
};
function getEnum(key) {
  const e = lists.enums || {};
  const src = e.list && !Array.isArray(e) ? e.list : e;
  for (const name of ENUM_ALIASES[key] || [key]) {
    const hit = Object.entries(src).find(([k]) => k.toLowerCase() === name);
    if (hit) return listOf(hit[1]);
  }
  return [];
}

function renderWeather() {
  const n = Number(sess.RaceWeatherSlots || 1);
  const items = getEnum('weather');
  const box = $('#weatherSlots');
  box.innerHTML = '';
  for (let i = 1; i <= 4; i++) {
    const key = 'RaceWeatherSlot' + i;
    const label = document.createElement('label');
    label.textContent = `Weather ${i}`;
    const sel = document.createElement('select');
    sel.dataset.attr = key; sel.dataset.type = 'int';
    if (items.length) fillSelect(sel, items, sess[key]);
    else sel.innerHTML = `<option>${esc(sess[key] ?? '')}</option>`;
    sel.disabled = i > n;
    label.append(sel);
    label.hidden = i > n;
    box.append(label);
  }
}

// Readable names for the session flags; unknown ones show their API name.
const FLAG_EN = {
  FORCE_IDENTICAL_VEHICLES: 'Everyone drives the same car',
  ALLOW_CUSTOM_VEHICLE_SETUP: 'Custom car setups allowed',
  FORCE_REALISTIC_DRIVING_AIDS: 'Only realistic driving aids',
  ABS_ALLOWED: 'ABS allowed',
  SC_ALLOWED: 'Stability control allowed',
  TCS_ALLOWED: 'Traction control allowed',
  FORCE_MANUAL: 'Manual gearbox required',
  ROLLING_STARTS: 'Rolling start',
  FORCE_SAME_VEHICLE_CLASS: 'Everyone in the same class',
  FILL_SESSION_WITH_AI: 'Fill the grid with AI',
  MECHANICAL_FAILURES: 'Mechanical failures',
  AUTO_START_ENGINE: 'Engine starts automatically',
  TIMED_RACE: 'Timed race',
  ONLINE_REPUTATION_ENABLED: 'Online reputation',
  GHOST_GRIEFERS: 'Ghost players who drive dangerously',
  WAIT_FOR_RACE_READY_INPUT: 'Wait for players before the start',
  PIT_STOP_ERRORS_ALLOWED: 'Pit stop errors',
  COOLDOWNLAP: 'Cool-down lap',
  FORCE_COCKPIT_VIEW: 'Cockpit view required',
  DISABLE_DRIVER_SWAP: 'No driver swaps',
};

function flagList() {
  const l = listOf(lists.flags_session);
  if (l.length) return l.map((f) => ({ name: f.name, value: Number(idOf(f)) })).filter((f) => f.value > 0).sort((a, b) => a.value - b.value);
  // Without the list we can still show which bits are on.
  const v = Number(sess.Flags || 0), out = [];
  for (let b = 1; b <= v; b *= 2) if (Math.floor(v / b) % 2) out.push({ name: 'bit ' + b, value: b });
  return out;
}
const hasBit = (v, b) => Math.floor(v / b) % 2 === 1;

function renderFlags() {
  const v = Number(sess.Flags || 0);
  $('#flags').innerHTML = flagList().map((f) => `
    <label class="check"><input type="checkbox" data-flag="${f.value}" ${hasBit(v, f.value) ? 'checked' : ''}>
      <span>${esc(FLAG_EN[f.name] || pretty(f.name))}<br><small>${esc(f.name)} (${f.value})</small></span></label>`).join('')
    || '<p class="hint">No rules are on. The full list appears after the server has run once.</p>';
  $('#flagsValue').textContent = v;
}

$('#flags').addEventListener('change', (e) => {
  const b = Number(e.target.dataset.flag);
  if (!b) return;
  let v = Number(sess.Flags || 0);
  if (e.target.checked && !hasBit(v, b)) v += b;
  if (!e.target.checked && hasBit(v, b)) v -= b;
  sess.Flags = v;
  $('#flagsValue').textContent = v;
  updateGridHint();
});

const CURATED = new Set(['TrackId', 'VehicleClassId', 'VehicleModelId', 'ServerControlsTrack', 'ServerControlsVehicleClass', 'ServerControlsVehicle',
  'GridSize', 'MaxPlayers', 'OpponentDifficulty', 'PracticeLength', 'QualifyLength', 'RaceLength', 'DamageType', 'TireWearType',
  'FuelUsageType', 'PenaltiesType', 'AllowedViews', 'RaceDateHour', 'RaceWeatherSlots', 'RaceWeatherSlot1', 'RaceWeatherSlot2',
  'RaceWeatherSlot3', 'RaceWeatherSlot4', 'Flags']);

function renderOtherAttrs() {
  const names = new Map();
  for (const a of listOf(lists.attributes_session)) {
    const access = String(a.access || '').toLowerCase();
    if (access && !access.includes('write')) continue;
    names.set(a.name, a);
  }
  for (const k of Object.keys(sess)) if (!names.has(k)) names.set(k, { name: k });
  const rows = [...names.values()].filter((a) => !CURATED.has(a.name)).sort(byName);
  $('#otherAttrsBody').innerHTML = rows.map((a) => `
    <label title="${esc(a.description || '')}">${esc(a.name)}
      <input data-attr="${esc(a.name)}" data-type="${/string/i.test(a.type || '') ? 'str' : 'num'}" value="${esc(sess[a.name] ?? '')}" placeholder="not set"></label>`).join('')
    || '<p class="hint">Every other setting the server allows appears here after it has run once.</p>';
}

function updateGridHint() {
  const ai = flagList().find((f) => f.name === 'FILL_SESSION_WITH_AI');
  const on = ai && hasBit(Number(sess.Flags || 0), ai.value);
  const extra = Number(sess.GridSize) - Number(sess.MaxPlayers);
  $('#gridHint').textContent = on && extra > 0
    ? `${extra} AI cars fill the grid when there are not enough players.`
    : 'AI joins only when the grid is larger than the player limit and the "Fill the grid with AI" rule is on.';
}

$('#sessionForm').addEventListener('change', (e) => {
  const el = e.target;
  const k = el.dataset.attr;
  if (!k) return;
  const t = el.dataset.type;
  if (t === 'bool01') sess[k] = el.checked ? 1 : 0;
  else if (el.value === '') delete sess[k];
  else if (t === 'str') sess[k] = el.value;
  else sess[k] = Number(el.value);
  if (k === 'VehicleClassId') {
    const cars = vehiclesInClass(classes().find((x) => idOf(x) === sess.VehicleClassId));
    if (cars.length && !cars.some((v) => idOf(v) === sess.VehicleModelId)) sess.VehicleModelId = idOf(cars[0]);
    renderChoices();
  }
  if (k === 'RaceWeatherSlots') renderWeather();
  updateGridHint();
});

function validateSession() {
  const track = listOf(lists.tracks).find((t) => idOf(t) === sess.TrackId);
  if (track?.gridsize && Number(sess.GridSize) > track.gridsize) {
    return `${pretty(track.name)} has room for ${track.gridsize} cars, but the grid size is ${sess.GridSize}.`;
  }
  if (Number(sess.MaxPlayers) > Number(sess.GridSize)) return 'Max. players cannot be higher than the grid size.';
  return null;
}

$('#sessSave').addEventListener('click', async () => {
  const bad = validateSession();
  if (bad) return toast(bad, true);
  config.sessionAttributes = { ...sess };
  await saveConfig();
});

async function applySession(mode) {
  const bad = validateSession();
  if (bad) return toast(bad, true);
  try {
    await api('POST', '/api/session/apply', { attributes: sess, mode });
    toast(mode === 'now' ? 'Settings applied.' : 'Settings sent to the next race.');
  } catch (err) { toast(err.message, true); }
}
$('#sessNext').addEventListener('click', () => applySession('next'));
$('#sessNow').addEventListener('click', () => applySession('now'));

// ----------------------------------------------------------------- presets --

let presets = {};
async function loadPresets() {
  try { presets = await api('GET', '/api/presets'); } catch { return; }
  const names = Object.keys(presets).sort();
  $('#presets').innerHTML = names.map((n) => {
    const a = presets[n].attributes || {};
    const track = listOf(lists.tracks).find((t) => idOf(t) === a.TrackId);
    const cls = listOf(lists.vehicle_classes).find((c) => idOf(c) === a.VehicleClassId);
    const desc = [track && pretty(track.name), cls && pretty(cls.name), a.RaceLength && `${a.RaceLength} laps`,
      presets[n].savedAt && 'saved ' + fmtDateTime(Date.parse(presets[n].savedAt))].filter(Boolean).join(', ');
    return `<li><b>${esc(n)}</b><span>${esc(desc)}</span>
      <button class="btn small" data-load="${esc(n)}">Load</button>
      <button class="btn small stop" data-del="${esc(n)}">Delete</button></li>`;
  }).join('');
  $('#presetsEmpty').hidden = names.length > 0;
}

$('#presetSave').addEventListener('click', async () => {
  const name = $('#presetName').value.trim();
  if (!name) { $('#presetName').focus(); return toast('Give the preset a name.', true); }
  await api('PUT', '/api/presets', { name, attributes: sess });
  $('#presetName').value = '';
  toast(`Preset "${name}" saved.`);
  loadPresets();
});

$('#presets').addEventListener('click', async (e) => {
  const load = e.target.dataset.load, del = e.target.dataset.del;
  if (load) {
    sess = { ...sess, ...presets[load].attributes };
    renderSession();
    toast(`"${load}" loaded. Save it to the config or send it to the next race.`);
  }
  if (del && confirm(`Delete the preset "${del}"?`)) {
    await api('DELETE', '/api/presets?name=' + encodeURIComponent(del));
    loadPresets();
  }
});

// ------------------------------------------------------------------ server --

async function renderServer() {
  $$('#serverForm [data-key]').forEach((el) => {
    const v = config[el.dataset.key];
    if (el.type === 'checkbox') el.checked = !!v;
    else el.value = v ?? '';
  });
  let found = [];
  try { found = (await api('GET', '/api/addons')).addons; } catch { /* not installed */ }
  const enabled = config.luaApiAddons || [];
  const libsOn = config.luaAllowedLibraries || [];
  const all = new Map();
  for (const n of enabled) all.set(n, { name: n, library: false });
  for (const n of libsOn) all.set(n, { name: n, library: true });
  for (const a of found) all.set(a.name, { ...all.get(a.name), ...a });
  const DESC = {
    sms_base: 'Core scripts, always loaded',
    sms_rotate: 'Rotates track and car setups from race to race',
    sms_motd: 'Welcome message for joining players',
    sms_stats: 'Server, session and player statistics',
    lib_rotate: 'Library, needed by the rotation',
  };
  const rows = [...all.values()].sort((a, b) => (a.library - b.library) || a.name.localeCompare(b.name));
  $('#addons').innerHTML = rows.map((a) => {
    const on = a.library ? libsOn.includes(a.name) : enabled.includes(a.name);
    return `<label class="check"><input type="checkbox" data-addon="${esc(a.name)}" data-lib="${a.library ? 1 : 0}" ${on ? 'checked' : ''} ${a.name === 'sms_base' ? 'disabled' : ''}>
      <span>${esc(a.name)} <small>${esc(DESC[a.name] || a.description || a.title || (a.library ? 'library' : ''))}</small></span></label>`;
  }).join('') || '<p class="hint">No addons found in the server\'s lua folder.</p>';
}

$('#serverSave').addEventListener('click', async () => {
  $$('#serverForm [data-key]').forEach((el) => {
    const k = el.dataset.key, t = el.dataset.type;
    if (t === 'bool') config[k] = el.checked;
    else if (t === 'int') { if (el.value !== '') config[k] = Number(el.value); }
    else config[k] = el.value;
  });
  const addons = ['sms_base'], libs = [];
  $$('#addons [data-addon]').forEach((el) => {
    if (!el.checked || el.dataset.addon === 'sms_base') return;
    (el.dataset.lib === '1' ? libs : addons).push(el.dataset.addon);
  });
  config.luaApiAddons = addons;
  config.luaAllowedLibraries = libs;
  if (config.maxPlayerCount > 32) config.maxPlayerCount = 32;
  await saveConfig();
});

async function saveConfig() {
  try {
    const r = await api('PUT', '/api/config', { config });
    if (r.running && confirm('Saved. The server reads the config only when it starts. Restart it now?')) {
      await api('POST', '/api/server/restart');
      toast('Server restarted.');
    } else toast('Config saved.');
    refreshState();
  } catch (err) { toast(err.message, true); }
}

// --------------------------------------------------------------------- raw --

async function loadRaw() {
  const r = await api('GET', '/api/config');
  $('#rawCfg').value = r.raw || '';
  $('#cfgPath').textContent = state?.cfgPath || '';
}
$('#rawReload').addEventListener('click', () => loadRaw().then(() => toast('Reloaded.')));
$('#rawSave').addEventListener('click', async () => {
  try {
    const r = await api('PUT', '/api/config/raw', { raw: $('#rawCfg').value });
    await loadConfig();
    if (r.running && confirm('Saved. Restart the server so it reads the file?')) await api('POST', '/api/server/restart');
    else toast('File saved.');
  } catch (err) { toast(err.message, true); }
});
$('#rawClean').addEventListener('click', async () => {
  if (!confirm('Replace server.cfg with the clean config? The server name, password, ports and race setup are kept, and the old file is backed up.')) return;
  const cur = config || {};
  const { config: def } = await api('GET', '/api/config/default');
  for (const k of ['name', 'password', 'steamPort', 'hostPort', 'queryPort', 'sessionAttributes']) if (k in cur) def[k] = cur[k];
  config = def;
  try {
    const r = await api('PUT', '/api/config', { config });
    $('#rawCfg').value = r.raw;
    toast('Clean config saved. Restart the server to use it.');
  } catch (err) { toast(err.message, true); }
  await loadConfig();
});

// --------------------------------------------------------------------- log --

const logBuf = [];
async function pollLog() {
  try {
    const r = await api('GET', '/api/log?since=' + logLast);
    if (r.last < logLast) logBuf.length = 0; // the panel restarted
    logLast = r.last;
    if (r.lines.length) { logBuf.push(...r.lines); while (logBuf.length > 2000) logBuf.shift(); renderLog(); }
  } catch { /* offline */ }
}
function renderLog() {
  const f = $('#logFilter').value;
  $('#log').innerHTML = logBuf.filter((l) => !f || l.source === f)
    .map((l) => `<span class="t">${esc(fmtTime(l.ts, true))}</span> <span class="s-${l.source}">${esc(l.text)}</span>`).join('\n');
  scrollLog();
}
function scrollLog() { if ($('#logFollow').checked) $('#log').scrollTop = $('#log').scrollHeight; }
$('#logFilter').addEventListener('change', renderLog);

// ------------------------------------------------------------------- panel --

function updateFormatPreview() {
  const saved = { ...display };
  display = { ...display, dateFormat: $('#dateFormat').value, timeFormat: $('#timeFormat').value };
  $('#formatPreview').textContent = 'Example: ' + fmtDateTime(Date.now());
  display = saved;
}
$('#dateFormat').addEventListener('change', updateFormatPreview);
$('#timeFormat').addEventListener('change', updateFormatPreview);

async function loadPanelSettings() {
  const { settings, settingsFile } = await api('GET', '/api/panel/settings');
  $$('#panelForm [data-pkey]').forEach((el) => {
    const v = settings[el.dataset.pkey];
    if (el.type === 'checkbox') el.checked = !!v;
    else el.value = Array.isArray(v) ? v.join(' ') : (v ?? '');
  });
  $('#panelInfo').textContent = 'Settings file: ' + settingsFile;
  updateFormatPreview();
}
$('#panelSave').addEventListener('click', async () => {
  const body = {};
  $$('#panelForm [data-pkey]').forEach((el) => {
    const k = el.dataset.pkey;
    if (el.type === 'checkbox') body[k] = el.checked;
    else if (el.dataset.list) body[k] = el.value.trim() ? el.value.trim().split(/\s+/) : [];
    else body[k] = el.value.trim();
  });
  if ($('#pwNew').value) { body.newPassword = $('#pwNew').value; body.currentPassword = $('#pwOld').value; }
  try {
    const r = await api('PUT', '/api/panel/settings', body);
    $('#pwNew').value = $('#pwOld').value = '';
    toast('Panel settings saved.');
    if (r.relogin) return showLogin();
    await refreshState();
  } catch (err) { toast(err.message, true); }
});

// ------------------------------------------------------------------- start --

async function loadConfig() {
  const r = await api('GET', '/api/config');
  if (!r.config) {
    toast('server.cfg has an error: ' + r.parseError, true);
    $('[data-tab="raw"]').click();
    config = {};
  } else config = r.config;
  sess = { ...(config.sessionAttributes || {}) };
  renderSession();
  renderServer();
}

let timers = [];
async function start() {
  $('#login').hidden = true;
  $('#app').hidden = false;
  timers.forEach(clearInterval);
  await refreshState();
  await loadLists(false, true);
  await loadConfig();
  loadPresets();
  pollLog();
  timers = [setInterval(refreshState, 4000), setInterval(pollLog, 2000)];
}

(async () => {
  const r = await fetch('/api/auth/check').then((x) => x.json()).catch(() => ({}));
  if (r.authed) start(); else showLogin();
})();
