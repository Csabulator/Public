'use strict';
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

let config = null;      // parsed server.cfg
let sess = {};          // working copy of sessionAttributes
let lists = {};         // cached lists from the dedicated server
let state = null;
let logLast = 0;

// ------------------------------------------------------------------ helpers --

async function api(method, url, body) {
  const res = await fetch(url, {
    method, headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && url !== '/api/auth/login') { showLogin(); throw new Error(data.error || 'Bejelentkezés szükséges.'); }
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

// Lists from the server API come as {list:[...]} or as plain arrays.
function listOf(x) {
  if (!x) return [];
  if (Array.isArray(x)) return x;
  if (Array.isArray(x.list)) return x.list;
  return [];
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
  const src = e.list && !Array.isArray(e) ? e.list : e; // tolerate both shapes
  for (const name of ENUM_ALIASES[key] || [key]) {
    const hit = Object.entries(src).find(([k]) => k.toLowerCase() === name);
    if (hit) return listOf(hit[1]);
  }
  return [];
}

// Hungarian labels for the known session flags; unknown ones show their API name.
const FLAG_HU = {
  FORCE_IDENTICAL_VEHICLES: 'Mindenki ugyanazzal az autóval',
  ALLOW_CUSTOM_VEHICLE_SETUP: 'Saját autóbeállítás (setup) engedélyezve',
  FORCE_REALISTIC_DRIVING_AIDS: 'Csak valósághű vezetéstámogatás',
  ABS_ALLOWED: 'ABS engedélyezve',
  SC_ALLOWED: 'Menetstabilizáló engedélyezve',
  TCS_ALLOWED: 'Kipörgésgátló engedélyezve',
  FORCE_MANUAL: 'Kötelező kézi váltó',
  ROLLING_STARTS: 'Repülőrajt',
  FORCE_SAME_VEHICLE_CLASS: 'Mindenki ugyanabban a kasztban',
  FILL_SESSION_WITH_AI: 'Mezőny feltöltése AI-val',
  MECHANICAL_FAILURES: 'Műszaki hibák',
  AUTO_START_ENGINE: 'Motor automatikus indítása',
  TIMED_RACE: 'Időre menő futam',
  ONLINE_REPUTATION_ENABLED: 'Online reputáció',
  GHOST_GRIEFERS: 'Szabálytalankodók szellemmé válnak',
  WAIT_FOR_RACE_READY_INPUT: 'Rajt előtt várakozás a játékosokra',
  PIT_STOP_ERRORS_ALLOWED: 'Boxhibák engedélyezve',
  COOLDOWNLAP: 'Levezető kör',
  FORCE_COCKPIT_VIEW: 'Kötelező pilótafülke-nézet',
  DISABLE_DRIVER_SWAP: 'Pilótacsere tiltva',
};

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

const STATE_HU = { running: 'Fut', stopped: 'Áll', starting: 'Indul', stopping: 'Leáll' };
const STAGE_HU = { Idle: 'Üresjárat', Lobby: 'Lobbi', Loading: 'Betöltés', Practice1: 'Edzés', Practice: 'Edzés', Qualifying: 'Időmérő', Race: 'Futam', PostRace: 'Futam után', Returning: 'Visszatérés', Allocating: 'Előkészítés' };

async function refreshState() {
  try { state = await api('GET', '/api/state'); } catch { return; }
  const p = state.process;
  const st = p.busy === 'update' ? 'busy' : p.state;
  $('#strip').dataset.state = st;
  $('#stripState').textContent = p.busy === 'update' ? 'Frissítés' : (STATE_HU[p.state] || p.state);
  const sub = [];
  if (p.state === 'running' && p.startedAt) sub.push('indult: ' + new Date(p.startedAt).toLocaleString('hu-HU'));
  if (p.external) sub.push('már futott a panel indulásakor');
  if (!state.installed) sub.push('a szerver nincs telepítve');
  if (state.dsError) sub.push('API nem válaszol');
  $('#stripSub').textContent = sub.join(', ') || (p.state === 'stopped' ? 'leállítva' : '');

  const s = state.status;
  const attrs = s?.attributes || {};
  const track = listOf(lists.tracks).find((t) => idOf(t) === attrs.TrackId);
  $('#factTrack').textContent = s ? (track ? pretty(track.name) : (attrs.TrackId ?? '–')) : '–';
  const stage = s?.attributes?.SessionStage || s?.state;
  $('#factStage').textContent = s ? (STAGE_HU[stage] || stage || '–') : '–';
  const members = s?.members || [];
  $('#factPlayers').textContent = s ? `${members.length} / ${attrs.MaxPlayers ?? '?'}` : '–';

  $('[data-action="start"]').disabled = p.state !== 'stopped' || !!p.busy;
  $('[data-action="stop"]').disabled = p.state !== 'running';
  $('[data-action="restart"]').disabled = p.state !== 'running';
  $('[data-action="update"]').disabled = p.state !== 'stopped' || !!p.busy;
  $('#installInfo').textContent = state.installed ? 'Telepítve. Mappa: ' + state.cfgPath.replace(/[\\/]server\.cfg$/, '') : 'A szerver még nincs telepítve ebbe a mappába: ' + state.cfgPath.replace(/[\\/]server\.cfg$/, '');

  const w = [...state.warnings];
  if (state.cfgError && state.cfgError !== 'missing') w.unshift('A server.cfg nem olvasható: ' + state.cfgError + ' Javítsd a Config fájl fülön.');
  $('#warnings').innerHTML = w.map((x, i) => `<div class="warn${i === 0 && state.cfgError ? ' bad' : ''}">${esc(x)}</div>`).join('');

  renderPlayers(members);
}

function renderPlayers(members) {
  const tb = $('#players tbody');
  tb.innerHTML = members.map((m) => `
    <tr><td>${esc(m.name)}</td><td>${esc(m.steamid ?? '')}</td><td>${esc(m.ping ?? m.attributes?.Ping ?? '')}</td>
    <td><button class="btn small" data-kick="${esc(m.refid)}">Kirúgás</button>
        <button class="btn small stop" data-ban="${esc(m.refid)}">Tiltás</button></td></tr>`).join('');
  $('#players').hidden = !members.length;
  $('#playersEmpty').hidden = !!members.length;
}

$('#players').addEventListener('click', async (e) => {
  const kick = e.target.dataset.kick, ban = e.target.dataset.ban;
  if (!kick && !ban) return;
  if (ban && !confirm('Biztosan kitiltod ezt a játékost?')) return;
  try {
    await api('POST', '/api/session/kick', { refid: kick || ban, ban: ban ? 1 : 0 });
    toast(ban ? 'Játékos kitiltva.' : 'Játékos kirúgva.');
    refreshState();
  } catch (err) { toast(err.message, true); }
});

$('#chatForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try { await api('POST', '/api/session/chat', { message: $('#chatMsg').value }); $('#chatMsg').value = ''; toast('Üzenet elküldve.'); }
  catch (err) { toast(err.message, true); }
});

$$('[data-action]').forEach((b) => b.addEventListener('click', async () => {
  const a = b.dataset.action;
  const msgs = { start: 'Szerver indítása…', stop: 'Szerver leállítása…', restart: 'Szerver újraindítása…', update: 'Frissítés elindítva, a Napló fülön követheted.' };
  if (a === 'stop' && (state?.status?.members || []).length && !confirm('Vannak fent játékosok. Biztosan leállítod?')) return;
  b.disabled = true;
  toast(msgs[a]);
  try {
    await api('POST', '/api/server/' + a);
    if (a === 'start' || a === 'restart') setTimeout(() => loadLists(true, true), 8000);
  } catch (err) { toast(err.message, true); }
  refreshState();
}));

// ------------------------------------------------------------------- lists --

async function loadLists(refresh, quiet) {
  try {
    lists = await api('GET', '/api/lists' + (refresh ? '?refresh' : ''));
    if (lists.error && !quiet) toast(lists.error, true);
  } catch (err) { if (!quiet) toast(err.message, true); }
  const has = listOf(lists.tracks).length;
  $('#listsInfo').innerHTML = has
    ? `Pálya- és autólista: ${esc(new Date(lists.fetchedAt).toLocaleString('hu-HU'))} <button class="btn small" id="listsRefresh">Frissítés</button>`
    : 'A pályák és autók listáját a futó szervertől kéri le a panel. Indítsd el egyszer a szervert, addig az azonosítók számként látszanak.';
  $('#listsRefresh')?.addEventListener('click', () => loadLists(true).then(() => toast('Listák frissítve.')));
  if (config) renderSession();
}

// ----------------------------------------------------------------- session --

function fillSelect(sel, items, current, placeholder) {
  const opts = items.map((x) => `<option value="${esc(idOf(x))}">${esc(pretty(x.name))}</option>`);
  if (current !== undefined && !items.some((x) => idOf(x) === current)) {
    opts.unshift(`<option value="${esc(current)}">${esc(placeholder || 'Azonosító')}: ${esc(current)}</option>`);
  }
  sel.innerHTML = opts.join('');
  if (current !== undefined) sel.value = String(current);
}

function renderSession() {
  const tracks = listOf(lists.tracks).slice().sort((a, b) => a.name.localeCompare(b.name));
  const classes = listOf(lists.vehicle_classes).slice().sort((a, b) => a.name.localeCompare(b.name));
  const vehicles = listOf(lists.vehicles).slice().sort((a, b) => a.name.localeCompare(b.name));

  fillSelect($('#s_TrackId'), tracks.map((t) => ({ ...t, name: pretty(t.name) + (t.gridsize ? ` (max. ${t.gridsize})` : '') })), sess.TrackId, 'Pálya');
  fillSelect($('#s_VehicleClassId'), classes, sess.VehicleClassId, 'Kaszt');
  const cls = classes.find((c) => idOf(c) === sess.VehicleClassId);
  const inClass = cls ? vehicles.filter((v) => v.class === cls.name || v.class === idOf(cls)) : vehicles;
  fillSelect($('#s_VehicleModelId'), inClass.length ? inClass : vehicles, sess.VehicleModelId, 'Autó');

  $$('#sessionForm select[data-enum]').forEach((sel) => {
    const items = getEnum(sel.dataset.enum);
    fillSelect(sel, items, sess[sel.dataset.attr], 'Érték');
  });

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

function renderWeather() {
  const n = Number(sess.RaceWeatherSlots || 1);
  const items = getEnum('weather');
  const box = $('#weatherSlots');
  box.innerHTML = '';
  for (let i = 1; i <= 4; i++) {
    const key = 'RaceWeatherSlot' + i;
    const label = document.createElement('label');
    label.textContent = `${i}. időjárás`;
    const sel = document.createElement('select');
    sel.dataset.attr = key; sel.dataset.type = 'int';
    if (items.length) fillSelect(sel, items, sess[key], 'Érték');
    else { sel.innerHTML = `<option>${esc(sess[key] ?? '')}</option>`; }
    sel.disabled = i > n;
    label.append(sel);
    label.hidden = i > n;
    box.append(label);
  }
}

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
  const flags = flagList();
  $('#flags').innerHTML = flags.map((f) => `
    <label class="check"><input type="checkbox" data-flag="${f.value}" ${hasBit(v, f.value) ? 'checked' : ''}>
      <span>${esc(FLAG_HU[f.name] || pretty(f.name))}<br><small>${esc(f.name)} (${f.value})</small></span></label>`).join('')
    || '<p class="hint">Nincs bekapcsolt szabály. A teljes lista a szerver első indítása után jelenik meg.</p>';
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
  const known = listOf(lists.attributes_session);
  const names = new Map();
  for (const a of known) {
    const access = String(a.access || '').toLowerCase();
    if (access && !access.includes('write')) continue;
    names.set(a.name, a);
  }
  for (const k of Object.keys(sess)) if (!names.has(k)) names.set(k, { name: k });
  const rows = [...names.values()].filter((a) => !CURATED.has(a.name)).sort((a, b) => a.name.localeCompare(b.name));
  $('#otherAttrsBody').innerHTML = rows.map((a) => `
    <label title="${esc(a.description || '')}">${esc(a.name)}
      <input data-attr="${esc(a.name)}" data-type="${/string/i.test(a.type || '') ? 'str' : 'num'}" value="${esc(sess[a.name] ?? '')}" placeholder="nincs beállítva"></label>`).join('')
    || '<p class="hint">A szerver első indítása után itt jelenik meg az összes többi állítható beállítás.</p>';
}

function updateGridHint() {
  const ai = flagList().find((f) => f.name === 'FILL_SESSION_WITH_AI');
  const on = ai && hasBit(Number(sess.Flags || 0), ai.value);
  const extra = Number(sess.GridSize) - Number(sess.MaxPlayers);
  $('#gridHint').textContent = on && extra > 0
    ? `${extra} AI autó tölti fel a mezőnyt, ha nincs elég játékos.`
    : 'AI csak akkor kerül a mezőnybe, ha a rajtrács nagyobb a max. játékosszámnál, és be van kapcsolva a „Mezőny feltöltése AI-val” szabály.';
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
  if (k === 'VehicleClassId' || k === 'TrackId') renderSession();
  if (k === 'RaceWeatherSlots') renderWeather();
  updateGridHint();
});

