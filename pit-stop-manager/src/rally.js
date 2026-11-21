/* ===================== rally: stages, timing, live stage view ===================== */
const DS = 5;                       // stage sample spacing in metres
const RL_TS = 7;                    // real stage seconds per screen second at 1x
const MODE_PF = [1.022, 1, .984], MODE_ERR_R = [.55, 1, 1.9], MODE_DMG = [.7, 1, 1.45], MODE_WEAR_R = [.8, 1, 1.3];
const DMG_KEYS = ['susp', 'body', 'engine', 'gear'];
const RSETUP = ['ride', 'spring', 'gear'];
let RW = null;                      // current rally / rallycross weekend
let RL = null;                      // live stage or rallycross race
const RMARKS = {};                  // tyre marks per stage, so a second pass drives over the first pass's marks

function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const fmtT = s => { if (!Number.isFinite(s)) return '–'; const m = Math.floor(s / 60), r = s - m * 60; return m + ':' + (r < 10 ? '0' : '') + r.toFixed(1); };
const fmtGap = s => (s >= 0 ? '+' : '−') + (Math.abs(s) >= 60 ? fmtT(Math.abs(s)) : Math.abs(s).toFixed(1));

/* ---------- stage geometry ---------- */
const STAGE_CACHE = {};
function genStage(ev, seed, km) {
  const key = ev.id + seed + km; if (STAGE_CACHE[key]) return STAGE_CACHE[key];
  const R = mulberry(seed), rr = (a, b) => a + R() * (b - a);
  const N = Math.ceil(km * 1000 / DS);
  const cv = new Float32Array(N), ft = new Uint8Array(N), sf = new Array(N);
  const keys = Object.keys(ev.mix);
  for (let i = 0; i < N;) {   // surface in chunks
    let r = R(), k = keys[0];
    for (const kk of keys) { r -= ev.mix[kk]; if (r <= 0) { k = kk; break; } }
    const len = Math.round(rr(900, 2600) / DS);
    for (let j = 0; j < len && i < N; j++, i++) sf[i] = k;
  }
  const tw = ev.twist, W = [.05 + .12 * tw, .1 + .15 * tw, .2, .25, .2 * (1.3 - tw), .2 * (1.4 - tw)];
  const RAD = [12, 22, 38, 60, 95, 150];
  /* the road is laid down segment by segment; a segment that would come closer than MIN metres to a part of the
     road more than SEP samples back is rolled again. Corners prefer the side with more free space, and when nothing
     fits the generator steps back a few segments, so the stage never touches or crosses itself. */
  const MIN = 70, SEP = 120, NEAR2 = 20, GC = 45, rgrid = new Map(), gk = (a, b) => a + ',' + b;
  const x = new Float32Array(N), y = new Float32Array(N), h = new Float32Array(N);
  let i = 0, hh = rr(0, Math.PI * 2), xx = 0, yy = 0, drift = 0, forced = 0;
  const cellOf = (px, py) => gk(Math.floor(px / GC), Math.floor(py / GC));
  const near = (px, py, k, d) => {
    const cx = Math.floor(px / GC), cy = Math.floor(py / GC), rC = Math.ceil(d / GC); let n = 0;
    for (let dx = -rC; dx <= rC; dx++) for (let dy = -rC; dy <= rC; dy++) {
      const arr = rgrid.get(gk(cx + dx, cy + dy)); if (!arr) continue;
      for (const j of arr) { const dd = Math.hypot(x[j] - px, y[j] - py); if ((k - j > SEP && dd < d) || (k - j > 12 && dd < NEAR2)) n++; }
    }
    return n;
  };
  const trySeg = (len, curv, check) => {
    let a = hh, px = xx, py = yy; const pts = [];
    for (let j = 0; j < len && i + j < N; j++) {
      a += curv * DS; px += Math.cos(a) * DS; py += Math.sin(a) * DS;
      if (check && near(px, py, i + j, MIN)) return null;
      pts.push([px, py, a]);
    }
    return pts;
  };
  const commit = (pts, curv) => {
    pts.forEach(([px, py, a]) => {
      x[i] = px; y[i] = py; h[i] = a; cv[i] = curv;
      const key = cellOf(px, py); if (!rgrid.has(key)) rgrid.set(key, []); rgrid.get(key).push(i);
      i++;
    });
    if (pts.length) { const l = pts[pts.length - 1]; xx = l[0]; yy = l[1]; hh = l[2]; }
  };
  const undoTo = st => {   // remove everything laid after a saved state
    for (let k = st.i; k < i; k++) { const arr = rgrid.get(cellOf(x[k], y[k])); if (arr) { const q = arr.indexOf(k); if (q >= 0) arr.splice(q, 1); } ft[k] = 0; cv[k] = 0; }
    i = st.i; hh = st.hh; xx = st.xx; yy = st.yy; drift = st.drift; corners.length = st.nc;
  };
  // which side is freer: probe ahead-left and ahead-right
  const freeSide = () => {
    const pr = s2 => near(xx + Math.cos(hh + s2 * .9) * 140, yy + Math.sin(hh + s2 * .9) * 140, i + SEP + 1, 130);
    const l = pr(-1), r2 = pr(1);
    return l === r2 ? 0 : l < r2 ? -1 : 1;
  };
  const corners = [];
  commit(trySeg(Math.round(rr(40, 80) / DS), 0, false), 0);
  const stack = []; let fails = 0;
  const placePair = force => {
    // straight
    let sl = Math.max(4, Math.round(rr(40, 300) * (1.6 - tw) / DS)), pts = null;
    for (let t2 = 0; t2 < 6 && !pts; t2++) { pts = trySeg(sl, 0, !force); if (!pts) sl = Math.max(4, Math.floor(sl * .55)); }
    if (!pts) return false;
    const s0 = i; commit(pts, 0);
    if (sl > 16 && R() < ev.jumps * .55) ft[Math.min(N - 1, s0 + Math.floor(sl / 2))] = 1;
    else if (sl > 12 && sf[s0] !== 'A' && R() < .07) ft[Math.min(N - 1, s0 + Math.floor(sl / 2))] = 2;
    if (i >= N) return true;
    const fs = freeSide();
    for (let t2 = 0; t2 < 14; t2++) {
      let r = R() * W.reduce((a2, b2) => a2 + b2, 0), sev = 1;
      for (let k = 0; k < 6; k++) { r -= W[k]; if (r <= 0) { sev = k + 1; break; } }
      if (t2 >= 8) sev = Math.max(sev, 3);
      const Rm = RAD[sev - 1], ang = sev === 1 ? rr(2.4, 3.0) : rr(.4, 1.5);
      let dir = R() < .5 ? -1 : 1;
      if (fs && R() < .85) dir = fs; else if (Math.abs(drift) > 2.4) dir = -Math.sign(drift);
      if (t2 >= 7) dir = t2 % 2 ? 1 : -1;
      const len = Math.max(2, Math.round(ang * Rm / DS)), p2 = trySeg(len, dir / Rm, !force);
      if (p2) { corners.push({ s: i, e: Math.min(N - 1, i + p2.length), sev, dir }); commit(p2, dir / Rm); drift += dir * ang; return true; }
    }
    return false;
  };
  while (i < N) {
    const st0 = { i, hh, xx, yy, drift, nc: corners.length };
    const force = fails > 3000;
    if (placePair(force)) { stack.push(st0); if (force) forced++; continue; }
    undoTo(st0); fails++;
    // step back a few segments and try again; the longer it is stuck, the further back
    const back = Math.min(stack.length, 1 + (fails % 5) + Math.floor(fails / 60) * 2);
    for (let k = 0; k < back; k++) undoTo(stack.pop());
  }
  // reference speed profile (a typical car on fresh tyres, dry)
  const v = new Float32Array(N), VMAX = 50;
  for (let k = 0; k < N; k++) {
    const mu = SURF[sf[k]].grip, c = Math.abs(cv[k]);
    let vc = c > 1e-4 ? Math.sqrt(9.81 * mu * 1.35 / c) : VMAX;
    if (ft[k] === 1) vc = Math.min(vc, 34); if (ft[k] === 2) vc = Math.min(vc, 20);
    v[k] = Math.min(VMAX, vc);
  }
  for (let k = N - 2; k >= 0; k--) v[k] = Math.min(v[k], Math.sqrt(v[k + 1] ** 2 + 2 * 9.81 * SURF[sf[k]].grip * DS));
  v[0] = Math.min(v[0], 4);
  for (let k = 1; k < N; k++) { const mu = SURF[sf[k]].grip; v[k] = Math.min(v[k], Math.sqrt(v[k - 1] ** 2 + 2 * 6 * Math.sqrt(mu) * (1 - v[k - 1] / VMAX * .6) * DS)); }
  const tc = new Float32Array(N); let tt = 0;
  for (let k = 1; k < N; k++) { tt += DS / ((v[k] + v[k - 1]) / 2); tc[k] = tt; }
  const frac = {}; sf.forEach(k => { frac[k] = (frac[k] || 0) + 1 / N; });
  // scenery: trees / rocks / spectators beside the road
  const decor = [];
  for (let k = 0; k < N; k += 2) {
    if (R() < .8) { const side = R() < .5 ? -1 : 1, off = rr(9, 44) * side, a = h[k] + Math.PI / 2; decor.push([x[k] + Math.cos(a) * off, y[k] + Math.sin(a) * off, R() < .9 ? 0 : 1, rr(1.6, 3.6), k]); }
  }
  // keep scenery clear of every part of the road (the road may pass near itself): grid lookup of road samples
  const CELL = 20, grid = new Map(), key2 = (a, b) => a + ',' + b;
  for (let k = 0; k < N; k++) { const gk = key2(Math.floor(x[k] / CELL), Math.floor(y[k] / CELL)); if (!grid.has(gk)) grid.set(gk, []); grid.get(gk).push(k); }
  const clear = (px, py, r) => {
    const gx = Math.floor(px / CELL), gy = Math.floor(py / CELL), need = 5.5 + r + 1.5;   // shoulder half-width + object + margin
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const arr = grid.get(key2(gx + dx, gy + dy)); if (!arr) continue;
      for (const k of arr) if (Math.hypot(x[k] - px, y[k] - py) < need) return false;
    }
    return true;
  };
  const decorOk = decor.filter(d => clear(d[0], d[1], d[2] === 0 ? d[3] : .7));
  const st = { N, km, x, y, h, cv, ft, sf, v, tc, ref: tt, corners, frac, decor: decorOk, seed, forced };
  STAGE_CACHE[key] = st; return st;
}

