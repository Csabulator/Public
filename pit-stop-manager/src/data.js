/* ===================== helpers ===================== */
const $ = s => document.querySelector(s);
const rnd = (a, b) => a + Math.random() * (b - a);
const ri = (a, b) => Math.floor(rnd(a, b + 1));
const pick = a => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const randn = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
const hashStr = s => { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 100003; return h; };
function shade(hex, amt) {
  let c = hex.replace('#', ''); if (c.length === 3) c = c.split('').map(x => x + x).join('');
  const n = parseInt(c, 16);
  const r = clamp((n >> 16) + amt, 0, 255), g = clamp(((n >> 8) & 255) + amt, 0, 255), b = clamp((n & 255) + amt, 0, 255);
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

/* ===================== balance constants ===================== */
const VERSION = '3.11.1';
const TEAM_COLORS = ['#e8392f', '#ff8a1e', '#f5c518', '#2fbf71', '#14b8c4', '#2f7bf5', '#7a4cf0', '#e64598', '#f2f2f2', '#2b2f36'];
const TIER_BASE = [24, 45, 67, 88];          // AI performance level per tier
const TIER_MULT = [1.25, 2.1, 3.6, 6.0];     // money multiplier per tier
const TEAMS = 8;                             // teams per series, two cars each
const FIELD = TEAMS * 2;                     // cars on the grid
const PRIZE = [12000, 9000, 7500, 6300, 5300, 4500, 3800, 3200, 2700, 2300, 2000, 1700, 1500, 1300, 1100, 1000];
const POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1, 0, 0, 0, 0, 0, 0];
const CHAMP_PRIZE = [90000, 60000, 40000, 28000, 20000, 14000, 10000, 8000];
const PROMOTE = 2, RELEGATE = 2;             // top 2 teams go up, bottom 2 go down
const MAXLV = 20;
const STAFF_MAX = 10;
const START_MONEY = 30000;
const STAGES = [1, 5, 10, 15];               // part level where each visual stage starts

/* ===================== tracks =====================
   rain = chance of rain, bump = surface roughness (affects the ideal ride height) */
