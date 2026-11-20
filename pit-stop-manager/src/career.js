/* ===================== career: results, morale, press, contracts, achievements ===================== */
// rank of the player's car among all teams (0 = best) -> expected finishing position
function expectedPos() {
  const mine = carStats(S.parts, S.staff.eng, S.rule).ovr + S.staff.eng * .9;
  const rank = S.field.filter(f => (f.P + f.H + f.B) / 3 > mine).length;
  return rank * 2 + 1.5;
}
const achieve = (k, list) => { if (!S.ach[k]) { S.ach[k] = S.season; S.rep = clamp(S.rep + 1.5, 0, 100); list.push(k); } };

function applyRaceResult() {
  const D = DISC[S.disc], ord = raceOrder(), mult = TIER_MULT[S.tier], sp = R.special;
  const pm = sp ? sp.points : 1, prm = sp ? sp.prize : 1;
  ord.forEach((c, i) => {
    if (c.dnf) return;
    const p = POINTS[i] * pm;
    S.points[c.team] = (S.points[c.team] || 0) + p; S.dpoints[c.id] = (S.dpoints[c.id] || 0) + p;
  });
  const my = R.my.map(c => ({ c, pos: ord.indexOf(c) + 1 }));
  const fin = my.filter(m => !m.c.dnf), best = fin.length ? Math.min(...fin.map(m => m.pos)) : 99;
  const prize = Math.round(my.reduce((a, m) => a + (m.c.dnf ? PRIZE[FIELD - 1] * .5 : PRIZE[m.pos - 1]), 0) * mult * prm);
  let spBase = 0, spBonus = 0; const spLines = [];
  S.sponsors.forEach(s => {
    spBase += s.per;
    const ok = best < 99 && (s.goal.t === 'finish' || best <= s.goal.n);
    if (ok) spBonus += s.bonus;
    spLines.push((ok ? '+ ' : '– ') + s.name + ': ' + goalTxt(s.goal));
    s.races--;
  });
  S.sponsors.filter(s => s.races <= 0).forEach(s => addNews('info', 'news.sponsorEnd', { n: s.name }));
  S.sponsors = S.sponsors.filter(s => s.races > 0);
  const sal = S.drivers[0].salary + S.drivers[1].salary, upk = upkeep();
  const repair = Math.round(my.reduce((a, m) => a + m.c.dmgTotal, 0) * 6000 * mult * (1 - S.staff.eng * .03) / 50) * 50;
  const net = prize + spBase + spBonus - sal - upk - repair;
  addMoney(net);
  const repD = best === 99 ? -1.5 : clamp((9 - best) * .45 + (best === 1 ? 2 : 0), -2, 6) * (sp ? 1.5 : 1);
  S.rep = clamp(S.rep + repD, 0, 100);
  // morale: result against expectation, team orders, crashes
  const exp = expectedPos();
  my.forEach(({ c, pos }) => {
    const d = S.drivers[c.seat];
    let dm = c.dnf ? (c.why === 'crash' ? -5 : c.why === 'fuel' ? -3 : -1) : clamp((exp - pos) * .9, -6, 6) + (pos === 1 ? 4 : 0);
    d.morale = clamp(d.morale + dm + (60 - d.morale) * .08, 0, 100);
  });
  if (R.orderUsed && R.orderUsed.kind === 'swap') { const y = R.orderUsed.yielded; S.drivers[y].morale = clamp(S.drivers[y].morale - 8, 0, 100); S.drivers[1 - y].morale = clamp(S.drivers[1 - y].morale + 3, 0, 100); }
  if (R.teamClash) S.drivers.forEach(d => { d.morale = clamp(d.morale - 4, 0, 100); });
  // driver development (training focus gets most of the growth)
  S.drivers.forEach((d, i) => {
    const ageF = d.age < 26 ? 1.3 : d.age > 32 ? .5 : 1, g = (.15 + S.staff.sim * .05) * ageF, tr = S.train[i];
    const gs = { skill: tr === 'skill' ? 1.6 : .35, cons: tr === 'cons' ? 1.6 : .4, wet: tr === 'wet' ? 1.8 : .4 };
    d.skill = Math.min(Math.max(d.skill, d.pot), d.skill + g * gs.skill * (d.skill < d.pot ? 1 : 0));
    d.cons = Math.min(98, d.cons + g * gs.cons);
    d.wet = Math.min(99, Math.max(d.wet, Math.min(d.pot + 8, d.wet + g * gs.wet)));
  });
  S.field.forEach(f => { f.P += rnd(0, .35); f.H += rnd(0, .35); f.B += rnd(0, .3); f.drivers.forEach(d => { d.D = Math.min(98, d.D + rnd(0, .15)); d.W = Math.min(98, d.W + rnd(0, .15)); }); });
  S.results[S.round] = { pos: my.map(m => m.pos), dnf: my.map(m => m.c.dnf) };
  // rival head-to-head
  const rv = ord.filter(c => c.isRival && !c.dnf).map(c => ord.indexOf(c) + 1);
  const rvBest = rv.length ? Math.min(...rv) : 99;
  if (best < rvBest) S.h2h.me++; else if (rvBest < best) S.h2h.rv++;
  // statistics
  const st = S.stats;
  st.starts++; st.points += my.reduce((a, m) => a + (m.c.dnf ? 0 : POINTS[m.pos - 1] * pm), 0);
  if (best === 1) st.wins++; if (best <= 3) st.podiums++;
  const pole = my.some(m => m.c.grid === 1); if (pole) st.poles++;
  st.dnfs += my.filter(m => m.c.dnf).length; st.laps += my.reduce((a, m) => a + m.c.led, 0);
  if (my.some(m => m.c.dnf)) S.seasonDnf = true;
  // parts under construction
  const done = [];
  S.dev.forEach(d => { d.left--; if (d.left <= 0) { S.parts[d.p] = Math.min(MAXLV, S.parts[d.p] + 1); done.push(d.p); addNews('money', 'news.devDone', { p: 'part.' + d.p, l: S.parts[d.p] }); } });
  S.dev = S.dev.filter(d => d.left > 0);
  if (S.feud > 0 && Math.random() < .25) S.feud--;
  // achievements
  const ach = [];
  if (fin.length) achieve('first_finish', ach);
  if (best <= 10) achieve('first_points', ach);
  if (best <= 3) achieve('first_podium', ach);
  if (best === 1) {
    achieve('first_win', ach);
    if (R.wetSum / Math.max(1, R.t) > .4) achieve('rain_win', ach);
    if (my.some(m => m.pos === 1 && m.c.grid >= 8)) achieve('comeback', ach);
    if (sp && sp.kind === 'endurance') achieve('endurance_win', ach);
    if (sp && sp.kind === 'bigrace') achieve('bigrace_win', ach);
  }
  if (pole) achieve('pole', ach);
  if (my.every(m => !m.c.dnf && m.pos <= 2)) achieve('one_two', ach);
  if (my.every(m => !m.c.dnf && m.pos <= 3)) achieve('double_podium', ach);
  if (st.wins >= 10) achieve('ten_wins', ach);
  if (S.money >= 1e6) achieve('millionaire', ach);
  if (PARTS.every(p => S.parts[p] >= STAGES[3])) achieve('full_pro', ach);
  const tname = 'track.' + R.tr.id;
  addNews(best === 99 ? 'bad' : best <= 3 ? 'win' : 'race', best === 99 ? 'news.dnf' : 'news.result', { tr: tname, p: best, pts: POINTS[best - 1] || 0 });
  const events = { interview: makeInterview(best, rvBest, my), poach: maybePoach(), ach, done };
  S.round++;
  genOffers(); genMarket();
  return { ord, my, best, prize, spBase, spBonus, spLines, sal, upk, repair, net, repD, trackId: R.tr.id, special: sp, rvBest, seasonOver: S.round >= D.rounds, events };
}