/* ---------- pace model ---------- */
function tyreGrip(ty, sf, wet) {
  const m = TYRES[ty];
  if (sf === 'N') return ty === 'SN' ? 1 : m === 'G' ? .82 : .74;
  if (sf === 'A') {
    if (m === 'A') return wet ? (ty === 'AW' ? .995 : ty === 'AS' ? .92 : .9) : (ty === 'AS' ? 1 : ty === 'AH' ? .988 : .955);
    return ty === 'SN' ? .86 : .9;
  }
  if (m === 'G') return (ty === 'GS' ? 1 : .987) * (wet ? .996 : 1);
  return ty === 'SN' ? .9 : .91;
}
function tyreWearRate(ty, sf, wet) {
  if (ty === 'SN') return sf === 'N' ? .7 : 2.5;
  if (ty === 'AW') return sf === 'A' && !wet ? 2.2 : 1.1;
  return ty === 'AS' || ty === 'GS' ? 1.25 : .8;
}
// overall performance of a crew on a stage (higher = faster); slippery surfaces lean on the driver's wet skill
function crewPerf(c, st, wet) {
  const slip = clamp((st.frac.N || 0) + (st.frac.S || 0) * .5 + (st.frac.G || 0) * .25 + (wet ? .5 : 0), 0, 1);
  const car = c.P * .35 + c.H * .45 + c.B * .2;
  const drv = c.D * (1 - slip * .5) + c.Wd * slip * .5;
  return car * .55 + drv * .45;
}
function basePf(c, st, ctx) {
  let pf = 1 + (70 - crewPerf(c, st, ctx.wet)) * .0028;
  if (ctx.sweep) pf *= 1 + ((st.frac.G || 0) + (st.frac.S || 0)) * .014 * ctx.sweep;
  pf *= 1 + ((st.frac.A || 0) * .07 + (st.frac.G || 0) * .03) * (ctx.wet ? 1 : 0) + (ctx.snowfall ? .03 : 0);
  return pf;
}
const dmgPf = d => 1 + d.susp * .12 + d.body * .04 + d.engine * .08 + d.gear * .06;
const setupPf = q => 1 + (.7 - q) * .035;
function rallyIdeal(ev) {
  const g = (ev.mix.G || 0) + (ev.mix.S || 0), a = ev.mix.A || 0, n = ev.mix.N || 0;
  return {
    ride: Math.round(clamp(2 + g * 5.5 + n * 3 + ev.rough * 1.5, 1, 9)),
    spring: Math.round(clamp(7.5 - g * 4 - n * 3 + a * .5, 1, 9)),
    gear: Math.round(clamp(8 - ev.twist * 6, 1, 9)),
  };
}
function rallySetupQ(ev, set) {
  const id = rallyIdeal(ev); let e = 0;
  RSETUP.forEach(k => { e += Math.abs(set[k] - id[k]) / 8; });
  return clamp(1 - e / 3 * 1.6, 0, 1);
}
function rallyFeedback(ev, set) {
  const id = rallyIdeal(ev), out = [];
  RSETUP.forEach(k => { const d = set[k] - id[k]; if (Math.abs(d) >= 2) out.push(['rfb.' + k + (d < 0 ? 'Lo' : 'Hi'), Math.abs(d)]); });
  out.sort((a, b) => b[1] - a[1]);
  return out.length ? out.slice(0, 2).map(o => o[0]) : ['rfb.ok'];
}
// low ride height on rough roads and jumps = more damage
const rideDmgF = (ev, set) => clamp(1 + (rallyIdeal(ev).ride - set.ride) * .22, .55, 2.4);

