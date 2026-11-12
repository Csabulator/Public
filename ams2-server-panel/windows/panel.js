#!/usr/bin/env node
'use strict';
// ams2-server-panel - web control panel for the Automobilista 2 dedicated server.
// Needs only Node.js 18 or newer, no npm packages.

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');
const cfgfile = require('./cfg');

const VERSION = '1.2.0';
const isWin = process.platform === 'win32';
const APP_DIR = __dirname;
const SETTINGS_FILE = process.env.PANEL_SETTINGS || path.join(APP_DIR, 'panel.json');

// ---------------------------------------------------------------- settings --

const DEFAULTS = {
  port: 8080,
  bind: '0.0.0.0',
  password: '',          // plain text, hashed on first start and then cleared
  passwordHash: '',
  serverDir: isWin ? 'C:\\AMS2-DS' : '/opt/ams2-ds',
  serverExe: 'DedicatedServerCmd.exe',
  launcher: isWin ? [] : ['xvfb-run', '-a', 'wine'],
  launchArgs: [],
  postStop: isWin ? [] : ['wineserver', '-k'],
  steamcmd: isWin ? 'C:\\steamcmd\\steamcmd.exe' : '/opt/steamcmd/steamcmd.sh',
  steamAppId: '1338040',
  forceWindowsPlatform: !isWin,
  dsApiUrl: '',          // empty = built from server.cfg (httpApiInterface + httpApiPort)
  dataDir: path.join(APP_DIR, 'data'),
  autoStart: true,
  autoRestart: true,
  installIfMissing: false,
  dateFormat: 'iso',     // iso | eu | uk | us
  timeFormat: '24h',     // 24h | 12h
};

let settings = loadSettings();

function loadSettings() {
  let s = {};
  if (fs.existsSync(SETTINGS_FILE)) {
    s = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8').replace(/^\uFEFF/, ''));
  }
  s = { ...DEFAULTS, ...s };
  // Environment overrides, mostly for Docker.
  const env = process.env;
  if (env.PANEL_PORT) s.port = Number(env.PANEL_PORT);
  // Only for the very first start; afterwards the password is changed in the panel.
  if (env.PANEL_PASSWORD && !s.passwordHash) s.password = env.PANEL_PASSWORD;
  if (env.AMS2_DIR) s.serverDir = env.AMS2_DIR;
  if (env.STEAMCMD) s.steamcmd = env.STEAMCMD;
  if (env.PANEL_DATA) s.dataDir = env.PANEL_DATA;
  if (env.AMS2_INSTALL_IF_MISSING) s.installIfMissing = env.AMS2_INSTALL_IF_MISSING === '1';
  if (s.password) {
    s.passwordHash = hashPassword(s.password);
    s.password = '';
    saveSettings(s);
  }
  return s;
}

function saveSettings(s) {
  fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(s, null, 2) + '\n');
}

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  return salt + ':' + crypto.scryptSync(pw, salt, 32).toString('hex');
}

function checkPassword(pw, stored) {
  if (!stored || typeof pw !== 'string') return false;
  const [salt, hash] = stored.split(':');
  const test = crypto.scryptSync(pw, salt, 32);
  const want = Buffer.from(hash, 'hex');
  return want.length === test.length && crypto.timingSafeEqual(want, test);
}

const dataDir = () => { fs.mkdirSync(settings.dataDir, { recursive: true }); return settings.dataDir; };
const cfgPath = () => path.join(settings.serverDir, 'server.cfg');
const exePath = () => path.join(settings.serverDir, settings.serverExe);

// ---------------------------------------------------------------------- log --

const logLines = [];
let logSeq = 0;
function log(source, line) {
  const ts = Date.now();
  for (const l of String(line).split(/\r?\n/)) {
    if (!l.trim()) continue;
    logLines.push({ n: ++logSeq, ts, source, text: l });
  }
  while (logLines.length > 2000) logLines.shift();
}
function pipeLog(stream, source) {
  let buf = '';
  stream.on('data', (d) => {
    buf += d.toString();
    const parts = buf.split(/\r?\n/);
    buf = parts.pop();
    for (const p of parts) log(source, p);
  });
  stream.on('end', () => { if (buf) log(source, buf); });
}

