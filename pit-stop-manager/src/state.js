/* ===================== game state & economy ===================== */
let S = null;

const partRating = l => 8 + l * 4.6;
function carStats(parts, eng, rule) {
  const r = k => partRating(parts[k]);
  const aero = r('aero') * (rule === 'aeroCap' ? .85 : 1);
  const P = r('engine') * .65 + r('gearbox') * .35;
  const H = aero * .45 + r('chassis') * .4 + r('tires') * .15;
  const B = r('brakes');
  const rel = clamp((r('engine') + r('gearbox') + r('chassis') + r('brakes')) / 4 * .65 + eng * 3.2, 0, 100);
  const ovr = P * .38 + H * .37 + B * .15 + r('tires') * .10;
  return { P, H, B, rel, ovr };
}
const salaryFor = skill => Math.round(300 * Math.pow(1.055, skill) / 50) * 50;
const feeFor = (d, years = 2) => Math.round(d.salary * (5 + years * 1.5) / 50) * 50;
function partCost(l, id) {
  let c = 8000 * Math.pow(1.29, l - 1) * (1 - S.staff.shop * .04);
  if (S.rule === 'costCap') c *= .85;
  if (S.rule === 'engineFreeze' && (id === 'engine' || id === 'gearbox')) c *= 1.4;
  return Math.round(c / 50) * 50;
}
// races a part takes to build; the workshop speeds it up
const devTime = l => clamp(2 + (l >= 10 ? 1 : 0) - (S.staff.shop >= 6 ? 1 : 0), 1, 3);
const devSlots = () => 2 + (S.staff.shop >= 5 ? 1 : 0) + (S.staff.shop >= 9 ? 1 : 0);
const inDev = id => S.dev.find(d => d.p === id);
const staffCost = l => Math.round(12000 * Math.pow(1.55, l - 1) / 100) * 100;
const staffUpkeep = l => Math.round(400 * Math.pow(l, 1.35) / 50) * 50;
const upkeep = () => STAFF.reduce((a, k) => a + staffUpkeep(S.staff[k]), 0);
const perRaceCost = () => S.drivers[0].salary + S.drivers[1].salary + upkeep();
const slots = () => Math.min(5, 1 + Math.floor(S.rep / 25) + (S.staff.mkt >= 3 ? 1 : 0));
const stageOf = lv => lv >= STAGES[3] ? 3 : lv >= STAGES[2] ? 2 : lv >= STAGES[1] ? 1 : 0;
// morale (0-100, neutral 60) nudges pace and consistency
const drvEff = d => {
  const m = ((d.morale ?? 60) - 60) / 40;
  return { D: clamp(d.skill + m * 3, 5, 100), K: clamp(d.cons + m * 5, 5, 100), W: clamp(d.wet + m * 3, 5, 100) };
};
const moraleLabel = m => m >= 80 ? 'top' : m >= 62 ? 'good' : m >= 45 ? 'ok' : 'low';