/* ---------- crews ---------- */
function rallyCrews() {
  const cs = carStats(S.parts, S.staff.eng, S.rule), dr = drvEff(S.drivers[0]), co = S.drivers[1];
  const me = { id: 'me_0', team: 'me', name: S.teamName, driver: S.drivers[0].name, co: co.name, nat: S.drivers[0].nat, color: S.color, num: S.num, isMe: true,
    P: cs.P, H: cs.H, B: cs.B, rel: cs.rel, D: dr.D, Wd: dr.W, K: dr.K, notes: co.skill * (.9 + (co.morale - 60) / 400), calm: co.cons };
  const out = [me];
  S.field.forEach(f => f.drivers.forEach((d, i) => out.push({ id: f.id + '_' + i, team: f.id, name: f.name, driver: d.name, nat: d.nat, color: f.color, num: d.num, isRival: f.id === 'rv',
    P: f.P, H: f.H, B: f.B, rel: f.rel, D: d.D, Wd: d.W, K: d.K })));
  out.forEach(c => { c.total = 0; c.times = []; c.out = false; c.restart = false; c.dnf = false; c.pen = 0; c.dayOut = -1; });
  return out;
}
// AI stage time with incidents; returns { t, ev } where ev = incident key or ''
// the best tyre for a stage (mix of surfaces): AI teams usually pick it, sometimes the second best
function bestTyres(ev, st, wet) {
  return tyreOptions(ev).map(ty => ({ ty, g: Object.entries(st.frac).reduce((a, [sf, f]) => a + f * tyreGrip(ty, sf, wet), 0) })).sort((a, b) => b.g - a.g);
}
function aiStageTime(c, st, ctx) {
  const rough = clamp(st.rough * (ctx.pass ? 1.2 : 1), 0, 1.2), slip = (st.frac.N || 0) + (ctx.wet ? .5 : 0);
  const tb = bestTyres(ctx.ev, st, ctx.wet), tg = (Math.random() < .15 && tb[1] ? tb[1] : tb[0]).g;
  let t = st.ref * basePf(c, st, ctx) / tg * (1 + randn() * .006 * (1.5 - c.K / 100)) * rnd(.99, 1.01);
  let ev = '';
  if (Math.random() < .055 * (1.5 - c.K / 100) * (1 + slip * .6)) { t += rnd(4, 35); ev = 'off'; }
  if (Math.random() < .03 * rough) { t += rnd(60, 110); ev = 'puncture'; }
  if (Math.random() < .007 * (1.45 - c.rel / 100) * (.6 + rough)) { ev = 'retire'; }
  return { t, ev };
}