function validateSession() {
  const track = listOf(lists.tracks).find((t) => idOf(t) === sess.TrackId);
  if (track?.gridsize && Number(sess.GridSize) > track.gridsize) {
    return `A(z) ${pretty(track.name)} rajtrácsa legfeljebb ${track.gridsize} autós, a beállított rajtrács ${sess.GridSize}.`;
  }
  if (Number(sess.MaxPlayers) > Number(sess.GridSize)) return 'A max. játékosszám nem lehet nagyobb a rajtrácsnál.';
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
    toast(mode === 'now' ? 'Beállítások alkalmazva.' : 'Beállítások elküldve a következő futamra.');
  } catch (err) { toast(err.message, true); }
}
$('#sessNext').addEventListener('click', () => applySession('next'));
$('#sessNow').addEventListener('click', () => applySession('now'));

// ----------------------------------------------------------------- presets --

async function loadPresets() {
  const p = await api('GET', '/api/presets');
  const names = Object.keys(p).sort();
  $('#presets').innerHTML = names.map((n) => {
    const a = p[n].attributes || {};
    const track = listOf(lists.tracks).find((t) => idOf(t) === a.TrackId);
    const cls = listOf(lists.vehicle_classes).find((c) => idOf(c) === a.VehicleClassId);
    const desc = [track && pretty(track.name), cls && pretty(cls.name), a.RaceLength && `${a.RaceLength} kör`].filter(Boolean).join(', ');
    return `<li><b>${esc(n)}</b><span>${esc(desc)}</span>
      <button class="btn small" data-load="${esc(n)}">Betöltés</button>
      <button class="btn small stop" data-del="${esc(n)}">Törlés</button></li>`;
  }).join('');
  $('#presetsEmpty').hidden = names.length > 0;
  window._presets = p;
}