function makeDriver(tier, opts = {}) {
  const base = TIER_BASE[tier];
  const skill = Math.round(clamp(opts.skill ?? rnd(base - 6, base + 24), 15, 97));
  const age = opts.age ?? ri(18, 36);
  const pot = Math.round(clamp(skill + (age < 23 ? rnd(8, 25) : age < 28 ? rnd(3, 14) : rnd(0, 5)), skill, 99));
  const cons = Math.round(clamp(opts.cons ?? rnd(35, 70) + (skill - 40) * .35, 20, 98));
  const wet = Math.round(clamp(opts.wet ?? skill * rnd(.55, 1.05) + rnd(-5, 5), 10, 97));
  const c = pick(TEAM_COLORS.slice(0, 8)), p = randomPerson();
  return {
    name: p.name, nat: p.nat, skill, cons, wet, age, pot, salary: salaryFor(skill), morale: 60, contract: opts.contract ?? 2,
    minRep: Math.max(0, Math.round((skill - 34) * 1.15)), h1: c, h2: pick(['#fff', '#111', '#f5c518', '#e8392f', '#2f7bf5'])
  };
}
const rookie = tier => makeDriver(tier, { skill: Math.max(18, TIER_BASE[tier] - 10), age: 19, contract: 1 });
function makeTeam(tier, id, name, color, boost = 0) {
  const lvl = TIER_BASE[tier] + rnd(-9, 9) + boost;
  const drv = () => { const p = randomPerson(), D = clamp(lvl + rnd(-4, 10), 15, 98); return { ...p, D, W: clamp(D * rnd(.7, 1.05), 10, 98), K: rnd(40, 88), num: 0 }; };
  return {
    id, name, color, P: lvl + rnd(-6, 6), H: lvl + rnd(-6, 6), B: lvl + rnd(-6, 6), rel: clamp(lvl + rnd(0, 20), 30, 98),
    pit: clamp(2 + tier * 2 + ri(-1, 2), 1, 10), setupQ: clamp(rnd(.45, .85) + tier * .03, .3, .95), drivers: [drv(), drv()]
  };
}
function makeField(tier) {
  const names = new Set([S.teamName, S.rival.name]), out = [];
  const nums = new Set([S.num, S.num2]);
  const freeNum = () => { let n; do { n = ri(2, 99); } while (nums.has(n)); nums.add(n); return n; };
  out.push(makeTeam(tier, 'rv', S.rival.name, S.rival.color, 4));   // the rival follows you through the tiers
  for (let i = 0; i < TEAMS - 2; i++) {
    let n; do { n = pick(TEAM_A) + ' ' + pick(TEAM_B); } while (names.has(n)); names.add(n);
    out.push(makeTeam(tier, 't' + i, n, AI_COLORS[i % AI_COLORS.length]));
  }
  out.forEach(tm => tm.drivers.forEach(d => { d.num = freeNum(); }));
  return out;
}
function newCalendar(disc) {
  const pool = tracksOf(disc), sp = DISC[disc].special;
  let idx = shuffle(pool.map((t, i) => i)).slice(0, DISC[disc].rounds);
  if (sp.track) {   // the headline race always runs at its own track
    const ti = pool.findIndex(t => t.id === sp.track);
    idx = idx.filter(i => i !== ti); idx.splice(sp.round, 0, ti); idx = idx.slice(0, DISC[disc].rounds);
  }
  return idx;
}
const tracksOf = d => POOLS[DISC[d].pool];
const isSpecial = (disc, round) => DISC[disc].special.round === round;
function newGame(teamName, color, num, disc) {
  const rv = pick(RIVAL_NAMES);
  S = {
    v: 5, teamName, color, num, num2: num < 99 ? num + 1 : 98, disc, tier: 0, season: 1, round: 0, money: START_MONEY, earned: 0, spent: 0, rep: 5,
    parts: { engine: 2, gearbox: 2, aero: 2, chassis: 2, brakes: 2, tires: 2 },
    staff: { eng: 1, pit: 1, shop: 1, sim: 1, mkt: 1 },
    drivers: [makeDriver(0, { skill: 26, age: 21, cons: 44, wet: 22 }), makeDriver(0, { skill: 22, age: 19, cons: 40, wet: 18, contract: 1 })],
    train: ['skill', 'skill'], sponsors: [], offers: [], market: [],
    rival: { name: rv, color: '#9b59b6' }, feud: 0, h2h: { me: 0, rv: 0 },
    field: [], calendar: newCalendar(disc), results: [], points: {}, dpoints: {},
    dev: [], rule: 'none', setups: {}, stats: { starts: 0, wins: 0, podiums: 0, poles: 0, dnfs: 0, points: 0, laps: 0 }, ach: {},
    news: [], history: [], titles: 0, titleDiscs: []
  };
  S.drivers.forEach(d => { d.salary = salaryFor(d.skill); d.pot = Math.max(d.pot, 60); });
  S.field = makeField(0);
  resetPoints(); genOffers(); genMarket();
  addNews('start', 'news.founded', { team: teamName, series: 'tier.' + disc + '.0' });
  addNews('info', 'news.rival', { r: S.rival.name });
  addNews('info', 'news.tip');
  save();
}
function resetPoints() {
  S.points = { me: 0 }; S.dpoints = { me_0: 0, me_1: 0 };
  S.field.forEach(f => { S.points[f.id] = 0; f.drivers.forEach((d, i) => S.dpoints[f.id + '_' + i] = 0); });
  S.results = []; S.h2h = { me: 0, rv: 0 };
}
// news are stored as translation keys so they follow the selected language
function addNews(type, k, p) { S.news.unshift({ e: type, k, p: p || {} }); S.news = S.news.slice(0, 18); }
function genOffers() {
  const used = new Set(S.sponsors.map(s => s.name));
  const pool = SPONSORS.filter(s => !used.has(s[0]));
  S.offers = shuffle(pool).slice(0, 3).map(([name, color]) => {
    const g = pick(GOALS.slice(0, S.tier >= 1 ? 5 : 4));
    const per = Math.round((1500 + Math.random() * 2500) * TIER_MULT[S.tier] * (1 + S.staff.mkt * .05) * (.75 + S.rep / 100 * .5) / 100) * 100;
    return { name, color, per, goal: { t: g.t, n: g.n }, bonus: Math.round(per * g.f * .8 / 100) * 100, races: ri(4, 12), sign: Math.round(per * rnd(.5, 1.5) / 100) * 100 };
  });
}
function genMarket() {
  S.market = Array.from({ length: 6 }, () => makeDriver(Math.min(3, S.tier + (Math.random() < .25 ? 1 : 0)), { contract: 2 }));
  S.market.sort((a, b) => a.skill - b.skill);
}
function addMoney(n) { n = Math.round(n); S.money += n; if (n >= 0) S.earned += n; else S.spent -= n; }
