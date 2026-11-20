/* ===================== rally weekend flow: shakedown, service, stages, results ===================== */
const RSTAGE_NAMES = {
  mecsek: ['Óbánya', 'Mánfa', 'Kisújbánya', 'Zengővárkony', 'Pécsvárad', 'Árpádtető'],
  bakony: ['Városlőd', 'Bakonybél', 'Porva', 'Csesznek', 'Kislőd', 'Zirc'],
  lapland: ['Kuusamo', 'Arctic Lake', 'Sodankylä', 'Pallas', 'Kittilä', 'Muonio'],
  fjord: ['Hamar', 'Torsby', 'Røros', 'Kongsberg', 'Elverum', 'Trysil'],
  smeralda: ['Monte Lerno', 'Tula', 'Coiluna', 'Sedini', 'Castelsardo', 'Arzachena'],
  dune: ['Erg Chebbi', 'Merzouga', 'Oasis Loop', 'Red Ridge', 'Sandstorm', 'Wadi Gate'],
  alpwinter: ['Col des Glières', 'Saint-Bonnet', 'Sisteron', 'Gap Nord', 'Laborel', 'Puy Gris'],
  lakes: ['Päijälä', 'Laajavuori', 'Harju', 'Kakaristo', 'Ruuhimäki', 'Oittila'],
  vinetarmac: ['Sancerre', 'Chablis', 'Montalcino', 'Rioja Alta', 'Douro', 'Mosel'],
  highland: ['Glenshee', 'Cairngorm', 'Dalwhinnie', 'Speyside', 'Loch Garry', 'Rannoch'],
  redrock: ['Red Mesa', 'Dry Creek', 'Vulture Peak', 'Painted Desert', 'Coyote Pass', 'Mesa Verde'],
  island: ['Akamas', 'Troodos', 'Lefkara', 'Paphos Hills', 'Kakopetria', 'Platres'],
};
const REPAIR_MIN = { susp: 26, body: 18, engine: 32, gear: 24 };      // minutes for a full repair from 100% damage
const REPAIR_CR = { susp: 3200, body: 2200, engine: 4200, gear: 3200 }; // CR for a full repair from 100% damage (tier 0)
const curEvent = () => RALLY_POOL[S.calendar[Math.min(S.round, S.calendar.length - 1)]];
const tyreOptions = ev => [...(ev.mix.A ? ['AS', 'AH', 'AW'] : []), ...(ev.mix.G || ev.mix.S ? ['GS', 'GH'] : []), ...(ev.mix.N ? ['SN'] : [])];
const dayOf = loop => loop < 2 ? 0 : 1;

/* ---------- saving a rally between stages ---------- */
function rwSnapshot(at) {
  if (!RW || RW.type !== 'rally') return;
  RW.at = at;
  const o = { ...RW, ev: undefined, evIdx: S.calendar[S.round], round: S.round, season: S.season };
  S.rw = JSON.parse(JSON.stringify(o)); save();
}
const rwPending = () => S && S.rw && S.rw.round === S.round && S.rw.season === S.season;
function rwResume() {
  if (!rwPending()) { S.rw = null; render(); return; }
  RW = { ...JSON.parse(JSON.stringify(S.rw)), ev: RALLY_POOL[S.rw.evIdx] };
  const at = RW.at || { k: 'next' };
  if (at.k === 'svc') openService(at.n);
  else if (at.k === 'road') roadSection();
  else if (at.k === 'run') { startStage(at.si); if (RL) { RL.speed = 99; } }   // left during a stage: it is driven automatically
  else nextRallyStage();
}
const rwExitBtn = () => `<button class="btn block" style="margin-top:8px" id="rwExit">${t('rw.exit')}</button>`;
function rwBindExit() { const b = $('#rwExit'); if (b) b.onclick = () => { closeModal(); RW = null; VIEW = 'home'; render(); toast(t('rw.saved')); }; }
const keysHint = () => window.matchMedia && window.matchMedia('(pointer:fine)').matches ? `<div class="small muted" style="margin:6px 2px">${t('keys.hint')}</div>` : '';

