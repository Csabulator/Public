/* ===================== race weekend & simulation ===================== */
let WEEKEND = null, R = null;
// per driving mode: 0 = conserve, 1 = normal, 2 = attack
const MODE_SPEED = [.982, 1, 1.022], MODE_WEAR = [.7, 1, 1.45], MODE_FUEL = [.78, 1, 1.25], MODE_ERR = [.6, 1, 1.7], MODE_HIT = [.4, 1, 2.2];
const PIT_LIMIT = .42;
const SC_GAP = 4;          // minimum spacing in the safety-car queue (track samples)      // pit lane speed limit relative to normal straight-line speed
const PIT_OFF = 1.3;        // pit lane distance from the track centre line, in track widths
const PIT_LATE = 10;        // a pit call closer than this (samples) to the entry comes too late for this lap
const lastName = n => n.split(' ').slice(-1)[0];

function playerEntries(setupQ) {
  const cs = carStats(S.parts, S.staff.eng, S.rule), eb = S.staff.eng * .9;
  return S.drivers.map((d, i) => {
    const e = drvEff(d);
    return {
      id: 'me_' + i, team: 'me', seat: i, isMe: true, name: S.teamName, driver: lastName(d.name), nat: d.nat, color: S.color, num: i ? S.num2 : S.num,
      P: cs.P + eb, H: cs.H + eb, B: cs.B + eb * .5, D: e.D, W: e.W, K: e.K, rel: cs.rel, pit: S.staff.pit, tiresLv: S.parts.tires, setupQ
    };
  });
}
function fieldEntries(setupQ) {
  const out = playerEntries(setupQ);
  S.field.forEach(tm => tm.drivers.forEach((d, i) => out.push({
    id: tm.id + '_' + i, team: tm.id, seat: i, isRival: tm.id === 'rv', name: tm.name, driver: lastName(d.name), nat: d.nat, color: tm.color, num: d.num,
    P: tm.P, H: tm.H, B: tm.B, D: d.D, W: d.W, K: d.K, rel: tm.rel, pit: tm.pit, tiresLv: clamp(Math.round((tm.P - 8) / 4.6), 1, 20), setupQ: clamp(tm.setupQ + randn() * .08, .2, 1)
  })));
  return out;
}
function rollWeather(tr) {
  if (Math.random() < tr.rain * .45) { const rain = Math.random() < .4 ? 1 : .5; return { rain, wet: rain === 1 ? 1 : .6 }; }
  return { rain: 0, wet: 0 };
}
function qualify(entries, tr, wet) {
  const corner = tr.c.reduce((a, b) => a + b, 0) / tr.N;
  return entries.map(e => {
    const d = lerp(e.D, e.W, wet);
    const sc = ((e.P * (1 - corner) + (e.H * .75 + e.B * .25) * corner) * .6 + d * .4) * setupSpeed(e.setupQ) + randn() * 4 * (1.3 - e.K / 100) * (1 + wet);
    return { e, sc };
  }).sort((a, b) => b.sc - a.sc).map(x => x.e);
}
// step 1 of a weekend: pick the track, weather and the special-event rules
function prepareWeekend() {
  const disc = S.disc, D = DISC[disc], ti = S.calendar[S.round], tr = buildTrack(D.pool, ti);
  let wx = rollWeather(tr), delay = false;
  if (tr.oval && wx.rain) { delay = true; wx = { rain: 0, wet: 0 }; }   // ovals do not race in the rain
  const special = isSpecial(disc, S.round) ? D.special : null;
  const baseLaps = D.laps(tr);
  WEEKEND = { ti, tr, baseLaps, laps: Math.round(baseLaps * (special ? special.laps : 1)), wx, delay, disc, kind: carKind(disc, S.tier), special, setup: defaultSetup(tr), runs: [] };
}
// step 2: qualifying with the chosen setup
function runQualifying() {
  const W = WEEKEND;
  W.q = setupQuality(W.tr, W.setup); W.fx = setupEffects(W.tr, W.setup);
  S.setups[W.tr.pool + W.tr.id] = { ...W.setup };
  W.grid = qualify(fieldEntries(W.q), W.tr, W.wx.wet);
}

function startRace(startTires, opts = {}) {
  const W = WEEKEND, tr = W.tr, D = DISC[W.disc], N = tr.N;
  const lapTime = tr.oval ? tr.lt : D.lapTime;
  const vScale = tr.geo.reduce((a, g) => a + 1 / g, 0) / lapTime;
  const fpl = 1 / (W.baseLaps * D.tank * (S.rule === 'smallTank' ? .9 : 1));
  const aiTire = W.wx.wet > .45 ? 'W' : 'S';
  const laneLen = tr.pitE + tr.pitX;
  const teamIdx = id => id === 'me' ? 3 : (id === 'rv' ? 0 : 1 + parseInt(id.slice(1), 10) + (parseInt(id.slice(1), 10) >= 2 ? 1 : 0));
  const boxOf = i => -tr.pitE + laneLen * (.3 + .45 * i / (TEAMS - 1));
  const cars = W.grid.map((e, i) => {
    const prog = -(i * 7) - 4, bi = teamIdx(e.team);
    return {
      ...e, crew: e.pit || 1, pit: null, prog, lap: 0, wear: 0, fuel: 1, fpl, tire: e.isMe ? startTires[e.seat] : aiTire,
      setErr: e.isMe ? W.fx.err : 1, setWear: e.isMe ? W.fx.wear : 1,
      dmg: { a: 0, s: 0, e: 0 }, dmgTotal: 0, mode: 1, pitReq: false, pitFrom: 0, box: boxOf(bi), boxIdx: bi,
      entryN: Math.floor((prog + tr.pitE) / N), mistT: 0, lane: i % 2 ? .55 : -.55,
      finished: false, fin: 0, dnf: false, why: '', stops: 0, noise: 1, thr: rnd(.5, .75), wetThr: rnd(.35, .55), evt: '', warn: {}, grid: i + 1,
      auto: !!(e.isMe && opts.auto), led: 0, lineK: rnd(.75, 1.1), yaw: 0, lock: 0, mk: null
    };
  });
  const RLINE = racingLine(tr);
  R = {
    line: RLINE.line, sc: RLINE.sc, wxNext: null,
    tr, disc: W.disc, kind: W.kind, laps: W.laps, special: W.special, cars, lapTime, vScale, t: 0, speed: 1, done: false, leaderDone: false, order: [],
    startT: 2.2, raf: 0, finished: false, rain: W.wx.rain, wet: W.wx.wet, wetSum: 0, caution: 0, redFlag: false, leaderLap: 0, called: false, lastUI: 0,
    plans: [{ tire: startTires[0], fuel: 'need' }, { tire: startTires[1], fuel: 'need' }], orders: 'free', orderUsed: null, swapNote: false,
    sel: 0, my: [], headless: !!opts.headless
  };
  R.my = [0, 1].map(s => cars.find(c => c.isMe && c.seat === s));
  if (R.headless) return;
  $('#rTrack').textContent = t('track.' + tr.id) + (W.special ? ' · ' + t('sp.' + W.special.kind) : '');
  $('#rSeries').textContent = t('tier.' + S.disc + '.' + S.tier);
  $('#race').classList.remove('hidden'); document.body.style.overflow = 'hidden';
  $('#pTire').classList.toggle('hidden', tr.oval);
  R.speed = raceSpeedPref(); R.cam = camPref(); camLabel(); setSeg('#rSpeed', 's', String(R.speed)); setSeg('#rOrd', 'o', 'free');
  selectCar(0);
  sizeCanvas(); drawBG();
  tick(t('rt.grid'));
  SND.start(R.kind);
  let last = performance.now();
  const loop = now => {
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    if (!R) return;
    if (R.speed === 99) { fastForward(); return; }
    if (R.speed > 0 && R.speed < 1) step(dt * R.speed); else for (let k = 0; k < R.speed; k++) step(dt);
    draw();
    const sc = R.my[R.sel];
    try { SND.engine(R.speed > 0 && !sc.finished && !sc.dnf && R.startT <= 0 ? (sc.vNow || 0) / R.vScale : 0, sc.pit ? 1 : 0); } catch (e) { }
    if (now - R.lastUI > 220) { R.lastUI = now; updateLB(); }
    if (R.done && !R.finished) { R.finished = true; SND.stop(); updateLB(); setTimeout(finishRace, 1400); }
    R.raf = requestAnimationFrame(loop);
  };
  R.raf = requestAnimationFrame(loop);
}
function raceSpeedPref() { let v = .25; try { const x = +localStorage.getItem('boxutca_speed'); if ([.25, .5, 1, 2, 4].includes(x)) v = x; } catch (e) { } return v; }
function setSeg(sel, key, val) { document.querySelectorAll(sel + ' button').forEach(b => b.classList.toggle('on', b.dataset[key] === String(val))); }
// kind: info | radio | warn | bad | good (colours the ticker edge)
function tick(text, kind = 'info') {
  if (!R || R.headless) return;
  const el = $('#rTick'); el.textContent = text; el.dataset.k = kind;
  if (kind === 'radio') SND.radio();
}

