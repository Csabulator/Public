'use strict';
// Reader and writer for the AMS2 dedicated server's server.cfg.
//
// The file is "almost JSON": top-level entries have no surrounding braces and no
// commas, keys may be bare words, commas inside maps/lists are optional, trailing
// commas are allowed, and comments can be //, # or /* */.

function parse(text) {
  text = String(text).replace(/^\uFEFF/, ''); // Notepad likes to add a BOM
  let i = 0;
  const n = text.length;

  function fail(msg) {
    const before = text.slice(0, i);
    const line = before.split('\n').length;
    const col = i - before.lastIndexOf('\n');
    const err = new Error(`${msg} (line ${line}, column ${col})`);
    err.line = line;
    throw err;
  }

  function skip() {
    for (;;) {
      while (i < n && /[\s,]/.test(text[i])) i++;
      if (text.startsWith('//', i) || text[i] === '#') {
        while (i < n && text[i] !== '\n') i++;
      } else if (text.startsWith('/*', i)) {
        const end = text.indexOf('*/', i + 2);
        if (end < 0) fail('Unclosed /* comment');
        i = end + 2;
      } else return;
    }
  }

  function str() {
    i++; // opening quote
    let out = '';
    while (i < n && text[i] !== '"') {
      if (text[i] === '\\') {
        const c = text[i + 1];
        const map = { n: '\n', t: '\t', r: '\r', '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f' };
        if (c === 'u') { out += String.fromCharCode(parseInt(text.substr(i + 2, 4), 16)); i += 6; continue; }
        out += map[c] !== undefined ? map[c] : c;
        i += 2;
      } else out += text[i++];
    }
    if (i >= n) fail('Unclosed string');
    i++;
    return out;
  }

  function key() {
    skip();
    if (text[i] === '"') return str();
    const m = /^[A-Za-z_][\w.\-]*/.exec(text.slice(i, i + 200));
    if (!m) fail('Expected a key');
    i += m[0].length;
    return m[0];
  }

  function colon() {
    skip();
    if (text[i] !== ':') fail('Expected ":"');
    i++;
  }

  function value() {
    skip();
    const c = text[i];
    if (c === '"') return str();
    if (c === '{') {
      i++;
      const obj = {};
      for (;;) {
        skip();
        if (text[i] === '}') { i++; return obj; }
        if (i >= n) fail('Unclosed {');
        const k = key();
        colon();
        obj[k] = value();
      }
    }
    if (c === '[') {
      i++;
      const arr = [];
      for (;;) {
        skip();
        if (text[i] === ']') { i++; return arr; }
        if (i >= n) fail('Unclosed [');
        arr.push(value());
      }
    }
    const m = /^(-?\d+(\.\d+)?([eE][+-]?\d+)?|true|false|null)/.exec(text.slice(i, i + 40));
    if (!m) fail('Unexpected value');
    i += m[0].length;
    return JSON.parse(m[0]);
  }

  const root = {};
  for (;;) {
    skip();
    if (i >= n) break;
    const k = key();
    colon();
    root[k] = value();
  }
  return root;
}

// Dummy comment entries that older configs use instead of real comments.
const COMMENT_KEYS = new Set(['//', 'rem', '#']);

// Sections and order of the generated file. Keys not listed here are kept and
// written at the end under "Other options".
const SECTIONS = [
  ['Basic server options', {
    logLevel: 'debug / info / warning / error',
    eventsLogSize: 'Number of gameplay events kept in memory',
    name: 'Server name shown in the browser',
    secure: 'Check VAC bans through Steam',
    password: 'Password to join (empty = open server)',
    maxPlayerCount: 'Largest session that can be created (the game supports max 32)',
    bindIP: 'Empty = all interfaces',
    steamPort: 'These three ports must be reachable on the public IP',
    hostPort: '',
    queryPort: '',
    sleepWaiting: 'Tick delay in ms while idle',
    sleepActive: 'Tick delay in ms while hosting',
    sportsPlay: 'LAN-only mode with system sockets',
    blackList: '',
    whiteList: '',
  }],
  ['HTTP API (the control panel talks to the server through this)', {
    enableHttpApi: '',
    httpApiLogLevel: '',
    httpApiInterface: '127.0.0.1 = only this machine can reach it',
    httpApiPort: '',
    httpApiExtraHeaders: '',
    httpApiAccessLevels: '',
    httpApiAccessFilters: '',
    httpApiUsers: '',
    httpApiGroups: '',
    staticWebFiles: 'Files of the built-in web tool',
  }],
  ['Lua addons', {
    enableLuaApi: '',
    luaAddonRoot: '',
    luaConfigRoot: '',
    luaOutputRoot: '',
    luaApiAddons: 'Loaded in this order; sms_base is always loaded',
    luaAllowedLibraries: '',
  }],
  ['Game setup', {
    allowEmptyJoin: 'Show the server in the browser even when empty',
    controlGameSetup: 'true = the server (and this panel) controls the setup, not the host player',
    sessionAttributes: 'Initial session settings, see /api/list/attributes/session',
  }],
];

function isBareKey(k) {
  return /^[A-Za-z_][\w]*$/.test(k);
}

function fmt(v, indent) {
  const json = JSON.stringify(v, null, 4);
  return json.split('\n').join('\n' + indent);
}

function serialize(cfg, header) {
  const out = [];
  out.push('// AMS2 dedicated server configuration.');
  out.push('// Generated by ams2-server-panel' + (header ? ' - ' + header : '') + '.');
  out.push('// You can still edit it by hand; the panel reads it back on every load.');
  out.push('');
  const done = new Set();
  const writeKey = (k, comment) => {
    if (comment) out.push('// ' + comment);
    const name = isBareKey(k) ? k : JSON.stringify(k);
    out.push(`${name} : ${fmt(cfg[k], '')}`);
    done.add(k);
  };
  for (const [title, keys] of SECTIONS) {
    const present = Object.keys(keys).filter((k) => k in cfg);
    if (!present.length) continue;
    out.push('');
    out.push('//' + '/'.repeat(title.length + 4));
    out.push('// ' + title + ' //');
    out.push('//' + '/'.repeat(title.length + 4));
    out.push('');
    for (const k of present) writeKey(k, keys[k]);
  }
  const rest = Object.keys(cfg).filter((k) => !done.has(k) && !COMMENT_KEYS.has(k));
  if (rest.length) {
    out.push('');
    out.push('// Other options');
    for (const k of rest) writeKey(k, '');
  }
  return out.join('\n') + '\n';
}

function clean(cfg) {
  const c = { ...cfg };
  for (const k of COMMENT_KEYS) delete c[k];
  return c;
}

module.exports = { parse, serialize, clean };