function openRallyWeekend() {
  if (rwPending()) { rwResume(); return; }
  const ev = curEvent();
  if (ev.type === 'rx') { openRxWeekend(); return; }
  prepareRally(); rallyPreview();
}
function prepareRally() {
  const ev = curEvent(), R = mulberry(hashStr(ev.id + '|' + S.season + '|' + S.round));
  const names = RSTAGE_NAMES[ev.id].slice().sort(() => R() - .5);
  const kmOf = () => Math.round((5 + R() * 6) * 10) / 10;
  const base = [0, 1, 2].map(k => ({ name: names[k], km: kmOf(), seed: Math.floor(R() * 1e9) }));
  const day2 = [3, 4, 5].map(k => ({ name: names[k], km: kmOf(), seed: Math.floor(R() * 1e9) }));
  day2[2].km = Math.round((4 + R() * 3) * 10) / 10;
  const stages = [...base.map(b => ({ ...b, loop: 0, pass: 0 })), ...base.map(b => ({ ...b, loop: 1, pass: 1 })), ...day2.map(b => ({ ...b, loop: 2, pass: 0 }))];
  stages[RALLY_STAGES - 1].power = true;
  const wx = [0, 1, 2].map(() => { const snow = !!ev.mix.N && Math.random() < ev.snow; return { wet: !snow && Math.random() < ev.rain, snow }; });
  const fc = wx.map(w => ({ rain: clamp((w.wet ? .62 : .18) + rnd(-.15, .15), .02, .95) * (ev.rain > 0 ? 1 : 0), snow: ev.mix.N ? clamp((w.snow ? .62 : .15) + rnd(-.15, .15), .02, .95) * (ev.snow > 0 ? 1 : 0) : 0 }));
  const crews = rallyCrews();
  // day 1 running order: championship order (first round: strongest crews first)
  const o1 = crews.slice().sort((a, b) => (S.dpoints[b.id] || 0) - (S.dpoints[a.id] || 0) || crewPerf(b, { frac: ev.mix }, false) - crewPerf(a, { frac: ev.mix }, false)).map(c => c.id);
  const opts = tyreOptions(ev);
  const id = rallyIdeal(ev);
  RW = {
    type: 'rally', ev, crews, stages, wx, fc, order: [o1, o1, null], loop: 0, si: 0,
    setup: { ride: 5, spring: 5, gear: 5 }, runs: [], tyre: opts[0], wear: 0, spares: 1, flat: false,
    dmg: { susp: 0, body: 0, engine: 0, gear: 0 }, repairCost: 0, tyreCost: 0, stageWins: 0, ps: null, ideal: id, srUsed: false,
  };
}
function rallyHead() {
  const W = RW, ev = W.ev;
  const mixTxt = surfText(ev.mix);
  return `<h3>${esc(t('track.' + ev.id))}</h3>
   <div class="small muted">${t('rw.round', { r: S.round + 1, n: DISC.rally.rounds, k: t('rw.ssN', { n: RALLY_STAGES }) })} · ${mixTxt}</div>`;
}
function rallyPreview() {
  const W = RW, ev = W.ev, maxRuns = 3 + (S.staff.sim >= 6 ? 1 : 0), left = maxRuns - W.runs.length;
  const km = W.stages.reduce((a, s, i) => a + (i < 3 || i >= 6 ? s.km * (i < 3 ? 2 : 1) : 0), 0);
  modal(`${rallyHead()}
   <div class="card" style="margin-top:12px">
    <div class="money-line"><span>${t('rw.stages')}</span><b>${RALLY_STAGES} · ${km.toFixed(1)} km</b></div>
    <div class="money-line"><span>${t('rw.format')}</span><b>${t('rw.formatV')}</b></div>
    <div class="money-line"><span>${t('rw.rough')}</span><b>${stars(ev.rough * 100)}</b></div>
    <div class="money-line"><span>${t('rw.jumps')}</span><b>${stars(ev.jumps * 100)}</b></div>
    <div class="small muted" style="margin-top:6px">${esc(t('trackd.' + ev.id))}</div>
   </div>
   <h2 class="sec">${t('rw.shake')}</h2>
   <div class="small muted" style="margin:-4px 2px 10px">${t('rw.shakeInfo')}</div>
   <div class="card">${RSETUP.map(k => `<div class="setrow"><div class="row"><b class="grow">${t('rset.' + k)}</b><span class="num">${W.setup[k]}</span></div>
     <input type="range" min="1" max="9" step="1" value="${W.setup[k]}" data-rset="${k}"><div class="row small muted"><span class="grow">${t('rset.' + k + '.lo')}</span><span>${t('rset.' + k + '.hi')}</span></div></div>`).join('')}</div>
   <div class="row" style="margin-top:10px"><button class="btn grow" id="shRun" ${left <= 0 ? 'disabled' : ''}>${t('rw.run', { n: left })}</button></div>
   ${W.runs.length ? `<div class="card prlog" style="margin-top:10px">${W.runs.map((r, i) => `<div class="prr"><div class="row"><b class="grow">${t('rw.runN', { n: i + 1 })}</b><span class="num">${fmtT(r.time)}</span></div>${r.fb.map(f => `<div class="small muted">${t(f)}</div>`).join('')}</div>`).reverse().join('')}</div>` : ''}
   <div class="row" style="margin-top:12px"><button class="btn grow" data-close>${t('ui.back')}</button><button class="btn pri grow" id="toSvc">${t('rw.toService')}</button></div>`);
  $('#mc').querySelectorAll('[data-rset]').forEach(inp => inp.oninput = () => { W.setup[inp.dataset.rset] = +inp.value; inp.closest('.setrow').querySelector('.num').textContent = inp.value; });
  $('#shRun').onclick = () => {
    if (W.runs.length >= maxRuns) return;
    const st = genStage(ev, 777 + S.round, 4.2), me = W.crews[0];
    const tm = st.ref * basePf(me, st, { wet: false }) * setupPf(rallySetupQ(ev, W.setup)) * (1 + randn() * .006);
    W.runs.push({ time: tm, fb: rallyFeedback(ev, W.setup) }); rallyPreview();
  };
  $('#toSvc').onclick = () => openService(0);
}