/* ---------- live stage (player car) ---------- */
function startStage(si) {
  const W = RW, sd = W.stages[si], ev = W.ev, st = genStage(ev, sd.seed, sd.km);
  st.rough = ev.rough;
  const me = W.crews[0], lp = sd.loop, wx = W.wx[lp];
  const ctxBase = { wet: wx.wet, snowfall: wx.snow, pass: sd.pass, ev };
  // AI times for this stage (start order decides road sweeping on first-pass gravel stages)
  const order = W.order[lp], n = order.length;
  W.crews.forEach(c => {
    if (c.isMe || c.out) return;
    const p = order.indexOf(c.id), sweep = !sd.pass && p >= 0 ? 1 - p / Math.max(1, n - 1) : 0;
    const r = aiStageTime(c, st, { ...ctxBase, sweep });
    c.cur = r;
  });
  const p = order.indexOf('me_0');
  RL = {
    kind: 'stage', si, sd, st, ev, wx, me, t: 0, s: 0, idx: 0, v: 0, hold: 0, offT: 0, done: false, speed: raceSpeedPref(), mode: 1, lastUI: 0,
    sweep: !sd.pass ? 1 - p / Math.max(1, n - 1) : 0, startPos: p + 1, nStart: n, ctx: ctxBase, prompt: null, msgs: [], dust: [], splits: [], noteI: 0,
    rideF: rideDmgF(ev, W.setup), q: rallySetupQ(ev, W.setup), events: [], startT: 1.6, retired: false, auto: false,
    marks: (RMARKS[sd.seed] = RMARKS[sd.seed] || []), mk: null,
  };
  const ai = W.crews.filter(c => !c.isMe && !c.out && c.cur && c.cur.ev !== 'retire');
  RL.best = ai.length ? Math.min(...ai.map(c => c.cur.t)) : st.ref;
  RL.ghost = ai.find(c => c.cur.t === RL.best);
  $('#rally').classList.remove('hidden'); document.body.style.overflow = 'hidden';
  $('#rlTitle').textContent = t('rl.ssName', { n: si + 1, name: sd.name }) + (sd.power ? ' · Power Stage' : '');
  $('#rlSub').textContent = `${t('track.' + ev.id)} · ${sd.km.toFixed(1)} km · ${surfText(st.frac)}`;
  $('#rlCnt').textContent = `${si + 1}/${RALLY_STAGES}`;
  $('#rlWx').innerHTML = wxBadge(wx, ev);
  $('#rlJoker').classList.add('hidden'); $('#rlModeRow').classList.remove('hidden');
  setSeg('#rlSpeed', 's', String(RL.speed)); setSeg('#rlMode', 'm', '1');
  rlTick(t('rl.startPos', { p: RL.startPos, n }) + (RL.sweep > .5 && !sd.pass && ((st.frac.G || 0) + (st.frac.S || 0)) > .3 ? ' ' + t('rl.sweepNote') : ''), 'info');
  rlSizeCanvas(); SND.start('rally');
  let last = performance.now();
  const loop = now => {
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    if (!RL || RL.kind !== 'stage') return;
    if (RL.speed === 99) { stageSkip(); return; }
    if (!RL.prompt && RL.speed > 0) stageStep(dt * RL.speed);
    drawStage();
    try { SND.engine(RL.speed > 0 && !RL.prompt && !RL.done ? (RL.hold > 0 ? .15 : RL.v / 50) : 0, 0); } catch (e) { }
    if (now - RL.lastUI > 200) { RL.lastUI = now; stageUI(); }
    if (RL.done && !RL.closing) { RL.closing = true; SND.stop(); stageUI(); setTimeout(() => endStage(), 900); return; }
    RL.raf = requestAnimationFrame(loop);
  };
  RL.raf = requestAnimationFrame(loop);
}
function stageStep(dtScreen) {
  const L = RL; if (L.done) return;
  if (L.startT > 0) { L.startT -= dtScreen; if (L.startT <= 0) rlTick(t('rl.go'), 'good'); return; }
  let dt = dtScreen * RL_TS;
  while (dt > 0 && !L.done && !L.prompt) {
    const h = Math.min(dt, .5); dt -= h;
    L.t += h;
    if (L.hold > 0) { L.hold -= h; L.v = 0; continue; }
    const st = L.st, i = Math.min(st.N - 1, Math.floor(L.s / DS));
    L.v = st.v[i] / livePf(i);
    const ns = L.s + L.v * h, ni = Math.min(st.N - 1, Math.floor(ns / DS));
    for (let k = i + 1; k <= ni && !L.done; k++) { sampleEvents(k); if (L.hold > 0 || L.prompt) { L.s = k * DS; break; } }
    if (L.hold <= 0 && !L.prompt) L.s = ns;
    [1 / 3, 2 / 3].forEach((f, k) => { if (!L.splits[k] && L.s >= st.N * DS * f) { L.splits[k] = L.t; const d = L.t - L.best * f; rlTick(t('rl.split', { n: k + 1, g: fmtGap(d) }), d <= 0 ? 'good' : 'warn'); } });
    if (L.s >= (st.N - 1) * DS) { L.s = (st.N - 1) * DS; L.done = true; }
  }
}
function livePf(i) {
  const L = RL, W = RW, st = L.st, me = L.me;
  let pf = basePf(me, st, { ...L.ctx, sweep: L.sweep });
  pf /= tyreGrip(W.tyre, st.sf[i], L.wx.wet) * (1 - .06 * W.wear * W.wear);
  return pf * MODE_PF[L.mode] * setupPf(L.q) * dmgPf(W.dmg) * (1 + W.spares * .003) * (W.flat ? 1.35 : 1) * (L.offT > 0 ? 1.6 : 1);
}
function sampleEvents(k) {
  const L = RL, W = RW, st = L.st, me = L.me, d = W.dmg, sf = st.sf[k], S0 = SURF[sf];
  const mode = L.mode, rough = clamp(L.ev.rough * (L.sd.pass ? 1.2 : 1), 0, 1.3) * (sf === 'A' ? .35 : 1);
  // tyre wear
  W.wear = clamp(W.wear + DS / 1000 * .009 * tyreWearRate(W.tyre, sf, L.wx.wet) * (sf === 'N' ? .6 : 1) * MODE_WEAR_R[mode] * (1.2 - S.parts.tires * .02), 0, 1.5);
  if (L.offT > 0) L.offT -= DS;
  // driver mistakes in corners (pace notes, grip, tyres, damage, setup)
  const c = Math.abs(st.cv[k]);
  if (c > 0) {
    const sev = clamp(c * 12, 0, 1.2), grip = tyreGrip(W.tyre, sf, L.wx.wet) * S0.grip;
    const slip = clamp(1.6 - grip, .6, 1.6) * (L.wx.wet ? 1.25 : 1) * (L.wx.snow ? 1.2 : 1);
    const notesF = clamp(1.5 - me.notes / 100, .55, 1.4);
    const rate = .0016 * sev * MODE_ERR_R[mode] * (1.55 - me.K / 100) * slip * notesF * (1 + d.susp * 1.5) * (1 + (1 - L.q) * .6) * (1 + W.wear * .5);
    if (Math.random() < rate) rlMistake(false);
    else if (Math.random() < .00011 * sev * clamp((100 - me.notes) / 45, .2, 2)) rlMistake(true);
  }
  if (st.ft[k] === 2) L.splash = true;
  if (st.ft[k] === 1) {   // jump: airborne for a few metres (drawn), then the landing
    L.air = { s: k * DS, d: clamp(L.v * .9, 10, 34) };
    const hit = rnd(0, .011) * MODE_DMG[mode] * L.rideF * (1.25 - S.parts.chassis * .025);
    d.susp = clamp(d.susp + hit, 0, 1); if (hit > .012) rlTick(t('rl.hardLanding'), 'warn');
  }
  if (Math.random() < .0009 * rough * L.rideF) {   // bottoming out on rough roads
    d.engine = clamp(d.engine + rnd(.01, .035), 0, 1); d.susp = clamp(d.susp + rnd(.004, .02), 0, 1);
    if (Math.random() < .3) rlTick(t('rl.bottom'), 'warn');
  }
  if (!W.flat && Math.random() < .00007 * rough * (W.tyre === 'GS' || W.tyre === 'AS' ? 1.35 : 1) * (1.3 - S.parts.tires * .02) * MODE_DMG[mode] * (1 + W.wear)) puncture();
  if (W.flat) d.susp = clamp(d.susp + .0009, 0, 1);   // driving on a flat damages the rim and suspension
  if (d.engine > .5 && Math.random() < .00003 * (d.engine - .5) * 10) { d.engine = 1; rlTick(t('rl.engineFail'), 'bad'); }
  if (d.gear > .55 && Math.random() < .00003 * (d.gear - .5) * 10) { d.gear = 1; rlTick(t('rl.gearFail'), 'bad'); }
  if (Math.random() < .000004 * (1.45 - me.rel / 100) * (1 + rough)) { d.engine = clamp(d.engine + rnd(.2, .5), 0, 1); rlTick(t('rl.mech'), 'bad'); }
  if (DMG_KEYS.some(k2 => d[k2] >= 1)) { L.retired = true; L.done = true; rlTick(t('rl.retired'), 'bad'); }
}
function rlMistake(note) {
  const L = RL, W = RW, d = W.dmg, r = Math.random(), mD = MODE_DMG[L.mode];
  let loss, key;
  if (r < .66) { loss = rnd(1.5, 4); key = 'rl.slide'; }
  else if (r < .9) { loss = rnd(6, 18); key = 'rl.spin'; d.body = clamp(d.body + rnd(.03, .12) * mD, 0, 1); d.susp = clamp(d.susp + rnd(.02, .08) * mD, 0, 1); }
  else if (r < .985) { loss = rnd(25, 70); key = 'rl.off'; d.body = clamp(d.body + rnd(.1, .3) * mD, 0, 1); d.susp = clamp(d.susp + rnd(.08, .25) * mD, 0, 1); if (Math.random() < .3) puncture(); }
  else { loss = rnd(40, 90); key = 'rl.roll'; d.body = clamp(d.body + rnd(.35, .7), 0, 1); d.susp = clamp(d.susp + rnd(.25, .6), 0, 1); d.engine = clamp(d.engine + rnd(.1, .3), 0, 1); }
  L.hold = Math.max(L.hold, loss); L.offT = 20; L.offDir = Math.random() < .5 ? -1 : 1; L.offAng = key === 'rl.slide' ? .5 : 1.4;
  L.events.push(key);
  rlTick((note ? t('rl.noteErr') + ' ' : '') + t(key, { s: loss.toFixed(0) }), loss > 10 ? 'bad' : 'warn');
}
function puncture() {
  const L = RL, W = RW;
  L.events.push('puncture');
  if (L.auto || L.speed === 99) { resolvePuncture(W.spares > 0 ? 'change' : 'drive'); return; }
  L.prompt = 'puncture'; stageUI();
}
function resolvePuncture(ch) {
  const L = RL, W = RW;
  if (ch === 'change' && W.spares > 0) { W.spares--; L.hold = Math.max(L.hold, rnd(75, 105) * (1.1 - L.me.calm / 500)); W.flat = false; rlTick(t('rl.wheelChanged'), 'radio'); }
  else { W.flat = true; rlTick(t('rl.driveFlat'), 'warn'); }
  L.prompt = null; stageUI();
}
function stageSkip() {   // finish the stage instantly (auto decisions)
  const L = RL; L.auto = true; L.prompt = null;
  if (L.startT > 0) L.startT = 0;
  let g = 0; while (!L.done && g < 200000) { stageStep(.05); if (L.prompt) resolvePuncture(RW.spares > 0 ? 'change' : 'drive'); g++; }
  cancelAnimationFrame(L.raf); SND.stop(); stageUI(); drawStage(); endStage();
}
function endStage() {
  const L = RL; if (!L || L.ended) return; L.ended = true; cancelAnimationFrame(L.raf);
  $('#rally').classList.add('hidden'); document.body.style.overflow = '';
  RL = null;
  rallyStageDone(L);
}