// --------------------------------------------------------------- server.cfg --

function readConfig() {
  const raw = fs.readFileSync(cfgPath(), 'utf8');
  return { raw, config: cfgfile.parse(raw) };
}

function backupConfig() {
  if (!fs.existsSync(cfgPath())) return;
  const dir = path.join(dataDir(), 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  fs.copyFileSync(cfgPath(), path.join(dir, `server.cfg.${stamp}`));
  const old = fs.readdirSync(dir).filter((f) => f.startsWith('server.cfg.')).sort();
  while (old.length > 30) fs.unlinkSync(path.join(dir, old.shift()));
}

function writeConfig(config) {
  backupConfig();
  const text = cfgfile.serialize(cfgfile.clean(config), new Date().toISOString().slice(0, 16).replace('T', ' '));
  fs.writeFileSync(cfgPath(), text);
  log('panel', 'server.cfg saved');
  return text;
}

function writeRawConfig(text) {
  cfgfile.parse(text); // throws with a line number if it is broken
  backupConfig();
  fs.writeFileSync(cfgPath(), text);
  log('panel', 'server.cfg saved (raw editor)');
}

// A starting config for a fresh install, based on the official sample but
// cleaned up and set up so that the panel can control the server.
function defaultConfig() {
  return {
    logLevel: 'info', eventsLogSize: 10000, name: 'AMS2 server', secure: true, password: '',
    maxPlayerCount: 32, bindIP: '', steamPort: 8766, hostPort: 27015, queryPort: 27016,
    sleepWaiting: 50, sleepActive: 10, sportsPlay: false,
    enableHttpApi: true, httpApiLogLevel: 'warning', httpApiInterface: '127.0.0.1', httpApiPort: 9000,
    enableLuaApi: true, luaAddonRoot: 'lua', luaConfigRoot: 'lua_config', luaOutputRoot: 'lua_output',
    luaApiAddons: ['sms_base', 'sms_rotate', 'sms_motd', 'sms_stats'], luaAllowedLibraries: ['lib_rotate'],
    allowEmptyJoin: true, controlGameSetup: true,
    sessionAttributes: {
      ServerControlsTrack: 1, ServerControlsVehicleClass: 0, ServerControlsVehicle: 0,
      GridSize: 24, MaxPlayers: 24, PracticeLength: 0, QualifyLength: 0, RaceLength: 3,
      Flags: 656104, OpponentDifficulty: 50, DamageType: 1, TireWearType: 8, FuelUsageType: 2,
      PenaltiesType: 1, AllowedViews: 0, TrackId: -1478712571, VehicleClassId: 492525831,
      VehicleModelId: 1323381033, RaceDateHour: 11, RaceWeatherSlots: 1,
      RaceWeatherSlot1: -934211870, RaceWeatherSlot2: -934211870, RaceWeatherSlot3: -934211870, RaceWeatherSlot4: -934211870,
    },
  };
}

// ------------------------------------------------------ dedicated server API --

function dsBase() {
  if (settings.dsApiUrl) return settings.dsApiUrl.replace(/\/$/, '');
  let host = '127.0.0.1', port = 9000;
  try {
    const c = readConfig().config;
    if (c.httpApiInterface && /^\d+\.\d+\.\d+\.\d+$/.test(c.httpApiInterface) && c.httpApiInterface !== '0.0.0.0') host = c.httpApiInterface;
    if (c.httpApiPort) port = c.httpApiPort;
  } catch { /* no config yet */ }
  return `http://${host}:${port}`;
}

async function ds(pathAndQuery, timeout = 4000) {
  const res = await fetch(dsBase() + pathAndQuery, { signal: AbortSignal.timeout(timeout) });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { throw new Error(`Dedicated server answered HTTP ${res.status}: ${text.slice(0, 200)}`); }
  if (!res.ok || (body.result && body.result !== 'ok')) {
    throw new Error(`Dedicated server: ${body.result || res.status}${body.message ? ' - ' + body.message : ''}`);
  }
  return body.response !== undefined ? body.response : body;
}

const LISTS = {
  tracks: '/api/list/tracks',
  vehicles: '/api/list/vehicles',
  vehicle_classes: '/api/list/vehicle_classes',
  flags_session: '/api/list/flags/session',
  enums: '/api/list/enums',
  attributes_session: '/api/list/attributes/session',
};

async function getLists(refresh) {
  const file = path.join(dataDir(), 'lists-cache.json');
  let cache = {};
  if (fs.existsSync(file)) cache = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (refresh || !cache.fetchedAt) {
    try {
      const fresh = {};
      for (const [k, p] of Object.entries(LISTS)) fresh[k] = await ds(p, 8000);
      fresh.fetchedAt = new Date().toISOString();
      fs.writeFileSync(file, JSON.stringify(fresh));
      cache = fresh;
    } catch (e) {
      if (refresh) cache.error = 'Could not refresh the lists: ' + e.message;
    }
  }
  return cache;
}

// --------------------------------------------------------- process control --

const proc = { child: null, pid: null, state: 'stopped', startedAt: null, external: false, busy: null, stopping: false, crashes: [] };
const pidFile = () => path.join(dataDir(), 'ds.pid');

function pidAlive(pid) {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

function adoptRunning() {
  // The panel may have been restarted while the server kept running.
  if (!fs.existsSync(pidFile())) return;
  const pid = Number(fs.readFileSync(pidFile(), 'utf8'));
  if (pidAlive(pid)) {
    Object.assign(proc, { pid, state: 'running', external: true, startedAt: null });
    log('panel', `Dedicated server already running (PID ${pid}); output is not visible until the next restart.`);
  } else fs.unlinkSync(pidFile());
}

function startServer() {
  if (proc.state === 'running' || proc.state === 'starting') return;
  if (!fs.existsSync(exePath())) throw new Error(`Dedicated server not found: ${exePath()} - install it with the "Install / update server" button.`);
  if (!fs.existsSync(cfgPath())) writeConfig(defaultConfig());
  const cmd = [...settings.launcher, exePath(), ...settings.launchArgs];
  log('panel', 'Starting: ' + cmd.join(' '));
  const child = spawn(cmd[0], cmd.slice(1), {
    cwd: settings.serverDir,
    detached: !isWin,              // own process group so stop() can kill wine & co.
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    env: { ...process.env, WINEDEBUG: process.env.WINEDEBUG || '-all' },
  });
  Object.assign(proc, { child, pid: child.pid, state: 'running', startedAt: new Date().toISOString(), external: false, stopping: false });
  fs.writeFileSync(pidFile(), String(child.pid));
  pipeLog(child.stdout, 'server');
  pipeLog(child.stderr, 'server');
  child.on('error', (e) => { log('panel', 'Start failed: ' + e.message); });
  child.on('exit', (code, signal) => {
    log('panel', `Dedicated server exited (code ${code}${signal ? ', ' + signal : ''})`);
    const wanted = proc.stopping;
    Object.assign(proc, { child: null, pid: null, state: 'stopped', startedAt: null });
    try { fs.unlinkSync(pidFile()); } catch { /* already gone */ }
    if (!wanted && settings.autoRestart) {
      const now = Date.now();
      proc.crashes = proc.crashes.filter((t) => now - t < 10 * 60 * 1000);
      proc.crashes.push(now);
      if (proc.crashes.length <= 5) {
        log('panel', 'Unexpected stop - restarting in 10 seconds.');
        setTimeout(() => { if (proc.state === 'stopped') try { startServer(); } catch (e) { log('panel', e.message); } }, 10000);
      } else log('panel', 'Crashed 5 times in 10 minutes - automatic restart disabled until you start it again.');
    }
  });
}

function killTree(pid, force) {
  if (isWin) {
    spawnSync('taskkill', ['/PID', String(pid), '/T', ...(force ? ['/F'] : [])], { windowsHide: true });
  } else {
    try { process.kill(-pid, force ? 'SIGKILL' : 'SIGTERM'); } catch { try { process.kill(pid, force ? 'SIGKILL' : 'SIGTERM'); } catch { /* gone */ } }
  }
}

async function stopServer() {
  if (proc.state !== 'running' || !proc.pid) return;
  proc.stopping = true;
  proc.state = 'stopping';
  const pid = proc.pid;
  log('panel', 'Stopping the dedicated server');
  killTree(pid, isWin); // Windows console apps do not handle a soft taskkill, so force there
  for (let i = 0; i < 40 && pidAlive(pid); i++) await sleep(250);
  if (pidAlive(pid)) { killTree(pid, true); await sleep(1000); }
  if (settings.postStop.length) spawnSync(settings.postStop[0], settings.postStop.slice(1), { stdio: 'ignore' });
  if (proc.external) {
    Object.assign(proc, { pid: null, state: 'stopped', external: false });
    try { fs.unlinkSync(pidFile()); } catch { /* gone */ }
  }
  for (let i = 0; i < 20 && proc.state !== 'stopped'; i++) await sleep(250);
  proc.state = 'stopped';
}

async function restartServer() {
  await stopServer();
  await sleep(1500);
  startServer();
}

function updateServer() {
  return new Promise((resolve, reject) => {
    if (proc.state !== 'stopped') return reject(new Error('Stop the server before updating it.'));
    if (!fs.existsSync(settings.steamcmd)) return reject(new Error(`SteamCMD not found: ${settings.steamcmd}`));
    fs.mkdirSync(settings.serverDir, { recursive: true });
    const args = [];
    if (settings.forceWindowsPlatform) args.push('+@sSteamCmdForcePlatformType', 'windows');
    args.push('+force_install_dir', settings.serverDir, '+login', 'anonymous', '+app_update', settings.steamAppId, 'validate', '+quit');
    log('panel', 'SteamCMD: ' + args.join(' '));
    proc.busy = 'update';
    const child = spawn(settings.steamcmd, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    pipeLog(child.stdout, 'steamcmd');
    pipeLog(child.stderr, 'steamcmd');
    child.on('error', (e) => { proc.busy = null; reject(e); });
    child.on('exit', (code) => {
      proc.busy = null;
      log('panel', `SteamCMD finished (code ${code})`);
      // SteamCMD often exits with 7 after a successful self-update; check the result instead.
      if (fs.existsSync(exePath())) resolve();
      else reject(new Error('The install did not finish, check the log.'));
    });
  });
}

// ------------------------------------------------------------------ presets --

const presetsFile = () => path.join(dataDir(), 'presets.json');
function readPresets() { return fs.existsSync(presetsFile()) ? JSON.parse(fs.readFileSync(presetsFile(), 'utf8')) : {}; }
function writePresets(p) { fs.writeFileSync(presetsFile(), JSON.stringify(p, null, 2)); }

// --------------------------------------------------------------------- addons --

function listAddons() {
  let root = 'lua';
  try { root = readConfig().config.luaAddonRoot || 'lua'; } catch { /* default */ }
  const dir = path.isAbsolute(root) ? root : path.join(settings.serverDir, root);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => {
      let meta = {};
      for (const f of [`${d.name}.json`, `${d.name}.txt`]) {
        const p = path.join(dir, d.name, f);
        if (fs.existsSync(p)) { try { meta = cfgfile.parse(fs.readFileSync(p, 'utf8')); } catch { /* ignore */ } break; }
      }
      return { name: d.name, library: d.name.startsWith('lib_'), title: meta.title || meta.name || '', description: meta.description || '' };
    });
}

// ------------------------------------------------------------------- http --

const sessions = new Map(); // token -> expiry
const SESSION_MS = 7 * 24 * 3600 * 1000;

function getCookie(req, name) {
  const m = (req.headers.cookie || '').split(';').map((s) => s.trim()).find((s) => s.startsWith(name + '='));
  return m ? decodeURIComponent(m.slice(name.length + 1)) : null;
}
function authed(req) {
  const t = getCookie(req, 'ams2panel');
  const exp = t && sessions.get(t);
  if (!exp || exp < Date.now()) return false;
  sessions.set(t, Date.now() + SESSION_MS);
  return true;
}

function send(res, code, obj, headers = {}) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 2e6) { reject(new Error('Too large')); req.destroy(); } });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(new Error('Bad JSON')); } });
  });
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