const ROAD_TRACKS = [
  { id: 'pannon', laps: 14, ratio: .5, wear: 1.0, rain: .25, bump: .3, pts: [[.1, .7], [.1, .3], [.25, .15], [.5, .2], [.6, .4], [.75, .2], [.9, .3], [.9, .7], [.7, .85], [.45, .65], [.3, .85]] },
  { id: 'balaton', laps: 14, ratio: .52, wear: 1.1, rain: .3, bump: .25, pts: [[.15, .82], [.08, .5], [.2, .18], [.45, .14], [.56, .33], [.44, .5], [.66, .56], [.84, .28], [.93, .55], [.8, .86], [.5, .86]] },
  { id: 'alpine', laps: 14, ratio: .42, wear: 1.2, rain: .45, bump: .45, pts: [[.08, .5], [.2, .14], [.36, .3], [.5, .12], [.72, .14], [.92, .36], [.76, .5], [.92, .72], [.7, .9], [.5, .74], [.3, .9], [.14, .8]] },
  { id: 'harbour', laps: 14, ratio: .36, wear: .9, rain: .35, bump: .7, sharp: true, pts: [[.1, .86], [.1, .18], [.32, .18], [.32, .46], [.56, .46], [.56, .14], [.9, .14], [.9, .6], [.7, .6], [.7, .86]] },
  { id: 'forest', laps: 14, ratio: .55, wear: 1.0, rain: .4, bump: .35, pts: [[.1, .6], [.2, .24], [.5, .1], [.8, .18], [.9, .44], [.66, .5], [.8, .74], [.56, .9], [.36, .7], [.24, .88]] },
  { id: 'desert', laps: 14, ratio: .48, wear: 1.35, rain: .05, bump: .2, pts: [[.08, .5], [.14, .18], [.6, .1], [.9, .24], [.9, .5], [.62, .54], [.46, .38], [.32, .6], [.68, .74], [.88, .86], [.3, .92], [.12, .8]] },
  { id: 'hungaria', laps: 14, ratio: .46, wear: 1.05, rain: .25, bump: .3, pts: [[.1, .8], [.1, .45], [.3, .3], [.3, .12], [.6, .12], [.7, .35], [.9, .3], [.92, .6], [.7, .62], [.6, .85]] },
  { id: 'coast', laps: 14, ratio: .6, wear: 1.0, rain: .3, bump: .2, pts: [[.08, .6], [.18, .2], [.7, .12], [.92, .3], [.85, .7], [.55, .88], [.2, .88]] },
  { id: 'volcano', laps: 14, ratio: .44, wear: 1.25, rain: .15, bump: .55, pts: [[.1, .5], [.15, .15], [.45, .2], [.5, .45], [.7, .15], [.92, .3], [.85, .6], [.6, .6], [.75, .88], [.35, .88], [.3, .65]] },
  { id: 'misty', laps: 14, ratio: .47, wear: .95, rain: .55, bump: .4, pts: [[.12, .85], [.08, .55], [.22, .4], [.12, .15], [.45, .12], [.5, .38], [.72, .2], [.92, .35], [.88, .65], [.6, .72], [.42, .6], [.38, .88]] },
  { id: 'airfield', laps: 14, ratio: .4, wear: 1.0, rain: .2, bump: .6, sharp: true, pts: [[.08, .8], [.08, .2], [.55, .2], [.55, .4], [.92, .4], [.92, .85], [.5, .85], [.5, .65], [.3, .65], [.3, .8]] },
  { id: 'vineyard', laps: 14, ratio: .5, wear: 1.1, rain: .3, bump: .35, pts: [[.1, .7], [.2, .3], [.4, .15], [.55, .3], [.45, .5], [.62, .62], [.85, .4], [.92, .7], [.7, .9], [.35, .88]] },
];
// oval shape: x = rx*sign(cos)*|cos|^p, y = ry*sin (+ tri-oval / D / egg modifiers); lt = lap time in seconds at 1x
const OVAL_TRACKS = [
  { id: 'duna', laps: 22, lt: 3.4, ratio: .7, wear: 1.1, rain: .08, bump: .25, o: { p: .6, rx: .4, ry: .33 } },
  { id: 'tisza', laps: 18, lt: 4.4, ratio: .82, wear: 1.0, rain: .1, bump: .15, o: { p: .5, rx: .42, ry: .3, tri: .07 } },
  { id: 'sunrise', laps: 16, lt: 5.2, ratio: .92, wear: .85, rain: .06, bump: .1, o: { p: .45, rx: .44, ry: .3 } },
  { id: 'canyon', laps: 18, lt: 4.4, ratio: .8, wear: 1.0, rain: .07, bump: .2, o: { p: .5, rx: .42, ry: .3, d: .06 } },
  { id: 'bullring', laps: 24, lt: 3.2, ratio: .68, wear: 1.25, rain: .1, bump: .35, o: { p: 1, rx: .38, ry: .33 } },
  { id: 'matra', laps: 18, lt: 4.4, ratio: .78, wear: 1.05, rain: .1, bump: .2, o: { p: 1, rx: .42, ry: .3, egg: .25 } },
  { id: 'paperclip', laps: 22, lt: 3.8, ratio: .62, wear: 1.15, rain: .08, bump: .3, o: { p: .3, rx: .45, ry: .22 } },
  { id: 'plains', laps: 18, lt: 4.6, ratio: .86, wear: .95, rain: .07, bump: .15, o: { p: .55, rx: .43, ry: .31 } },
  { id: 'crystal', laps: 22, lt: 3.3, ratio: .72, wear: 1.15, rain: .1, bump: .3, o: { p: .7, rx: .38, ry: .34 } },
  { id: 'storm', laps: 16, lt: 5.4, ratio: .94, wear: .85, rain: .12, bump: .1, o: { p: .42, rx: .45, ry: .29, tri: .05 } },
  { id: 'dawn', laps: 18, lt: 4.5, ratio: .84, wear: 1.0, rain: .07, bump: .15, o: { p: .5, rx: .42, ry: .3, tri: .1 } },
];
/* ===================== rally =====================
   Surfaces: grip = base grip, rough = how rough the road is (punctures, bottoming).
   Rally events: mix = surface share, rain / snow = chance of rain or fresh snow per loop,
   jumps / twist = how many jumps and how twisty the stages are, scen = scenery. */