/* ---------- textures: small tiles drawn once, used as world-aligned patterns ---------- */
const TEX = {};
function texTile(key, base, paint) {
  if (TEX[key]) return TEX[key];
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 128, 128);
  const R = mulberry(hashStr(key)), rr = (a, b) => a + R() * (b - a);
  paint(g, R, rr);
  TEX[key] = c; return c;
}
const dots = (g, R, rr, n, cols, s0, s1) => { for (let i = 0; i < n; i++) { g.fillStyle = cols[Math.floor(R() * cols.length)]; const s = rr(s0, s1); g.fillRect(rr(0, 128), rr(0, 128), s, s); } };
// blobs wrap around the tile edges, so the pattern repeats without seams
const softBlobs = (g, R, rr, n, col) => { for (let i = 0; i < n; i++) { const x = rr(0, 128), y = rr(0, 128), r = rr(6, 22); g.fillStyle = col; for (const dx of [-128, 0, 128]) for (const dy of [-128, 0, 128]) { g.beginPath(); g.arc(x + dx, y + dy, r, 0, 7); g.fill(); } } };
function surfTex(sf) {
  return {
    A: () => texTile('tA', '#555a63', (g, R, rr) => { dots(g, R, rr, 900, ['#4b5058', '#60656e', '#5a5f68', '#6b7079'], .8, 1.8); g.strokeStyle = 'rgba(30,32,36,.35)'; g.lineWidth = .8; for (let i = 0; i < 4; i++) { g.beginPath(); let x = rr(0, 128), y = rr(0, 128); g.moveTo(x, y); for (let k = 0; k < 4; k++) { x += rr(-14, 14); y += rr(-14, 14); g.lineTo(x, y); } g.stroke(); } }),
    G: () => texTile('tG', '#a3825a', (g, R, rr) => { softBlobs(g, R, rr, 10, 'rgba(120,92,60,.18)'); dots(g, R, rr, 1300, ['#8c6d48', '#b8976a', '#c9ad84', '#7a6a58', '#9a9288'], .8, 2.6); }),
    S: () => texTile('tS', '#d6bc86', (g, R, rr) => { g.strokeStyle = 'rgba(160,130,80,.25)'; g.lineWidth = 1.2; for (let y = 4; y < 128; y += 9) { g.beginPath(); for (let x = 0; x <= 128; x += 8) g.lineTo(x, y + Math.sin(x * .1 + y) * 2.5); g.stroke(); } dots(g, R, rr, 400, ['#c4a874', '#e6d2a4'], .8, 1.6); }),
    N: () => texTile('tN', '#e6ecf3', (g, R, rr) => { softBlobs(g, R, rr, 12, 'rgba(170,190,215,.18)'); dots(g, R, rr, 500, ['#d2dbe6', '#ffffff', '#c3cfdd'], .8, 1.8); }),
  }[sf]();
}
function groundTex(scen) {
  return {
    forest: () => texTile('gF', '#22402a', (g, R, rr) => { softBlobs(g, R, rr, 16, 'rgba(10,30,14,.25)'); softBlobs(g, R, rr, 10, 'rgba(90,130,70,.12)'); g.strokeStyle = 'rgba(110,150,90,.25)'; g.lineWidth = 1; for (let i = 0; i < 160; i++) { const x = rr(0, 128), y = rr(0, 128); g.beginPath(); g.moveTo(x, y); g.lineTo(x + rr(-1.5, 1.5), y - rr(2, 4)); g.stroke(); } }),
    snow: () => texTile('gN', '#d3dce7', (g, R, rr) => { softBlobs(g, R, rr, 14, 'rgba(150,170,200,.16)'); softBlobs(g, R, rr, 8, 'rgba(255,255,255,.4)'); dots(g, R, rr, 200, ['#ffffff', '#bfcbd9'], .8, 1.6); }),
    desert: () => texTile('gD', '#b9925c', (g, R, rr) => { softBlobs(g, R, rr, 12, 'rgba(150,110,60,.2)'); g.strokeStyle = 'rgba(140,100,55,.22)'; g.lineWidth = 1.2; for (let y = 6; y < 128; y += 12) { g.beginPath(); for (let x = 0; x <= 128; x += 8) g.lineTo(x, y + Math.sin(x * .08 + y * .3) * 3); g.stroke(); } dots(g, R, rr, 300, ['#8f7048', '#cfae7a', '#7d6a55'], .8, 2.2); }),
    coast: () => texTile('gC', '#4f6d3b', (g, R, rr) => { softBlobs(g, R, rr, 14, 'rgba(30,50,20,.22)'); softBlobs(g, R, rr, 10, 'rgba(160,170,90,.15)'); dots(g, R, rr, 300, ['#3d5a2c', '#6a8a4a', '#8a8a60'], .8, 2); }),
  }[scen in { forest: 1, snow: 1, desert: 1, coast: 1 } ? scen : 'forest']();
}
// a world-aligned pattern: tile covers `m` metres, (ox, oy) = screen position of world (0, 0), k = pixels per metre
function worldPat(g, tile, m, ox, oy, k) {
  const p = g.createPattern(tile, 'repeat'), s = k * m / 128;
  if (p.setTransform) p.setTransform(new DOMMatrix([s, 0, 0, s, ox, oy]));
  return p;
}