/* ---------- service park ---------- */
function openService(n) {
  const W = RW, ev = W.ev, loop = n, budget = SERVICE_MIN[n], me = W.crews[0];
  const forced = n === 2 && me.sr;   // Super Rally: the car must be fully rebuilt overnight
  if (!W.svc || W.svc.n !== n) W.svc = { n, fix: { susp: forced ? 2 : 0, body: forced ? 2 : 0, engine: forced ? 2 : 0, gear: forced ? 2 : 0 }, tyre: suggestTyre(ev, W.fc[loop]), spares: W.spares, set: { ...W.setup } };
  const V = W.svc, mult = TIER_MULT[S.tier];
  const minOf = (k, lv) => W.dmg[k] * REPAIR_MIN[k] * [0, .5, 1][lv] * (1 - S.staff.pit * .05);
  const crOf = (k, lv) => Math.round(W.dmg[k] * REPAIR_CR[k] * mult * [0, .5, 1][lv] * (1 - S.staff.shop * .03) / 50) * 50;
  const setChanged = RSETUP.some(k => V.set[k] !== W.setup[k]);
  const used = DMG_KEYS.reduce((a, k) => a + minOf(k, V.fix[k]), 0) + (setChanged ? 5 : 0);
  const cr = DMG_KEYS.reduce((a, k) => a + crOf(k, V.fix[k]), 0), tyreCr = Math.round(500 * mult / 50) * 50 * (1 + V.spares);
  const over = forced ? 0 : Math.max(0, Math.ceil(used - budget)), pen = over * 10;
  const tooLate = over > 15;
  const fc = W.fc[loop], f = [];
  if (fc.rain > 0) f.push(t('rw.fcRain', { p: Math.round(fc.rain * 100) }));
  if (fc.snow > 0) f.push(t('rw.fcSnow', { p: Math.round(fc.snow * 100) }));
  const opts = tyreOptions(ev);
  rwSnapshot({ k: 'svc', n });
  modal(`${rallyHead()}
   <h2 class="sec">${t('svc.title', { m: budget })}${forced ? ' · Super Rally' : ''}</h2>
   <div class="small muted" style="margin:-4px 2px 8px">${forced ? t('svc.srInfo') : t('svc.info')}</div>
   <div class="card">${DMG_KEYS.map(k => `<div class="svcrow"><div class="row"><b class="grow">${t('rdmg.' + k)}</b><span class="tag" style="color:${condCol(W.dmg[k])}">${Math.round(W.dmg[k] * 100)}%</span></div>
     <div class="seg sm" data-fix="${k}">${[0, 1, 2].map(lv => `<button data-lv="${lv}" class="${V.fix[k] === lv ? 'on' : ''}" ${W.dmg[k] < .005 && lv ? 'disabled' : ''} ${forced && lv < 2 && W.dmg[k] >= .005 ? 'disabled' : ''}>${t('svc.lv' + lv)}${lv && W.dmg[k] >= .005 ? `<small>${minOf(k, lv).toFixed(0)}′ · ${money(crOf(k, lv))}</small>` : ''}</button>`).join('')}</div></div>`).join('')}
   </div>
   <h2 class="sec">${t('svc.next', { n: loop + 1 })}</h2>
   <div class="card wx"><b>${f.length ? f.join(' · ') : t('rw.fcDry')}</b><div class="small muted">${t('svc.stagesNext', { s: W.stages.filter(s => s.loop === loop).map(s => esc(s.name)).join(', ') })}</div></div>
   <label class="l">${t('svc.tyre')}</label>
   <div class="seg sm wrapseg" id="svTy">${opts.map(o => `<button data-ty="${o}" class="${V.tyre === o ? 'on' : ''}">${t('ty.' + o)}</button>`).join('')}</div>
   <div class="small muted" style="margin:4px 2px">${t('tyd.' + V.tyre)}</div>
   <label class="l">${t('svc.spares')}</label>
   <div class="seg sm" id="svSp">${[0, 1, 2].map(n2 => `<button data-sp="${n2}" class="${V.spares === n2 ? 'on' : ''}">${n2}</button>`).join('')}</div>
   <div class="small muted" style="margin:4px 2px">${t('svc.sparesInfo')}</div>
   <details class="card" style="margin-top:10px"><summary><b>${t('svc.setup')}</b> <span class="small muted">${t('svc.setupCost')}</span></summary>
    ${['ride', 'spring'].map(k => `<div class="setrow"><div class="row"><b class="grow">${t('rset.' + k)}</b><span class="num">${V.set[k]}</span></div><input type="range" min="1" max="9" value="${V.set[k]}" data-sset="${k}"><div class="row small muted"><span class="grow">${t('rset.' + k + '.lo')}</span><span>${t('rset.' + k + '.hi')}</span></div></div>`).join('')}
   </details>
   <div class="card" style="margin-top:10px">
    <div class="money-line"><span>${t('svc.time')}</span><b class="${over ? 'neg' : 'pos'}">${used.toFixed(0)} / ${forced ? '∞' : budget} ${t('u.min')}</b></div>
    ${over ? `<div class="money-line"><span>${t('svc.late')}</span><b class="neg">+${pen} s</b></div>` : ''}
    <div class="money-line"><span>${t('svc.cost')}</span><b>${money(cr)}</b></div>
    <div class="money-line"><span>${t('svc.tyreCost', { n: 4 + V.spares })}</span><b>${money(tyreCr)}</b></div>
    ${tooLate ? `<div class="small neg" style="margin-top:6px">${t('svc.tooLate')}</div>` : ''}
   </div>
   <button class="btn pri block" style="margin-top:12px" id="svGo" ${tooLate ? 'disabled' : ''}>${t('svc.go', { n: loop + 1 })}</button>${rwExitBtn()}`);
  rwBindExit();
  $('#mc').querySelectorAll('[data-fix]').forEach(sg => sg.onclick = e => { const b = e.target.closest('button'); if (!b || b.disabled) return; V.fix[sg.dataset.fix] = +b.dataset.lv; openService(n); });
  $('#svTy').onclick = e => { const b = e.target.closest('button'); if (b) { V.tyre = b.dataset.ty; openService(n); } };
  $('#svSp').onclick = e => { const b = e.target.closest('button'); if (b) { V.spares = +b.dataset.sp; openService(n); } };
  $('#mc').querySelectorAll('[data-sset]').forEach(inp => inp.onchange = () => { V.set[inp.dataset.sset] = +inp.value; openService(n); });
  $('#svGo').onclick = () => {
    DMG_KEYS.forEach(k => { W.dmg[k] = clamp(W.dmg[k] * (1 - [0, .5, 1][V.fix[k]]), 0, 1); });
    addMoney(-(cr + tyreCr)); W.repairCost += cr; W.tyreCost += tyreCr;
    if (pen) { me.pen += pen; toast(t('svc.penToast', { s: pen })); }
    W.tyre = V.tyre; W.spares = V.spares; W.wear = 0; W.flat = false; W.setup = { ...W.setup, ...V.set };
    if (forced) { me.sr = false; me.out = false; W.srUsed = true; }
    W.svc = null; W.loop = loop; save(); closeModal();
    nextRallyStage();
  };
}
function suggestTyre(ev, fc) {
  const best = bestTyres(ev, { frac: ev.mix }, fc.rain > .5)[0].ty;
  return best === 'GS' && ev.rough > .6 ? 'GH' : best;
}