const SURF = {
  A: { grip: 1.0, rough: .12, col: '#555a63', edge: '#e4e7ec' },
  G: { grip: .84, rough: .5, col: '#a8875b', edge: '#6e593b', dust: '196,164,118' },
  S: { grip: .8, rough: .36, col: '#d9c08a', edge: '#a88f5e', dust: '230,210,160' },
  N: { grip: .68, rough: .22, col: '#e9eef4', edge: '#aab6c6', dust: '245,248,252' },
};
const RALLY_EVENTS = [
  { id: 'mecsek', type: 'rally', mix: { A: .85, G: .15 }, rain: .35, snow: 0, rough: .25, jumps: .1, twist: .85, scen: 'forest' },
  { id: 'bakony', type: 'rally', mix: { G: 1 }, rain: .3, snow: 0, rough: .6, jumps: .35, twist: .6, scen: 'forest' },
  { id: 'lapland', type: 'rally', mix: { N: 1 }, rain: 0, snow: .45, rough: .25, jumps: .45, twist: .4, scen: 'snow' },
  { id: 'fjord', type: 'rally', mix: { N: .6, G: .4 }, rain: .3, snow: .3, rough: .35, jumps: .3, twist: .55, scen: 'snow' },
  { id: 'smeralda', type: 'rally', mix: { G: .75, S: .25 }, rain: .1, snow: 0, rough: .75, jumps: .3, twist: .7, scen: 'coast' },
  { id: 'dune', type: 'rally', mix: { S: .7, G: .3 }, rain: .03, snow: 0, rough: .5, jumps: .5, twist: .35, scen: 'desert' },
  { id: 'alpwinter', type: 'rally', mix: { A: .7, N: .3 }, rain: .3, snow: .35, rough: .2, jumps: .05, twist: .95, scen: 'snow' },
  { id: 'lakes', type: 'rally', mix: { G: 1 }, rain: .25, snow: 0, rough: .35, jumps: .95, twist: .3, scen: 'forest' },
  { id: 'vinetarmac', type: 'rally', mix: { A: 1 }, rain: .3, snow: 0, rough: .15, jumps: .05, twist: .9, scen: 'coast' },
  { id: 'highland', type: 'rally', mix: { G: .9, A: .1 }, rain: .6, snow: 0, rough: .5, jumps: .4, twist: .6, scen: 'forest' },
  { id: 'redrock', type: 'rally', mix: { G: 1 }, rain: .05, snow: 0, rough: .85, jumps: .4, twist: .55, scen: 'desert' },
  { id: 'island', type: 'rally', mix: { G: .5, A: .5 }, rain: .25, snow: 0, rough: .55, jumps: .3, twist: .7, scen: 'coast' },
];
/* rallycross circuits: pts = layout (0..1), size = metres across, grav = lap fractions on gravel,
   joker = alternative route between lap fractions a and b, bulging out by `out` (longer = bigger bulge) */
const RX_TRACKS = [
  { id: 'rx_pannon', type: 'rx', size: 260, rain: .3, ice: false, grav: [[.3, .62]], joker: { a: .66, b: .8, out: .16 }, pts: [[.1, .75], [.12, .3], [.35, .18], [.55, .35], [.8, .2], [.92, .5], [.75, .62], [.82, .86], [.45, .88]] },
  { id: 'rx_quarry', type: 'rx', size: 240, rain: .25, ice: false, grav: [[.1, .45], [.7, .85]], joker: { a: .48, b: .6, out: .22 }, pts: [[.12, .55], [.2, .16], [.6, .14], [.9, .3], [.7, .5], [.9, .78], [.5, .9], [.35, .66]] },
  { id: 'rx_frost', type: 'rx', size: 250, rain: 0, ice: true, grav: [[0, 1]], joker: { a: .2, b: .34, out: .14 }, pts: [[.1, .5], [.25, .15], [.62, .2], [.88, .4], [.78, .8], [.42, .86], [.3, .62]] },
  { id: 'rx_coast', type: 'rx', size: 270, rain: .35, ice: false, grav: [[.45, .78]], joker: { a: .82, b: .95, out: .1 }, pts: [[.08, .7], [.18, .22], [.5, .12], [.66, .4], [.92, .3], [.9, .78], [.6, .7], [.4, .9]] },
  { id: 'rx_valley', type: 'rx', size: 230, rain: .3, ice: false, grav: [[.05, .3], [.55, .72]], joker: { a: .34, b: .5, out: .2 }, pts: [[.15, .8], [.1, .35], [.4, .14], [.65, .3], [.9, .15], [.88, .6], [.6, .62], [.55, .88]] },
];
const RALLY_POOL = [...RALLY_EVENTS, ...RX_TRACKS];
const POOLS = { road: ROAD_TRACKS, oval: OVAL_TRACKS, rally: RALLY_POOL };