/* ---------- drawing ---------- */
let RLC = null;
function rlSizeCanvas() {
  const cv = $('#rlCv'), box = $('#rlStage'), dpr = Math.min(2, window.devicePixelRatio || 1);
  const wide = window.matchMedia('(min-aspect-ratio:5/4) and (min-width:640px)').matches;
  const w = box.clientWidth || 360, h = wide ? Math.max(260, box.clientHeight) : Math.round(Math.min(w * .78, window.innerHeight * .5));
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); cv.style.height = h + 'px';
  RLC = { cv, g: cv.getContext('2d'), w, h, dpr };
}
window.addEventListener('resize', () => { if (RL) { rlSizeCanvas(); } });
const SCEN = { forest: ['#1d3523', '#2f5a35', '#3d6b3f'], snow: ['#cfd8e2', '#5d7a68', '#2f4a3a'], desert: ['#b9925c', '#8d6a3d', '#6f5534'], coast: ['#4c6b3a', '#6f8f4a', '#3b5a30'] };
function drawStage() {
  const L = RL; if (!L || !RLC) return;
  const { g, w, h, dpr } = RLC, st = L.st, sc = SCEN[L.ev.scen] || SCEN.forest;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const i = Math.min(st.N - 1, Math.floor(L.s / DS)), fr = L.s / DS - i, j = Math.min(st.N - 1, i + 1);
  // heading interpolated between samples, smoothing driven by real frame time (no jumps between samples)
  const now = performance.now(), fdt = clamp((now - (L.lastDraw || now)) / 1000, 0, .1); L.lastDraw = now;
  const sm = rate => 1 - Math.exp(-fdt * rate);
  const cx = lerp(st.x[i], st.x[j], fr), cy = lerp(st.y[i], st.y[j], fr), hd = lerp(st.h[i], st.h[j], fr);
  const k = Math.min(w, h) / 80;    // pixels per metre
  // driving line and drift (visual only): cut towards the apex, the rear steps out on loose surfaces
  let cA = 0; for (let q = i; q < Math.min(st.N, i + 6); q++) cA += st.cv[q]; cA /= 6;
  const sfc = st.sf[i], loose = sfc === 'A' ? .36 : sfc === 'N' ? .56 : .5, mu = SURF[sfc].grip * (L.wx.wet ? .85 : 1);
  const tLat = L.hold > 0 ? 0 : Math.sign(cA) * clamp(Math.abs(cA) * 70, 0, 2.2);
  const tYaw = L.hold > 0 || L.v < 6 ? 0 : Math.sign(cA) * clamp(L.v * L.v * Math.abs(cA) / (9.81 * mu) * loose * [.75, 1, 1.3][L.mode], 0, .72);
  L.lat = lerp(L.lat || 0, tLat, sm(3.5)); L.yaw = lerp(L.yaw || 0, tYaw, sm(6));
  const wob = L.v > 10 && L.hold <= 0 ? (Math.sin(L.t * 1.7) * (sfc === 'A' ? .03 : .05) + Math.sin(L.t * 4.3 + 1) * .015) : 0;
  const px = cx + Math.cos(hd + Math.PI / 2) * L.lat, py = cy + Math.sin(hd + Math.PI / 2) * L.lat;
  let lift = 0;
  if (L.air) { const u = (L.s - L.air.s) / L.air.d; if (u < 1 && u >= 0) lift = Math.sin(Math.PI * u); else if (u >= 1) { const dc0 = SURF[sfc].dust || '200,200,200'; for (let m = 0; m < 10; m++) L.dust.push({ x: px + rnd(-2.5, 2.5), y: py + rnd(-2.5, 2.5), r: rnd(1.5, 3), a: .55, c: dc0 }); L.air = null; } }
  // camera: locked to the car, the look-ahead turns slowly towards the direction of travel
  const look = 14;
  if (L.lookX == null) { L.lookX = Math.cos(hd) * look; L.lookY = Math.sin(hd) * look; }
  L.lookX = lerp(L.lookX, Math.cos(hd) * look, sm(1.6)); L.lookY = lerp(L.lookY, Math.sin(hd) * look, sm(1.6));
  const camX = px + L.lookX, camY = py + L.lookY;
  const X = px => (px - camX) * k + w / 2, Y = py => (py - camY) * k + h / 2;
  const span = Math.ceil(Math.max(w, h) / k / DS) + 10, a = Math.max(0, i - span), b = Math.min(st.N - 1, i + span);
  const wox = X(0), woy = Y(0);
  g.fillStyle = worldPat(g, groundTex(L.ev.scen), 30, wox, woy, k); g.fillRect(0, 0, w, h);
  // road: shoulder, then surface in runs of the same surface
  g.lineCap = 'round'; g.lineJoin = 'round';
  const run = (wid, colF) => {
    let s0 = a;
    for (let q = a + 1; q <= b; q++) {
      if (q === b || st.sf[q] !== st.sf[s0]) {
        g.beginPath(); g.moveTo(X(st.x[s0]), Y(st.y[s0]));
        for (let r = s0 + 1; r <= q; r++) g.lineTo(X(st.x[r]), Y(st.y[r]));
        g.strokeStyle = colF(st.sf[s0]); g.lineWidth = wid * k; g.stroke(); s0 = q;
      }
    }
  };
  // verge (darker), shoulder, then the textured surface
  g.globalAlpha = .35; run(14, () => '#000'); g.globalAlpha = 1;
  run(11, sf => SURF[sf].edge);
  const pats = {}; const patOf = sf => pats[sf] || (pats[sf] = worldPat(g, surfTex(sf), sf === 'A' ? 10 : 12, wox, woy, k));
  run(7.5, patOf);
  // lines along the road, offset sideways (metres): wheel ruts on loose surfaces, painted lines on tarmac
  const along = (off, test, style, wid, dash) => {
    g.strokeStyle = style; g.lineWidth = Math.max(1, wid * k); g.setLineDash(dash ? dash.map(d => d * k) : []);
    let open = false;
    for (let q = a; q <= b; q++) {
      const okq = test(st.sf[q]);
      const nx = Math.cos(st.h[q] + Math.PI / 2), ny = Math.sin(st.h[q] + Math.PI / 2), xx = X(st.x[q] + nx * off), yy = Y(st.y[q] + ny * off);
      if (okq && !open) { g.beginPath(); g.moveTo(xx, yy); open = true; } else if (okq) g.lineTo(xx, yy);
      if ((!okq || q === b) && open) { g.stroke(); open = false; }
    }
    g.setLineDash([]);
  };
  const isLoose = sf => sf !== 'A';
  along(-1.0, isLoose, 'rgba(60,40,20,.22)', .7); along(1.0, isLoose, 'rgba(60,40,20,.22)', .7);
  along(0, isLoose, 'rgba(255,255,255,.08)', .5);
  along(-3.45, sf => sf === 'A', 'rgba(255,255,255,.7)', .15); along(3.45, sf => sf === 'A', 'rgba(255,255,255,.7)', .15);
  along(0, sf => sf === 'A', 'rgba(255,255,255,.55)', .14, [3, 5]);
  if (L.wx.wet) { g.globalAlpha = .18; run(7.5, () => '#3a6ea8'); g.globalAlpha = 1; }
  // features
  for (let q = a; q <= b; q++) {
    if (st.ft[q] === 1) { g.save(); g.translate(X(st.x[q]), Y(st.y[q])); g.rotate(st.h[q]); g.strokeStyle = '#ffd400'; g.lineWidth = 2; for (let m = 0; m < 2; m++) { g.beginPath(); g.moveTo((-2 + m * 3) * k, -3 * k); g.lineTo((0 + m * 3) * k, 0); g.lineTo((-2 + m * 3) * k, 3 * k); g.stroke(); } g.restore(); }
    if (st.ft[q] === 2) { g.fillStyle = 'rgba(80,150,220,.65)'; g.beginPath(); g.ellipse(X(st.x[q]), Y(st.y[q]), 5 * k, 4 * k, st.h[q], 0, Math.PI * 2); g.fill(); }
  }
  // start and finish lines
  [[0, '#fff'], [st.N - 1, '#ffb21e']].forEach(([q, col]) => { if (q >= a && q <= b) { g.save(); g.translate(X(st.x[q]), Y(st.y[q])); g.rotate(st.h[q]); g.fillStyle = col; g.fillRect(-1 * k, -5 * k, 2 * k, 10 * k); g.restore(); } });
  // scenery
  st.decor.forEach(([dx, dy, ty, r]) => {
    const sx = X(dx), sy = Y(dy); if (sx < -20 || sy < -20 || sx > w + 20 || sy > h + 20) return;
    if (ty === 0) drawDecor(g, sx, sy, r * k, L.ev.scen, dx * 13 + dy * 7);
    else { g.fillStyle = ['#e8392f', '#2f7bf5', '#f5c518', '#fff'][Math.floor(dx * 7 + dy) & 3]; g.beginPath(); g.arc(sx, sy, .7 * k, 0, Math.PI * 2); g.fill(); }
  });
  // tyre marks (rally: always; darker when sliding)
  if (L.marks && L.marks.length) {
    g.lineCap = 'round'; g.lineWidth = Math.max(1, .32 * k);
    const vx0 = camX - w / 2 / k - 5, vx1 = camX + w / 2 / k + 5, vy0 = camY - h / 2 / k - 5, vy1 = camY + h / 2 / k + 5;
    for (const m of L.marks) {
      if (m[0] < vx0 || m[0] > vx1 || m[1] < vy0 || m[1] > vy1) continue;
      g.strokeStyle = m[4]; g.beginPath(); g.moveTo(X(m[0]), Y(m[1])); g.lineTo(X(m[2]), Y(m[3])); g.stroke();
    }
  }
  // ghost of the fastest crew so far
  if (L.ghost && L.startT <= 0) {
    const gt = L.t / (L.best / st.ref); let gi = 0, lo = 0, hi = st.N - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (st.tc[m] < gt) lo = m + 1; else hi = m; } gi = lo;
    if (gi < st.N - 1) drawRallyCar(g, X(st.x[gi]), Y(st.y[gi]), st.h[gi], k, null, true);
  }
  // dust / snow spray
  const dc = SURF[st.sf[i]].dust, ang0 = hd + L.yaw + wob;
  if (dc && L.v > 8 && L.hold <= 0 && lift < .2) {
    const n = 2 + Math.round(Math.abs(L.yaw) * 10), side = -Math.sign(L.yaw);
    for (let m = 0; m < n; m++) L.dust.push({ x: px - Math.cos(ang0) * 2.4 + Math.cos(ang0 + Math.PI / 2) * side * rnd(0, 2.5) + rnd(-1, 1), y: py - Math.sin(ang0) * 2.4 + Math.sin(ang0 + Math.PI / 2) * side * rnd(0, 2.5) + rnd(-1, 1), r: rnd(1, 2), a: .5, c: dc });
  }
  if (!dc && Math.abs(L.yaw) > .08 && L.hold <= 0 && lift < .2) L.dust.push({ x: px - Math.cos(ang0) * 2.2, y: py - Math.sin(ang0) * 2.2, r: .8, a: .35, c: '200,200,205' });
  if (L.splash) {   // water splash: little pixel drops fly out
    L.splash = false; L.drops = L.drops || [];
    for (let m = 0; m < 34; m++) { const a = hd + rnd(-2.2, 2.2), sp = rnd(6, 18); L.drops.push({ x: px, y: py, vx: Math.cos(a) * sp + Math.cos(hd) * 6, vy: Math.sin(a) * sp + Math.sin(hd) * 6, s: rnd(.6, 1.2), a: 1, c: pick(['#9fd3ff', '#e8f6ff', '#5aa9e6', '#ffffff']) }); }
  }
  L.dust = L.dust.filter(p => (p.a -= .012) > 0).slice(-160);
  L.dust.forEach(p => { p.r += .08; g.fillStyle = `rgba(${p.c},${p.a})`; g.beginPath(); g.arc(X(p.x), Y(p.y), p.r * k, 0, Math.PI * 2); g.fill(); });
  // the car (off the road during an incident)
  let ox = 0, oy = 0, ang = ang0;
  if (L.hold > 0) { const n = hd + Math.PI / 2 * (L.offDir || 1); ox = Math.cos(n) * 5; oy = Math.sin(n) * 5; ang = hd + (L.offAng || 1) * (L.offDir || 1); }
  else { // rotate around the front axle so the rear swings out
    const fx = px + Math.cos(hd) * 1.4, fy = py + Math.sin(hd) * 1.4;
    ox = fx - Math.cos(ang) * 1.4 - px; oy = fy - Math.sin(ang) * 1.4 - py;
  }
  if (L.hold <= 0 && lift < .15 && L.v > 2) {
    const qx = px + ox, qy = py + oy, rx = qx - Math.cos(ang) * 1.3, ry = qy - Math.sin(ang) * 1.3, nx = -Math.sin(ang) * .78, ny = Math.cos(ang) * .78;
    const cur = [rx + nx, ry + ny, rx - nx, ry - ny];
    if (!L.mk || Math.hypot(cur[0] - L.mk[0], cur[1] - L.mk[1]) > 1.2) {
      if (L.mk && Math.hypot(cur[0] - L.mk[0], cur[1] - L.mk[1]) < 8) {
        const sl = Math.abs(L.yaw), a = sfc === 'A' ? (sl > .1 ? .08 + sl * .4 : 0) : .1 + sl * .35;
        const col = { A: `rgba(15,15,17,${a})`, G: `rgba(80,60,38,${a})`, S: `rgba(140,110,62,${a})`, N: `rgba(120,135,155,${a})` }[sfc];
        if (a > 0) { L.marks.push([L.mk[0], L.mk[1], cur[0], cur[1], col], [L.mk[2], L.mk[3], cur[2], cur[3], col]); if (L.marks.length > 9000) L.marks.splice(0, 400); }
      }
      L.mk = cur;
    }
  } else L.mk = null;
  drawRallyCar(g, X(px + ox), Y(py + oy), ang, k, S.color, false, lift);
  if (L.drops && L.drops.length) {
    L.drops = L.drops.filter(d => (d.a -= fdt * 1.6) > 0);
    L.drops.forEach(d => { d.x += d.vx * fdt; d.y += d.vy * fdt; d.vx *= 1 - fdt * 2; d.vy *= 1 - fdt * 2; g.globalAlpha = d.a; g.fillStyle = d.c; const s = Math.max(2, d.s * k); g.fillRect(Math.round(X(d.x) - s / 2), Math.round(Y(d.y) - s / 2), s, s); });
    g.globalAlpha = 1;
  }
  // rain / snowfall on the stage
  if (L.wx.wet || L.wx.snow) {
    g.strokeStyle = L.wx.snow ? 'rgba(255,255,255,.75)' : 'rgba(200,215,235,.35)'; g.fillStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 1; g.beginPath();
    for (let m = 0; m < 110; m++) { const xx = Math.random() * w, yy = Math.random() * h; if (L.wx.snow) g.rect(xx, yy, 2, 2); else { g.moveTo(xx, yy); g.lineTo(xx - 2, yy + 9); } }
    L.wx.snow ? g.fill() : g.stroke();
  }
  // minimap
  const mw = Math.min(150, w * .34), mh = mw * .75, mx = w - mw - 8, my = 8;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let q = 0; q < st.N; q += 10) { x0 = Math.min(x0, st.x[q]); x1 = Math.max(x1, st.x[q]); y0 = Math.min(y0, st.y[q]); y1 = Math.max(y1, st.y[q]); }
  const ms = Math.min((mw - 12) / (x1 - x0 || 1), (mh - 12) / (y1 - y0 || 1)), MX = v => mx + 6 + (v - x0) * ms, MY = v => my + 6 + (v - y0) * ms;
  g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(mx, my, mw, mh);
  g.beginPath(); for (let q = 0; q < st.N; q += 6) { q ? g.lineTo(MX(st.x[q]), MY(st.y[q])) : g.moveTo(MX(st.x[q]), MY(st.y[q])); }
  g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 1.5; g.stroke();
  g.fillStyle = '#ffb21e'; g.beginPath(); g.arc(MX(st.x[st.N - 1]), MY(st.y[st.N - 1]), 2.5, 0, Math.PI * 2); g.fill();
  g.fillStyle = S.color; g.strokeStyle = '#fff'; g.beginPath(); g.arc(MX(cx), MY(cy), 3.5, 0, Math.PI * 2); g.fill(); g.stroke();
  wxIcons(g, mx - 8, my, L.wx.wet ? 1 : 0, null, L.wx.snow);
  // timer and pace note
  g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(8, 8, 118, 34);
  g.fillStyle = '#fff'; g.font = `700 22px ${FC}`; g.textBaseline = 'middle'; g.fillText(L.startT > 0 ? Math.ceil(L.startT * 2) + '…' : fmtT(L.t), 16, 26);
  const note = paceNote(L);
  if (note && L.startT <= 0) {
    g.font = `700 17px ${FC}`; const tw = g.measureText(note).width + 22;
    const ny = Math.min(56, h * .14);
    g.fillStyle = 'rgba(15,18,23,.85)'; g.fillRect(w / 2 - tw / 2, ny, tw, 30);
    g.fillStyle = '#ffb21e'; g.textAlign = 'center'; g.fillText(note, w / 2, ny + 15); g.textAlign = 'left';
  }
}
// scenery objects by landscape: broadleaf trees, snowy pines, desert rocks and shrubs, coastal bushes
function drawDecor(g, x, y, r, scen, h) {
  const v = Math.abs(Math.floor(h)) % 7;
  g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.ellipse(x + r * .35, y + r * .45, r, r * .85, 0, 0, 7); g.fill();
  if (scen === 'snow') {   // pine seen from above: dark star, snow on top
    g.fillStyle = '#2b4a3a'; g.beginPath(); for (let k = 0; k <= 16; k++) { const a = k / 16 * Math.PI * 2, rr = k % 2 ? r * .55 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.fill();
    g.fillStyle = 'rgba(245,250,255,.85)'; g.beginPath(); g.arc(x - r * .15, y - r * .15, r * .42, 0, 7); g.fill();
  } else if (scen === 'desert') {
    if (v < 4) {   // rock
      g.fillStyle = ['#8a7b6a', '#7a6a58', '#9a8a74'][v % 3]; g.beginPath();
      for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2, rr = r * (.7 + ((h * (k + 3)) % 5) / 12); g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.fill();
      g.fillStyle = 'rgba(255,255,255,.15)'; g.beginPath(); g.arc(x - r * .25, y - r * .25, r * .35, 0, 7); g.fill();
    } else { g.fillStyle = '#6d6b3a'; for (let k = 0; k < 5; k++) { g.beginPath(); g.arc(x + Math.cos(k * 1.3) * r * .4, y + Math.sin(k * 1.3) * r * .4, r * .4, 0, 7); g.fill(); } }
  } else {
    const c1 = scen === 'coast' ? ['#4f6b2c', '#5d7a34', '#456127'][v % 3] : ['#1f4a26', '#2a5a2e', '#21522a'][v % 3];
    g.fillStyle = c1; for (let k = 0; k < 5; k++) { g.beginPath(); g.arc(x + Math.cos(k * 1.26 + v) * r * .38, y + Math.sin(k * 1.26 + v) * r * .38, r * .62, 0, 7); g.fill(); }
    g.fillStyle = 'rgba(160,200,110,.22)'; g.beginPath(); g.arc(x - r * .3, y - r * .3, r * .45, 0, 7); g.fill();
  }
}
function drawRallyCar(g, x, y, ang, k, col, ghost, lift = 0) {
  const L = 4.1 * k, Wd = 1.85 * k;
  if (!ghost) {   // shadow: moves away and fades while the car is in the air
    g.save(); g.translate(x + 1 + lift * 2.2 * k, y + 2 + lift * 3.2 * k); g.rotate(ang);
    g.fillStyle = `rgba(0,0,0,${.35 - lift * .15})`; g.fillRect(-L / 2, -Wd / 2, L, Wd); g.restore();
  }
  g.save(); g.translate(x, y); g.rotate(ang);
  if (lift) g.scale(1 + lift * .45, 1 + lift * .45);
  if (ghost) { g.strokeStyle = 'rgba(255,255,255,.55)'; g.setLineDash([3, 3]); g.lineWidth = 1.5; g.strokeRect(-L / 2, -Wd / 2, L, Wd); g.setLineDash([]); g.restore(); return; }
  g.fillStyle = col; g.beginPath(); g.roundRect ? g.roundRect(-L / 2, -Wd / 2, L, Wd, Wd * .25) : g.rect(-L / 2, -Wd / 2, L, Wd); g.fill();
  g.fillStyle = '#10151c'; g.fillRect(L * .02, -Wd * .38, L * .2, Wd * .76); g.fillRect(-L * .34, -Wd * .34, L * .12, Wd * .68);
  g.fillStyle = col === '#f2f2f2' ? '#e8392f' : '#fff'; g.fillRect(-L * .14, -Wd * .36, L * .14, Wd * .72);
  g.fillStyle = '#fff8c8'; g.fillRect(L / 2 - 2, -Wd * .42, 2, Wd * .22); g.fillRect(L / 2 - 2, Wd * .2, 2, Wd * .22);
  g.restore();
}
function paceNote(L) {
  const st = L.st, i = Math.floor(L.s / DS), look = 150 / DS;
  for (let q = i; q < Math.min(st.N, i + look); q++) { if (st.ft[q] === 1) return t('note.jump'); if (st.ft[q] === 2) return t('note.splash'); }
  const c = st.corners.find(c => c.s >= i && c.s < i + look);
  if (!c) return t('note.straight');
  const side = t(c.dir > 0 ? 'note.R' : 'note.L');
  return c.sev === 1 ? t('note.hairpin', { d: side }) : `${side} ${c.sev}${c.e - c.s > 40 ? ' ' + t('note.long') : ''}`;
}
function rlTick(text, kind) { const el = $('#rlTick'); if (!el) return; el.textContent = text; el.dataset.k = kind || ''; }
function stageUI() {
  const L = RL; if (!L) return;
  const W = RW, d = W.dmg;
  $('#rlTele').innerHTML = rallyTele(W) + `<div class="small muted" style="margin-top:4px">${t('rl.tyreNow', { t: t('ty.' + W.tyre), n: W.spares })}${W.flat ? ' · <b class="neg">' + t('rl.flat') + '</b>' : ''}</div>`;
  const pr = $('#rlPrompt');
  if (L.prompt === 'puncture') {
    pr.classList.remove('hidden');
    pr.innerHTML = `<b>${t('rl.puncture')}</b><div class="small muted">${t('rl.punctureP')}</div><div class="row" style="margin-top:8px"><button class="btn grow team" data-pc="change" ${W.spares > 0 ? '' : 'disabled'}>${t('rl.change', { n: W.spares })}</button><button class="btn grow" data-pc="drive">${t('rl.drive')}</button></div>`;
    pr.querySelectorAll('[data-pc]').forEach(b => b.onclick = () => resolvePuncture(b.dataset.pc));
  } else pr.classList.add('hidden');
  // live stage times: crews that started before us have finished
  const order = W.order[L.sd.loop], myP = order.indexOf('me_0');
  const fin = W.crews.filter(c => !c.isMe && !c.out && c.cur && c.cur.ev !== 'retire' && order.indexOf(c.id) < myP).map(c => ({ c, tm: c.cur.t }));
  fin.push({ c: L.me, tm: L.done && !L.retired ? L.t : null });
  fin.sort((a, b) => (a.tm ?? 1e9) - (b.tm ?? 1e9));
  const best = fin.length && fin[0].tm != null ? fin[0].tm : null;
  $('#rlLb').innerHTML = `<div class="small muted" style="margin:2px 0 6px">${t('rl.liveTimes')}</div>` + fin.slice(0, 10).map((e, k) => `<div class="lbr ${e.c.isMe ? 'me' : ''}"><span class="p">${e.tm != null ? k + 1 : '–'}</span><span class="dot" style="background:${e.c.color}"></span><span class="nm">${esc(lastName(e.c.driver))}</span><span class="gap">${e.tm == null ? (e.c.isMe ? (L.retired ? 'DNF' : fmtT(L.t)) : '') : k === 0 ? fmtT(e.tm) : fmtGap(e.tm - best)}</span></div>`).join('');
}
function rallyTele(W) {
  const d = W.dmg, bar = (k, v) => `<div class="trow"><span>${t('rdmg.' + k)}</span><div class="bar"><i style="width:${Math.round(v * 100)}%;background:${condCol(v)}"></i></div><b>${Math.round(v * 100)}%</b></div>`;
  const tw = clamp(1 - W.wear, 0, 1);
  return `<div class="rtele">${DMG_KEYS.map(k => bar(k, d[k])).join('')}<div class="trow"><span>${t('tele.tires')}</span><div class="bar"><i style="width:${Math.round(tw * 100)}%;background:${treadCol(tw)}"></i></div><b>${Math.round(tw * 100)}%</b></div></div>`;
}
const surfText = fr => Object.entries(fr).filter(([k, v]) => v > .04).sort((a, b) => b[1] - a[1]).map(([k, v]) => t('surf.' + k) + (v < .97 ? ' ' + Math.round(v * 100) + '%' : '')).join(' · ');
function wxBadge(wx, ev) { const k = wx.snow ? 'snow' : wx.wet ? 'wet' : 'dry'; return `<i class="wxd ${k === 'snow' ? 'damp' : k}"></i>${t('rwx.' + k)}`; }