$('#presetSave').addEventListener('click', async () => {
  const name = $('#presetName').value.trim();
  if (!name) { $('#presetName').focus(); return toast('Adj nevet az előbeállításnak.', true); }
  await api('PUT', '/api/presets', { name, attributes: sess });
  $('#presetName').value = '';
  toast(`„${name}” elmentve.`);
  loadPresets();
});

$('#presets').addEventListener('click', async (e) => {
  const load = e.target.dataset.load, del = e.target.dataset.del;
  if (load) {
    sess = { ...sess, ...window._presets[load].attributes };
    renderSession();
    toast(`„${load}” betöltve. Mentsd a configba, vagy küldd el a következő futamra.`);
  }
  if (del && confirm(`Törlöd: „${del}”?`)) {
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
    sms_base: 'Alap, mindig betöltődik',
    sms_rotate: 'Pálya- és autórotáció futamról futamra',
    sms_motd: 'Üdvözlő üzenet a belépő játékosoknak',
    sms_stats: 'Statisztikák a szerverről, futamokról és játékosokról',
    lib_rotate: 'Könyvtár, a rotációhoz kell',
  };
  const rows = [...all.values()].sort((a, b) => (a.library - b.library) || a.name.localeCompare(b.name));
  $('#addons').innerHTML = rows.map((a) => {
    const on = a.library ? libsOn.includes(a.name) : enabled.includes(a.name);
    return `<label class="check"><input type="checkbox" data-addon="${esc(a.name)}" data-lib="${a.library ? 1 : 0}" ${on ? 'checked' : ''} ${a.name === 'sms_base' ? 'disabled' : ''}>
      <span>${esc(a.name)} <small>${esc(DESC[a.name] || a.description || a.title || (a.library ? 'könyvtár' : ''))}</small></span></label>`;
  }).join('') || '<p class="hint">Nem találtam addonokat a szerver lua mappájában.</p>';
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
    if (r.running && confirm('Elmentve. A szerver csak újraindítás után olvassa be a configot. Újraindítod most?')) {
      await api('POST', '/api/server/restart');
      toast('Szerver újraindítva.');
    } else toast('Config elmentve.');
    refreshState();
  } catch (err) { toast(err.message, true); }
}