/* ---------- press interviews ---------- */
// each answer: rep change, morale change per seat, feud change; 'risk' = chance that a denial backfires
function makeInterview(best, rvBest, my) {
  if (Math.random() > .45) return null;
  let q;
  if (R.orderUsed && R.orderUsed.kind === 'swap') q = 'orders';
  else if (R.teamClash || my.some(m => m.c.dnf && m.c.why === 'crash')) q = 'crash';
  else if (best === 1) q = 'win';
  else if (rvBest < best) q = 'rival';
  else q = 'goals';
  return { q, y: R.orderUsed && R.orderUsed.yielded != null ? R.orderUsed.yielded : 0, clashRival: !!R.rivalClash };
}
const IV_FX = {
  win: [{ rep: 1, m: [2, 2] }, { rep: 2, m: [3, -3] }, { rep: 0, m: [1, 1] }],
  rival: [{ rep: 1 }, { rep: 2, feud: 1 }, { rep: 0 }],
  crash: [{ rep: 1, m: [-1, -1] }, { rep: -1, feud: 1 }, { rep: 0, m: [1, 1] }],
  orders: [{ rep: -1, my: 3 }, { rep: 1, risk: .5, fail: -4 }],
  goals: [{ rep: 2, m: [-2, -2] }, { rep: 0, m: [2, 2] }, { rep: 1 }],
};
function applyInterview(iv, k) {
  const fx = IV_FX[iv.q][k]; let caught = false;
  let rep = fx.rep || 0;
  if (fx.risk && Math.random() < fx.risk) { rep = fx.fail; caught = true; }
  S.rep = clamp(S.rep + rep, 0, 100);
  if (fx.m) S.drivers.forEach((d, i) => { d.morale = clamp(d.morale + fx.m[i], 0, 100); });
  if (fx.my) S.drivers[iv.y].morale = clamp(S.drivers[iv.y].morale + fx.my, 0, 100);
  if (fx.feud) S.feud = Math.min(3, S.feud + fx.feud);
  save();
  return { rep, caught };
}