function carSpeed(c, cc, idx) {
  const tr = R.tr, w = R.wet;
  const d = lerp(c.D, c.W, w);
  const sF = .88 + .0016 * c.P + .0008 * d, cF = .88 + .0011 * c.H + .0005 * c.B + .0008 * d;
  let v = R.vScale * lerp(sF, cF, cc) * tr.geo[idx];
  const wr = Math.min(c.wear, 1.6); v *= 1 - .13 * wr * wr * (1 - (c.tiresLv || 3) * .012);
  v *= c.tire === 'W' ? 1 - (1 - w) * .07 - w * .10 : 1 - w * .30;
  v *= 1 - cc * (c.dmg.a * .07 + c.dmg.s * .05) - (1 - cc) * c.dmg.e * .05;
  v *= 1 + (1 - c.fuel) * .012;
  return v * MODE_SPEED[c.mode] * c.noise * setupSpeed(c.setupQ);
}
const pitU = c => clamp((c.prog - c.pit.entry) / (c.pit.exit - c.pit.entry), 0, 1);
const mateInLane = c => R.cars.find(o => o !== c && o.team === c.team && o.pit && !o.dnf);
const teammateStopping = c => R.cars.some(o => o !== c && o.team === c.team && o.pit && o.pit.stage === 'stop');
const night = () => R.special && R.special.kind === 'endurance' && R.leaderLap / R.laps >= .55;
function step(dt) {
  if (!R || R.done) return;
  if (R.startT > 0) { R.startT -= dt; if (R.startT <= 0) tick(t('rt.go'), 'good'); return; }
  R.t += dt; const tr = R.tr, N = tr.N, lt = R.lapTime;
  const target = R.rain === 0 ? 0 : R.rain === .5 ? .6 : 1;
  R.wet += (target - R.wet) * Math.min(1, (target > R.wet ? .9 : .22) * dt / lt);
  R.wetSum += R.wet * dt;
  if (R.caution > 0) {
    R.caution -= dt;
    if (R.caution <= 0) { R.caution = 0; if (R.redFlag) { R.redFlag = false; R.rain = 0; R.wet = 0; } tick(t('rt.green'), 'good'); }
  }
  const act = R.cars.filter(c => !c.finished && !c.dnf && !c.pit).sort((a, b) => b.prog - a.prog);
  const ahead = new Map(); act.forEach((c, i) => ahead.set(c, i > 0 ? act[i - 1] : null));
  const cau = R.caution > 0, nightF = night() ? 1.2 : 1;
  // team orders between the player's two cars
  const [m0, m1] = R.my, both = !m0.finished && !m0.dnf && !m0.pit && !m1.finished && !m1.dnf && !m1.pit;
  let lead = null, trail = null, tgap = 999;
  if (both) { lead = m0.prog >= m1.prog ? m0 : m1; trail = lead === m0 ? m1 : m0; tgap = lead.prog - trail.prog; }
  for (const c of R.cars) {
    if (c.finished || c.dnf) continue;
    const idx = ((Math.floor(c.prog) % N) + N) % N, cc = tr.c[idx];
    let v = carSpeed(c, cc, idx);
    const prevLap = Math.floor(c.prog / N);
    if (c.pit) {
      const p = c.pit;
      if (p.stage === 'stop') {
        p.stopT -= dt;
        if (p.stopT <= 0) { serviceDone(c); p.stage = 'out'; }
        c.vNow = 0; continue;
      }
      if (p.stage === 'queue') {   // the teammate is still in the box: wait behind it
        c.vNow = 0;
        if (!teammateStopping(c)) { p.stage = 'stop'; p.stopT = p.service; c.prog = p.box; if (c.isMe) SND.gun(); }
        continue;
      }
      const u = pitU(c), lim = R.vScale * PIT_LIMIT * (1 + 1.3 * Math.max(0, 1 - u / .12) + 1.3 * Math.max(0, (u - .88) / .12));
      v = Math.min(v, lim);
      c.prog += v * dt; c.vNow = v;
      if (p.stage === 'in' && c.prog >= p.box) {
        if (teammateStopping(c)) { c.prog = p.box - 3; p.stage = 'queue'; if (c.isMe) tick(t('rt.pitQueue', { num: c.num }), 'radio'); }
        else { c.prog = p.box; p.stage = 'stop'; p.stopT = p.service; if (c.isMe) { tick(t('rt.pitStop', { num: c.num, s: p.service.toFixed(1) }), 'radio'); SND.gun(); } }
      }
      if (p.stage === 'out' && c.prog >= p.exit) { c.pit = null; c.evt = ''; c.lane = .7; if (c.isMe) tick(t('rt.pitOut', { num: c.num }), 'good'); }
      c.fuel -= dt / lt * c.fpl * .3;
    } else {
      const ah = ahead.get(c), gap = ah ? ah.prog - c.prog : 999;
      if (!cau && gap > 0 && gap < (tr.oval ? 16 : 10)) v *= tr.oval ? 1.028 : (cc < .1 ? 1.008 : 1);   // slipstream
      if (cau) { const cap = R.vScale * .55 * tr.geo[idx]; v = Math.min(v, cap * (gap > 16 ? 1.45 : gap < 7 ? .7 : 1)); }
      if (both && !cau) {
        if (R.orders === 'hold' && c === trail && tgap > 0 && tgap < 7) v *= .965;
        if (R.orders === 'swap' && c === R.swapLead && c === lead && tgap < R.tr.N / R.lapTime * 1.5) v *= .9;
      }
      if (c.mistT > 0) { c.mistT -= dt; v *= .3; if (c.mistT <= 0 && c.evt === '!') c.evt = ''; }
      const was = c.prog;
      c.prog += v * dt;
      // no overtaking behind the safety car: stay in line behind the car ahead
      if (cau && ah && c.prog > ah.prog - SC_GAP) c.prog = Math.max(was, ah.prog - SC_GAP);
      c.vNow = (c.prog - was) / dt;
      if (c.prog <= 0) continue;
      const lf = dt / lt;
      c.wear += lf * .095 * tr.wear * (S.rule === 'tyreWear' ? 1.15 : 1) * c.setWear * (1.2 - (c.tiresLv || 3) * .025) * MODE_WEAR[c.mode] * (c.tire === 'W' ? 1 + (1 - R.wet) * 1.8 : 1) * (cau ? .3 : 1);
      c.fuel -= lf * c.fpl * MODE_FUEL[c.mode] * (cau ? .4 : 1);
      if (!cau && c.fuel > 0) {
        const wetMis = c.tire === 'S' ? 1 + R.wet * 3 : 1 + R.wet * .6;
        const mRate = .018 * (1.55 - c.K / 100) * MODE_ERR[c.mode] * (1 + Math.min(c.wear, 1.5) * .8) * (1 + c.dmg.s * 1.5) * wetMis * (1 + R.wet * (1 - c.W / 100)) * c.setErr * nightF;
        if (c.mistT <= 0 && Math.random() < mRate * lf) mistake(c);
        if (!c.dnf && ah && gap > 0 && gap < 6 && ah.mistT <= 0) {
          const mates = c.team === ah.team;
          if (!(mates && c.isMe && R.orders !== 'free')) {
            let hit = .012 * MODE_HIT[c.mode] * [.7, 1, 1.4][ah.mode] * (1.25 - c.K / 100) * (1 + R.wet * .8);
            if (mates) hit *= 1.3;
            if ((c.isMe && ah.isRival) || (c.isRival && ah.isMe)) hit *= 1 + S.feud * .3;
            if (Math.random() < hit * dt) contact(c, ah);
          }
        }
        if (!c.dnf && Math.random() < .0045 * (1.35 - c.rel / 100) * [.8, 1, 1.3][c.mode] * (1 + c.dmg.e * 4) * lf) retire(c, 'mech');
      }
    }
    if (c.dnf) continue;
    if (c.fuel <= 0) { c.fuel = 0; retire(c, 'fuel'); continue; }
    if (c.isMe && !c.auto) playerWarnings(c);
    const en = Math.floor((c.prog + tr.pitE) / N);
    if (en > c.entryN) { c.entryN = en; if (en >= 1 && !c.pit) atPitEntry(c, en); }
    const nowLap = Math.floor(c.prog / N);
    if (nowLap > prevLap && nowLap >= 1) onLap(c, nowLap);
  }
  // a completed position swap turns the order back into "hold"
  if (both && R.orders === 'swap') {
    if (R.swapLead && R.swapLead !== lead && lead.prog - trail.prog > 3) {
      R.orders = 'hold'; R.orderUsed = { kind: 'swap', yielded: R.swapLead.seat };
      if (!R.headless) setSeg('#rOrd', 'o', 'hold');
      tick(t('rt.swapDone', { a: lead.num, b: trail.num }), 'radio');
    } else if (!R.swapNote && tgap > R.tr.N / R.lapTime * 1.5) { R.swapNote = true; tick(t('rt.swapFar'), 'radio'); }
  }
  for (const c of R.cars) {
    if (c.finished || c.dnf || c.pit) continue;
    let tg = 0;
    if (!cau) for (const o of act) { if (o === c) continue; const g = o.prog - c.prog; if (g > 0 && g < 12) { tg = o.lane > 0 ? -.7 : .7; break; } }
    if (c.prog < 20) tg = c.lane;
    c.lane = lerp(c.lane, tg, .04);
  }
  if (R.cars.every(c => c.finished || c.dnf)) R.done = true;
}
function atPitEntry(c, en) {
  const left = R.laps - en;
  if (left < 0 || R.leaderDone) return;
  let p = null;
  const mate = mateInLane(c);   // one garage per team: only one car of a team may be in the pit lane at a time
  if (c.isMe && !c.auto) {
    if (c.pitReq && en >= c.pitFrom) {
      if (mate) { if (!R.headless) tick(t('rt.pitBusy', { num: c.num, mate: mate.num }), 'warn'); return; }   // request stays active for the next lap
      c.pitReq = false; p = userPlan(c, left);
    }
  } else { if (mate) return; p = aiPit(c, left); }
  if (!p) return;
  const base = en * R.tr.N;
  c.pit = { stage: 'in', entry: base - R.tr.pitE, exit: base + R.tr.pitX, box: base + c.box, plan: p, service: serviceTime(c, p) * rnd(.95, 1.1) };
  c.stops++; c.evt = 'BOX';
  if (c.isMe) { tick(t('rt.pitIn', { num: c.num }), 'radio'); updateBoxBtn(); }
}
function playerWarnings(c) {
  const fl = c.fuel / (c.fpl * MODE_FUEL[c.mode]), left = R.laps - c.lap, n = c.num;
  if (fl < left) {
    if (fl < 2.2 && !c.warn.f2) { c.warn.f2 = 1; tick(t('rt.fuel2', { num: n }), 'warn'); }
    if (fl < 1.1 && !c.warn.f1) { c.warn.f1 = 1; tick(t('rt.fuel1', { num: n }), 'bad'); }
  }
  if (!c.warn.t && c.wear > .75 && !c.pitReq) { c.warn.t = 1; tick(t('rt.tyreWarn', { num: n }), 'warn'); }
  if (!R.tr.oval && !c.warn.w && !c.pitReq && ((c.tire === 'S' && R.wet > .45) || (c.tire === 'W' && R.wet < .2))) { c.warn.w = 1; tick(t(c.tire === 'S' ? 'rt.needWet' : 'rt.needSlick', { num: n }), 'warn'); }
}
function onLap(c, lap) {
  c.lap = lap; c.noise = 1 + randn() * .01 * (1.4 - c.K / 100);
  if (lap > R.leaderLap) {
    R.leaderLap = lap; c.led++;
    if (R.special && R.special.kind === 'endurance' && lap === Math.ceil(R.laps * .55)) tick(t('rt.night'), 'info');
    weatherTick(); if (R.called) return;
  }
  if (c.finished) return;
  if (c.lap >= R.laps || R.leaderDone) { finishCar(c); return; }
  const left = R.laps - c.lap;
  if (!c.isMe) {
    const need = left * c.fpl;
    c.mode = (c.fuel < need * 1.03 && c.fuel > need * .82) ? 0 : (left <= 2 && Math.random() < .5 ? 2 : 1);
  }
  if (c.isMe && c.seat === R.sel && left === 1 && !c.auto) tick(t('rt.lastLap'), 'info');
}
function finishCar(c) {
  c.finished = true; c.fin = R.t; R.order.push(c);
  if (!R.leaderDone) { R.leaderDone = true; tick(t('rt.win', { num: c.num, drv: c.driver, team: c.name }), 'good'); }
}
function aiPit(c, left) {
  if (left < 1) return null;
  const rate = .095 * R.tr.wear * (1.2 - (c.tiresLv || 3) * .025);
  const need = left * c.fpl;
  const mustFuel = c.fuel < need * .97 && c.fuel < c.fpl * 1.35;
  const wrongTire = !R.tr.oval && ((c.tire === 'S' && R.wet > c.wetThr) || (c.tire === 'W' && R.wet < c.wetThr - .25));
  const tyres = left >= 2 && c.wear > c.thr && c.wear + rate * left > 1.0;
  const dmgSum = c.dmg.a + c.dmg.s + c.dmg.e;
  const repair = dmgSum > .35 && left >= 3;
  const cautionStop = R.caution > 0 && left >= 2 && (c.wear > .35 || c.fuel < need);
  if (!(mustFuel || wrongTire || tyres || repair || cautionStop)) return null;
  const tire = R.tr.oval ? 'S' : wrongTire ? (c.tire === 'S' ? 'W' : 'S') : (R.wet > c.wetThr ? 'W' : 'S');
  return { tire, fuel: Math.min(1, need + .03 + c.fpl * .3), repair: dmgSum > .12 };
}
function userPlan(c, left) {
  const p = R.plans[c.seat];
  const tire = R.tr.oval ? (p.tire === '-' ? '-' : 'S') : p.tire;
  const fuel = p.fuel === 'full' ? 1 : Math.min(1, left * c.fpl + .03 + c.fpl * .3);
  return { tire, fuel: Math.max(fuel, c.fuel), repair: true };
}
function serviceTime(c, p) {
  const lt = R.lapTime, pl = c.crew || 1;
  let tm = lt * .02;
  if (p.tire !== '-') tm += lt * (.10 - pl * .006);
  tm += Math.max(0, p.fuel - c.fuel) * lt * .14 * (1 - pl * .03);
  const ds = c.dmg.a + c.dmg.s + c.dmg.e; if (p.repair && ds > 0) tm += ds * lt * .3 * (1 - pl * .02);
  return tm;
}
function pitLaneLoss() { const L = R.tr.pitE + R.tr.pitX; return L / (R.vScale * PIT_LIMIT) * .85 - L / R.vScale; }
function serviceDone(c) {
  const p = c.pit.plan;
  if (p.tire !== '-') { c.tire = p.tire; c.wear = 0; c.warn.t = 0; c.warn.w = 0; }
  if (p.fuel > c.fuel) { c.fuel = p.fuel; c.warn.f1 = 0; c.warn.f2 = 0; }
  if (p.repair) c.dmg = { a: 0, s: 0, e: 0 };
  if (c.isMe) tick(t('rt.pitDone', { num: c.num, n: c.stops }), 'radio');
}
function damage(c, part, amt) {
  c.dmg[part] = Math.min(1, c.dmg[part] + amt); c.dmgTotal += amt;
  if (c.dmg[part] >= 1 && !c.dnf) retire(c, 'crash');
}
function mistake(c) {
  c.mistT = rnd(.8, 2.2); c.evt = '!';
  let crash = false;
  if (Math.random() < .35) {
    const heavy = Math.random() < (c.tire === 'S' ? .08 + R.wet * .2 : .08);
    const amt = heavy ? rnd(.5, .9) : rnd(.08, .3); crash = heavy;
    damage(c, pick(['a', 's', 's', 'e']), amt);
  }
  if (c.dnf) return;
  const m = t('mis.' + ri(1, 4));
  if (c.isMe) tick(t('rt.mistake', { num: c.num, drv: c.driver, m }), 'bad');
  else if (Math.random() < .5 || crash) tick(t('rt.mistake', { num: c.num, drv: c.driver, m }), 'warn');
  if (R.tr.oval ? Math.random() < .55 : (crash && Math.random() < .5)) caution();
}
function contact(c, o) {
  const heavy = Math.random() < .08;
  damage(c, pick(['a', 'a', 's']), heavy ? rnd(.4, .7) : rnd(.05, .25));
  damage(o, pick(['s', 'a', 'e']), heavy ? rnd(.3, .6) : rnd(.04, .2));
  if (!c.dnf) c.mistT = Math.max(c.mistT, .5);
  if (!o.dnf) o.mistT = Math.max(o.mistT, .3);
  if (c.isMe && o.isMe) { R.teamClash = true; tick(t('rt.teamClash'), 'bad'); }
  else if (c.isMe || o.isMe) { const me = c.isMe ? c : o, other = c.isMe ? o : c; if (other.isRival) R.rivalClash = true; tick(t('rt.contactMe', { me: me.num, num: other.num }), 'bad'); }
  else if (Math.random() < .4 || heavy) tick(t('rt.contact', { a: c.num, b: o.num }), 'warn');
  if (heavy && Math.random() < (R.tr.oval ? .7 : .3)) caution();
}
function retire(c, why) {
  if (c.dnf) return;
  c.dnf = true; c.why = why; c.evt = 'DNF'; c.pit = null;
  const reason = t('dnf.' + (why === 'mech' ? 'mech' + ri(1, 4) : why));
  tick(c.isMe ? t('rt.dnfMe', { num: c.num, r: reason }) : t('rt.dnf', { num: c.num, drv: c.driver, r: reason }), 'bad');
  if (why === 'crash' && (R.tr.oval || Math.random() < .4)) caution();
}
function caution() {
  if (R.caution > 0 || R.leaderDone) return;
  R.caution = R.lapTime * rnd(1.3, 1.9);
  tick(t(R.tr.oval ? 'rt.yellow' : 'rt.sc'), 'warn');
}
/* weather is forecast 1-2 laps ahead (blinking icon + radio), then it arrives */
function weatherTick() {
  if (R.wxNext) { if (R.leaderLap >= R.wxNext.lap) { applyWx(R.wxNext.rain); R.wxNext = null; } return; }
  if (R.tr.oval) {
    if (R.rain === 0 && !R.redFlag && Math.random() < R.tr.rain * .05) scheduleWx(.5);
    return;
  }
  if (R.rain === 0) { if (Math.random() < R.tr.rain * .04) scheduleWx(Math.random() < .35 ? 1 : .5); }
  else {
    const r = Math.random();
    if (r < .12) scheduleWx(0);
    else if (r < .27) scheduleWx(R.rain === 1 ? .5 : 1);
  }
}
function scheduleWx(level) {
  const n = ri(1, 2); R.wxNext = { rain: level, lap: R.leaderLap + n };
  tick(t(R.tr.oval ? 'rt.rainSoonOval' : level === 0 ? 'rt.drySoon' : R.rain === 0 ? 'rt.rainSoon' : level > R.rain ? 'rt.heavySoon' : 'rt.lightSoon', { n }), level === 0 ? 'good' : 'warn');
}
function applyWx(level) {
  if (R.tr.oval) {
    if (R.leaderLap >= R.laps / 2) { tick(t('rt.rainCalled'), 'warn'); callRace(); }
    else { R.redFlag = true; R.caution = R.lapTime * 2.4; R.rain = .5; tick(t('rt.redFlag'), 'bad'); }
    return;
  }
  const was = R.rain; R.rain = level;
  tick(t(level === 0 ? 'rt.rainStop' : was === 0 ? 'rt.rainStart' : level === 1 ? 'rt.rainHeavy' : 'rt.rainLight'), level === 0 ? 'info' : 'warn');
}
/* racing line: outside before a corner, inside at the apex, drifting out on the exit (in posLat units) */
function racingLine(tr) {
  const N = tr.N, W = 6;
  let a = Array.from({ length: N }, (_, i) => { let d = tr.ang[(i + W) % N] - tr.ang[(i - W + N) % N]; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; });
  const sm = (arr, r, n) => { for (let p = 0; p < n; p++) arr = arr.map((v, i) => { let s = 0; for (let k = -r; k <= r; k++) s += arr[(i + k + N) % N]; return s / (2 * r + 1); }); return arr; };
  a = sm(a, 6, 4);
  const mx = Math.max(...a.map(Math.abs)) || 1; a = a.map(v => v / mx);
  const lead = Math.round(N * .025);
  let ln = a.map((v, i) => clamp(v * 1.1 - a[(i + lead) % N] * .9 - a[(i - lead + N) % N] * .4, -1, 1));
  ln = sm(ln, 8, 3);
  return { line: ln.map(v => v * .34 * (tr.oval ? .55 : 1) * tr.pitSide), sc: a };
}
function callRace() {
  R.called = true; R.leaderDone = true;
  R.cars.filter(c => !c.finished && !c.dnf).sort((a, b) => b.prog - a.prog).forEach(c => { c.finished = true; c.fin = R.t; R.order.push(c); });
}
function fastForward() {
  R.my.forEach(c => { c.auto = true; });   // when skipping, the engineers run the strategy
  let n = 0; while (R && !R.done && n < 400000) { step(1 / 30); n++; }
  if (R && !R.headless) { R.speed = 1; SND.stop(); draw(); updateLB(); if (!R.finished) { R.finished = true; setTimeout(finishRace, 400); } }
}
function raceOrder() {
  const run = R.cars.filter(c => !c.finished && !c.dnf).sort((a, b) => b.prog - a.prog);
  const dnf = R.cars.filter(c => c.dnf).sort((a, b) => b.prog - a.prog);
  return [...R.order, ...run, ...dnf];
}