/* ---------- running the stages ---------- */
function nextRallyStage() {
  const W = RW, si = W.si;
  if (si >= RALLY_STAGES) { finishRally(); return; }
  const me = W.crews[0];
  if (me.out) { simStageAI(si); afterStage(null); return; }   // out of the day (Super Rally) or the rally
  stageIntro(si);
}
function stageIntro(si) {
  const W = RW, sd = W.stages[si], loop = sd.loop, order = W.order[loop], p = order.indexOf('me_0') + 1;
  const st = genStage(W.ev, sd.seed, sd.km), wx = W.wx[loop];
  rwSnapshot({ k: 'next' });
  modal(`<h3>${t('rl.ssName', { n: si + 1, name: esc(sd.name) })}${sd.power ? ' <span class="tag a">Power Stage</span>' : ''}</h3>
   <div class="small muted">${sd.km.toFixed(1)} km · ${surfText(st.frac)}${sd.pass ? ' · ' + t('rl.pass2') : ''}</div>
   <div class="card wx" style="margin-top:10px"><b>${wxBadge(wx, W.ev)}</b><div class="small muted">${t('rl.tyreNow', { t: t('ty.' + W.tyre), n: W.spares })}</div></div>
   <div class="grid2" style="margin-top:10px">
    <div class="kpi"><small>${t('rl.startPosK')}</small><b>${p}/${order.length}</b><div class="small muted">${!sd.pass && ((st.frac.G || 0) + (st.frac.S || 0)) > .3 && p <= 3 ? t('rl.sweepNote') : '&nbsp;'}</div></div>
    <div class="kpi"><small>${t('rl.overall')}</small><b>${si ? 'P' + (overallOrder().findIndex(c => c.isMe) + 1) : '–'}</b><div class="small muted">${si ? fmtGapLeader() : '&nbsp;'}</div></div>
   </div>
   ${sd.power ? `<div class="small muted" style="margin-top:8px">${t('rl.powerInfo')}</div>` : ''}
   <div class="small muted" style="margin:10px 2px">${t('rl.howto')}</div>${keysHint()}
   <button class="btn pri block" id="ssGo">${t('rl.start')}</button>${rwExitBtn()}`);
  rwBindExit();
  $('#ssGo').onclick = () => { SND.unlock(); closeModal(); rwSnapshot({ k: 'run', si }); startStage(si); };
}
function overallOrder() {
  return RW.crews.filter(c => !c.dnf).slice().sort((a, b) => (a.out && !a.sr) - (b.out && !b.sr) || (a.total + a.pen) - (b.total + b.pen));
}
function fmtGapLeader() {
  const o = overallOrder(), me = o.find(c => c.isMe); if (!me) return '';
  return me === o[0] ? t('rl.leading') : fmtGap(me.total + me.pen - o[0].total - o[0].pen);
}
// stage without the player: only the AI times
function simStageAI(si) {
  const W = RW, sd = W.stages[si], st = genStage(W.ev, sd.seed, sd.km); st.rough = W.ev.rough;
  const wx = W.wx[sd.loop], order = W.order[sd.loop], n = order.length;
  W.crews.forEach(c => {
    if (c.isMe || c.out) { c.cur = null; return; }
    const p = order.indexOf(c.id), sweep = !sd.pass && p >= 0 ? 1 - p / Math.max(1, n - 1) : 0;
    c.cur = aiStageTime(c, st, { wet: wx.wet, snowfall: wx.snow, pass: sd.pass, sweep, ev: W.ev });
  });
}
function rallyStageDone(L) {
  const W = RW, me = W.crews[0];
  if (L.retired) {
    me.out = true;
    if (dayOf(L.sd.loop) === 0) { me.sr = true; rlNews('rl.srOut'); }
    else me.dnf = true;
  } else me.cur = { t: L.t, ev: '' };
  me.lastEvents = L.events;
  afterStage(L);
}
function afterStage(L) {
  const W = RW, si = W.si, sd = W.stages[si], day = dayOf(sd.loop);
  // AI retirements
  W.crews.forEach(c => { if (!c.isMe && c.cur && c.cur.ev === 'retire') { c.out = true; c.cur = null; if (day === 0 && Math.random() < .75) c.sr = true; else c.dnf = true; } });
  const fin = W.crews.filter(c => c.cur && !c.out);
  const best = fin.length ? Math.min(...fin.map(c => c.cur.t)) : 600;
  W.crews.forEach(c => {
    if (c.dnf && !c.cur) { c.times[si] = null; return; }
    if (c.cur && !c.out) { c.times[si] = c.cur.t; c.total += c.cur.t; }
    else if (c.sr) { c.times[si] = best + 600; c.total += best + 600; c.srStage = true; }   // Super Rally: 10 minutes per missed stage
    c.cur = null;
  });
  const stageRank = W.crews.filter(c => c.times[si] != null && !c.srStage).sort((a, b) => a.times[si] - b.times[si]);
  W.crews.forEach(c => { c.srStage = false; });
  if (stageRank[0] && stageRank[0].isMe) W.stageWins++;
  if (sd.power) W.ps = stageRank.filter(c => !c.dnf && !c.out).slice(0, 5).map(c => c.id);
  const lastOfLoop = si === RALLY_STAGES - 1 || W.stages[si + 1].loop !== sd.loop;
  W.si++;
  // evening: day 2 running order = reverse of the top 10, then the rest; restarting crews return
  if (lastOfLoop && sd.loop === 1) {
    W.crews.forEach(c => { if (!c.isMe && c.sr) { c.sr = false; c.out = false; } });
    const o = overallOrder().filter(c => !c.dnf), top = o.slice(0, 10).reverse(), rest = o.slice(10);
    W.order[2] = [...top, ...rest].map(c => c.id);
    if (!W.order[2].includes('me_0') && W.crews[0].sr) W.order[2].push('me_0');
  }
  showStageResult(si, stageRank, () => {
    if (W.si >= RALLY_STAGES) finishRally();
    else if (lastOfLoop) openService(sd.loop + 1);
    else if (W.crews[0].out) nextRallyStage();
    else roadSection();
  });
}
function rlNews(k) { toast(t(k)); }
function showStageResult(si, rank, next) {
  const W = RW, sd = W.stages[si], me = W.crews[0];
  const best = rank[0] ? rank[0].times[si] : 0;
  const row = (c, i, tm, ref) => `<div class="res ${c.isMe ? 'me' : ''}"><span class="p">${i + 1}</span><span><span class="dot" style="background:${c.color}"></span>${esc(c.driver)} ${natTag(c.nat)}${c.isRival ? ' <span class="tt r">RIV</span>' : ''}</span><span class="small muted">${i ? fmtGap(tm - ref) : ''}</span><b class="num">${fmtT(tm)}</b></div>`;
  const list = (arr, getT) => { const ref = arr[0] ? getT(arr[0]) : 0; const idx = arr.findIndex(c => c.isMe); const show = arr.slice(0, 6); if (idx >= 6) show.push(arr[idx]); return show.map(c => row(c, arr.indexOf(c), getT(c), ref)).join(''); };
  const ov = overallOrder().filter(c => !(c.out && !c.sr));
  const myStage = rank.findIndex(c => c.isMe);
  const evs = (me.lastEvents || []).reduce((a, k) => { a[k] = (a[k] || 0) + 1; return a; }, {});
  modal(`<h3>${t('rl.ssName', { n: si + 1, name: esc(sd.name) })}</h3>
   <div class="grid2" style="margin:8px 0">
    <div class="kpi" style="text-align:center"><small>${t('rl.stagePos')}</small><b class="bigpos">${me.dnf || me.out ? 'DNF' : 'P' + (myStage + 1)}</b><div class="small muted">${myStage >= 0 ? fmtT(me.times[si]) : ''}</div></div>
    <div class="kpi" style="text-align:center"><small>${t('rl.overall')}</small><b class="bigpos">${me.dnf ? 'DNF' : 'P' + (ov.findIndex(c => c.isMe) + 1)}</b><div class="small muted">${me.dnf ? '' : fmtGapLeader()}</div></div>
   </div>
   ${Object.keys(evs).length ? `<div class="small muted">${Object.entries(evs).map(([k, n]) => t('rlev.' + k) + (n > 1 ? ' ×' + n : '')).join(' · ')}</div>` : ''}
   ${me.sr && !me.dnf ? `<div class="card warn small" style="margin-top:8px">${t('rl.srInfo')}</div>` : ''}
   <h2 class="sec">${t('rl.stageRes')}</h2><div class="card">${list(rank, c => c.times[si])}</div>
   <h2 class="sec">${t('rl.overallRes')}</h2><div class="card">${list(ov, c => c.total + c.pen)}</div>
   ${!me.out ? `<h2 class="sec">${t('tele.dmg')}</h2><div class="card">${rallyTele(RW)}</div>` : ''}
   <button class="btn pri block" style="margin-top:12px" id="srNext">${t('ui.continue')}</button>`);
  $('#srNext').onclick = () => { closeModal(); next(); };
}
// road section between two stages of a loop: only the crew can work on the car
function roadSection() {
  const W = RW, d = W.dmg, canFix = DMG_KEYS.some(k => d[k] > .02) || (W.flat && W.spares > 0);
  rwSnapshot({ k: 'road' });
  modal(`<h3>${t('road.t')}</h3><p class="small muted">${t('road.p')}</p>
   <div class="card">${rallyTele(W)}<div class="small muted" style="margin-top:4px">${t('rl.tyreNow', { t: t('ty.' + W.tyre), n: W.spares })}${W.flat ? ' · <b class="neg">' + t('rl.flat') + '</b>' : ''}</div></div>
   <div class="row col" style="margin-top:12px">
    <button class="btn team" id="rdFix" ${canFix ? '' : 'disabled'}>${t('road.fix')}</button>
    <button class="btn pri" id="rdGo">${t('road.go')}</button>
   </div>${rwExitBtn()}`);
  rwBindExit();
  $('#rdFix').onclick = () => {
    ['susp', 'body'].forEach(k => { d[k] = Math.max(0, d[k] - .12 - S.drivers[1].cons / 1500); });
    if (W.flat && W.spares > 0) { W.flat = false; W.spares--; }
    toast(t('road.fixed')); closeModal(); nextRallyStage();
  };
  $('#rdGo').onclick = () => { closeModal(); nextRallyStage(); };
}