// --------------------------------------------------------------------- raw --

async function loadRaw() {
  const r = await api('GET', '/api/config');
  $('#rawCfg').value = r.raw || '';
  $('#cfgPath').textContent = state?.cfgPath || '';
}
$('#rawReload').addEventListener('click', () => loadRaw().then(() => toast('Újratöltve.')));
$('#rawSave').addEventListener('click', async () => {
  try {
    const r = await api('PUT', '/api/config/raw', { raw: $('#rawCfg').value });
    await loadConfig();
    if (r.running && confirm('Elmentve. Újraindítod a szervert, hogy beolvassa?')) await api('POST', '/api/server/restart');
    else toast('Fájl elmentve.');
  } catch (err) { toast(err.message, true); }
});
$('#rawClean').addEventListener('click', async () => {
  if (!confirm('A server.cfg-t lecserélem a tisztított alapconfigra. A szerver neve, jelszava, portjai és a futambeállítás megmarad, a régi fájlról biztonsági másolat készül. Folytatod?')) return;
  const cur = config || {};
  const { config: def } = await api('GET', '/api/config/default');
  // Keep the server identity and the current race setup.
  for (const k of ['name', 'password', 'steamPort', 'hostPort', 'queryPort', 'sessionAttributes']) if (k in cur) def[k] = cur[k];
  config = def;
  await api('PUT', '/api/config', { config }).then((r) => { $('#rawCfg').value = r.raw; toast('Tisztított config elmentve. Indítsd újra a szervert.'); });
  await loadConfig();
});