/* disciplines: pool = which track list, rounds per season, tank = fuel tank size as a fraction of a
   normal race distance; special = the round index of the season's headline event */
const DISC = {
  road: { pool: 'road', rounds: 12, lapTime: 6.2, tank: .6, laps: t => t.laps, special: { round: 6, kind: 'endurance', laps: 2.2, prize: 2, points: 2 } },
  oval: { pool: 'oval', rounds: 11, tank: .45, laps: t => t.laps, special: { round: 0, kind: 'bigrace', laps: 1.5, prize: 3, points: 1, track: 'sunrise' } },
  // rally: 8 rallies + 3 rallycross rounds (at rxRounds); no headline event
  rally: { pool: 'rally', rounds: 11, tank: 1, laps: t => t.type === 'rx' ? RX_LAPS.final : RALLY_STAGES, special: { round: -1, kind: 'none', laps: 1, prize: 1, points: 1 }, rxRounds: [3, 6, 9] },
};
const DISC_KEYS = ['road', 'oval', 'rally'];
const RALLY_STAGES = 9;                       // 3 loops of 3 stages; the last stage is the Power Stage
const RALLY_LOOPS = 3;
const SERVICE_MIN = [15, 30, 45];             // service before loop 1 / after loop 1 / evening service
const POWER_PTS = [5, 4, 3, 2, 1];
const RX_LAPS = { heat: 4, final: 6 };
const RX_PEN = 30;                            // seconds added if the joker lap is skipped
const TYRES = { AS: 'A', AH: 'A', AW: 'A', GS: 'G', GH: 'G', SN: 'N' };   // tyre -> surface it is made for
const CO_TRAIN = ['notes', 'calm'];
const racesPerSeason = d => DISC[d].rounds;
// car body style: GT cars in the lower road tiers, prototypes at the top, stock cars on ovals
const carKind = (disc, tier) => disc === 'oval' ? 'stock' : disc === 'rally' ? 'rally' : tier >= 2 ? 'proto' : 'gt';

const PARTS = ['engine', 'gearbox', 'aero', 'chassis', 'brakes', 'tires'];
const STAFF = ['eng', 'pit', 'shop', 'sim', 'mkt'];
const TRAIN = ['skill', 'cons', 'wet'];
const SETUP = ['wing', 'gear', 'ride', 'press'];
const ORDERS = ['free', 'hold', 'swap'];
// season rule changes: one may apply per season
const RULES = ['none', 'aeroCap', 'tyreWear', 'costCap', 'engineFreeze', 'smallTank'];

