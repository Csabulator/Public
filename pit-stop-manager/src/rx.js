/* ===================== rallycross: heats, semi-finals, final, joker lap ===================== */
const RX_DS = 2;          // metres between samples
const RX_TS = 4;          // real seconds per screen second at 1x
const RX_CACHE = {};
function buildRx(T) {
  if (RX_CACHE[T.id]) return RX_CACHE[T.id];
  const raw = catmull(T.pts.map(p => [p[0] * T.size, p[1] * T.size * .75]), 30);
  const seg = [0];
  for (let i = 1; i <= raw.length; i++) { const a = raw[i - 1], b = raw[i % raw.length]; seg.push(seg[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
  const Lm = seg[seg.length - 1], N = Math.floor(Lm / RX_DS), x = [], y = []; let j = 0;
  for (let i = 0; i < N; i++) {
    const d = i * RX_DS; while (seg[j + 1] < d) j++;
    const u = (d - seg[j]) / (seg[j + 1] - seg[j] || 1), a = raw[j], b = raw[(j + 1) % raw.length];
    x.push(lerp(a[0], b[0], u)); y.push(lerp(a[1], b[1], u));
  }
  const h = x.map((_, i) => Math.atan2(y[(i + 2) % N] - y[(i - 2 + N) % N], x[(i + 2) % N] - x[(i - 2 + N) % N]));
  const cv = h.map((_, i) => { let d = h[(i + 3) % N] - h[(i - 3 + N) % N]; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d / (6 * RX_DS); });
  const grav = x.map((_, i) => T.grav.some(([a, b]) => i / N >= a && i / N < b));
  // joker: the main route between a and b pushed outwards (away from the centre)
  const ia = Math.floor(T.joker.a * N), ib = Math.floor(T.joker.b * N);
  let cx = 0, cy = 0; x.forEach((v, i) => { cx += v; cy += y[i]; }); cx /= N; cy /= N;
  const jx = [], jy = [];
  for (let i = ia; i <= ib; i++) {
    const u = (i - ia) / (ib - ia), bul = Math.sin(u * Math.PI) * T.joker.out * T.size;
    let nx = -Math.sin(h[i]), ny = Math.cos(h[i]); if ((x[i] - cx) * nx + (y[i] - cy) * ny < 0) { nx = -nx; ny = -ny; }
    jx.push(x[i] + nx * bul); jy.push(y[i] + ny * bul);
  }
  let JL = 0; for (let i = 1; i < jx.length; i++) JL += Math.hypot(jx[i] - jx[i - 1], jy[i] - jy[i - 1]);
  const ML = (ib - ia) * RX_DS;
  const sp = arr => { // speed profile for a closed loop
    const v = arr.map(c => { const mu = .95, k = Math.abs(c); return Math.min(40, k > 1e-4 ? Math.sqrt(9.81 * mu * 1.4 / k) : 40); });
    for (let pass = 0; pass < 2; pass++) for (let i = v.length - 1; i >= 0; i--) v[i] = Math.min(v[i], Math.sqrt(v[(i + 1) % v.length] ** 2 + 2 * 9 * RX_DS));
    for (let pass = 0; pass < 2; pass++) for (let i = 0; i < v.length; i++) v[i] = Math.min(v[i], Math.sqrt(v[(i - 1 + v.length) % v.length] ** 2 + 2 * 6.5 * RX_DS * (1 - v[(i - 1 + v.length) % v.length] / 50)));
    return v;
  };
  const v = sp(cv);
  const tr = { T, N, L: N * RX_DS, x, y, h, cv, grav, v, ia, ib, jx, jy, JL, ML, cx, cy };
  RX_CACHE[T.id] = tr; return tr;
}
function rxSVG(T, w = 140, hgt = 100) {
  const tr = buildRx(T), xs = tr.x, ys = tr.y;
  const x0 = Math.min(...xs), x1 = Math.max(...xs, ...tr.jx), y0 = Math.min(...ys, ...tr.jy), y1 = Math.max(...ys, ...tr.jy);
  const s = Math.min((w - 10) / (x1 - Math.min(x0, ...tr.jx)), (hgt - 10) / (y1 - y0)), ox = Math.min(x0, ...tr.jx);
  const P = (a, b) => `${(5 + (a - ox) * s).toFixed(1)} ${(5 + (b - y0) * s).toFixed(1)}`;
  let d = ''; for (let i = 0; i < tr.N; i += 3) d += (i ? 'L' : 'M') + P(xs[i], ys[i]);
  let jd = ''; for (let i = 0; i < tr.jx.length; i += 2) jd += (i ? 'L' : 'M') + P(tr.jx[i], tr.jy[i]);
  return `<svg viewBox="0 0 ${w} ${hgt}" xmlns="http://www.w3.org/2000/svg"><path d="${jd}" fill="none" stroke="#ffb21e" stroke-width="2.5" stroke-dasharray="4 3"/><path d="${d}Z" fill="none" stroke="#000" stroke-opacity=".35" stroke-width="7" stroke-linejoin="round"/><path d="${d}Z" fill="none" stroke="#e6e9ef" stroke-width="4" stroke-linejoin="round"/><circle cx="${P(xs[0], ys[0]).split(' ')[0]}" cy="${P(xs[0], ys[0]).split(' ')[1]}" r="4" fill="#ffb21e"/></svg>`;
}

/* ---------- weekend ---------- */
function openRxWeekend() {
  const T = curEvent(), crews = rallyCrews();
  const wet = Math.random() < T.rain;
  RW = { type: 'rx', T, tr: buildRx(T), crews, wet, q: {}, stage: 'q1', dmg: { susp: 0, body: 0, engine: 0, gear: 0 }, repairCost: 0, myRaces: 0 };
  crews.forEach(c => { c.qpts = 0; c.qbest = 1e9; });
  const tr = RW.tr;
  modal(`<h3>${esc(t('track.' + T.id))} <span class="tag a">RX</span></h3>
   <div class="small muted">${t('rw.round', { r: S.round + 1, n: DISC.rally.rounds, k: 'Rallycross' })}</div>
   <div class="tv" style="margin:10px auto;max-width:260px">${rxSVG(T, 260, 170)}</div>
   <div class="card">
    <div class="money-line"><span>${t('rx.lap')}</span><b>${Math.round(tr.L)} m · ${t('rx.gravel', { p: Math.round(tr.grav.filter(Boolean).length / tr.N * 100) })}</b></div>
    <div class="money-line"><span>${t('rx.joker')}</span><b>+${Math.round(tr.JL - tr.ML)} m (${T.joker.out > .17 ? t('rx.jLong') : t('rx.jShort')})</b></div>
    <div class="money-line"><span>${t('rx.wx')}</span><b>${T.ice ? t('rx.ice') : wet ? t('rwx.wet') : t('rwx.dry')}</b></div>
   </div>
   <div class="small muted" style="margin:10px 2px">${t('rx.format', { h: RX_LAPS.heat, f: RX_LAPS.final, p: RX_PEN })}</div>
   <div class="row"><button class="btn grow" data-close>${t('ui.back')}</button><button class="btn pri grow" id="rxGo">${t('rx.toQ1')}</button></div>`);
  $('#rxGo').onclick = () => { closeModal(); rxQualRound(1); };
}
// qualifying round: three heats of five, heat times ranked across all heats -> points 16, 15, ...
function rxQualRound(n) {
  const W = RW, heats = [[], [], []];
  shuffle(W.crews).forEach((c, i) => heats[i % 3].push(c));
  W.heats = heats; W.qn = n; W.hi = 0; W.qres = [];
  rxNextHeat();
}
function rxNextHeat() {
  const W = RW;
  if (W.hi >= W.heats.length) { rxQualDone(); return; }
  const cars = W.heats[W.hi], label = t('rx.heat', { q: W.qn, h: W.hi + 1 });
  W.hi++;
  if (cars.some(c => c.isMe)) rxIntro(label, cars, RX_LAPS.heat, res => { W.qres.push(...res); rxNextHeat(); });
  else { W.qres.push(...rxSimRace(cars, RX_LAPS.heat)); rxNextHeat(); }
}
function rxQualDone() {
  const W = RW, rank = W.qres.slice().sort((a, b) => a.t - b.t);
  if (W.qScored !== W.qn) { W.qScored = W.qn; rank.forEach((r, i) => { r.c.qpts += r.dnf ? 0 : Math.max(0, 16 - i); if (!r.dnf) r.c.qbest = Math.min(r.c.qbest, r.t); }); }
  const tab = W.crews.slice().sort((a, b) => b.qpts - a.qpts || a.qbest - b.qbest);
  modal(`<h3>${t('rx.qDone', { n: W.qn })}</h3>
   <div class="card">${tab.map((c, i) => `<div class="res ${c.isMe ? 'me' : ''} ${i === 11 ? 'cut' : ''}"><span class="p">${i + 1}</span><span><span class="dot" style="background:${c.color}"></span>${esc(c.driver)} ${natTag(c.nat)}${c.isRival ? ' <span class="tt r">RIV</span>' : ''}</span><span class="small muted">${fmtT(c.qbest)}</span><b class="num">${c.qpts}</b></div>`).join('')}</div>
   <div class="small muted" style="margin:8px 2px">${W.qn === 1 ? t('rx.qInfo') : t('rx.semiInfo')}</div>
   ${rxRepairHtml()}
   <button class="btn pri block" style="margin-top:12px" id="rxNext">${W.qn === 1 ? t('rx.toQ2') : t('rx.toSemi')}</button>`);
  rxBindRepair(rxQualDone);
  $('#rxNext').onclick = () => { closeModal(); if (W.qn === 1) rxQualRound(2); else rxSemis(tab); };
}
function rxSemis(tab) {
  const W = RW; W.qtab = tab;
  const top = tab.slice(0, 12), sf = [top.filter((c, i) => i % 2 === 0), top.filter((c, i) => i % 2 === 1)];
  W.sf = sf; W.sres = [];
  const run = k => {
    if (k >= 2) { rxFinal(); return; }
    const cars = sf[k], label = t('rx.semi', { n: k + 1 });
    if (cars.some(c => c.isMe)) rxIntro(label, cars, RX_LAPS.final, res => { W.sres[k] = res; run(k + 1); });
    else { W.sres[k] = rxSimRace(cars, RX_LAPS.final); run(k + 1); }
  };
  if (!top.some(c => c.isMe)) toast(t('rx.outQ'));
  run(0);
}
function rxFinal() {
  const W = RW, fin = W.sres.flatMap(r => r.filter(e => !e.dnf).slice(0, 3).map(e => e.c));
  fin.sort((a, b) => W.qtab.indexOf(a) - W.qtab.indexOf(b));
  const go = () => {
    if (fin.some(c => c.isMe)) rxIntro(t('rx.final'), fin, RX_LAPS.final, res => rxDone(res));
    else rxDone(rxSimRace(fin, RX_LAPS.final));
  };
  if (W.sf.some(s => s.some(c => c.isMe))) {
    const inF = fin.some(c => c.isMe);
    modal(`<h3>${inF ? t('rx.inFinal') : t('rx.outSemi')}</h3>${inF ? rxRepairHtml(true) : ''}<button class="btn pri block" style="margin-top:12px" id="rxNext">${inF ? t('rx.toFinal') : t('ui.continue')}</button>`);
    if (inF) rxBindRepair(() => rxFinal());
    $('#rxNext').onclick = () => { closeModal(); go(); };
  } else go();
}
function rxDone(finalRes) {
  const W = RW, cls = finalRes.filter(e => !e.dnf).map(e => e.c);
  // semi-final 4th-6th next (ranked by qualifying), then everyone else by qualifying points
  const semiRest = W.sres.flatMap(r => r.filter(e => !e.dnf).slice(3).map(e => e.c)).sort((a, b) => W.qtab.indexOf(a) - W.qtab.indexOf(b));
  semiRest.forEach(c => { if (!cls.includes(c)) cls.push(c); });
  W.qtab.forEach(c => { if (!cls.includes(c) && !finalRes.some(e => e.c === c && e.dnf)) cls.push(c); });
  finalRes.filter(e => e.dnf).forEach(e => { if (!cls.includes(e.c)) cls.push(e.c); });
  W.crews.forEach(c => { if (!cls.includes(c)) cls.push(c); });
  const res = applyRallyResult(cls, [], { type: 'rx', repairCost: W.repairCost, name: W.T.id });
  RW = null; save(); showRallyResult(res);
}
function rxRepairHtml(final) {
  const d = RW.dmg, total = DMG_KEYS.reduce((a, k) => a + d[k], 0);
  if (total < .02) return '';
  const cr = Math.round(total * 2600 * TIER_MULT[S.tier] * (1 - S.staff.shop * .03) / 50) * 50;
  return `<h2 class="sec">${t('rx.repairT')}</h2><div class="card">${rallyTele(RW)}<button class="btn team block" style="margin-top:8px" id="rxFix" data-cr="${cr}">${t('rx.repair', { m: money(cr) })}</button></div>`;
}
function rxBindRepair(again) {
  const b = $('#rxFix'); if (!b) return;
  b.onclick = () => { const cr = +b.dataset.cr; addMoney(-cr); RW.repairCost += cr; DMG_KEYS.forEach(k => { RW.dmg[k] = 0; }); toast(t('rx.repaired')); again(); };
}

/* ---------- one race ---------- */
function rxCar(c, k, n, laps) {
  const row = Math.floor(k / (n > 5 ? 2 : 5)), col = k % (n > 5 ? 2 : 5);
  return { c, isMe: !!c.isMe, prog: -row * 9 - 2, lane: n > 5 ? (col ? .9 : -.9) : (col - 2) * .8, lap: 0, onJ: false, jp: 0, joker: false, plan: ri(1, laps), react: rnd(.15, .45) * (1.45 - c.K / 100),
    v: 0, hold: 0, done: false, time: 0, dnf: false, dmg: c.isMe ? RW.dmg : { susp: 0, body: 0, engine: 0, gear: 0 }, pf: 1 };
}
function rxPf(car) {
  const W = RW, c = car.c, gfrac = W.tr.grav.filter(Boolean).length / W.tr.N;
  const st = { frac: W.T.ice ? { N: 1 } : { A: 1 - gfrac, G: gfrac } };
  return (1 + (70 - crewPerf(c, st, W.wet)) * .0028) * dmgPf(car.dmg) * (car.isMe ? MODE_PF[RL ? RL.mode : 1] : 1);
}
function rxStep(L, dt) {
  const W = RW, tr = W.tr, N = tr.N, Lm = tr.L;
  L.t += dt;
  if (L.t < 0) return;
  const run = L.cars.filter(c => !c.done && !c.dnf);
  const eff = c => c.onJ ? c.lap * Lm + tr.ia * RX_DS + c.jp / tr.JL * tr.ML : c.prog;
  run.sort((a, b) => eff(b) - eff(a));
  run.forEach((car, ri2) => {
    if (L.t < car.react) return;
    if (car.hold > 0) { car.hold -= dt; car.v = 0; return; }
    const mode = car.isMe ? L.mode : 1;
    const i = ((Math.floor((car.onJ ? (tr.ia * RX_DS + car.jp / tr.JL * tr.ML) : car.prog) / RX_DS) % N) + N) % N;
    let v = tr.v[i] / rxPf(car) * (tr.grav[i] ? .93 : 1) * (W.wet && !tr.grav[i] ? .93 : 1) * (W.T.ice ? .82 : 1);
    if (car.prog < 0) v = Math.min(v, 6 + L.t * 14);
    // following: same route, close behind a slower car -> attempt a pass or wait
    const ahead = run.slice(0, ri2).reverse().find(o => o.onJ === car.onJ && eff(o) - eff(car) > 0 && eff(o) - eff(car) < 7);
    if (ahead && ahead.v < v) {
      const passP = (tr.grav[i] ? .5 : .3) * [.6, 1, 1.6][mode] * (Math.abs(tr.cv[i]) < .01 ? 1.5 : .5) * dt;
      if (Math.random() < passP) { car.lane = -ahead.lane || .9; v *= 1.05; }
      else v = Math.min(v, ahead.v);
      const hitP = .04 * [.6, 1, 1.8][mode] * (car.prog < 200 ? 4 : 1) * dt * (1.3 - car.c.K / 100);
      if (Math.random() < hitP) rxContact(L, car, ahead);
    }
    if (Math.random() < .004 * [.5, 1, 2][mode] * (1.5 - car.c.K / 100) * dt * (W.T.ice ? 2 : 1)) { car.hold = rnd(.6, 2.2); if (car.isMe) rlTick(t('rx.slide'), 'warn'); }
    v = Math.max(3, v * [.985, 1, 1.012][mode]); car.v = v;
    if (car.onJ) {
      car.jp += v * dt;
      if (car.jp >= tr.JL) { car.onJ = false; car.joker = true; car.prog = car.lap * Lm + tr.ib * RX_DS; if (car.isMe) rlTick(t('rx.jokerDone'), 'good'); }
    } else {
      const before = car.prog; car.prog += v * dt;
      const lapStart = car.lap * Lm, pa = lapStart + tr.ia * RX_DS;
      if (!car.joker && before < pa && car.prog >= pa && car.lap + 1 >= car.plan && car.lap + 1 <= L.laps && car.prog > 0) { car.onJ = true; car.jp = 0; car.prog = pa; if (car.isMe) rlTick(t('rx.jokerIn'), 'radio'); }
      if (car.prog >= (car.lap + 1) * Lm) {
        car.lap++;
        if (car.lap >= L.laps) { car.done = true; car.time = L.t + (car.joker ? 0 : RX_PEN); if (!car.joker && car.isMe) rlTick(t('rx.noJoker', { s: RX_PEN }), 'bad'); }
        else if (car.isMe && car.lap === L.laps - 1 && !car.joker) rlTick(t('rx.lastJoker'), 'warn');
      }
    }
    if (DMG_KEYS.some(k => car.dmg[k] >= 1)) { car.dnf = true; if (car.isMe) rlTick(t('rl.retired'), 'bad'); }
  });
  if (L.cars.every(c => c.done || c.dnf)) L.done = true;
}
function rxContact(L, a, b) {
  [a, b].forEach(c => { c.dmg.body = clamp(c.dmg.body + rnd(.02, .1), 0, 1); c.dmg.susp = clamp(c.dmg.susp + rnd(.01, .07), 0, 1); });
  b.hold = Math.max(b.hold, rnd(.2, .9)); a.hold = Math.max(a.hold, rnd(0, .4));
  if (a.isMe || b.isMe) rlTick(t('rx.contact'), 'warn');
}
function rxSimRace(crews, laps) {
  const L = { cars: crews.map((c, k) => rxCar(c, k, crews.length, laps)), t: -1.5, laps, mode: 1 };
  let g = 0; while (!L.done && g < 40000) { rxStep(L, .05); g++; }
  return rxResult(L);
}
const rxResult = L => L.cars.slice().sort((a, b) => (a.dnf - b.dnf) || a.time - b.time).map(c => ({ c: c.c, t: c.dnf ? 1e9 : c.time, dnf: c.dnf }));
function rxIntro(label, crews, laps, done) {
  modal(`<h3>${label}</h3><div class="small muted">${t('rx.laps', { n: laps })}</div>
   <div class="card gridlist" style="margin-top:10px">${crews.map((c, i) => `<div class="res g3 ${c.isMe ? 'me' : ''}"><span class="p">${i + 1}</span><span><span class="dot" style="background:${c.color}"></span>${esc(c.driver)} ${natTag(c.nat)}${c.isRival ? ' <span class="tt r">RIV</span>' : ''}</span><span class="small muted">#${c.num}</span></div>`).join('')}</div>
   <div class="small muted" style="margin:10px 2px">${t('rx.howto', { p: RX_PEN })}</div>${keysHint()}
   <button class="btn pri block" id="rxStart">${t('rl.start')}</button>`);
  $('#rxStart').onclick = () => { SND.unlock(); closeModal(); rxRun(label, crews, laps, done); };
}
function rxRun(label, crews, laps, done) {
  const W = RW;
  RL = { kind: 'rx', cars: crews.map((c, k) => rxCar(c, k, crews.length, laps)), t: -1.5, laps, mode: 1, speed: raceSpeedPref(), done: false, lastUI: 0, dust: [] };
  RL.me = RL.cars.find(c => c.isMe); RL.me.plan = 99;   // the player calls the joker
  $('#rally').classList.remove('hidden'); document.body.style.overflow = 'hidden';
  $('#rlTitle').textContent = label; $('#rlSub').textContent = t('track.' + W.T.id);
  $('#rlWx').innerHTML = W.T.ice ? `<i class="wxd damp"></i>${t('rx.ice')}` : wxBadge({ wet: W.wet }, null);
  $('#rlJoker').classList.remove('hidden'); $('#rlPrompt').classList.add('hidden');
  setSeg('#rlSpeed', 's', String(RL.speed)); setSeg('#rlMode', 'm', '1');
  rlTick(t('rx.grid'), 'info'); rlSizeCanvas(); SND.start('rx');
  let last = performance.now();
  const loop = now => {
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    if (!RL || RL.kind !== 'rx') return;
    if (RL.speed === 99) { if (!RL.me.joker && !RL.me.onJ && RL.me.plan > RL.laps) rxJokerCall(); let g = 0; while (!RL.done && g < 40000) { rxStep(RL, .05); g++; } }
    else if (RL.speed > 0) { const n = Math.ceil(RL.speed * RX_TS); for (let k = 0; k < n; k++) rxStep(RL, dt * RL.speed * RX_TS / n); }
    drawRx();
    try { SND.engine(RL.speed > 0 && !RL.done ? (RL.me.v || 0) / 40 : 0, 0); } catch (e) { }
    if (now - RL.lastUI > 200) { RL.lastUI = now; rxUI(); }
    if (RL.done) {
      cancelAnimationFrame(RL.raf); SND.stop(); rxUI();
      const L = RL; setTimeout(() => { $('#rally').classList.add('hidden'); document.body.style.overflow = ''; RL = null; rxShowRace(label, L, done); }, 900); return;
    }
    RL.raf = requestAnimationFrame(loop);
  };
  RL.raf = requestAnimationFrame(loop);
}
function rxJokerCall() {
  const L = RL, me = L.me; if (me.joker || me.onJ) return;
  const tr = RW.tr, pa = me.lap * tr.L + tr.ia * RX_DS;
  me.plan = me.prog < pa ? me.lap + 1 : me.lap + 2;
  if (me.plan > L.laps) me.plan = L.laps;
  rlTick(t('rx.jokerCalled', { n: me.plan }), 'radio'); rxUI();
}
function rxShowRace(label, L, done) {
  const res = rxResult(L);
  modal(`<h3>${label}</h3>
   <div class="card">${res.map((e, i) => `<div class="res ${e.c.isMe ? 'me' : ''}"><span class="p">${e.dnf ? '–' : i + 1}</span><span><span class="dot" style="background:${e.c.color}"></span>${esc(e.c.driver)}${e.c.isRival ? ' <span class="tt r">RIV</span>' : ''}</span><span class="small muted">${e.dnf ? 'DNF' : i ? fmtGap(e.t - res[0].t) : fmtT(e.t)}</span><b class="num">${L.cars.find(c => c.c === e.c).joker ? 'J ✓' : 'J ✗'}</b></div>`).join('')}</div>
   <button class="btn pri block" style="margin-top:12px" id="rxOk">${t('ui.continue')}</button>`);
  $('#rxOk').onclick = () => { closeModal(); done(res); };
}
function rxUI() {
  const L = RL; if (!L) return;
  const W = RW, me = L.me, tr = W.tr;
  const eff = c => c.done ? 1e12 - c.time : c.onJ ? c.lap * tr.L + tr.ia * RX_DS + c.jp / tr.JL * tr.ML : c.prog;
  const ord = L.cars.slice().sort((a, b) => (a.dnf - b.dnf) || eff(b) - eff(a));
  $('#rlCnt').textContent = `${Math.min(L.laps, me.lap + 1)}/${L.laps}`;
  const jb = $('#rlJoker');
  jb.textContent = me.joker ? t('rx.jDone') : me.onJ ? t('rx.jNow') : me.plan <= L.laps ? t('rx.jPlanned', { n: me.plan }) : 'JOKER';
  jb.classList.toggle('req', !me.joker && me.plan > L.laps && me.lap >= L.laps - 2); jb.classList.toggle('in', me.joker);
  const myPos = ord.indexOf(me) + 1;
  $('#rlTele').innerHTML = rallyTele({ dmg: me.dmg, wear: 0 }, `#${S.num} · P${myPos} · ${t('mode.' + L.mode)}`);
  $('#rlLb').innerHTML = ord.map((c, i) => lbRow(c.dnf ? '–' : i + 1, c.c, c.dnf ? '<span class="g dnf">DNF</span>' : `${c.joker ? 'J✓ ' : c.onJ ? 'J… ' : ''}${c.done ? fmtT(c.time) : t('rx.lapN', { n: Math.min(L.laps, c.lap + 1) })}`, c.onJ)).join('');
}
function drawRx() {
  const L = RL; if (!L || !RLC) return;
  const { g, w, h, dpr } = RLC, W = RW, tr = W.tr;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const xs = tr.x.concat(tr.jx), ys = tr.y.concat(tr.jy);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const k = Math.min((w - 30) / (x1 - x0), (h - 30) / (y1 - y0)), X = v => 15 + (v - x0) * k + (w - 30 - (x1 - x0) * k) / 2, Y = v => 15 + (v - y0) * k + (h - 30 - (y1 - y0) * k) / 2;
  const wox = X(0), woy = Y(0);
  g.fillStyle = worldPat(g, groundTex(W.T.ice ? 'snow' : 'forest'), 30, wox, woy, k); g.fillRect(0, 0, w, h);
  const patA = worldPat(g, surfTex('A'), 10, wox, woy, k), patG = worldPat(g, surfTex('G'), 12, wox, woy, k), patN = worldPat(g, surfTex('N'), 12, wox, woy, k);
  // grandstand and service area beside the start
  { const hd0 = tr.h[0], nx = Math.cos(hd0 + Math.PI / 2), ny = Math.sin(hd0 + Math.PI / 2), out = ((tr.x[0] - tr.cx) * nx + (tr.y[0] - tr.cy) * ny) > 0 ? 1 : -1;
    g.save(); g.translate(X(tr.x[0] + nx * out * 17), Y(tr.y[0] + ny * out * 17)); g.rotate(hd0);
    g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(-26 * k + 2, -4 * k + 3, 52 * k, 8 * k);
    for (let r = 0; r < 4; r++) { g.fillStyle = r % 2 ? '#3b4250' : '#4a5263'; g.fillRect(-26 * k, -4 * k + r * 2 * k, 52 * k, 2 * k); }
    for (let q = 0; q < 60; q++) { g.fillStyle = ['#e8392f', '#2f7bf5', '#f5c518', '#fff'][q % 4]; g.fillRect((-25 + (q * 37 % 50)) * k, (-3.6 + (q * 13 % 7)) * k, 1.5, 1.5); }
    g.restore(); }
  g.lineCap = 'round'; g.lineJoin = 'round';
  const path = (ax, ay, closed) => { g.beginPath(); g.moveTo(X(ax[0]), Y(ay[0])); for (let i = 1; i < ax.length; i++) g.lineTo(X(ax[i]), Y(ay[i])); if (closed) g.closePath(); };
  // tyre barrier around the circuit (outside the verge)
  path(tr.x, tr.y, true); g.strokeStyle = '#26282c'; g.lineWidth = 21 * k; g.setLineDash([1.2 * k, .6 * k]); g.stroke(); g.setLineDash([]);
  path(tr.x, tr.y, true); g.strokeStyle = W.T.ice ? '#b9c6d6' : '#3e5a35'; g.lineWidth = 18.5 * k; g.stroke();
  path(tr.jx, tr.jy); g.strokeStyle = '#6e593b'; g.lineWidth = 13 * k; g.stroke(); g.strokeStyle = W.T.ice ? patN : patG; g.lineWidth = 9 * k; g.stroke();
  path(tr.x, tr.y, true); g.strokeStyle = '#1b1d21'; g.lineWidth = 15 * k; g.stroke();
  for (let i = 0; i < tr.N; i++) {   // textured surface per sample, tarmac with white edge lines
    const j = (i + 1) % tr.N; g.beginPath(); g.moveTo(X(tr.x[i]), Y(tr.y[i])); g.lineTo(X(tr.x[j]), Y(tr.y[j]));
    g.strokeStyle = W.T.ice ? patN : tr.grav[i] ? patG : patA; g.lineWidth = 11 * k; g.stroke();
  }
  if (!W.T.ice) for (const sd of [-1, 1]) {
    g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = Math.max(1, .18 * k);
    for (let i = 0; i < tr.N; i++) { if (tr.grav[i]) continue; const j = (i + 1) % tr.N, n1 = tr.h[i] + Math.PI / 2, n2 = tr.h[j] + Math.PI / 2;
      g.beginPath(); g.moveTo(X(tr.x[i] + Math.cos(n1) * 5.1 * sd), Y(tr.y[i] + Math.sin(n1) * 5.1 * sd)); g.lineTo(X(tr.x[j] + Math.cos(n2) * 5.1 * sd), Y(tr.y[j] + Math.sin(n2) * 5.1 * sd)); g.stroke(); }
  }
  if (W.wet) { path(tr.x, tr.y, true); g.strokeStyle = 'rgba(58,110,168,.2)'; g.lineWidth = 11 * k; g.stroke(); }
  const jm = Math.floor(tr.jx.length / 2); g.fillStyle = '#ffb21e'; g.font = `800 ${Math.max(10, 9 * k)}px ${FC}`; g.textAlign = 'center'; g.fillText('JOKER', X(tr.jx[jm]), Y(tr.jy[jm]) - 10 * k); g.textAlign = 'left';
  g.save(); g.translate(X(tr.x[0]), Y(tr.y[0])); g.rotate(tr.h[0]); g.fillStyle = '#fff'; g.fillRect(-1.5, -6 * k, 3, 12 * k); g.restore();
  // tyre marks: gravel always, tarmac only when sliding; they build up lap after lap
  if (!L.mkc || L.mkc.width !== RLC.cv.width || L.mkc.height !== RLC.cv.height) { L.mkc = document.createElement('canvas'); L.mkc.width = RLC.cv.width; L.mkc.height = RLC.cv.height; }
  g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(L.mkc, 0, 0); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const mg = L.mkc.getContext('2d'); mg.setTransform(dpr, 0, 0, dpr, 0, 0); mg.lineCap = 'round'; mg.lineWidth = Math.max(1, .3 * k * 1.3);
  // cars
  const pos = c => {
    if (c.onJ) { const f = c.jp / tr.JL * (tr.jx.length - 1), i = Math.min(tr.jx.length - 2, Math.floor(f)), u = f - i; return [lerp(tr.jx[i], tr.jx[i + 1], u), lerp(tr.jy[i], tr.jy[i + 1], u), Math.atan2(tr.jy[i + 1] - tr.jy[i], tr.jx[i + 1] - tr.jx[i])]; }
    const p = ((c.prog % tr.L) + tr.L) % tr.L, i = Math.floor(p / RX_DS) % tr.N, j = (i + 1) % tr.N, u = p / RX_DS - Math.floor(p / RX_DS);
    const hd = tr.h[i], off = c.lane * 2.6, cv = tr.cv[i];
    const yaw = Math.sign(cv) * clamp((c.v || 0) ** 2 * Math.abs(cv) / 9.81 * (tr.grav[i] || W.T.ice ? .3 : .12), 0, .55);
    return [lerp(tr.x[i], tr.x[j], u) - Math.sin(hd) * off, lerp(tr.y[i], tr.y[j], u) + Math.cos(hd) * off, hd + yaw];
  };
  L.cars.forEach(c => {
    if (c.dnf && !c.isMe) return;
    const [px, py, hd] = pos(c);
    if (c.v > 10 && (tr.grav[Math.floor((((c.prog % tr.L) + tr.L) % tr.L) / RX_DS) % tr.N] || c.onJ)) L.dust.push({ x: px - Math.cos(hd) * 2.5, y: py - Math.sin(hd) * 2.5, r: 1, a: .45 });
    const ii = Math.floor((((c.prog % tr.L) + tr.L) % tr.L) / RX_DS) % tr.N, loose = c.onJ || tr.grav[ii] || W.T.ice, slide = Math.abs(hd - tr.h[ii]) > .2 || c.hold > 0;
    if (c.v > 3 && (loose || slide) && !c.dnf && !c.done) {
      const a = hd, rx = px - Math.cos(a) * 1.3, ry = py - Math.sin(a) * 1.3, nx = -Math.sin(a) * .8, ny = Math.cos(a) * .8, cur = [X(rx + nx), Y(ry + ny), X(rx - nx), Y(ry - ny)];
      if (c.mk && Math.hypot(cur[0] - c.mk[0], cur[1] - c.mk[1]) < 25) { mg.strokeStyle = W.T.ice ? 'rgba(110,125,145,.07)' : loose ? 'rgba(70,52,32,.07)' : 'rgba(12,12,14,.12)'; mg.beginPath(); mg.moveTo(c.mk[0], c.mk[1]); mg.lineTo(cur[0], cur[1]); mg.moveTo(c.mk[2], c.mk[3]); mg.lineTo(cur[2], cur[3]); mg.stroke(); }
      c.mk = cur;
    } else c.mk = null;
    drawRallyCar(g, X(px), Y(py), hd + (c.hold > 0 ? .8 : 0), k * 1.3, c.c.color, false);
    if (c.isMe) { g.strokeStyle = '#ffb21e'; g.lineWidth = 2; g.beginPath(); g.arc(X(px), Y(py), 5 * k * 1.3, 0, Math.PI * 2); g.stroke(); }
  });
  L.dust = L.dust.filter(p => (p.a -= .015) > 0).slice(-200);
  L.dust.forEach(p => { p.r += .06; g.fillStyle = `rgba(196,164,118,${p.a})`; g.beginPath(); g.arc(X(p.x), Y(p.y), p.r * k * 1.3, 0, Math.PI * 2); g.fill(); });
  if (W.wet) { g.strokeStyle = 'rgba(200,215,235,.3)'; g.lineWidth = 1; g.beginPath(); for (let m = 0; m < 90; m++) { const xx = Math.random() * w, yy = Math.random() * h; g.moveTo(xx, yy); g.lineTo(xx - 2, yy + 9); } g.stroke(); }
  wxIcons(g, w - 8, 8, W.wet ? 1 : 0, null, false);
  if (L.t < 0) { g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(w / 2 - 40, h / 2 - 22, 80, 44); g.fillStyle = '#fff'; g.font = `800 28px ${FC}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(Math.ceil(-L.t * 2), w / 2, h / 2); g.textAlign = 'left'; }
}