/* ---------- race screen UI ---------- */
function selectCar(i) {
  R.sel = i; const c = R.my[i];
  document.querySelectorAll('#rCar button').forEach(b => {
    const s = +b.dataset.c, car = R.my[s];
    b.classList.toggle('on', s === i); b.innerHTML = `<b>#${car.num}</b> ${esc(car.driver)}`;
  });
  setSeg('#rMode', 'm', c.mode); setSeg('#pTire', 'ty', R.plans[i].tire); setSeg('#pFuel', 'f', R.plans[i].fuel);
  updateBoxBtn(); if (R.lastUI) updateLB();
}
function updateBoxBtn() { const b = $('#rBox'); if (b && R) { const c = R.my[R.sel]; b.classList.toggle('req', c.pitReq); b.classList.toggle('in', !!c.pit); b.classList.toggle('busy', !c.pit && !!mateInLane(c)); } }
function wxLabel() { return R.wet < .2 ? ['dry', t('wx.dry')] : R.wet < .7 ? ['damp', t('wx.damp')] : ['wet', t('wx.wet')]; }
function toEntry(c) { return (c.entryN + 1) * R.tr.N - R.tr.pitE - c.prog; }
function updateLB() {
  if (!R || R.headless) return;
  const ord = raceOrder(), leader = ord[0], vAvg = R.tr.N / R.lapTime, me = R.my[R.sel];
  const lap = clamp(Math.floor(Math.max(0, leader.prog) / R.tr.N) + 1, 1, R.laps);
  $('#rLap').innerHTML = `${R.caution > 0 ? `<span class="flag ${R.redFlag ? 'red' : ''}">${R.tr.oval ? (R.redFlag ? 'RED' : 'CAUTION') : 'SC'}</span> ` : ''}${night() ? '<span class="flag night">NIGHT</span> ' : ''}${lap}/${R.laps}`;
  const [wk, wl] = wxLabel(); $('#rWx').innerHTML = `<i class="wxd ${wk}"></i>${wl}`;
  $('#rLb').innerHTML = ord.map((c, i) => {
    let g;
    if (i === 0) g = c.finished ? t('race.fin') : t('race.leads');
    else if (c.dnf) g = `<span class="g dnf">DNF</span>`;
    else if (c.pit) g = `<span class="g pit">PIT</span>`;
    else {
      const d = (leader.finished && c.finished) ? (c.fin - leader.fin) * vAvg : (leader.prog - c.prog);
      g = d > R.tr.N ? t('race.lapsDown', { n: Math.floor(d / R.tr.N) }) : `+${(d / vAvg).toFixed(1)} ${t('u.s')}`;
    }
    if (!g.startsWith('<')) g = `<span class="g">${g}</span>`;
    const tt = (c.tire === 'W' ? '<span class="tt w">W</span>' : '') + ((c.dmg.a + c.dmg.s + c.dmg.e) > .2 && !c.dnf ? '<span class="tt d">DMG</span>' : '') + (c.isRival ? '<span class="tt r">RIV</span>' : '');
    return `<div class="lbr ${c.isMe ? 'me' : ''} ${c === me ? 'sel' : ''}"><span class="p">${i + 1}</span><span class="sw" style="background:${c.color}"></span><span class="nm">#${c.num} ${esc(c.driver)} <span class="nat">${c.nat || ''}</span> <span class="muted small">· ${esc(c.name)}</span> ${tt}</span>${g}</div>`;
  }).join('');
  $('#teleCar').innerHTML = teleCarSVG(me);
  const tread = clamp(1 - me.wear / 1.2, 0, 1);
  const tb = $('#tWear'); tb.style.width = tread * 100 + '%'; tb.style.background = treadCol(tread);
  $('#tWearT').textContent = Math.round(tread * 100) + '% ' + (me.tire === 'W' ? t('tire.W') : t('tire.S'));
  const fb = $('#tFuel'); fb.style.width = clamp(me.fuel, 0, 1) * 100 + '%';
  const fl = me.fuel / (me.fpl * MODE_FUEL[me.mode]);
  fb.style.background = fl < R.laps - me.lap && fl < 2.5 ? '#ff5a5f' : '#4aa3ff';
  $('#tFuelT').textContent = t('tele.fuelLaps', { n: fl.toFixed(1) });
  const dmgChip = (k, v) => `<span class="dchip" style="color:${condCol(v)}">${t('dmg.' + k)} ${Math.round(v * 100)}%</span>`;
  $('#tDmg').innerHTML = dmgChip('a', me.dmg.a) + dmgChip('s', me.dmg.s) + dmgChip('e', me.dmg.e);
  $('#tPos').textContent = `#${me.num} · P${ord.indexOf(me) + 1} · ${t('mode.' + me.mode)} · ${me.stops} ${t('race.stops')}`;
  let est = '';
  if (me.dnf) est = 'DNF';
  else if (!me.finished) {
    const mate = mateInLane(me);
    if (me.pit) est = t('race.inLane');
    else if (mate) est = t('race.boxBusy', { mate: mate.num });
    else est = t('race.pitEst', { s: (serviceTime(me, userPlan(me, R.laps - me.lap - 1)) + pitLaneLoss()).toFixed(1), e: (Math.max(0, toEntry(me)) / vAvg).toFixed(1) });
  }
  $('#pEst').textContent = est;
  updateBoxBtn();
}
function bindRaceControls() {
  $('#rCam').onclick = () => setCam(R && R.cam === 'chase' ? 'top' : 'chase');
  $('#rSpeed').onclick = e => { const b = e.target.closest('button'); if (!b || !R) return; R.speed = +b.dataset.s; setSeg('#rSpeed', 's', b.dataset.s); if (R.speed > 0 && R.speed < 99) { try { localStorage.setItem('boxutca_speed', b.dataset.s); } catch (x) { } } SND.unlock(); };
  $('#rCar').onclick = e => { const b = e.target.closest('button'); if (!b || !R) return; selectCar(+b.dataset.c); };
  $('#rMode').onclick = e => {
    const b = e.target.closest('button'); if (!b || !R) return;
    const c = R.my[R.sel]; c.mode = +b.dataset.m; setSeg('#rMode', 'm', b.dataset.m); tick(t('rt.mode' + c.mode, { num: c.num }), 'radio');
  };
  $('#rOrd').onclick = e => {
    const b = e.target.closest('button'); if (!b || !R) return;
    R.orders = b.dataset.o; setSeg('#rOrd', 'o', R.orders); R.swapNote = false;
    if (R.orders === 'swap') { const [a, c] = R.my; R.swapLead = a.prog >= c.prog ? a : c; }
    if (R.orders === 'hold' && !R.orderUsed) R.orderUsed = { kind: 'hold' };
    tick(t('rt.order.' + R.orders), 'radio');
  };
  $('#pTire').onclick = e => { const b = e.target.closest('button'); if (!b || !R) return; R.plans[R.sel].tire = b.dataset.ty; setSeg('#pTire', 'ty', b.dataset.ty); updateLB(); };
  $('#pFuel').onclick = e => { const b = e.target.closest('button'); if (!b || !R) return; R.plans[R.sel].fuel = b.dataset.f; setSeg('#pFuel', 'f', b.dataset.f); updateLB(); };
  $('#rBox').onclick = () => {
    if (!R) return; const me = R.my[R.sel]; if (me.finished || me.dnf || me.pit) return;
    me.pitReq = !me.pitReq;
    if (me.pitReq) {
      const late = toEntry(me) < PIT_LATE;   // too close to the entry: the driver can only come in next lap
      me.pitFrom = me.entryN + (late ? 2 : 1);
      tick(t(late ? 'rt.boxLate' : 'rt.boxCall', { num: me.num }), 'radio');
    } else tick(t('rt.boxCancel', { num: me.num }), 'radio');
    updateBoxBtn();
  };
  $('#rSnd').onclick = () => { SND.toggle(); };
  $('#rQuit').onclick = () => {
    if (!R) return;
    modal(`<h3>${t('race.quitT')}</h3><p>${t('race.quitP')}</p><div class="row"><button class="btn grow" data-close>${t('ui.cancel')}</button><button class="btn pri grow" id="ok">${t('race.skip')}</button></div>`);
    $('#ok').onclick = () => { closeModal(); R.speed = 99; };
  };
}