function serveStatic(req, res, urlPath) {
  const pub = path.join(APP_DIR, 'public');
  let p = path.normalize(path.join(pub, urlPath === '/' ? 'index.html' : urlPath));
  if (!p.startsWith(pub) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) p = path.join(pub, 'index.html');
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(p).pipe(res);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function attrQuery(attrs) {
  return Object.entries(attrs)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `session_${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

async function api(req, res, url) {
  const route = req.method + ' ' + url.pathname;

  if (route === 'POST /api/auth/login') {
    const { password } = await readBody(req);
    if (!checkPassword(password, settings.passwordHash)) {
      await sleep(1000);
      return send(res, 401, { error: 'Wrong password.' });
    }
    const token = crypto.randomBytes(24).toString('hex');
    sessions.set(token, Date.now() + SESSION_MS);
    return send(res, 200, { ok: true }, { 'Set-Cookie': `ams2panel=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_MS / 1000}` });
  }
  if (route === 'GET /api/auth/check') return send(res, 200, { authed: authed(req), version: VERSION });
  if (!authed(req)) return send(res, 401, { error: 'Please sign in.' });

  if (route === 'POST /api/auth/logout') {
    sessions.delete(getCookie(req, 'ams2panel'));
    return send(res, 200, { ok: true }, { 'Set-Cookie': 'ams2panel=; Path=/; Max-Age=0' });
  }

  if (route === 'GET /api/state') {
    let status = null, dsError = null;
    if (proc.state === 'running') {
      try { status = await ds('/api/session/status?attributes&members&participants', 2500); } catch (e) { dsError = e.message; }
    }
    let cfg = null, cfgError = null;
    try { cfg = readConfig().config; } catch (e) { cfgError = fs.existsSync(cfgPath()) ? e.message : 'missing'; }
    const warnings = [];
    if (cfg) {
      if (!cfg.enableHttpApi) warnings.push('enableHttpApi is off, so the panel cannot see or control the running server. Turn it on in the Server tab.');
      if (!cfg.controlGameSetup) warnings.push('controlGameSetup is off: the host player decides the setup, and the server ignores race settings sent from this panel. Turn it on in the Server tab.');
    }
    return send(res, 200, {
      version: VERSION, platform: process.platform,
      process: { state: proc.state, pid: proc.pid, startedAt: proc.startedAt, external: proc.external, busy: proc.busy },
      installed: fs.existsSync(exePath()), cfgPath: cfgPath(), cfgError, status, dsError, warnings,
      display: { dateFormat: settings.dateFormat, timeFormat: settings.timeFormat },
    });
  }

  if (route === 'GET /api/config') {
    if (!fs.existsSync(cfgPath())) return send(res, 200, { config: defaultConfig(), raw: '', isDefault: true });
    try { return send(res, 200, readConfig()); } catch (e) {
      return send(res, 200, { config: null, raw: fs.readFileSync(cfgPath(), 'utf8'), parseError: e.message });
    }
  }
  if (route === 'PUT /api/config') {
    const { config } = await readBody(req);
    if (!config || typeof config !== 'object') return send(res, 400, { error: 'Missing config.' });
    fs.mkdirSync(settings.serverDir, { recursive: true });
    const raw = writeConfig(config);
    return send(res, 200, { ok: true, raw, running: proc.state === 'running' });
  }
  if (route === 'PUT /api/config/raw') {
    const { raw } = await readBody(req);
    try { writeRawConfig(String(raw)); } catch (e) { return send(res, 400, { error: 'The config has an error: ' + e.message }); }
    return send(res, 200, { ok: true, running: proc.state === 'running' });
  }
  if (route === 'GET /api/config/default') return send(res, 200, { config: defaultConfig() });

  if (route === 'GET /api/lists') return send(res, 200, await getLists(url.searchParams.has('refresh')));
  if (route === 'GET /api/addons') return send(res, 200, { addons: listAddons() });

  if (route === 'POST /api/server/start') { startServer(); return send(res, 200, { ok: true }); }
  if (route === 'POST /api/server/stop') { await stopServer(); return send(res, 200, { ok: true }); }
  if (route === 'POST /api/server/restart') { await restartServer(); return send(res, 200, { ok: true }); }
  if (route === 'POST /api/server/update') {
    updateServer().catch((e) => log('panel', 'Update failed: ' + e.message));
    return send(res, 200, { ok: true });
  }

  if (route === 'POST /api/session/apply') {
    const { attributes, mode } = await readBody(req);
    const q = attrQuery(attributes || {});
    if (!q) return send(res, 400, { error: 'Nothing to send.' });
    const ep = mode === 'now' ? 'set_attributes' : 'set_next_attributes';
    const r = await ds(`/api/session/${ep}?${q}`);
    log('panel', `Session settings sent (${ep})`);
    return send(res, 200, { ok: true, response: r });
  }
  if (route === 'POST /api/session/chat') {
    const { message } = await readBody(req);
    await ds('/api/session/send_chat?message=' + encodeURIComponent(message));
    return send(res, 200, { ok: true });
  }
  if (route === 'POST /api/session/kick') {
    const { refid, ban } = await readBody(req);
    await ds(`/api/session/kick?refid=${encodeURIComponent(refid)}${ban ? '&ban=' + Number(ban) : ''}`);
    return send(res, 200, { ok: true });
  }

  if (route === 'GET /api/log') {
    const since = Number(url.searchParams.get('since') || 0);
    return send(res, 200, { lines: logLines.filter((l) => l.n > since), last: logSeq });
  }

  if (route === 'GET /api/presets') return send(res, 200, readPresets());
  if (route === 'PUT /api/presets') {
    const { name, attributes } = await readBody(req);
    if (!name) return send(res, 400, { error: 'Give the preset a name.' });
    const p = readPresets();
    p[name] = { attributes, savedAt: new Date().toISOString() };
    writePresets(p);
    return send(res, 200, { ok: true });
  }
  if (route === 'DELETE /api/presets') {
    const p = readPresets();
    delete p[url.searchParams.get('name')];
    writePresets(p);
    return send(res, 200, { ok: true });
  }

  if (route === 'GET /api/panel/settings') {
    const { password, passwordHash, ...rest } = settings;
    return send(res, 200, { settings: rest, settingsFile: SETTINGS_FILE });
  }
  if (route === 'PUT /api/panel/settings') {
    const body = await readBody(req);
    const allowed = ['serverDir', 'serverExe', 'launcher', 'launchArgs', 'postStop', 'steamcmd', 'dsApiUrl', 'autoStart', 'autoRestart', 'dateFormat', 'timeFormat'];
    for (const k of allowed) if (k in body) settings[k] = body[k];
    if (body.newPassword) {
      if (!checkPassword(body.currentPassword, settings.passwordHash)) return send(res, 400, { error: 'The current password is wrong.' });
      settings.passwordHash = hashPassword(body.newPassword);
      sessions.clear();
    }
    saveSettings(settings);
    return send(res, 200, { ok: true, relogin: !!body.newPassword });
  }

  return send(res, 404, { error: 'Unknown endpoint.' });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname.startsWith('/api/')) await api(req, res, url);
    else serveStatic(req, res, url.pathname);
  } catch (e) {
    log('panel', `${req.method} ${url.pathname}: ${e.message}`);
    if (!res.headersSent) send(res, 500, { error: e.message });
  }
});

// -------------------------------------------------------------------- start --

async function main() {
  if (!settings.passwordHash) {
    console.error('No password set. Put one in the "password" field of ' + SETTINGS_FILE + ' (or set the PANEL_PASSWORD environment variable) and start again.');
    if (!fs.existsSync(SETTINGS_FILE)) saveSettings(settings);
    process.exit(1);
  }
  dataDir();
  adoptRunning();
  server.listen(settings.port, settings.bind, () => {
    console.log(`ams2-server-panel ${VERSION} - http://${settings.bind === '0.0.0.0' ? 'localhost' : settings.bind}:${settings.port}`);
    log('panel', `Panel started on port ${settings.port}`);
  });
  if (!fs.existsSync(exePath()) && settings.installIfMissing) {
    log('panel', 'Dedicated server not installed yet - installing with SteamCMD');
    try { await updateServer(); } catch (e) { log('panel', 'Install failed: ' + e.message); }
  }
  if (settings.autoStart && proc.state === 'stopped' && fs.existsSync(exePath())) {
    try { startServer(); } catch (e) { log('panel', e.message); }
  }
}

async function shutdown() {
  // Leave the server running when only the panel stops? No: the panel owns the
  // process, so stop it cleanly to avoid orphaned wine processes.
  if (proc.child) await stopServer();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

main();