/* ===================== names (mostly international, some Hungarian) ===================== */
const NATS = {
  HUN: { w: 3, f: ['Bence', 'Máté', 'Levente', 'Dávid', 'Ádám', 'Gergő', 'Zsolt', 'Kristóf', 'Milán', 'Norbert'], l: ['Kovács', 'Szabó', 'Tóth', 'Varga', 'Horváth', 'Nagy', 'Molnár', 'Fekete', 'Kiss', 'Benedek'] },
  GBR: { w: 2, f: ['Oliver', 'Harry', 'James', 'Callum', 'Ryan', 'George', 'Jake', 'Lewis'], l: ['Walsh', 'Carter', 'Hughes', 'Bennett', 'Fletcher', 'Turner', 'Price', 'Doyle'] },
  ITA: { w: 2, f: ['Marco', 'Luca', 'Matteo', 'Giorgio', 'Andrea', 'Davide', 'Riccardo'], l: ['Rossi', 'Lombardi', 'Ferraro', 'Bianchi', 'Moretti', 'Galli', 'Conti'] },
  GER: { w: 2, f: ['Felix', 'Jonas', 'Lukas', 'Maximilian', 'Tim', 'Niklas'], l: ['Müller', 'Bauer', 'Keller', 'Weber', 'Brandt', 'Hoffmann', 'Richter'] },
  FRA: { w: 2, f: ['Hugo', 'Théo', 'Antoine', 'Pierre', 'Louis', 'Julien'], l: ['Moreau', 'Duval', 'Laurent', 'Girard', 'Fontaine', 'Mercier'] },
  ESP: { w: 1, f: ['Carlos', 'Álex', 'Pablo', 'Javier', 'Iker'], l: ['García', 'Navarro', 'Ortega', 'Romero', 'Castillo'] },
  BRA: { w: 1, f: ['Rafael', 'Thiago', 'Bruno', 'Gabriel', 'Felipe'], l: ['Silva', 'Pereira', 'Costa', 'Almeida', 'Barbosa'] },
  USA: { w: 2, f: ['Kyle', 'Tyler', 'Brody', 'Austin', 'Chase', 'Cody', 'Logan'], l: ['Hendricks', 'Dalton', 'Parker', 'Mitchell', 'Reed', 'Hayes', 'Brooks'] },
  JPN: { w: 1, f: ['Kenta', 'Yuki', 'Ren', 'Haruto', 'Sho'], l: ['Sato', 'Tanaka', 'Nakamura', 'Yamada', 'Kobayashi'] },
  NED: { w: 1, f: ['Daan', 'Sem', 'Lars', 'Bram'], l: ['Jansen', 'de Vries', 'Bakker', 'Visser'] },
  SWE: { w: 1, f: ['Erik', 'Oskar', 'Viktor', 'Elias'], l: ['Lindqvist', 'Berg', 'Nyström', 'Holm'] },
  AUS: { w: 1, f: ['Jack', 'Mitchell', 'Cooper', 'Liam'], l: ['Kelly', 'Murray', 'Doherty', 'Webb'] },
  POL: { w: 1, f: ['Kacper', 'Jakub', 'Mateusz'], l: ['Kowalski', 'Nowak', 'Wójcik'] },
  MEX: { w: 1, f: ['Diego', 'Santiago', 'Emilio'], l: ['Hernández', 'Ramírez', 'Torres'] },
};
const NAT_POOL = Object.entries(NATS).flatMap(([k, v]) => Array(v.w).fill(k));
function randomPerson() { const nat = pick(NAT_POOL), n = NATS[nat]; return { nat, name: pick(n.f) + ' ' + pick(n.l) }; }
const TEAM_A = ['Apex', 'Titan', 'Falcon', 'Vortex', 'Nova', 'Zenith', 'Strada', 'Corsa', 'Veloce', 'Nordic', 'Atlas', 'Orion', 'Phoenix', 'Cobra', 'Stellar', 'Kestrel', 'Meridian', 'Duna', 'Bakony', 'Villám'];
const TEAM_B = ['Racing', 'Motorsport', 'Engineering', 'Competition', 'Autosport', 'Performance', 'Works', 'Corse', 'Racing Team'];
const RIVAL_NAMES = ['Scuderia Valente', 'Blackwood Racing', 'Ironside Motorsport', 'Hollister Competition'];
const SPONSORS = [['Pannon Olaj', '#d4a017'], ['Kocka Bank', '#1f4fb5'], ['Turbó Kávé', '#7b4a2a'], ['Northwind Logistics', '#34495e'], ['Ardent Energy', '#18a558'], ['Kestrel Watches', '#2c3e50'],
  ['Bluefin Insurance', '#1a6fb0'], ['Vectra Telecom', '#8e44ad'], ['Helix Lubricants', '#e4572e'], ['Summit Water', '#2b9fd6'], ['Orbit Gaming', '#e91e63'], ['Crimson Pizza', '#c0392b'],
  ['Sparkline Electronics', '#0b8a8a'], ['Aurora Solar', '#f39c12'], ['Granite Construction', '#7f8c8d'], ['Fjord Toothpaste', '#16a0c8'], ['Redline Couriers', '#b03a2e'], ['Meridian Airways', '#1b4f72']];
const GOALS = [{ t: 'finish', n: FIELD, f: .5 }, { t: 'top', n: 10, f: 1 }, { t: 'top', n: 6, f: 1.6 }, { t: 'top', n: 3, f: 2.6 }, { t: 'top', n: 1, f: 4.2 }];
const AI_COLORS = ['#d63031', '#0984e3', '#00b894', '#fdcb6e', '#e17055', '#6c5ce7', '#fd79a8', '#00cec9', '#a29bfe', '#55efc4', '#74b9ff', '#b2bec3'];
const ACHIEVEMENTS = ['first_finish', 'first_points', 'first_podium', 'first_win', 'pole', 'rain_win', 'comeback', 'one_two', 'double_podium', 'ten_wins',
  'promotion', 'title', 'world_title', 'both_titles', 'endurance_win', 'bigrace_win', 'clean_season', 'millionaire', 'full_pro', 'beat_rival',
  'rally_win', 'power_stage', 'rx_win', 'super_rally'];
