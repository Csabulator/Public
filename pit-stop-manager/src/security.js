/* ===================== save protection =====================
   Saves are encoded and signed. Any edit (by hand or with an AI tool) breaks the
   signature, and a bookkeeping check (money = start + earned - spent) plus range
   checks reject made-up values. Client-side code can never be 100% tamper-proof,
   but casual save editing does not work. */
const SAVE_KEY = 'boxutca_save_v3', OLD_KEY = 'boxutca_save_v2';
const _K = [0x5b, 0x1f, 0xa7, 0x3c, 0xe2, 0x91, 0x46, 0xd8].map((x, i) => x ^ (i * 37 & 255));
const _SALT = String.fromCharCode(..._K) + 'pit-wall-' + (0x2f9b * 7).toString(36);
function h53(str, seed) {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) { const ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
const sig = j => h53(_SALT + j + _SALT.length, 0x9e37) + h53(j + _SALT, 0x85eb);
function xorStr(str, seed) {
  let x = parseInt(h53(_SALT, seed).slice(0, 6), 36) || 12345, o = '';
  for (let i = 0; i < str.length; i++) { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; o += String.fromCharCode(str.charCodeAt(i) ^ (x & 255)); }
  return o;
}
function seal(o) { const j = JSON.stringify(o); return 'BX5.' + btoa(xorStr(unescape(encodeURIComponent(j)), 7)) + '.' + sig(j); }
function unseal(code) {
  code = String(code || '').replace(/\s+/g, '');
  const m = code.match(/^BX([2-5])\.([A-Za-z0-9+/=]+)\.([a-z0-9]+)$/); if (!m) return null;
  let j; try { j = decodeURIComponent(escape(xorStr(atob(m[2]), 7))); } catch (e) { return null; }
  if (sig(j) !== m[3]) return null;
  let o; try { o = JSON.parse(j); } catch (e) { return null; }
  if ((o.v || 0) < 5) o = migrate(o);
  return o && validState(o) ? o : null;
}
/* older saves -> v5. v2: no weather; v3: touring cars; v4: one-car teams.
   Money, parts, staff, sponsors and the driver carry over; the current season restarts
   with two-car teams (a rookie joins as second driver). */
function migrate(o) {
  try {
    if (!o || !o.parts) return null;
    if (o.disc === 'touring') o.disc = 'road';
    if (!DISC[o.disc]) return null;
    const d = o.driver || o.drivers && o.drivers[0];
    if (!d) return null;
    d.wet = d.wet ?? Math.round(clamp(d.skill * .7, 10, 97));
    const p = randomPerson();
    d.nat = d.nat || 'HUN'; d.morale = 60; d.contract = 2;
    const prev = S; S = o;   // helpers below read the global state
    o.num2 = o.num < 99 ? o.num + 1 : 98;
    o.drivers = [d, rookie(o.tier)]; delete o.driver; o.train = [typeof o.train === 'string' ? o.train : 'skill', 'skill'];
    o.rival = { name: pick(RIVAL_NAMES), color: '#9b59b6' }; o.feud = 0;
    o.dev = []; o.rule = 'none'; o.setups = {}; o.ach = {}; o.titleDiscs = [];
    o.stats = { starts: 0, wins: 0, podiums: 0, poles: 0, dnfs: 0, points: 0, laps: 0 };
    o.history = (o.history || []).map(h => ({ season: h.season, disc: h.disc === 'touring' ? 'road' : (h.disc || o.disc), tier: h.tier || 0, pos: h.pos, move: h.move || '', label: h.label }));
    o.round = 0; o.calendar = newCalendar(o.disc); o.field = makeField(o.tier);
    resetPoints(); genOffers(); genMarket();
    (o.market || []).forEach(m => { m.nat = m.nat || p.nat; m.morale = 60; m.contract = 2; });
    delete o.leg; delete o.lastOrder;
    o.news = []; o.v = 5;
    addNews('info', 'news.migrated');
    S = prev;
    return o;
  } catch (e) { return null; }
}
const isInt = (v, a, b) => Number.isFinite(v) && Math.floor(v) === v && v >= a && v <= b;
function validState(o) {
  try {
    if (!o || typeof o !== 'object' || !DISC[o.disc]) return false;
    if (!isInt(o.tier, 0, 3) || !isInt(o.round, 0, DISC[o.disc].rounds) || !isInt(o.season, 1, 999)) return false;
    if (!PARTS.every(p => isInt(o.parts[p], 1, MAXLV))) return false;
    if (!STAFF.every(p => isInt(o.staff[p], 1, STAFF_MAX))) return false;
    if (!(o.rep >= 0 && o.rep <= 100)) return false;
    if (!Array.isArray(o.drivers) || o.drivers.length !== 2) return false;
    for (const d of o.drivers) {
      if (!d || !(d.skill >= 10 && d.skill <= 99) || !(d.cons >= 10 && d.cons <= 99) || !(d.wet >= 5 && d.wet <= 99) || !(d.pot <= 99) || !isInt(d.salary, 0, 1e7)) return false;
      if (!(d.morale >= 0 && d.morale <= 100)) return false;
    }
    if (!Array.isArray(o.field) || o.field.length !== TEAMS - 1) return false;
    if (o.field.some(f => !(f.P > 0 && f.P < 140 && f.H > 0 && f.H < 140) || !Array.isArray(f.drivers) || f.drivers.length !== 2 || f.drivers.some(d => !(d.D <= 99)))) return false;
    const maxPts = 50 * racesPerSeason(o.disc) * 2 + 100;
    if (Object.values(o.points || {}).some(v => !isInt(v, 0, maxPts))) return false;
    if (Object.values(o.dpoints || {}).some(v => !isInt(v, 0, maxPts))) return false;
    if (!Array.isArray(o.sponsors) || o.sponsors.length > 5) return false;
    if (o.sponsors.some(sp => !isInt(sp.per, 0, 2e6) || !isInt(sp.bonus, 0, 1e7) || !isInt(sp.races, 0, 12))) return false;
    if (!Array.isArray(o.dev) || o.dev.length > 4 || o.dev.some(d => !PARTS.includes(d.p) || !isInt(d.left, 0, 3))) return false;
    if (!Number.isFinite(o.money) || Math.abs(o.money) > 1e9) return false;
    if (!Number.isFinite(o.earned) || !Number.isFinite(o.spent)) return false;
    if (Math.abs(START_MONEY + o.earned - o.spent - o.money) > 1) return false;   // bookkeeping must match
    if (o.earned > (o.season * 12 + 12) * 4000000) return false;
    return true;
  } catch (e) { return false; }
}
function save() { try { localStorage.setItem(SAVE_KEY, seal(S)); } catch (e) { } }
let LOAD_MSG = false;
function load() {
  try {
    const t = localStorage.getItem(SAVE_KEY) || localStorage.getItem(OLD_KEY);
    if (!t) return null;
    const o = unseal(t);
    if (o) { try { localStorage.removeItem(OLD_KEY); } catch (e) { } return o; }
    LOAD_MSG = true;
    try { localStorage.removeItem(SAVE_KEY); localStorage.removeItem(OLD_KEY); } catch (e) { }
  } catch (e) { }
  return null;
}