/* ---------- other teams try to sign your drivers ---------- */
function maybePoach() {
  for (let i = 0; i < 2; i++) {
    const d = S.drivers[i];
    const strong = d.skill > TIER_BASE[S.tier] + 12, unhappy = d.morale < 45;
    if ((strong || unhappy) && Math.random() < (unhappy ? .1 : .05)) {
      const from = Math.random() < .5 ? S.rival.name : pick(S.field.filter(f => f.id !== 'rv')).name;
      return { seat: i, from };
    }
  }
  return null;
}
function resolvePoach(ev, keep) {
  const d = S.drivers[ev.seat];
  if (keep) { const raise = Math.round(d.salary * .25 / 50) * 50; d.salary += raise; d.morale = clamp(d.morale + 8, 0, 100); addNews('driver', 'news.kept', { n: d.name, m: money(d.salary) }); }
  else {
    const comp = Math.round(feeFor(d) * .5 / 50) * 50; addMoney(comp);
    addNews('driver', 'news.left', { n: d.name, t: ev.from, m: money(comp) });
    S.drivers[ev.seat] = rookie(S.tier);
  }
  save();
}

/* ---------- season end ---------- */
function teamStandings() {
  const rows = [{ id: 'me', name: S.teamName, color: S.color, pts: S.points.me || 0, me: true }];
  S.field.forEach(f => rows.push({ id: f.id, name: f.name, color: f.color, pts: S.points[f.id] || 0, rival: f.id === 'rv' }));
  rows.sort((a, b) => b.pts - a.pts || (a.me ? -1 : 1)); return rows;
}
function driverStandings() {
  const rows = S.drivers.map((d, i) => ({ id: 'me_' + i, name: d.name, nat: d.nat, team: S.teamName, color: S.color, pts: S.dpoints['me_' + i] || 0, me: true }));
  S.field.forEach(f => f.drivers.forEach((d, i) => rows.push({ id: f.id + '_' + i, name: d.name, nat: d.nat, team: f.name, color: f.color, pts: S.dpoints[f.id + '_' + i] || 0, rival: f.id === 'rv' })));
  rows.sort((a, b) => b.pts - a.pts || (a.me ? -1 : 1)); return rows;
}
function seasonResolve() {
  const rows = teamStandings(), pos = rows.findIndex(r => r.me) + 1;
  const prize = Math.round((CHAMP_PRIZE[pos - 1] || 5000) * TIER_MULT[S.tier]); addMoney(prize);
  const oldTier = S.tier, ach = []; let move = '';
  if (pos === 1) {
    S.titles++; achieve('title', ach);
    if (!S.titleDiscs.includes(S.disc)) S.titleDiscs.push(S.disc);
    if (S.tier === 3) achieve('world_title', ach);
    if (S.titleDiscs.length >= 2) achieve('both_titles', ach);
  }
  if (pos <= PROMOTE && S.tier < 3) { S.tier++; move = 'up'; S.rep = clamp(S.rep + 10, 0, 100); achieve('promotion', ach); }
  else if (pos > TEAMS - RELEGATE && S.tier > 0) { S.tier--; move = 'down'; S.rep = clamp(S.rep - 6, 0, 100); }
  if (!S.seasonDnf) achieve('clean_season', ach);
  if (S.h2h.me > S.h2h.rv) achieve('beat_rival', ach);
  S.history.unshift({ season: S.season, disc: S.disc, tier: oldTier, pos, move, champ: rows[0].name, h2h: { ...S.h2h } });
  // contracts run down; expired ones need a decision
  const expired = [];
  S.drivers.forEach((d, i) => { d.contract--; if (d.contract <= 0) expired.push(i); });
  return { pos, prize, move, oldTier, ach, expired, champ: rows[0].name };
}
const renewSalary = d => Math.round(salaryFor(Math.round(d.skill)) * (d.morale < 45 ? 1.3 : 1.1) / 50) * 50;
function renewDriver(i, years) { const d = S.drivers[i]; d.salary = renewSalary(d); d.contract = years; d.morale = clamp(d.morale + 5, 0, 100); }
function releaseDriver(i) { addNews('driver', 'news.released', { n: S.drivers[i].name }); S.drivers[i] = rookie(S.tier); }
function nextSeason(disc, tier) {
  S.disc = disc; S.tier = tier; S.season++; S.round = 0; S.seasonDnf = false;
  S.field = makeField(tier); S.calendar = newCalendar(disc); resetPoints();
  S.drivers.forEach(d => { d.age++; if (d.age > 33) d.skill = Math.max(15, d.skill - rnd(.5, 2)); d.morale = clamp(d.morale + (60 - d.morale) * .5, 0, 100); });
  S.rule = Math.random() < .4 ? 'none' : pick(RULES.slice(1));
  genOffers(); genMarket();
  addNews('start', 'news.season', { n: S.season, s: 'tier.' + disc + '.' + tier });
  if (S.rule !== 'none') addNews('info', 'news.rule', { r: 'rule.' + S.rule });
  save();
}