// --------------------------------------------------------------------- log --

const logBuf = [];
async function pollLog() {
  try {
    const r = await api('GET', '/api/log?since=' + logLast);
    if (r.last < logLast) { logBuf.length = 0; } // panel restarted
    logLast = r.last;
    if (r.lines.length) { logBuf.push(...r.lines); while (logBuf.length > 2000) logBuf.shift(); renderLog(); }
  } catch { /* offline */ }
}
function renderLog() {
  const f = $('#logFilter').value;
  $('#log').innerHTML = logBuf.filter((l) => !f || l.source === f)
    .map((l) => `<span class="t">${esc(l.t.slice(11))}</span> <span class="s-${l.source}">${esc(l.text)}</span>`).join('\n');
  scrollLog();
}
function scrollLog() { if ($('#logFollow').checked) $('#log').scrollTop = $('#log').scrollHeight; }
$('#logFilter').addEventListener('change', renderLog);

// ------------------------------------------------------------------- panel --

async function loadPanelSettings() {
  const { settings, settingsFile } = await api('GET', '/api/panel/settings');
  $$('#panelForm [data-pkey]').forEach((el) => {
    const v = settings[el.dataset.pkey];
    if (el.type === 'checkbox') el.checked = !!v;
    else el.value = Array.isArray(v) ? v.join(' ') : (v ?? '');
  });
  $('#panelInfo').textContent = 'Fájl: ' + settingsFile;
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
    toast('Panelbeállítások elmentve.');
    if (r.relogin) showLogin();
    refreshState();
  } catch (err) { toast(err.message, true); }
});

// ------------------------------------------------------------------- start --

async function loadConfig() {
  const r = await api('GET', '/api/config');
  if (!r.config) {
    toast('A server.cfg hibás: ' + r.parseError, true);
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
  await loadLists(false, true);
  await loadConfig();
  await refreshState();
  loadPresets();
  pollLog();
  timers = [setInterval(refreshState, 4000), setInterval(pollLog, 2000)];
}

(async () => {
  const r = await fetch('/api/auth/check').then((x) => x.json()).catch(() => ({}));
  if (r.authed) start(); else showLogin();
})();