/* ---------- canvas rendering ---------- */
let CV, CTX, BG, DPR = 1, TW = 10;
const FIT = { s: 1, ox: 0, oy: 0 };
function sizeCanvas() {
  CV = $('#cv'); const st = $('#stage'), body = $('.race .rbody');
  const side = getComputedStyle(body).display === 'grid', tk = $('#rTick');
  const tkH = tk ? tk.offsetHeight + 14 : 0;   // the message bar sits under the map, not on it
  const w = Math.max(200, st.clientWidth || Math.min(760, window.innerWidth));
  const h = side ? Math.max(180, body.clientHeight - tkH) : Math.round(Math.max(170, Math.min(w * .7, window.innerHeight * .38)));
  DPR = Math.min(2, window.devicePixelRatio || 1);
  CV.width = w * DPR; CV.height = h * DPR; CV.style.height = h + 'px'; CTX = CV.getContext('2d');
  const pad = Math.min(w, h) * .08;
  FIT.s = Math.min(w - 2 * pad, (h - 2 * pad) / .8); FIT.ox = (w - FIT.s) / 2; FIT.oy = (h - FIT.s * .8) / 2 - FIT.s * .1;
  TW = Math.max(9, Math.min(w, h) * (R.tr.oval ? .07 : .052));
}
const P = p => [FIT.ox + p[0] * FIT.s, FIT.oy + p[1] * FIT.s];
// point at track position `prog`, shifted sideways by `lat` track widths (positive = pit side)
function posLat(prog, lat) {
  const tr = R.tr, N = tr.N, fi = ((prog % N) + N) % N, i0 = Math.floor(fi), i1 = (i0 + 1) % N, f = fi - i0;
  const a = tr.pts[i0], b = tr.pts[i1], ang = tr.ang[i0], q = P([lerp(a[0], b[0], f), lerp(a[1], b[1], f)]);
  const d = lat * TW * tr.pitSide;
  return { x: q[0] - Math.sin(ang) * d, y: q[1] + Math.cos(ang) * d, ang };
}
const posAt = (prog, lane) => posLat(prog, lane * .3);
const smooth = x => x * x * (3 - 2 * x);
const pitRamp = u => smooth(clamp(u / .22, 0, 1)) * smooth(clamp((1 - u) / .22, 0, 1));
let MARKS = null;
const CHASE_Z = 2.6;
function camPref() { try { return localStorage.getItem('boxutca_cam') === 'chase' ? 'chase' : 'top'; } catch (e) { return 'top'; } }
function camLabel() { const b = $('#rCam'); if (b && R) { b.textContent = R.cam === 'chase' ? t('cam.top') : t('cam.chase'); b.classList.toggle('on', R.cam === 'chase'); } }
function setCam(v) {
  if (!R) return; R.cam = v; R.camX = null; try { localStorage.setItem('boxutca_cam', v); } catch (e) { }
  camLabel(); const old = MARKS; drawBG(); if (old) MARKS.getContext('2d').drawImage(old, 0, 0); draw();
}
// chase view: small position / gap line, because the leaderboard is out of sight on small screens
function chaseHud(g, W, H) {
  const ord = raceOrder(), me = R.my[R.sel], i = ord.indexOf(me);
  if (i < 0) return;
  const txt = `P${i + 1}  #${me.num}`;
  g.font = '700 13px system-ui,sans-serif'; g.textAlign = 'left'; g.textBaseline = 'alphabetic'; const w = g.measureText(txt).width + 18;
  g.fillStyle = 'rgba(0,0,0,.55)'; roundRect(g, 8, H - 34, w, 26, 8); g.fill();
  g.fillStyle = '#ffb21e'; g.fillText(txt, 17, H - 16);
}
/* skid marks on the circuit: only when a car slides or locks up; they stay and get darker where it happens often */
function skidMarks() {
  if (!MARKS || R.caution > 0) return;
  const g = MARKS.getContext('2d'), tr = R.tr, N = tr.N;
  g.setTransform(DPR, 0, 0, DPR, 0, 0); g.lineCap = 'round';
  R.cars.forEach(c => {
    if (c.pit || c.dnf || c.finished || c.prog < 0) { c.mk = null; return; }
    const i = ((Math.floor(c.prog) % N) + N) % N, ahead = tr.c[(i + 10) % N] - tr.c[i];
    if (!tr.oval && c.lock <= 0 && ahead > .35 && (c.vNow || 0) > R.vScale * .7 && Math.random() < (c.mode === 2 ? .05 : .015) * (1 + R.wet)) c.lock = 10;
    const on = c.mistT > 0 || c.lock > 0;
    if (c.lock > 0) c.lock--;
    if (!on) { c.mk = null; return; }
    const p = carPos(c), a = p.ang + (c.yaw || 0), L = TW * .8, Wd = TW * .42;
    const rx = p.x - Math.cos(a) * L * .3, ry = p.y - Math.sin(a) * L * .3, nx = -Math.sin(a) * Wd * .4, ny = Math.cos(a) * Wd * .4;
    const cur = [rx + nx, ry + ny, rx - nx, ry - ny];
    if (c.mk) {
      g.strokeStyle = (c.offL || 0) > .45 ? 'rgba(70,52,30,.3)' : 'rgba(12,12,14,.16)'; g.lineWidth = Math.max(1, TW * .07);
      g.beginPath(); g.moveTo(c.mk[0], c.mk[1]); g.lineTo(cur[0], cur[1]); g.moveTo(c.mk[2], c.mk[3]); g.lineTo(cur[2], cur[3]); g.stroke();
    }
    c.mk = cur;
  });
}
/* weather icons in the top right of a map: current weather, then the forecast blinking red/yellow */
function wxIcons(g, xr, y, rain, next, snow) {
  const s = 22, blink = Math.floor(performance.now() / 350) % 2;
  const icon = (x, lv, sn, warn) => {
    g.fillStyle = 'rgba(0,0,0,.55)'; roundRect(g, x - 3, y - 3, s + 6, s + 6, 7); g.fill();
    if (warn) { g.strokeStyle = blink ? '#ff3b30' : '#ffd400'; g.lineWidth = 2.5; roundRect(g, x - 3, y - 3, s + 6, s + 6, 7); g.stroke(); }
    if (lv === 0 && !sn) {   // sun
      g.fillStyle = '#ffd34d'; g.beginPath(); g.arc(x + s / 2, y + s / 2, s * .22, 0, 7); g.fill();
      g.strokeStyle = '#ffd34d'; g.lineWidth = 1.6; g.beginPath();
      for (let k = 0; k < 8; k++) { const an = k * Math.PI / 4; g.moveTo(x + s / 2 + Math.cos(an) * s * .32, y + s / 2 + Math.sin(an) * s * .32); g.lineTo(x + s / 2 + Math.cos(an) * s * .44, y + s / 2 + Math.sin(an) * s * .44); }
      g.stroke(); return;
    }
    g.fillStyle = warn ? (blink ? '#ff6b5f' : '#ffd400') : '#cfd6e0';
    g.beginPath(); g.arc(x + s * .36, y + s * .45, s * .2, 0, 7); g.arc(x + s * .6, y + s * .38, s * .25, 0, 7); g.arc(x + s * .76, y + s * .5, s * .17, 0, 7); g.rect(x + s * .2, y + s * .45, s * .6, s * .2); g.fill();
    g.strokeStyle = sn ? '#fff' : '#6fb3ff'; g.lineWidth = 1.6; g.beginPath();
    const n = sn ? 3 : lv >= 1 ? 4 : 2;
    for (let k = 0; k < n; k++) { const xx = x + s * (.3 + k * .16); if (sn) { g.moveTo(xx - 1.5, y + s * .86); g.lineTo(xx + 1.5, y + s * .86); } else { g.moveTo(xx, y + s * .74); g.lineTo(xx - 2, y + s * .95); } }
    g.stroke();
  };
  let x = xr - s;
  if (next != null) { icon(x, next, false, true); x -= s + 10; g.fillStyle = '#fff'; g.font = `800 13px ${FC}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('›', x + s + 5, y + s / 2); g.textAlign = 'left'; x -= 2; }
  icon(x, rain, snow, false);
}
/* ---------- detailed circuit map ---------- */
// corner runs: where the track is tight, which side is the inside, local radius in pixels
function kerbRuns(tr) {
  const N = tr.N;
  const dA = i => { let d = tr.ang[(i + 3) % N] - tr.ang[(i - 3 + N) % N]; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
  const rad = Array.from({ length: N }, (_, i) => { const a = P(tr.pts[(i - 3 + N) % N]), b = P(tr.pts[(i + 3) % N]); return Math.hypot(b[0] - a[0], b[1] - a[1]) / Math.max(1e-4, Math.abs(dA(i))); });
  const tight = rad.map(r => r < TW * 7);
  const on = tight.map((v, i) => { for (let d = -4; d <= 4; d++) if (tight[(i + d + N) % N]) return true; return false; });
  const side = new Array(N).fill(0), runs = [];
  for (let i = 0; i < N; i++) if (on[i] && !side[i]) {
    let j = i, best = i; while (on[j % N] && j < i + N) { if (rad[j % N] < rad[best % N]) best = j; j++; }
    const sd = Math.sign(dA(best % N)) * tr.pitSide;
    for (let q = i; q < j; q++) side[q % N] = sd;
    runs.push({ s: i, e: j, apex: best % N, side: sd, r: rad[best % N] });
  }
  return { on, side, rad, runs };
}
function blob(g, x, y, r, n, sr, wob = .35) {
  g.beginPath();
  for (let k = 0; k <= n; k++) { const a = k / n * Math.PI * 2, rr = r * (1 - wob / 2 + sr() * wob); const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr; k ? g.lineTo(px, py) : g.moveTo(px, py); }
  g.closePath();
}
// scenery around the circuit: mottled grass, lakes, forests, car parks, buildings, paddock, service road
function drawScenery(g, W, H, tr, sr, near, KR) {
  for (let k = 0; k < 220; k++) { const x = sr() * W, y = sr() * H, r = 18 + sr() * 70; g.fillStyle = sr() < .5 ? 'rgba(255,255,240,.03)' : 'rgba(0,20,0,.05)'; blob(g, x, y, r, 9, sr, .5); g.fill(); }
  g.globalAlpha = .06; g.fillStyle = '#000'; for (let x = 0; x < W; x += 26) g.fillRect(x, 0, 13, H); g.globalAlpha = 1;
  const taken = [];
  const free = (x, y, r) => x > r * .4 && y > r * .4 && x < W - r * .4 && y < H - r * .4 && !near(x, y, TW * 2.6 + r) && taken.every(t => Math.hypot(t[0] - x, t[1] - y) > t[2] + r);
  // paddock behind the pit garages: team trucks and hospitality
  const L = tr.pitE + tr.pitX;
  let lastT = null;
  for (let k = 0; k < 9; k++) {
    const u = .3 + .4 * k / 8, p = posLat(-tr.pitE + u * L, PIT_OFF + 2.2);
    if (near(p.x, p.y, TW * 1.5) || (lastT && Math.hypot(p.x - lastT.x, p.y - lastT.y) < TW * .9)) continue;
    lastT = p;
    g.save(); g.translate(p.x, p.y); g.rotate(p.ang + Math.PI / 2);
    g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(-TW * .45 + 2, -TW * .16 + 3, TW * .9, TW * .32);
    g.fillStyle = '#e6e8ec'; g.fillRect(-TW * .45, -TW * .16, TW * .72, TW * .32);
    g.fillStyle = AI_COLORS[k % AI_COLORS.length]; g.fillRect(TW * .29, -TW * .16, TW * .16, TW * .32);
    g.restore(); taken.push([p.x, p.y, TW * .6]);
  }
  // lakes
  for (let k = 0, n = 0; k < 60 && n < 2; k++) {
    const x = sr() * W, y = sr() * H, r = TW * (1.3 + sr() * 1.8); if (!free(x, y, r * 1.35)) continue; n++;
    const s0 = seed0(sr);
    g.fillStyle = '#b8a880'; blob(g, x, y, r * 1.1, 14, mkr(s0), .3); g.fill();
    g.fillStyle = '#2d5d7d'; blob(g, x, y, r, 14, mkr(s0), .3); g.fill();
    g.fillStyle = 'rgba(120,180,220,.25)'; blob(g, x - r * .2, y - r * .25, r * .5, 10, sr, .3); g.fill();
    taken.push([x, y, r * 1.3]);
  }
  // car parks with parked cars, and buildings
  const lots = [];
  for (let k = 0, n = 0; k < 90 && n < 5; k++) {
    const w = TW * (2.4 + sr() * 2.2), h = TW * (1.8 + sr() * 1.2), x = sr() * W, y = sr() * H, r = Math.hypot(w, h) / 2;
    if (!free(x, y, r)) continue; n++;
    const ang = (sr() < .5 ? 0 : Math.PI / 2) + (sr() - .5) * .5, building = sr() < .35;
    g.save(); g.translate(x, y); g.rotate(ang);
    g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(-w / 2 + 3, -h / 2 + 4, w, h);
    if (building) {
      g.fillStyle = '#9aa0a8'; g.fillRect(-w / 2, -h / 2, w, h * .6); g.fillStyle = '#c3c8cf'; g.fillRect(-w / 2, -h / 2, w, h * .12);
      g.fillStyle = '#7d838b'; for (let q = 1; q < 5; q++) g.fillRect(-w / 2 + w * q / 5 - 1, -h / 2, 2, h * .6);
    } else {
      g.fillStyle = '#5f646b'; g.fillRect(-w / 2, -h / 2, w, h);
      g.strokeStyle = 'rgba(255,255,255,.45)'; g.lineWidth = 1;
      const rows = Math.max(2, Math.floor(h / (TW * .55))), sw = TW * .3;
      for (let rI = 0; rI < rows; rI++) {
        const yy = -h / 2 + (rI + .5) * h / rows;
        g.beginPath(); g.moveTo(-w / 2 + 3, yy); g.lineTo(w / 2 - 3, yy); g.stroke();
        for (let xx = -w / 2 + 3; xx < w / 2 - sw; xx += sw) {
          if (sr() < .55) { g.fillStyle = ['#d9d9d9', '#2f6fd1', '#c33', '#222', '#e8c13a', '#7a8794'][Math.floor(sr() * 6)]; g.fillRect(xx + sw * .2, yy - (rI % 2 ? -2 : sw * .9), sw * .6, sw * .7); }
        }
      }
    }
    g.restore(); taken.push([x, y, r]); lots.push([x, y]);
  }
  // service road joining the car parks to the edge of the map
  g.strokeStyle = '#6b7078'; g.lineWidth = Math.max(2, TW * .3); g.lineCap = 'round';
  lots.forEach(([x, y]) => {
    const ex = x < W / 2 ? 0 : W, ey = y;
    let ok = true; for (let q = 0; q <= 10; q++) { const px = lerp(x, ex, q / 10); if (near(px, ey, TW * 1.4)) { ok = false; break; } }
    if (ok) { g.beginPath(); g.moveTo(x, y); g.lineTo(ex, ey); g.stroke(); }
  });
  // grandstands on the outside of the bigger corners
  (KR.runs || []).slice(0, 4).forEach(run => {
    const p = posLat(run.apex, -run.side * 2.5); if (near(p.x, p.y, TW * 1.6)) return;
    g.save(); g.translate(p.x, p.y); g.rotate(p.ang);
    g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(-TW * 1.2 + 2, -TW * .3 + 3, TW * 2.4, TW * .6);
    for (let rI = 0; rI < 4; rI++) { g.fillStyle = rI % 2 ? '#3b4250' : '#4a5263'; g.fillRect(-TW * 1.2, -TW * .3 + rI * TW * .15, TW * 2.4, TW * .15); }
    for (let q = 0; q < 26; q++) { g.fillStyle = ['#e8392f', '#2f7bf5', '#f5c518', '#fff', '#2fbf71'][q % 5]; g.fillRect(-TW * 1.15 + sr() * TW * 2.3, -TW * .28 + sr() * TW * .56, 1.6, 1.6); }
    g.restore(); taken.push([p.x, p.y, TW * 1.3]);
  });
  // forests: dense clumps of trees, then scattered single trees
  const tree = (x, y, r) => {
    g.fillStyle = 'rgba(0,0,0,.28)'; g.beginPath(); g.arc(x + r * .35, y + r * .45, r, 0, 7); g.fill();
    g.fillStyle = sr() < .5 ? '#1d4421' : '#24522a'; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    g.fillStyle = 'rgba(120,170,90,.22)'; g.beginPath(); g.arc(x - r * .3, y - r * .3, r * .5, 0, 7); g.fill();
  };
  for (let c = 0, n = 0; c < 120 && n < 12; c++) {
    const cx = sr() * W, cy = sr() * H; if (!free(cx, cy, TW * 1.2)) continue; n++;
    const R0 = TW * (1.4 + sr() * 1.6);
    for (let k = 0; k < 40; k++) { const a = sr() * 7, d = Math.sqrt(sr()) * R0, x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d, r = 3 + sr() * 5; if (free(x, y, r)) tree(x, y, r); }
  }
  for (let k = 0; k < 170; k++) { const x = sr() * W, y = sr() * H, r = 3 + sr() * 5; if (free(x, y, r)) tree(x, y, r); }
}
const seed0 = sr => Math.floor(sr() * 1e6);
const mkr = s0 => { let q = s0; return () => ((q = (q * 9301 + 49297) % 233280) / 233280); };
// run-off: gravel traps on the outside of corners with a tyre barrier behind them
function drawRunoff(g, tr, KR, sr) {
  const N = tr.N;
  KR.runs.forEach((run, ri) => {
    const len = run.e - run.s; if (len < 4 || run.r > TW * 4.5) return;   // only the real corners get a gravel trap
    const tarmac = false;
    const pts = [], bar = [];
    const trim = Math.floor(len * .22);   // only around the middle of the corner, where cars slide off
    for (let q = run.s + trim; q <= run.e - trim + 2; q += 2) { const i = ((q % N) + N) % N; pts.push(posLat(i, -run.side * .86)); bar.push(posLat(i, -run.side * 1.24)); }
    if (pts.length < 3) return;
    const poly = (arr, w, col) => { g.beginPath(); arr.forEach((p, k) => k ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); g.lineWidth = w; g.strokeStyle = col; g.lineCap = 'round'; g.lineJoin = 'round'; g.stroke(); };
    poly(pts, TW * .66, tarmac ? '#5d636b' : '#cdb98a');
    if (!tarmac) { g.fillStyle = 'rgba(120,100,60,.35)'; pts.forEach(p => { for (let k = 0; k < 3; k++) g.fillRect(p.x + (sr() - .5) * TW * .55, p.y + (sr() - .5) * TW * .55, 1.2, 1.2); }); }
    else { g.setLineDash([TW * .25, TW * .25]); poly(pts.map(p => p), TW * .08, 'rgba(220,40,40,.5)'); g.setLineDash([]); }
    g.setLineDash([2, 2]); poly(bar, Math.max(2, TW * .12), '#2a2c30'); g.setLineDash([]); poly(bar, 1, 'rgba(255,255,255,.35)');
  });
}
// average colour along the map edge: fills the area outside the map in the chase view without a hard border
function edgeColour() {
  try {
    const g = BG.getContext('2d'), w = BG.width, h = BG.height; let r = 0, gg = 0, b = 0, n = 0;
    for (const [x, y, ww, hh] of [[0, 0, w, 4], [0, h - 4, w, 4], [0, 0, 4, h], [w - 4, 0, 4, h]]) {
      const d = g.getImageData(x, y, ww, hh).data; for (let i = 0; i < d.length; i += 16) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; n++; }
    }
    return `rgb(${r / n | 0},${gg / n | 0},${b / n | 0})`;
  } catch (e) { return null; }
}
function drawBG() {
  const W = CV.width / DPR, H = CV.height / DPR; BG = document.createElement('canvas');
  // the chase camera zooms in, so the background is drawn sharper then (kept under ~9 Mpx for phones)
  const BS = R.cam === 'chase' ? Math.min(DPR * CHASE_Z, Math.sqrt(9e6 / (W * H))) : DPR;
  BG.width = Math.round(W * BS); BG.height = Math.round(H * BS);
  MARKS = document.createElement('canvas'); MARKS.width = CV.width; MARKS.height = CV.height;
  const g = BG.getContext('2d'); g.scale(BS, BS); const tr = R.tr, N = tr.N;
  g.fillStyle = tr.oval ? '#2b4f2d' : '#2c5a30'; g.fillRect(0, 0, W, H);
  const path = () => { g.beginPath(); tr.pts.forEach((p, i) => { const q = P(p); i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); }); g.closePath(); };
  const near = (x, y, d) => { for (let i = 0; i < N; i += 4) { const q = P(tr.pts[i]); if (Math.hypot(q[0] - x, q[1] - y) < d) return true; } return false; };
  let seed = tr.idx * 9301 + 49297 + (tr.oval ? 777 : 0); const sr = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  const KR = kerbRuns(tr);
  drawScenery(g, W, H, tr, sr, near, KR);
  if (tr.oval) { path(); g.fillStyle = '#2e6232'; g.fill(); g.strokeStyle = '#7d8289'; g.lineWidth = TW * 1.9; g.lineJoin = 'round'; path(); g.stroke(); }
  else drawRunoff(g, tr, KR, sr);
  const gs = posLat(0, -1.6);
  g.save(); g.translate(gs.x, gs.y); g.rotate(gs.ang);
  for (let k = -3; k <= 3; k++) { g.fillStyle = k % 2 ? '#3b4250' : '#454d5c'; g.fillRect(k * TW * 1.1 - TW * .55, -TW * .4, TW * 1.05, TW * .8); }
  g.restore();
  const L = tr.pitE + tr.pitX, lanePts = [], wallPts = [];
  for (let k = 0; k <= 60; k++) { const u = k / 60, pr = -tr.pitE + u * L; lanePts.push(posLat(pr, PIT_OFF * pitRamp(u))); if (u > .2 && u < .8) wallPts.push(posLat(pr, PIT_OFF * .55)); }
  const poly = (pts, w, col, dash) => { g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); g.lineWidth = w; g.strokeStyle = col; g.setLineDash(dash || []); g.stroke(); g.setLineDash([]); };
  g.lineJoin = 'round'; g.lineCap = 'round';
  poly(lanePts, TW * .62 + 4, 'rgba(0,0,0,.35)'); poly(lanePts, TW * .62, '#5b6067');
  for (let i = 0; i < TEAMS; i++) {   // one garage per team, both cars share it
    const u = .3 + .45 * i / (TEAMS - 1), p = posLat(-tr.pitE + u * L, PIT_OFF + .6);
    const car = R.cars.find(c => c.boxIdx === i);
    g.save(); g.translate(p.x, p.y); g.rotate(p.ang);
    g.fillStyle = '#23272e'; g.fillRect(-TW * .4, -TW * .22, TW * .8, TW * .44);
    g.fillStyle = car ? car.color : '#444';
    const side = tr.pitSide > 0 ? 1 : -1; g.fillRect(-TW * .4, side > 0 ? TW * .15 : -TW * .22, TW * .8, TW * .07);
    if (car && car.isMe) { g.strokeStyle = '#ffb21e'; g.lineWidth = 1.5; g.strokeRect(-TW * .42, -TW * .24, TW * .84, TW * .48); }
    g.restore();
  }
  g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = TW + 6; path(); g.stroke();
  if (tr.oval) { g.strokeStyle = '#d2d6dc'; g.lineWidth = TW + 6; path(); g.stroke(); }
  g.strokeStyle = tr.oval ? '#484c53' : '#4c5057'; g.lineWidth = TW; path(); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,.1)'; g.lineWidth = 1; g.setLineDash(tr.oval ? [6, 8] : [4, 10]); path(); g.stroke(); g.setLineDash([]);
  // white track-limit lines along both edges
  g.strokeStyle = 'rgba(255,255,255,.72)'; g.lineWidth = Math.max(1, TW * .045);
  for (const sd of [-1, 1]) { g.beginPath(); for (let i = 0; i <= N; i += 2) { const q = posLat(i % N, sd * .46); i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y); } g.closePath(); g.stroke(); }
  if (!tr.oval) {   // kerbs: red and white blocks on the inside of every corner, following its radius
    const { on, side, rad } = KR, lat = i => side[i] * Math.min(.5, rad[i] * .8 / TW);
    g.lineCap = 'butt'; g.lineWidth = Math.max(2, TW * .17);
    let k = 0;
    for (let i = 0; i < N; i += 2) {
      const i2 = (i + 2) % N;
      if (!on[i] || !on[i2] || !side[i]) { k = 0; continue; }
      const a = posLat(i, lat(i)), b = posLat(i2, lat(i2));
      g.strokeStyle = k % 2 ? '#f2f2f2' : '#d1342a'; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
      k++;
    }
    g.lineCap = 'round';
  }
  poly(wallPts, 2.5, '#c9ced6');
  poly(lanePts.slice(0, 15), 1.5, 'rgba(255,255,255,.75)', [3, 3]); poly(lanePts.slice(-15), 1.5, 'rgba(255,255,255,.75)', [3, 3]);
  const s0 = posLat(0, 0);
  g.save(); g.translate(s0.x, s0.y); g.rotate(s0.ang); const sq = TW / 6;
  for (let r = 0; r < 2; r++) for (let kk = 0; kk < 6; kk++) { g.fillStyle = (r + kk) % 2 ? '#111' : '#fff'; g.fillRect(-sq + r * sq, -TW / 2 + kk * sq, sq, sq); }
  g.restore();
  const pl = posLat(0, PIT_OFF); g.save(); g.translate(pl.x, pl.y); g.rotate(pl.ang); g.fillStyle = '#fff'; g.fillRect(-1, -TW * .3, 2, TW * .6); g.restore();
  const lbl = (pr, txt) => { const p = posLat(pr, PIT_OFF + 1.35); g.fillStyle = 'rgba(255,255,255,.8)'; g.font = `700 ${Math.max(8, Math.min(16, TW * .32))}px "Barlow Condensed","Arial Narrow",sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, p.x, p.y); };
  lbl(-tr.pitE + L * .06, 'PIT IN'); lbl(-tr.pitE + L * .94, 'PIT OUT');
  R.edgeCol = R.cam === 'chase' ? edgeColour() : null;
}
function carPos(c) {
  if (c.pit) return posLat(c.prog, PIT_OFF * pitRamp(pitU(c)));
  if (c.dnf) return posLat(c.prog, -2.1);
  const N = R.tr.N, f = ((c.prog % N) + N) % N, i0 = Math.floor(f), ln = lerp(R.line[i0], R.line[(i0 + 1) % N], f - i0);
  const base = clamp(c.lane * .3 + ln * (c.lineK || 1) * (R.caution > 0 ? .3 : 1), -.44, .44);
  // a car that slides (!) leaves the track on the outside of the corner, then rejoins
  return posLat(c.prog, base + (c.offL || 0) * (c.offSide || 1) * (R.tr.oval ? .55 : 1.05));
}
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
// top-down car: the nose points to +x; seat 1 cars carry a light nose band so teammates can be told apart
function drawCarShape(g, kind, color, num, L, Wd, seat = 0) {
  g.fillStyle = 'rgba(0,0,0,.35)'; roundRect(g, -L / 2 + 1.5, -Wd / 2 + 1.5, L, Wd, Wd * .3); g.fill();
  const tyre = (x, y, w, h) => { g.fillStyle = '#0b0b0c'; g.fillRect(x - w / 2, y - h / 2, w, h); };
  const dark = shade(color, -45);
  if (kind === 'proto') {
    tyre(L * .3, -Wd * .43, L * .2, Wd * .24); tyre(L * .3, Wd * .43, L * .2, Wd * .24); tyre(-L * .3, -Wd * .45, L * .22, Wd * .26); tyre(-L * .3, Wd * .45, L * .22, Wd * .26);
    g.fillStyle = color; g.beginPath();
    g.moveTo(L * .52, -Wd * .12); g.lineTo(L * .52, Wd * .12); g.lineTo(L * .42, Wd * .46); g.lineTo(L * .16, Wd * .5); g.lineTo(L * .04, Wd * .3); g.lineTo(-L * .16, Wd * .32); g.lineTo(-L * .44, Wd * .5); g.lineTo(-L * .5, Wd * .3);
    g.lineTo(-L * .5, -Wd * .3); g.lineTo(-L * .44, -Wd * .5); g.lineTo(-L * .16, -Wd * .32); g.lineTo(L * .04, -Wd * .3); g.lineTo(L * .16, -Wd * .5); g.lineTo(L * .42, -Wd * .46); g.closePath(); g.fill();
    g.fillStyle = '#141c26'; g.beginPath(); g.ellipse(L * .1, 0, L * .12, Wd * .17, 0, 0, 7); g.fill();
    g.strokeStyle = dark; g.lineWidth = Math.max(1, Wd * .08); g.beginPath(); g.moveTo(-L * .02, 0); g.lineTo(-L * .45, 0); g.stroke();
    g.fillStyle = '#121417'; g.fillRect(-L * .56, -Wd * .5, L * .09, Wd);
  } else if (kind === 'gt') {
    tyre(L * .3, -Wd * .44, L * .19, Wd * .22); tyre(L * .3, Wd * .44, L * .19, Wd * .22); tyre(-L * .3, -Wd * .45, L * .2, Wd * .24); tyre(-L * .3, Wd * .45, L * .2, Wd * .24);
    g.fillStyle = color; roundRect(g, -L * .5, -Wd * .47, L, Wd * .94, Wd * .35); g.fill();
    g.fillStyle = dark; g.fillRect(L * .22, -Wd * .2, L * .18, Wd * .4);
    g.fillStyle = '#141c26'; roundRect(g, -L * .16, -Wd * .33, L * .34, Wd * .66, Wd * .12); g.fill();
    g.fillStyle = color; roundRect(g, -L * .1, -Wd * .27, L * .2, Wd * .54, Wd * .1); g.fill();
    g.fillStyle = '#121417'; g.fillRect(-L * .5, -Wd * .55, L * .1, Wd * 1.1);
  } else {
    tyre(L * .3, -Wd * .45, L * .18, Wd * .22); tyre(L * .3, Wd * .45, L * .18, Wd * .22); tyre(-L * .3, -Wd * .45, L * .18, Wd * .22); tyre(-L * .3, Wd * .45, L * .18, Wd * .22);
    g.fillStyle = color; roundRect(g, -L * .5, -Wd * .48, L, Wd * .96, Wd * .22); g.fill();
    g.fillStyle = '#141c26'; g.fillRect(L * .1, -Wd * .36, L * .13, Wd * .72); g.fillRect(-L * .28, -Wd * .34, L * .1, Wd * .68);
    g.fillStyle = shade(color, 25); g.fillRect(-L * .18, -Wd * .38, L * .28, Wd * .76);
    g.fillStyle = '#121417'; g.fillRect(-L * .5, -Wd * .48, L * .04, Wd * .96);
    if (TW > 12 && num !== '') { g.fillStyle = '#fff'; g.font = `800 ${Wd * .55}px "Barlow Condensed","Arial Narrow",sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.save(); g.translate(-L * .04, 0); g.rotate(Math.PI / 2); g.fillText(num, 0, 0); g.restore(); }
  }
  if (seat === 1) { g.fillStyle = 'rgba(255,255,255,.85)'; g.fillRect(L * .4, -Wd * .3, L * .07, Wd * .6); }
}
function drawCar(g, c) {
  const p0 = carPos(c), x = p0.x, y = p0.y, L = TW * .8, Wd = TW * .42;
  // slip angle: the car turns in a little in corners (more in the wet, a lot when it slides)
  const N = R.tr.N, i = ((Math.floor(c.prog) % N) + N) % N, base = { gt: .12, proto: .08, stock: .07 }[R.kind] || .1;
  const sp = clamp((c.vNow || 0) / R.vScale, 0, 1.3);
  let tY = c.pit || c.dnf ? 0 : (R.sc[i] || 0) * sp * base * (1 + R.wet * 1.2);
  if (c.mistT > 0) tY += (c.evt === '!' ? .55 : .25) * (c.num % 2 ? 1 : -1);
  c.yaw = lerp(c.yaw || 0, tY, .15);
  if (c.mistT > 0 && c.evt === '!' && !c.pit && !c.offL) {   // slide off on the outside of the corner the car is in or entering
    let best = 0; for (let k = -4; k <= 24; k++) { const v = R.sc[(i + k + N) % N] || 0; if (Math.abs(v) > Math.abs(best)) best = v; }
    c.offSide = -(Math.sign(best) || (c.num % 2 ? 1 : -1)) * R.tr.pitSide;
  }
  c.offL = lerp(c.offL || 0, c.mistT > 0 && c.evt === '!' && !c.pit && !c.dnf ? 1 : 0, c.mistT > 0 ? .12 : .05);
  if (c.offL < .01 && !(c.mistT > 0)) c.offL = 0;
  const ang = p0.ang + c.yaw;
  if (R.wet > .25 && !c.dnf && !(c.pit && c.pit.stage === 'stop') && sp > .3) {   // light spray curtain, never hides the cars behind
    for (let k = 1; k <= 3; k++) {
      g.fillStyle = `rgba(215,225,238,${(.1 - k * .022) * R.wet * Math.min(1, sp)})`;
      g.beginPath(); g.ellipse(x - Math.cos(ang) * L * (.55 + k * .38), y - Math.sin(ang) * L * (.55 + k * .38), L * (.3 + k * .14), Wd * (.6 + k * .22), ang, 0, 7); g.fill();
    }
  }
  if (night() && !c.dnf) {   // headlights
    const gr = g.createRadialGradient(x + Math.cos(ang) * L, y + Math.sin(ang) * L, 1, x + Math.cos(ang) * L * 1.6, y + Math.sin(ang) * L * 1.6, L * 1.6);
    gr.addColorStop(0, 'rgba(255,244,200,.55)'); gr.addColorStop(1, 'rgba(255,244,200,0)');
    g.fillStyle = gr; g.beginPath(); g.ellipse(x + Math.cos(ang) * L * 1.4, y + Math.sin(ang) * L * 1.4, L * 1.3, Wd * 1.4, ang, 0, 7); g.fill();
  }
  g.save(); g.translate(x, y); g.rotate(ang); if (c.dnf) g.globalAlpha = .45;
  drawCarShape(g, R.kind, c.color, c.num, L, Wd, c.seat);
  if (c.isMe) { const sel = c === R.my[R.sel]; g.strokeStyle = sel ? '#ffb21e' : 'rgba(255,178,30,.5)'; g.lineWidth = sel ? 2.2 : 1.4; g.beginPath(); g.ellipse(0, 0, L * .75, Wd * 1.05, 0, 0, 7); g.stroke(); }
  g.restore();
  if (c.evt === '!') { g.fillStyle = '#ff5a5f'; g.font = `800 ${Math.max(10, TW * .7)}px "Barlow Condensed","Arial Narrow",sans-serif`; g.textAlign = 'center'; g.fillText('!', x, y - TW * .6); }
}
function draw() {
  if (!R || R.headless) return;
  const g = CTX, W = CV.width / DPR, H = CV.height / DPR, chase = R.cam === 'chase';
  g.setTransform(1, 0, 0, 1, 0, 0);
  if (chase) {
    // chase camera: zoomed in behind the selected car, the map turns so the car always drives up the screen
    // the view points along the road a little ahead, so the track in front runs up the screen even in hairpins
    const c = R.my[R.sel], p = carPos(c), q = posLat(c.prog + 5, 0), r0 = posLat(c.prog - 1, 0);
    const aim = Math.atan2(q.y - r0.y, q.x - r0.x);
    if (R.camX == null) { R.camX = p.x; R.camY = p.y; R.camA = aim; }
    const da = Math.atan2(Math.sin(aim - R.camA), Math.cos(aim - R.camA));
    R.camX = lerp(R.camX, p.x, .25); R.camY = lerp(R.camY, p.y, .25); R.camA += da * .14;
    g.fillStyle = R.edgeCol || '#2c5a30'; g.fillRect(0, 0, CV.width, CV.height);
    g.setTransform(DPR, 0, 0, DPR, 0, 0); g.translate(W / 2, H * .64); g.rotate(-R.camA - Math.PI / 2); g.scale(CHASE_Z, CHASE_Z); g.translate(-R.camX, -R.camY);
    g.drawImage(BG, 0, 0, W, H); if (MARKS) g.drawImage(MARKS, 0, 0, W, H);
  } else { R.camX = null; g.drawImage(BG, 0, 0, CV.width, CV.height); if (MARKS) g.drawImage(MARKS, 0, 0); g.setTransform(DPR, 0, 0, DPR, 0, 0); }
  skidMarks();
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
  if (night()) { g.fillStyle = 'rgba(6,10,28,.58)'; g.fillRect(0, 0, CV.width, CV.height); }
  if (R.wet > .02) { g.fillStyle = `rgba(25,40,65,${R.wet * .3})`; g.fillRect(0, 0, CV.width, CV.height); }
  g.restore();
  R.cars.filter(c => !c.isMe).forEach(c => drawCar(g, c)); R.my.forEach(c => drawCar(g, c));
  if (R.caution > 0 && !R.tr.oval) {
    const ld = R.cars.filter(c => !c.finished && !c.dnf && !c.pit).sort((a, b) => b.prog - a.prog)[0];
    if (ld) { const p = posAt(ld.prog + 14, 0); g.save(); g.translate(p.x, p.y); g.rotate(p.ang); drawCarShape(g, 'gt', '#e9ebee', '', TW * .72, TW * .38); g.fillStyle = '#ffb21e'; g.fillRect(-TW * .06, -TW * .13, TW * .12, TW * .26); g.restore(); }
  }
  g.setTransform(DPR, 0, 0, DPR, 0, 0);
  if (chase) chaseHud(g, W, H);
  if (R.rain > 0) {
    g.strokeStyle = 'rgba(200,215,235,.35)'; g.lineWidth = 1; g.beginPath();
    const n = R.rain * 140;
    for (let i = 0; i < n; i++) { const x = Math.random() * W, y = Math.random() * H; g.moveTo(x, y); g.lineTo(x - 2, y + 9); }
    g.stroke();
  }
  if (R.caution > 0) { g.strokeStyle = R.redFlag ? '#ff3b30' : '#ffd400'; g.lineWidth = 4; g.strokeRect(2, 2, W - 4, H - 4); }
  wxIcons(g, W - 8, 8, R.rain, R.wxNext ? R.wxNext.rain : null, false);
  if (R.startT > 0) {
    const n = Math.ceil(R.startT / .55);
    g.fillStyle = 'rgba(0,0,0,.6)'; roundRect(g, W / 2 - 70, 10, 140, 34, 10); g.fill();
    for (let k = 0; k < 4; k++) { g.fillStyle = n <= 4 - k ? '#e8392f' : '#3a1010'; g.beginPath(); g.arc(W / 2 - 45 + k * 30, 27, 10, 0, 7); g.fill(); }
  }
}
window.addEventListener('resize', () => { if (R && !R.headless && !$('#race').classList.contains('hidden')) { sizeCanvas(); drawBG(); draw(); } });