/* ---------- end of the rally ---------- */
function finishRally() {
  const W = RW;
  const cls = overallOrder().filter(c => !c.dnf && !c.out);
  const dnf = W.crews.filter(c => !cls.includes(c));
  S.rw = null;
  const res = applyRallyResult(cls, dnf, { type: 'rally', ps: W.ps || [], stageWins: W.stageWins, repairCost: W.repairCost + W.tyreCost, sr: W.srUsed, name: W.ev.id });
  RW = null; save();
  showRallyResult(res);
}
// shared by rally and rallycross: cls = classified crews in order, dnf = the rest
function applyRallyResult(cls, dnf, o) {
  const mult = TIER_MULT[S.tier];
  // driver points; team points = best crew of each team; Power Stage bonus
  const teamBest = {};
  cls.forEach((c, i) => {
    const p = POINTS[i] || 0;
    S.dpoints[c.id] = (S.dpoints[c.id] || 0) + p;
    if (!(c.team in teamBest)) { teamBest[c.team] = i; S.points[c.team] = (S.points[c.team] || 0) + p; }
  });
  (o.ps || []).forEach((id, i) => { const c = cls.find(x => x.id === id); if (!c) return; S.dpoints[id] = (S.dpoints[id] || 0) + POWER_PTS[i]; S.points[c.team] = (S.points[c.team] || 0) + POWER_PTS[i]; });
  const pos = cls.findIndex(c => c.isMe) + 1, best = pos || 99, rvC = cls.filter(c => c.isRival).map(c => cls.indexOf(c) + 1), rvBest = rvC.length ? Math.min(...rvC) : 99;
  const psPos = (o.ps || []).indexOf('me_0') + 1;
  const prize = Math.round((pos ? PRIZE[pos - 1] : PRIZE[FIELD - 1] * .5) * 1.6 * mult);
  let spBase = 0, spBonus = 0; const spLines = [];
  S.sponsors.forEach(s => {
    spBase += s.per;
    const ok = best < 99 && (s.goal.t === 'finish' || best <= s.goal.n);
    if (ok) spBonus += s.bonus;
    spLines.push((ok ? '+ ' : '– ') + s.name + ': ' + goalTxt(s.goal)); s.races--;
  });
  S.sponsors.filter(s => s.races <= 0).forEach(s => addNews('info', 'news.sponsorEnd', { n: s.name }));
  S.sponsors = S.sponsors.filter(s => s.races > 0);
  const sal = S.drivers[0].salary + S.drivers[1].salary, upk = upkeep(), repair = o.repairCost || 0;
  const net = prize + spBase + spBonus - sal - upk - repair;
  addMoney(net + repair);   // service repairs were paid on the spot
  const repD = best === 99 ? -1.5 : clamp((9 - best) * .45 + (best === 1 ? 2 : 0), -2, 6);
  S.rep = clamp(S.rep + repD, 0, 100);
  // morale (driver and co-driver share the result), training
  const exp = expectedPos();
  S.drivers.forEach(d => { const dm = best === 99 ? -4 : clamp((exp - best) * .9, -6, 6) + (best === 1 ? 4 : 0); d.morale = clamp(d.morale + dm + (60 - d.morale) * .08, 0, 100); });
  S.drivers.forEach((d, i) => {
    const ageF = d.age < 26 ? 1.3 : d.age > 32 ? .5 : 1, g = (.15 + S.staff.sim * .05) * ageF, tr = S.train[i];
    const key = tr === 'notes' ? 'skill' : tr === 'calm' ? 'cons' : tr;
    const gs = { skill: key === 'skill' ? 1.6 : .35, cons: key === 'cons' ? 1.6 : .4, wet: key === 'wet' ? 1.8 : .4 };
    d.skill = Math.min(Math.max(d.skill, d.pot), d.skill + g * gs.skill * (d.skill < d.pot ? 1 : 0));
    d.cons = Math.min(98, d.cons + g * gs.cons);
    d.wet = Math.min(99, Math.max(d.wet, Math.min(d.pot + 8, d.wet + g * gs.wet)));
  });
  S.field.forEach(f => { f.P += rnd(0, .35); f.H += rnd(0, .35); f.B += rnd(0, .3); f.drivers.forEach(d => { d.D = Math.min(98, d.D + rnd(0, .15)); d.W = Math.min(98, d.W + rnd(0, .15)); }); });
  S.results[S.round] = { pos: [pos || 99], dnf: [!pos] };
  if (best < rvBest) S.h2h.me++; else if (rvBest < best) S.h2h.rv++;
  const st = S.stats;
  st.starts++; st.points += (pos ? POINTS[pos - 1] || 0 : 0) + (psPos ? POWER_PTS[psPos - 1] : 0);
  if (best === 1) st.wins++; if (best <= 3) st.podiums++;
  if (!pos) { st.dnfs++; S.seasonDnf = true; }
  st.sw = (st.sw || 0) + (o.stageWins || 0);
  const done = [];
  S.dev.forEach(d => { d.left--; if (d.left <= 0) { S.parts[d.p] = Math.min(MAXLV, S.parts[d.p] + 1); done.push(d.p); addNews('money', 'news.devDone', { p: 'part.' + d.p, l: S.parts[d.p] }); } });
  S.dev = S.dev.filter(d => d.left > 0);
  if (S.feud > 0 && Math.random() < .25) S.feud--;
  const ach = [];
  if (pos) achieve('first_finish', ach);
  if (best <= 10) achieve('first_points', ach);
  if (best <= 3) achieve('first_podium', ach);
  if (best === 1) { achieve('first_win', ach); achieve(o.type === 'rx' ? 'rx_win' : 'rally_win', ach); }
  if (psPos === 1) achieve('power_stage', ach);
  if (o.sr && pos && pos <= 10) achieve('super_rally', ach);
  if (st.wins >= 10) achieve('ten_wins', ach);
  if (S.money >= 1e6) achieve('millionaire', ach);
  if (PARTS.every(p => S.parts[p] >= STAGES[3])) achieve('full_pro', ach);
  addNews(best === 99 ? 'bad' : best <= 3 ? 'win' : 'race', best === 99 ? 'news.dnf' : 'news.result', { tr: 'track.' + o.name, p: best, pts: POINTS[best - 1] || 0 });
  let interview = null;
  if (Math.random() < .4) interview = { q: best === 1 ? 'win' : !pos ? 'crash' : rvBest < best ? 'rival' : 'goals', y: 0 };
  const events = { interview, poach: maybePoach(), ach, done };
  S.round++;
  genOffers(); genMarket();
  return { cls, dnf, pos, best, psPos, prize, spBase, spBonus, spLines, sal, upk, repair, net, repD, rvBest, type: o.type, name: o.name, seasonOver: S.round >= DISC[S.disc].rounds, events, stageWins: o.stageWins || 0 };
}
function showRallyResult(r) {
  const best = r.best, podium = r.cls.slice(0, 3);
  const rows = r.cls.map((c, i) => `<div class="res ${c.isMe ? 'me' : ''}"><span class="p">${i + 1}</span><span><span class="dot" style="background:${c.color}"></span>#${c.num} ${esc(c.driver)} ${natTag(c.nat)} <span class="muted small">${esc(c.name)}</span>${c.isRival ? ' <span class="tt r">RIV</span>' : ''}</span><span class="small muted">${r.type === 'rally' && i ? fmtGap(c.total + c.pen - r.cls[0].total - r.cls[0].pen) : r.type === 'rally' ? fmtT(c.total + c.pen) : ''}</span><b class="num">${POINTS[i] || 0}</b></div>`).join('')
    + r.dnf.map(c => `<div class="res ${c.isMe ? 'me' : ''}"><span class="p">–</span><span><span class="dot" style="background:${c.color}"></span>#${c.num} ${esc(c.driver)}</span><span class="small muted">DNF</span><b class="num">0</b></div>`).join('');
  const line = (k, v, cls) => `<div class="money-line"><span>${k}</span><span class="${cls}">${cls === 'neg' ? '−' : '+'}${money(Math.abs(v))}</span></div>`;
  modal(`<h3>${best === 99 ? t('res.dnf') : best === 1 ? t('res.win') : best <= 3 ? t('res.podium') : t('res.finish')}</h3>
   <div class="small muted">${esc(t('track.' + r.name))}</div>
   <div class="podium">${[1, 0, 2].map(k => podium[k] ? `<div style="height:${[92, 70, 56][k]}px" class="${podium[k].isMe ? 'me' : ''}"><b class="h" style="font-size:20px">${k + 1}.</b>${esc(podium[k].driver)}</div>` : '').join('')}</div>
   <div class="grid2"><div class="kpi" style="text-align:center"><b>${r.pos ? 'P' + r.pos : 'DNF'}</b><div class="small muted">${esc(S.drivers[0].name)}</div></div>
    <div class="kpi" style="text-align:center"><b>${r.type === 'rally' ? (r.psPos ? 'PS ' + r.psPos + '. +' + POWER_PTS[r.psPos - 1] : '–') : '&nbsp;'}</b><div class="small muted">${r.type === 'rally' ? t('rres.ps', { n: r.stageWins }) : ''}</div></div></div>
   <div class="small muted" style="margin-top:8px">${t('res.rival', { r: esc(S.rival.name), p: r.rvBest === 99 ? 'DNF' : 'P' + r.rvBest, a: S.h2h.me, b: S.h2h.rv })}</div>
   <h2 class="sec">${t('res.money')}</h2>
   <div class="card">
    ${line(t('res.prize2'), r.prize, 'pos')}${line(t('res.spBase'), r.spBase, 'pos')}${line(t('res.spBonus'), r.spBonus, 'pos')}
    ${line(t('res.salary2'), r.sal, 'neg')}${line(t('res.upkeep'), r.upk, 'neg')}${r.repair ? line(t('rres.service'), r.repair, 'neg') : ''}
    <div class="money-line t"><span>${t('res.net')}</span><span class="${r.net >= 0 ? 'pos' : 'neg'}">${r.net >= 0 ? '+' : '−'}${money(Math.abs(r.net))}</span></div>
    ${r.spLines.length ? `<div class="small muted" style="margin-top:8px;line-height:1.6">${r.spLines.map(esc).join('<br>')}</div>` : ''}
    <div class="small muted" style="margin-top:6px">${t('res.rep')}: ${r.repD >= 0 ? '+' : ''}${r.repD.toFixed(1)} ★</div>
   </div>
   <h2 class="sec">${t('res.table')}</h2><div class="card">${rows}</div>
   <button class="btn pri block" style="margin-top:14px" id="cont">${t('ui.continue')}</button>`);
  $('#cont').onclick = () => {
    closeModal();
    if (checkBankrupt()) return;
    const ev = r.events, q = [];
    if (ev.done.length) toast(t('dev.doneToast', { p: ev.done.map(p => t('part.' + p)).join(', ') }));
    if (ev.ach.length) q.push(next => showAch(ev.ach, next));
    if (ev.poach) q.push(next => showPoach(ev.poach, next));
    if (ev.interview) q.push(next => showInterview(ev.interview, next));
    const end = () => { if (r.seasonOver) seasonEnd(); else { VIEW = 'home'; render(); } };
    VIEW = 'home'; render();
    runQueue(q, end);
  };
}
/* keyboard: Space = pause / resume, 1-4 = speed, B = BOX (circuit), J = joker (rallycross) */
const KEY_SPEEDS = { '1': '0.5', '2': '1', '3': '2', '4': '4' };
function bindKeys() {
  let lastSpeed = {};
  document.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test((e.target.tagName || ''))) return;
    const race = !$('#race').classList.contains('hidden') && R, rally = !$('#rally').classList.contains('hidden') && RL;
    if (!race && !rally) return;
    if (!$('#modal').classList.contains('hidden')) return;
    const seg = race ? '#rSpeed' : '#rlSpeed', cur = race ? R.speed : RL.speed, id = race ? 'race' : 'rally';
    const press = v => { const b = $(`${seg} button[data-s="${v}"]`); if (b) b.click(); };
    if (e.code === 'Space') { e.preventDefault(); if (cur > 0 && cur < 99) { lastSpeed[id] = cur; press('0'); } else if (cur === 0) press(String(lastSpeed[id] || raceSpeedPref())); }
    else if (KEY_SPEEDS[e.key]) { e.preventDefault(); press(KEY_SPEEDS[e.key]); }
    else if ((e.key === 'b' || e.key === 'B') && race) $('#rBox').click();
    else if ((e.key === 'j' || e.key === 'J') && rally && RL.kind === 'rx') $('#rlJoker').click();
  });
}
function bindRallyControls() {
  $('#rlSpeed').onclick = e => { const b = e.target.closest('button'); if (!b || !RL) return; RL.speed = +b.dataset.s; setSeg('#rlSpeed', 's', b.dataset.s); if (RL.speed > 0 && RL.speed < 99) { try { localStorage.setItem('boxutca_speed', b.dataset.s); } catch (x) { } } SND.unlock(); };
  $('#rlMode').onclick = e => { const b = e.target.closest('button'); if (!b || !RL) return; RL.mode = +b.dataset.m; setSeg('#rlMode', 'm', b.dataset.m); };
  $('#rlJoker').onclick = () => { if (RL && RL.kind === 'rx') rxJokerCall(); };
  $('#rlQuit').onclick = () => {
    if (!RL) return;
    modal(`<h3>${t('rl.skipT')}</h3><p>${t('rl.skipP')}</p><div class="row"><button class="btn grow" data-close>${t('ui.cancel')}</button><button class="btn pri grow" id="ok">${t('rl.skipOk')}</button></div>`);
    $('#ok').onclick = () => { closeModal(); if (RL) RL.speed = 99; };
  };
}
