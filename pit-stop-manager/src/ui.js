/* ===================== UI ===================== */
let VIEW = 'home', CHAMP_TAB = 'team';
function money(n) {
  const neg = n < 0; n = Math.abs(n);
  const s = n >= 1e6 ? (n / 1e6).toLocaleString(loc(), { maximumFractionDigits: 2 }) + ' M CR' : Math.round(n).toLocaleString(loc()) + ' CR';
  return (neg ? '−' : '') + s;
}
function toast(text) { const el = $('#toast'); el.textContent = text; el.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove('show'), 2400); }
function modal(html) { $('#mc').innerHTML = html; $('#modal').classList.remove('hidden'); $('#mc').scrollTop = 0; $('#mc').querySelectorAll('[data-close]').forEach(b => b.onclick = closeModal); }
function closeModal() { $('#modal').classList.add('hidden'); }
const tierName = (d, tr) => t('tier.' + d + '.' + tr);
const goalTxt = g => g.t === 'finish' ? t('goal.finish') : g.n === 1 ? t('goal.win') : g.n === 3 ? t('goal.podium') : t('goal.top', { n: g.n });
const stars = v => { const n = Math.round(clamp(v, 0, 100) / 20); return '★'.repeat(n) + '☆'.repeat(5 - n); };
const initials = n => esc(n.split(' ').map(w => w[0]).join('').slice(0, 3));
const curTrack = () => buildTrack(DISC[S.disc].pool, S.calendar[Math.min(S.round, S.calendar.length - 1)]);
const natTag = n => n ? `<span class="nat">${n}</span>` : '';

function staticTexts() {
  document.documentElement.lang = LANG;
  document.querySelectorAll('[data-t]').forEach(el => { el.textContent = t(el.dataset.t); });
}
function renderTop() {
  $('#top').classList.remove('hidden'); $('#nav').classList.remove('hidden');
  document.documentElement.style.setProperty('--team', S.color);
  const b = $('#tBadge'); b.textContent = S.num; b.style.color = S.color === '#f2f2f2' || S.color === '#f5c518' ? '#111' : '#fff';
  $('#tName').textContent = S.teamName;
  $('#tSeries').textContent = t('top.season', { n: S.season }) + ' · ' + tierName(S.disc, S.tier);
  const m = $('#tMoney'); m.textContent = money(S.money); m.classList.toggle('neg', S.money < 0);
  $('#tRep').textContent = '★ ' + Math.round(S.rep);
  document.querySelectorAll('.nav button').forEach(x => x.classList.toggle('on', x.dataset.v === VIEW));
}
function go(v) { VIEW = v; render(); window.scrollTo(0, 0); }
function render() {
  staticTexts();
  if (!S) { renderIntro(); return; }
  renderTop();
  $('#view').innerHTML = { home: vHome, garage: vGarage, team: vTeam, sponsors: vSponsors, champ: vChamp }[VIEW]();
  bindView();
}
function standTable(rows, limit, drivers) {
  const my = rows.map((r, i) => r.me ? i : -1).filter(i => i >= 0);
  let list = rows.map((r, i) => ({ ...r, i }));
  if (limit && rows.length > limit) { list = list.slice(0, limit); my.forEach(i => { if (i >= limit) list.push({ ...rows[i], i }); }); }
  const up = !drivers && S.tier < 3, down = !drivers && S.tier > 0;
  return `<table class="st">${list.map(r => `<tr class="${r.me ? 'me' : ''} ${up && r.i < PROMOTE ? 'zone-up' : ''} ${down && r.i >= rows.length - RELEGATE ? 'zone-down' : ''}"><td class="p">${r.i + 1}</td><td><span class="dot" style="background:${r.color}"></span>${esc(r.name)} ${drivers ? natTag(r.nat) + ` <span class="muted small">${esc(r.team)}</span>` : ''}${r.rival ? ' <span class="tt r">RIV</span>' : ''}</td><td class="pts">${r.pts}</td></tr>`).join('')}</table>`;
}
const statRow = (label, v, cls, max = 10, suffix = '') => `<div class="stat"><span class="muted">${label}</span><div class="bar ${cls}"><i style="width:${clamp(v / max, 0, 1) * 100}%"></i></div><span class="num">${Math.round(v)}${suffix}</span></div>`;
function trackChars(tr) {
  const corner = tr.c.reduce((a, b) => a + b, 0) / tr.N;
  const pw = clamp(1 - corner * 1.8, .2, 1), cn = clamp(corner * 2.2 + (1 - tr.ratio) * .6, 0, 1), wr = clamp(tr.wear / 1.4, 0, 1);
  return statRow(t('trk.power'), pw * 10, '') + statRow(t('trk.corner'), cn * 10, 'b') + statRow(t('trk.wear'), wr * 10, 'r') + statRow(t('trk.rain'), tr.rain * 100, 'w', 100, '%');
}

/* ---------- home ---------- */
function vHome() {
  if (isRally()) return vHomeWrap(rallyNextCard());
  const D = DISC[S.disc], tr = curTrack(), sp = isSpecial(S.disc, S.round) ? D.special : null;
  const laps = Math.round(D.laps(tr) * (sp ? sp.laps : 1));
  return vHomeWrap(`<div class="card next ${sp ? 'special' : ''}">
    <div class="tv ${tr.oval ? 'oval' : ''}">${trackSVG(tr.pool, tr.idx, 140, 100, '#e6e9ef', 5)}${sp ? `<span class="sptag">${t('sp.' + sp.kind)}</span>` : ''}</div>
    <div class="body">
      <div class="round">${t('home.round', { r: S.round + 1, n: D.rounds, laps })}</div>
      <div class="name">${esc(t('track.' + tr.id))}</div>
      <div class="small muted" style="margin-bottom:8px">${esc(t('trackd.' + tr.id))}${sp ? ' ' + t('sp.' + sp.kind + '.d', { p: sp.prize }) : ''}</div>
      ${trackChars(tr)}
      <button class="btn pri block" style="margin-top:12px" data-act="weekend">${t('home.start')}</button>
    </div>
  </div>`);
}
function rallyNextCard() {
  const ev = curEvent(), D = DISC.rally, rx = ev.type === 'rx';
  const thumb = rx ? rxSVG(ev, 140, 100) : stageThumb(ev);
  const mix = rx ? (ev.ice ? { N: 1 } : (() => { const tr = buildRx(ev), g = tr.grav.filter(Boolean).length / tr.N; return { A: 1 - g, G: g }; })()) : ev.mix;
  const bar = `<div class="ev-surf">${Object.entries(mix).filter(([k, v]) => v > .01).map(([k, v]) => `<i style="width:${v * 100}%;background:${SURF[k].col}"></i>`).join('')}</div><div class="small muted">${surfText(mix)}</div>`;
  return `<div class="card next">
    <div class="tv rl">${thumb}${rx ? '<span class="sptag">RX</span>' : ''}</div>
    <div class="body">
      <div class="round">${t('rw.round', { r: S.round + 1, n: D.rounds, k: rx ? 'Rallycross' : t('rw.ssN', { n: RALLY_STAGES }) })}</div>
      <div class="name">${esc(t('track.' + ev.id))}</div>
      <div class="small muted" style="margin-bottom:8px">${esc(t('trackd.' + ev.id))}</div>
      ${bar}
      ${rx ? statRow(t('rx.jokerS'), ev.joker.out * 50, 'b') + statRow(t('trk.rain'), ev.rain * 100, 'w', 100, '%')
           : statRow(t('rw.rough'), ev.rough * 10, 'r') + statRow(t('rw.jumps'), ev.jumps * 10, 'b') + statRow(t('trk.rain'), (ev.rain + ev.snow) * 100, 'w', 100, '%')}
      <button class="btn pri block" style="margin-top:12px" data-act="weekend">${rx ? t('rw.startRx') : t('rw.start')}</button>
    </div>
  </div>`;
}
function stageThumb(ev) {
  const st = genStage(ev, hashStr(ev.id) * 7 + 3, 9), w = 140, h = 100;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < st.N; i += 8) { x0 = Math.min(x0, st.x[i]); x1 = Math.max(x1, st.x[i]); y0 = Math.min(y0, st.y[i]); y1 = Math.max(y1, st.y[i]); }
  const s = Math.min((w - 12) / (x1 - x0 || 1), (h - 12) / (y1 - y0 || 1)), P = i => `${(6 + (st.x[i] - x0) * s).toFixed(1)} ${(6 + (st.y[i] - y0) * s).toFixed(1)}`;
  let d = ''; for (let i = 0; i < st.N; i += 6) d += (i ? 'L' : 'M') + P(i);
  return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg"><path d="${d}" fill="none" stroke="#000" stroke-opacity=".35" stroke-width="6" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="#e6e9ef" stroke-width="3.5" stroke-linejoin="round"/><circle cx="${P(0).split(' ')[0]}" cy="${P(0).split(' ')[1]}" r="4" fill="#2fbf71"/><circle cx="${P(st.N - 1).split(' ')[0]}" cy="${P(st.N - 1).split(' ')[1]}" r="4" fill="#ffb21e"/></svg>`;
}
function vHomeWrap(card) {
  const rows = teamStandings(), pos = rows.findIndex(r => r.me) + 1;
  const cs = carStats(S.parts, S.staff.eng, S.rule);
  const fieldAvg = S.field.reduce((a, f) => a + (f.P + f.H + f.B) / 3, 0) / S.field.length;
  return `<div class="cols"><div>
  <h2 class="sec">${isRally() ? t('rw.next') : t('home.next')}</h2>
  ${card}
  <div class="grid2" style="margin-top:10px">
    <div class="kpi"><small>${t('kpi.pos')}</small><b>${t('kpi.posV', { n: pos })}</b><div class="small muted">${t('kpi.pts', { n: S.points.me || 0 })}</div></div>
    <div class="kpi"><small>${t('kpi.car')}</small><b class="${cs.ovr >= fieldAvg ? 'pos' : 'neg'}">${cs.ovr >= fieldAvg ? '+' : ''}${(cs.ovr - fieldAvg).toFixed(1)}</b><div class="small muted">${t('kpi.carSub')}</div></div>
    <div class="kpi"><small>${t('kpi.cost')}</small><b>${money(perRaceCost())}</b><div class="small muted">${t('kpi.costSub')}</div></div>
    <div class="kpi"><small>${t('kpi.spon')}</small><b class="pos">${money(S.sponsors.reduce((a, s) => a + s.per, 0))}</b><div class="small muted">${t('kpi.sponSub', { n: S.sponsors.length, m: slots() })}</div></div>
  </div>
  ${S.rule !== 'none' ? `<div class="card rule"><b>${t('home.rule')}: ${t('rule.' + S.rule)}</b><div class="small muted">${t('rule.' + S.rule + '.d')}</div></div>` : ''}
  <div class="card rival"><div class="row"><span class="dot" style="background:${S.rival.color}"></span><b class="grow">${t('home.rival')}: ${esc(S.rival.name)}</b><span class="tag ${S.h2h.me >= S.h2h.rv ? 'g' : 'r'}">${S.h2h.me}–${S.h2h.rv}</span></div><div class="small muted">${t('home.rivalInfo')}${S.feud ? ' ' + t('home.feud', { n: S.feud }) : ''}</div></div>
  ${S.money < 0 ? `<div class="card warn"><b class="neg">${t('home.negT')}</b><div class="small muted">${t('home.negP', { m: money(-30000 * TIER_MULT[S.tier]) })}</div></div>` : ''}
  </div><div>
  <h2 class="sec">${t('home.champ', { s: tierName(S.disc, S.tier) })}</h2>
  <div class="card">${standTable(rows, 5)}<div class="small muted" style="margin-top:8px">${S.tier < 3 ? t('home.promo', { n: PROMOTE }) : t('home.top')}${S.tier > 0 ? ' ' + t('home.releg', { n: RELEGATE }) : ''}</div></div>
  <h2 class="sec">${t('home.news')}</h2>
  <div class="card"><ul class="news">${S.news.map(n => `<li><span class="nd ${esc(n.e)}"></span><span>${esc(newsText(n))}</span></li>`).join('')}</ul></div>
  <h2 class="sec">${t('home.settings')}</h2>
  <div class="card">
    <div class="row" style="margin-bottom:12px"><span class="grow">${t('set.lang')}</span>${langSelect()}</div>
    <div class="row" style="margin-bottom:12px"><span class="grow">${t('set.sound')}</span><button class="btn sm" data-act="sound">${SND.on ? t('set.on') : t('set.off')}</button></div>
    <div class="small muted" style="margin-bottom:10px">${t('set.saveInfo')}</div>
    <div class="row wrap"><button class="btn sm" data-act="export">${t('set.export')}</button><button class="btn sm" data-act="import">${t('set.import')}</button><span class="grow"></span><button class="btn sm danger-t" data-act="reset">${t('set.reset')}</button></div>
    <div class="small muted" style="margin-top:10px">v${VERSION}</div>
  </div>
  </div></div>`;
}
function newsText(n) {
  const p = { ...n.p };
  for (const k in p) if (typeof p[k] === 'string' && /^(tier|track|disc|part|rule)\./.test(p[k])) p[k] = t(p[k]);
  return t(n.k, p);
}
function langSelect() { return `<select class="sel" data-act-lang>${Object.keys(I18N).map(l => `<option value="${l}" ${l === LANG ? 'selected' : ''}>${I18N[l]._name}</option>`).join('')}</select>`; }

/* ---------- garage ---------- */
function vGarage() {
  const cs = carStats(S.parts, S.staff.eng, S.rule);
  const best = Math.max(...S.field.map(f => (f.P + f.H + f.B) / 3));
  const free = devSlots() - S.dev.length;
  return `<div class="cols"><div>
  <h2 class="sec">${t('nav.garage')}</h2>
  <div class="garage">${carSideSVG({ kind: carKind(S.disc, S.tier), color: S.color, num: S.num, parts: S.parts, sponsor: S.sponsors[0], team: S.teamName })}</div>
  <div class="card" style="margin-top:10px">
    ${statRow(t('car.P'), cs.P, '', 100)}${statRow(t('car.H'), cs.H, 'b', 100)}${statRow(t('car.B'), cs.B, 'r', 100)}${statRow(t('car.rel'), cs.rel, 'g', 100)}
    <div class="small muted" style="margin-top:6px">${t('car.ovr', { v: cs.ovr.toFixed(1), b: best.toFixed(0) })}</div>
  </div>
  <div class="card"><b>${t('dev.title')}</b> <span class="tag ${free > 0 ? 'g' : 'r'}">${S.dev.length}/${devSlots()}</span><div class="small muted" style="margin-top:4px">${t('dev.info')}</div>
  ${S.dev.length ? `<div style="margin-top:8px">${S.dev.map(d => `<div class="money-line"><span>${t('part.' + d.p)} → ${t('ui.lvl', { l: S.parts[d.p] + 1 })}</span><b>${t('dev.left', { n: d.left })}</b></div>`).join('')}</div>` : ''}</div>
  </div><div>
  <h2 class="sec">${t('garage.parts')}</h2>
  ${PARTS.map(id => {
    const l = S.parts[id], max = l >= MAXLV, st = stageOf(l), dv = inDev(id);
    const c = max ? 0 : partCost(l, id), dt = max ? 0 : devTime(l), rush = Math.round(c * 1.6 / 50) * 50;
    let act;
    if (max) act = `<button class="btn sm" disabled>MAX</button>`;
    else if (dv) act = `<span class="tag a">${t('dev.building', { n: dv.left })}</span>`;
    else act = `<button class="btn sm team" data-up="${id}" ${free <= 0 || S.money < c ? 'disabled' : ''}>${money(c)} · ${t('dev.races', { n: dt })}</button>${dt > 1 ? `<button class="btn sm" data-rush="${id}" ${free <= 0 || S.money < rush ? 'disabled' : ''}>${t('dev.rush')} ${money(rush)}</button>` : ''}`;
    return `<div class="card part2"><div class="art st${st}">${partArt(id, l)}<span class="stg">${t('stage.' + st)}</span></div><div class="pinfo">
      <div class="row"><span class="nm">${t('part.' + id)}</span><span class="lv">${t('ui.level', { l, m: MAXLV })}</span></div>
      <div class="ds">${t('partd.' + id)}</div>
      <div class="pips">${Array.from({ length: MAXLV }, (_, i) => `<i class="${i < l ? 'on' : ''} ${STAGES.includes(i + 1) ? 'mk' : ''}"></i>`).join('')}</div>
      <div class="small muted" style="margin-top:6px">${max || dv ? '' : (STAGES.includes(l + 1) ? t('garage.nextStage', { s: t('stage.' + (st + 1)) }) : '')}</div>
      <div class="row wrap acts">${act}</div></div></div>`;
  }).join('')}</div></div>`;
}

/* ---------- team ---------- */
function driverCard(d, i) {
  const ml = moraleLabel(d.morale), co = d.role === 'co', tr = co ? CO_TRAIN : TRAIN;
  const stats = co ? statRow(t('drv.notes'), d.skill, '', 100) + statRow(t('drv.calm'), d.cons, 'g', 100)
    : statRow(t('drv.skill'), d.skill, '', 100) + statRow(t('drv.cons'), d.cons, 'g', 100) + statRow(isRally() ? t('drv.slip') : t('drv.wet'), d.wet, 'w', 100);
  return `<div class="card"><div class="drv">${helmetSVG(d)}<div>
    <div class="h" style="font-size:21px;font-weight:700">${co ? `<span class="tag a">${t('team.co')}</span>` : '#' + (i ? S.num2 : S.num)} ${esc(d.name)} ${natTag(d.nat)}</div>
    <div class="small muted">${t('team.age', { n: d.age })} · ${money(d.salary)}${t('u.perRace')} · ${t('team.contract', { n: d.contract })} · ${t('team.pot')} <span class="stars">${stars(d.pot)}</span></div></div></div>
    <div style="margin-top:10px">${stats}${statRow(t('drv.morale'), d.morale, 'm ' + ml, 100)}</div>
    <div class="small muted" style="margin:2px 0 8px">${t('morale.' + ml)}${co ? ' ' + t('team.coInfo') : ''}</div>
    <div class="seg" data-trainseg="${i}">${tr.map(k => `<button data-tr="${k}" data-seat="${i}" class="${S.train[i] === k ? 'on' : ''}">${t(isRally() && k === 'wet' ? 'train.slip' : 'train.' + k)}</button>`).join('')}</div>
  </div>`;
}
function vTeam() {
  return `<div class="cols"><div>
  <h2 class="sec">${isRally() ? t('team.crew') : t('team.drivers')}</h2>
  ${S.drivers.map(driverCard).join('')}
  <div class="small muted" style="margin:6px 2px">${t('team.trainInfo')}</div>
  <h2 class="sec">${t('team.staff')}</h2>
  ${STAFF.map(id => {
    const l = S.staff[id], c = staffCost(l), max = l >= STAFF_MAX;
    return `<div class="card part"><div class="ico">${ICONS[id]}</div><div>
    <div class="row"><span class="nm">${t('staff.' + id)}</span><span class="lv">${l}/${STAFF_MAX}</span></div>
    <div class="ds">${t('staffd.' + id)} · ${t('team.upkeep', { m: money(staffUpkeep(l)) })}</div>
    <div class="pips">${Array.from({ length: STAFF_MAX }, (_, i) => `<i class="${i < l ? 'on' : ''}"></i>`).join('')}</div></div>
    <button class="btn sm ${max ? '' : 'team'}" data-staff="${id}" ${max || S.money < c ? 'disabled' : ''}>${max ? 'MAX' : money(c)}</button></div>`;
  }).join('')}
  </div><div>
  <h2 class="sec">${t('team.market')}</h2>
  <div class="small muted" style="margin:-2px 2px 8px">${t('team.marketInfo')}</div>
  ${S.market.map((m, i) => {
    const locked = S.rep < m.minRep;
    return `<div class="card drv mk">${helmetSVG(m, 52)}
    <div><b>${esc(m.name)}</b> ${natTag(m.nat)} ${m.role === 'co' ? `<span class="tag a">${t('team.co')}</span>` : ''} <span class="small muted">${t('team.age', { n: m.age })}</span>
      <div class="small">${m.role === 'co' ? `${t('drv.notesS')} <b>${m.skill}</b> · ${t('drv.calmS')} <b>${m.cons}</b>` : `${t('drv.skillS')} <b>${m.skill}</b> · ${t('drv.consS')} <b>${m.cons}</b> · ${t('drv.wetS')} <b>${m.wet}</b>`}</div>
      <div class="small muted">${money(m.salary)}${t('u.perRace')} · <span class="stars">${stars(m.pot)}</span></div></div>
    <div style="text-align:right">${locked ? `<span class="tag r">★ ${m.minRep}</span>` : `<button class="btn sm team" data-sign="${i}">${t('team.offer')}</button><div class="small muted" style="margin-top:3px">${t('team.from', { m: money(feeFor(m, 1)) })}</div>`}</div></div>`;
  }).join('')}</div></div>`;
}

/* ---------- sponsors ---------- */
function vSponsors() {
  const free = slots() - S.sponsors.length;
  return `<div class="cols"><div>
  <h2 class="sec">${t('sp.active', { n: S.sponsors.length, m: slots() })}</h2>
  ${S.sponsors.length ? S.sponsors.map((s, i) => `<div class="card spn"><div class="logo" style="background:${s.color}">${initials(s.name)}</div>
    <div><b>${esc(s.name)}</b>${i === 0 ? ` <span class="tag a">${t('sp.main')}</span>` : ''}
      <div class="small">${money(s.per)}${t('u.perRace')} · ${t('sp.goal')}: <b>${goalTxt(s.goal)}</b> → +${money(s.bonus)}</div>
      <div class="small muted">${t('sp.left', { n: s.races })}</div></div>
    <button class="btn sm" data-drop="${i}">${t('sp.drop')}</button></div>`).join('') : `<div class="card small muted">${t('sp.none')}</div>`}
  <div class="small muted" style="margin:8px 2px">${t('sp.slotsInfo')}</div>
  </div><div>
  <h2 class="sec">${t('sp.offers')}</h2>
  ${S.offers.map((o, i) => `<div class="card spn"><div class="logo" style="background:${o.color}">${initials(o.name)}</div>
    <div><b>${esc(o.name)}</b>
      <div class="small">${money(o.per)}${t('u.perRace')} · ${t('sp.races', { n: o.races })}</div>
      <div class="small">${t('sp.goal')}: <b>${goalTxt(o.goal)}</b> → +${money(o.bonus)} · ${t('sp.sign', { m: money(o.sign) })}</div></div>
    <button class="btn sm green" data-offer="${i}" ${free <= 0 ? 'disabled' : ''}>${t('sp.signBtn')}</button></div>`).join('') || `<div class="card small muted">${t('sp.noOffers')}</div>`}
  </div></div>`;
}

/* ---------- championship, stats, achievements, hall of fame ---------- */
function vChamp() {
  const D = DISC[S.disc], pool = D.pool;
  const badge = (p, dnf) => dnf ? '<span class="tag r">DNF</span>' : `<span class="tag ${p <= 3 ? 'a' : p <= 10 ? 'g' : ''}">P${p}</span>`;
  const st = S.stats;
  return `<div class="cols"><div>
  <h2 class="sec">${t('top.season', { n: S.season })} · ${esc(tierName(S.disc, S.tier))}</h2>
  <div class="seg" id="champTab"><button data-tab="team" class="${CHAMP_TAB === 'team' ? 'on' : ''}">${t('champ.teams')}</button><button data-tab="drivers" class="${CHAMP_TAB === 'drivers' ? 'on' : ''}">${t('champ.drivers')}</button></div>
  <div class="card" style="margin-top:8px">${CHAMP_TAB === 'team' ? standTable(teamStandings()) : standTable(driverStandings(), 0, true)}</div>
  <h2 class="sec">${t('champ.cal')}</h2>
  <div class="card">${S.calendar.map((ti, i) => {
    if (isRally()) return rallyCalRow(ti, i, badge);
    const tr = buildTrack(pool, ti), r = S.results[i], sp = isSpecial(S.disc, i);
    const res = r ? r.pos.map((p, k) => badge(p, r.dnf[k])).join(' ') : i === S.round ? `<span class="tag a">${t('champ.next')}</span>` : '';
    const laps = Math.round(D.laps(tr) * (sp ? D.special.laps : 1));
    return `<div class="cal ${i === S.round ? 'cur' : ''}">${trackSVG(pool, ti, 52, 40, '#cfd4dc', 3)}<div><b>${esc(t('track.' + tr.id))}</b>${sp ? ` <span class="tag a">${t('sp.' + D.special.kind)}</span>` : ''}<div class="small muted">${t('champ.laps', { n: laps })} · ${t('trk.rain')} ${Math.round(tr.rain * 100)}%</div></div><div class="cres">${res}</div></div>`;
  }).join('')}</div>
  </div><div>
  <h2 class="sec">${t('champ.stats')}</h2>
  <div class="card statgrid">${[['starts', st.starts], ['wins', st.wins], ['podiums', st.podiums], isRally() || st.sw ? ['sw', st.sw || 0] : ['poles', st.poles], ['points', st.points], ['laps', st.laps], ['dnfs', st.dnfs], ['titles', S.titles]].map(([k, v]) => `<div><b>${v}</b><small>${t('stat.' + k)}</small></div>`).join('')}</div>
  <h2 class="sec">${t('champ.ach')} · ${Object.keys(S.ach).length}/${ACHIEVEMENTS.length}</h2>
  <div class="card achgrid">${ACHIEVEMENTS.map(k => `<div class="ach ${S.ach[k] ? 'on' : ''}"><b>${t('ach.' + k)}</b><small>${t('ach.' + k + '.d')}</small></div>`).join('')}</div>
  <h2 class="sec">${t('champ.hof')}</h2>
  <div class="card">${S.history.length ? S.history.map(h => `<div class="money-line"><span>${t('top.season', { n: h.season })} · ${esc(h.label || tierName(h.disc, h.tier))}<br><span class="small muted">${t('champ.champion')}: ${esc(h.champ || '–')}</span></span><b>${t('kpi.posV', { n: h.pos })} ${h.move ? t('move.' + h.move) : ''}</b></div>`).join('') : `<div class="small muted">${t('champ.first')}</div>`}</div>
  </div></div>`;
}

function rallyCalRow(ti, i, badge) {
  const ev = RALLY_POOL[ti], r = S.results[i], rx = ev.type === 'rx';
  const res = r ? r.pos.map((p, k) => badge(p, r.dnf[k])).join(' ') : i === S.round ? `<span class="tag a">${t('champ.next')}</span>` : '';
  return `<div class="cal ${i === S.round ? 'cur' : ''}"><div class="ev-ico">${rx ? 'RX' : Object.keys(ev.mix).map(k => `<i style="background:${SURF[k].col}"></i>`).join('')}</div><div><b>${esc(t('track.' + ev.id))}</b>${rx ? ' <span class="tag a">RX</span>' : ''}<div class="small muted">${rx ? t('rx.short') : t('rw.ssN', { n: RALLY_STAGES }) + ' · ' + surfText(ev.mix)}</div></div><div class="cres">${res}</div></div>`;
}

/* ---------- actions ---------- */
function orderPart(id, rush) {
  const l = S.parts[id], c = rush ? Math.round(partCost(l, id) * 1.6 / 50) * 50 : partCost(l, id);
  if (S.money < c || S.dev.length >= devSlots() || inDev(id) || l >= MAXLV) return false;
  addMoney(-c); S.dev.push({ p: id, left: rush ? 1 : devTime(l) }); save(); return true;
}
function bindView() {
  const v = $('#view');
  v.querySelectorAll('[data-act]').forEach(b => b.onclick = () => ({ weekend: isRally() ? openRallyWeekend : openWeekend, export: openExport, import: openImport, reset: confirmReset, sound: () => { SND.toggle(); render(); } }[b.dataset.act])());
  const ls = v.querySelector('[data-act-lang]'); if (ls) ls.onchange = () => setLang(ls.value);
  v.querySelectorAll('[data-up],[data-rush]').forEach(b => b.onclick = () => {
    const id = b.dataset.up || b.dataset.rush;
    if (orderPart(id, !!b.dataset.rush)) { toast(t('dev.ordered', { p: t('part.' + id), n: inDev(id).left })); render(); }
  });
  v.querySelectorAll('[data-staff]').forEach(b => b.onclick = () => {
    const id = b.dataset.staff, c = staffCost(S.staff[id]); if (S.money < c) return;
    addMoney(-c); S.staff[id]++; save(); toast(t('team.staffToast', { s: t('staff.' + id) })); render();
  });
  v.querySelectorAll('[data-tr]').forEach(b => b.onclick = () => { S.train[+b.dataset.seat] = b.dataset.tr; save(); render(); });
  v.querySelectorAll('#champTab button').forEach(b => b.onclick = () => { CHAMP_TAB = b.dataset.tab; render(); });
  v.querySelectorAll('[data-sign]').forEach(b => b.onclick = () => openSign(+b.dataset.sign));
  v.querySelectorAll('[data-offer]').forEach(b => b.onclick = () => {
    if (S.sponsors.length >= slots()) return;
    const o = S.offers.splice(+b.dataset.offer, 1)[0]; addMoney(o.sign); S.sponsors.push(o);
    addNews('money', 'news.sponsor', { n: o.name, m: money(o.per) }); save(); toast(t('sp.signedToast', { n: o.name, m: money(o.sign) })); render();
  });
  v.querySelectorAll('[data-drop]').forEach(b => b.onclick = () => {
    const s = S.sponsors[+b.dataset.drop], pen = s.per * 2;
    modal(`<h3>${t('sp.dropT')}</h3><p>${t('sp.dropP', { n: esc(s.name), m: money(pen) })}</p><div class="row"><button class="btn grow" data-close>${t('ui.cancel')}</button><button class="btn grow danger" id="ok">${t('sp.drop')}</button></div>`);
    $('#ok').onclick = () => { addMoney(-pen); S.sponsors.splice(+b.dataset.drop, 1); save(); closeModal(); render(); };
  });
}
function openSign(mi) {
  const m = S.market[mi], seats = [0, 1].filter(i => (S.drivers[i].role === 'co') === (m.role === 'co'));
  let seat = seats.length === 1 ? seats[0] : S.drivers[0].skill <= S.drivers[1].skill ? 0 : 1, years = 2;
  const draw = () => {
    const fee = feeFor(m, years);
    modal(`<h3>${t('team.signT')}</h3><p>${t('team.signP', { n: esc(m.name), a: m.age, s: m.skill, c: m.cons, w: m.wet, sal: money(m.salary) })}</p>
    <label class="l">${t('team.replace')}</label><div class="seg" id="sgSeat">${seats.map(i => { const d = S.drivers[i]; return `<button data-v="${i}" class="${seat === i ? 'on' : ''}">${d.role === 'co' ? t('team.co') : '#' + (i ? S.num2 : S.num)} ${esc(lastName(d.name))} (${Math.round(d.skill)})</button>`; }).join('')}</div>
    <label class="l">${t('team.length')}</label><div class="seg" id="sgYears">${[1, 2, 3].map(y => `<button data-v="${y}" class="${years === y ? 'on' : ''}">${t('team.years', { n: y })}</button>`).join('')}</div>
    <div class="money-line t" style="margin-top:14px"><span>${t('team.fee')}</span><b>${money(fee)}</b></div>
    <div class="small muted" style="margin-bottom:12px">${t('team.signLeave', { n: esc(S.drivers[seat].name) })}</div>
    <div class="row"><button class="btn grow" data-close>${t('ui.cancel')}</button><button class="btn team grow" id="ok" ${S.money < fee ? 'disabled' : ''}>${t('sp.signBtn')}</button></div>`);
    $('#sgSeat').onclick = e => { const b = e.target.closest('button'); if (b) { seat = +b.dataset.v; draw(); } };
    $('#sgYears').onclick = e => { const b = e.target.closest('button'); if (b) { years = +b.dataset.v; draw(); } };
    $('#ok').onclick = () => {
      if (S.money < fee) return; addMoney(-fee);
      addNews('driver', 'news.newDriver', { n: m.name, o: S.drivers[seat].name });
      m.contract = years; m.morale = 65; S.drivers[seat] = m; S.market.splice(mi, 1); save(); closeModal(); render(); toast(t('team.signed'));
    };
  };
  draw();
}
document.querySelectorAll('.nav button').forEach(b => b.onclick = () => go(b.dataset.v));

function openExport() {
  let code = ''; try { code = seal(S); } catch (e) { }
  modal(`<h3>${t('set.export')}</h3><p class="small muted">${t('set.exportP')}</p><textarea id="code" readonly>${code}</textarea><div class="row" style="margin-top:10px"><button class="btn grow" data-close>${t('ui.close')}</button><button class="btn pri grow" id="cp">${t('ui.copy')}</button></div>`);
  $('#cp').onclick = async () => { try { await navigator.clipboard.writeText(code); toast(t('ui.copied')); } catch (e) { $('#code').select(); toast(t('ui.copyManual')); } };
}
function openImport() {
  modal(`<h3>${t('set.import')}</h3><textarea id="code" placeholder="${t('set.importPh')}"></textarea><div class="row" style="margin-top:10px"><button class="btn grow" data-close>${t('ui.cancel')}</button><button class="btn pri grow" id="ld">${t('set.load')}</button></div>`);
  $('#ld').onclick = () => { const o = unseal($('#code').value); if (!o) { toast(t('set.badCode')); return; } S = o; save(); closeModal(); VIEW = 'home'; render(); toast(t('set.loaded')); };
}
function confirmReset() {
  modal(`<h3>${t('set.resetT')}</h3><p>${t('set.resetP')}</p><div class="row"><button class="btn grow" data-close>${t('ui.cancel')}</button><button class="btn grow danger" id="ok">${t('set.resetOk')}</button></div>`);
  $('#ok').onclick = () => { S = null; try { localStorage.removeItem(SAVE_KEY); } catch (e) { } closeModal(); render(); };
}

/* ---------- intro ---------- */
const INTRO = { color: '#e8392f', disc: 'road' };
const DEMO_PARTS = { engine: 12, gearbox: 10, aero: 12, chassis: 10, brakes: 12, tires: 14 };
function renderIntro() {
  $('#top').classList.add('hidden'); $('#nav').classList.add('hidden');
  $('#view').innerHTML = `<div class="intro">
    <div class="row"><p class="logo-title grow">PIT STOP<span>MANAGER</span></p>${langSelect()}</div>
    <div class="muted" style="margin:6px 0 14px">${t('intro.sub')}</div>
    <div class="garage" id="introCar"></div>
    <div class="cols"><div>
    <label class="l">${t('intro.team')}</label><input type="text" id="iName" maxlength="26" value="${esc(INTRO.name ?? t('intro.defTeam'))}">
    <label class="l">${t('intro.color')}</label><div class="swatches" id="iCol">${TEAM_COLORS.map(c => `<button style="background:${c}" data-c="${c}" class="${c === INTRO.color ? 'on' : ''}" aria-label="${c}"></button>`).join('')}</div>
    <label class="l">${t('intro.num')}</label><input type="number" id="iNum" min="1" max="99" value="7">
    </div><div>
    <label class="l">${t('intro.series')}</label>
    <div class="disc" id="iDisc">${DISC_KEYS.map(d => `<button data-d="${d}" class="${INTRO.disc === d ? 'on' : ''}">${carSideSVG({ kind: carKind(d, 0), color: '#8d96a8', num: '', parts: DEMO_PARTS, bg: false })}<div><b>${t('disc.' + d)}</b><small>${t('disc.' + d + '.d')}</small></div></button>`).join('')}</div>
    </div></div>
    <button class="btn pri block" style="margin:18px 0 30px;padding:15px;font-size:17px" id="iGo">${t('intro.go')}</button>
  </div>`;
  const ls = $('#view [data-act-lang]'); ls.onchange = () => setLang(ls.value);
  const upd = () => { const n = clamp(parseInt($('#iNum').value) || 7, 1, 99); $('#introCar').innerHTML = carSideSVG({ kind: carKind(INTRO.disc, 0), color: INTRO.color, num: n, parts: DEMO_PARTS, team: $('#iName').value }); };
  upd();
  $('#iCol').querySelectorAll('button').forEach(b => b.onclick = () => { INTRO.color = b.dataset.c; $('#iCol').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); upd(); });
  $('#iDisc').querySelectorAll('button').forEach(b => b.onclick = () => { INTRO.disc = b.dataset.d; $('#iDisc').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); upd(); });
  $('#iNum').oninput = upd; $('#iName').oninput = () => { INTRO.name = $('#iName').value; upd(); };
  $('#iGo').onclick = () => {
    const name = $('#iName').value.trim() || t('intro.defTeam'), n = clamp(parseInt($('#iNum').value) || 7, 1, 99);
    newGame(name, INTRO.color, n, INTRO.disc); VIEW = 'home'; render();
    modal(`<h3>${t('welcome.t')}</h3><p>${t('welcome.p', { s: esc(tierName(S.disc, 0)), r: esc(S.rival.name) })}</p><ul class="small welcome">${[1, 2, 3, 4, 5, 6, 7].map(i => `<li>${t('welcome.' + i)}</li>`).join('')}</ul><button class="btn pri block" data-close>${t('welcome.go')}</button>`);
  };
}

/* ---------- race weekend: practice -> qualifying -> race ---------- */
function weekendHead(W) {
  const D = DISC[S.disc];
  const wk = W.wx.rain ? (W.wx.rain === 1 ? 'wet' : 'damp') : 'dry';
  const wxTxt = W.delay ? t('wk.ovalDelay') : W.wx.rain ? (W.wx.rain === 1 ? t('wk.heavyRain') : t('wk.lightRain')) : t('wk.dry');
  return `<h3>${esc(t('track.' + W.tr.id))}${W.special ? ` <span class="tag a">${t('sp.' + W.special.kind)}</span>` : ''}</h3>
   <div class="small muted">${t('home.round', { r: S.round + 1, n: D.rounds, laps: W.laps })}</div>
   <div class="card wx" style="margin-top:12px"><b><i class="wxd ${wk}"></i>${wxTxt}</b><div class="small muted">${t('wk.chance', { p: Math.round(W.tr.rain * 100) })}${W.tr.oval ? ' ' + t('wk.ovalNote') : ''}</div></div>`;
}
function openWeekend() { prepareWeekend(); openPractice(); }
function openPractice() {
  const W = WEEKEND, maxRuns = 3 + (S.staff.sim >= 6 ? 1 : 0);
  const left = maxRuns - W.runs.length;
  const est = W.runs.length ? clamp(setupQuality(W.tr, W.setup) + randn() * (.12 / W.runs.length), 0, 1) : null;
  modal(`${weekendHead(W)}
   <h2 class="sec">${t('pr.title')}</h2>
   <div class="small muted" style="margin:-4px 2px 10px">${t('pr.info')}</div>
   <div class="card">${SETUP.map(k => `<div class="setrow"><div class="row"><b class="grow">${t('set.' + k)}</b><span class="num">${W.setup[k]}</span></div>
     <input type="range" min="1" max="9" step="1" value="${W.setup[k]}" data-set="${k}"><div class="row small muted"><span class="grow">${t('set.' + k + '.lo')}</span><span>${t('set.' + k + '.hi')}</span></div></div>`).join('')}</div>
   <div class="row" style="margin-top:10px"><button class="btn grow" id="prRun" ${left <= 0 ? 'disabled' : ''}>${t('pr.run', { n: left })}</button></div>
   ${est != null ? `<div class="card" style="margin-top:10px"><div class="row"><span class="grow">${t('pr.est')}</span><b class="num">${Math.round(est * 100)}%</b></div><div class="bar g" style="margin-top:6px"><i style="width:${est * 100}%"></i></div></div>` : ''}
   ${W.runs.length ? `<div class="card prlog">${W.runs.map((r, i) => `<div class="prr"><div class="row"><b class="grow">${t('pr.lap', { n: i + 1 })} · ${esc(r.drv)}</b><span class="num">${fmtLap(r.time)}</span></div>${r.fb.map(f => `<div class="small muted">${t(f)}</div>`).join('')}</div>`).reverse().join('')}</div>` : ''}
   <div class="row" style="margin-top:12px"><button class="btn grow" data-close>${t('ui.back')}</button><button class="btn pri grow" id="toQuali">${t('pr.toQuali')}</button></div>`);
  $('#mc').querySelectorAll('[data-set]').forEach(inp => inp.oninput = () => { W.setup[inp.dataset.set] = +inp.value; inp.closest('.setrow').querySelector('.num').textContent = inp.value; });
  $('#prRun').onclick = () => {
    if (W.runs.length >= maxRuns) return;
    const d = S.drivers[W.runs.length % 2];
    W.runs.push({ drv: lastName(d.name), time: practiceLap(W.tr, W.setup, d), fb: practiceFeedback(W.tr, W.setup, d), set: { ...W.setup } });
    openPractice();
  };
  $('#toQuali').onclick = () => { runQualifying(); openQuali(); };
}
function openQuali() {
  const W = WEEKEND, wet = W.wx.wet > .45, tires = [wet ? 'W' : 'S', wet ? 'W' : 'S'];
  const myPos = [0, 1].map(s => W.grid.findIndex(e => e.isMe && e.seat === s) + 1);
  modal(`${weekendHead(W)}
   <h2 class="sec">${t('wk.quali')}</h2>
   <div class="grid2" style="margin:4px 0 10px">${[0, 1].map(s => `<div class="kpi" style="text-align:center"><b class="bigpos">P${myPos[s]}</b><div class="small muted">#${s ? S.num2 : S.num} ${esc(S.drivers[s].name)}</div></div>`).join('')}</div>
   <div class="card gridlist">${W.grid.map((e, i) => `<div class="res g3 ${e.isMe ? 'me' : ''}"><span class="p">${i + 1}</span><span><span class="dot" style="background:${e.color}"></span>${esc(e.driver)} ${natTag(e.nat)} <span class="muted small">${esc(e.name)}</span>${e.isRival ? ' <span class="tt r">RIV</span>' : ''}</span><span class="small muted">#${e.num}</span></div>`).join('')}</div>
   ${W.tr.oval ? '' : `<h2 class="sec">${t('wk.startTire')}</h2>${[0, 1].map(s => `<div class="row" style="margin-bottom:6px"><span style="min-width:64px">#${s ? S.num2 : S.num}</span><div class="seg grow" data-wt="${s}"><button data-ty="S" class="${tires[s] === 'S' ? 'on' : ''}">${t('tire.S')}</button><button data-ty="W" class="${tires[s] === 'W' ? 'on' : ''}">${t('tire.W')}</button></div></div>`).join('')}<div class="small muted" style="margin-top:6px">${t('wk.tireInfo')}</div>`}
   <div class="small muted" style="margin:12px 2px">${t('wk.howto')}</div>
   <div class="row"><button class="btn grow" id="backPr">${t('ui.back')}</button><button class="btn pri grow" id="goRace">${t('wk.go')}</button></div>`);
  $('#mc').querySelectorAll('[data-wt]').forEach(sg => sg.onclick = e => { const b = e.target.closest('button'); if (!b) return; tires[+sg.dataset.wt] = b.dataset.ty; sg.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); });
  $('#backPr').onclick = openPractice;
  $('#goRace').onclick = () => { SND.unlock(); closeModal(); startRace(tires); };
}

/* ---------- results and the events that follow ---------- */
function finishRace() {
  if (!R) return; cancelAnimationFrame(R.raf); SND.stop();
  const r = applyRaceResult();
  $('#race').classList.add('hidden'); document.body.style.overflow = '';
  R = null; save();
  const { ord, best } = r, podium = ord.slice(0, 3);
  const rows = ord.map((c, i) => `<div class="res ${c.isMe ? 'me' : ''}"><span class="p">${i + 1}</span><span><span class="dot" style="background:${c.color}"></span>#${c.num} ${esc(c.driver)} ${natTag(c.nat)} <span class="muted small">${esc(c.name)}</span>${c.isRival ? ' <span class="tt r">RIV</span>' : ''}</span><span class="small muted">${c.dnf ? 'DNF' : t('res.stops', { n: c.stops })}</span><b class="num">${c.dnf ? 0 : POINTS[i] * (r.special ? r.special.points : 1)}</b></div>`).join('');
  const line = (k, v, cls) => `<div class="money-line"><span>${k}</span><span class="${cls}">${cls === 'neg' ? '−' : '+'}${money(Math.abs(v))}</span></div>`;
  modal(`<h3>${best === 99 ? t('res.dnf') : best === 1 ? t('res.win') : best <= 3 ? t('res.podium') : t('res.finish')}</h3>
   <div class="small muted">${esc(t('track.' + r.trackId))}${r.special ? ' · ' + t('sp.' + r.special.kind) : ''}</div>
   <div class="podium">${[1, 0, 2].map(k => podium[k] ? `<div style="height:${[92, 70, 56][k]}px" class="${podium[k].isMe ? 'me' : ''}"><b class="h" style="font-size:20px">${k + 1}.</b>${esc(podium[k].driver)}</div>` : '').join('')}</div>
   <div class="grid2">${r.my.map(m => `<div class="kpi" style="text-align:center"><b>${m.c.dnf ? 'DNF' : 'P' + m.pos}</b><div class="small muted">#${m.c.num} ${esc(m.c.driver)}</div></div>`).join('')}</div>
   <div class="small muted" style="margin-top:8px">${t('res.rival', { r: esc(S.rival.name), p: r.rvBest === 99 ? 'DNF' : 'P' + r.rvBest, a: S.h2h.me, b: S.h2h.rv })}</div>
   <h2 class="sec">${t('res.money')}</h2>
   <div class="card">
    ${line(t('res.prize2'), r.prize, 'pos')}${line(t('res.spBase'), r.spBase, 'pos')}${line(t('res.spBonus'), r.spBonus, 'pos')}
    ${line(t('res.salary2'), r.sal, 'neg')}${line(t('res.upkeep'), r.upk, 'neg')}${r.repair ? line(t('res.repair'), r.repair, 'neg') : ''}
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
function runQueue(q, end) { const f = q.shift(); if (f) f(() => runQueue(q, end)); else end(); }
function showAch(list, next) {
  modal(`<h3>${t('ach.unlocked')}</h3>${list.map(k => `<div class="ach on" style="margin:8px 0"><b>${t('ach.' + k)}</b><small>${t('ach.' + k + '.d')}</small></div>`).join('')}<button class="btn pri block" id="ok">${t('ui.continue')}</button>`);
  $('#ok').onclick = () => { closeModal(); render(); next(); };
}
function showPoach(ev, next) {
  const d = S.drivers[ev.seat], raise = Math.round(d.salary * .25 / 50) * 50, comp = Math.round(feeFor(d) * .5 / 50) * 50;
  modal(`<h3>${t('po.t')}</h3><p>${t('po.p', { t: esc(ev.from), n: esc(d.name) })}</p>
   <div class="row col"><button class="btn pri" id="keep">${t('po.keep', { m: money(raise) })}</button><button class="btn" id="let">${t('po.let', { m: money(comp) })}</button></div>`);
  $('#keep').onclick = () => { resolvePoach(ev, true); closeModal(); render(); next(); };
  $('#let').onclick = () => { resolvePoach(ev, false); closeModal(); render(); next(); };
}
function showInterview(iv, next) {
  const n = IV_FX[iv.q].length;
  modal(`<h3>${t('iv.t')}</h3><p class="ivq">${t('iv.' + iv.q, { n: esc(S.drivers[iv.y].name), r: esc(S.rival.name) })}</p>
   <div class="row col">${Array.from({ length: n }, (_, k) => `<button class="btn ivo" data-k="${k}">${t('iv.' + iv.q + '.' + k)}</button>`).join('')}</div>`);
  $('#mc').querySelectorAll('[data-k]').forEach(b => b.onclick = () => {
    const res = applyInterview(iv, +b.dataset.k);
    toast(res.caught ? t('iv.caught') : t('iv.done', { r: (res.rep >= 0 ? '+' : '') + res.rep }));
    closeModal(); render(); next();
  });
}
function checkBankrupt() {
  if (S.money >= -30000 * TIER_MULT[S.tier]) return false;
  modal(`<h3>${t('bk.t')}</h3><p>${t('bk.p', { n: esc(S.teamName) })}</p><p class="small muted">${t('bk.stats', { s: S.season, t: esc(tierName(S.disc, S.tier)), n: S.titles })}</p><button class="btn pri block" id="ok">${t('bk.new')}</button>`);
  $('#ok').onclick = () => { S = null; try { localStorage.removeItem(SAVE_KEY); } catch (e) { } closeModal(); render(); };
  return true;
}
function seasonEnd() {
  const res = seasonResolve();
  const cur = tierName(S.disc, S.tier), other = DISC_KEYS.filter(d => d !== S.disc), ot = Math.max(0, S.tier - 1);
  modal(`<h3>${res.pos === 1 ? t('se.champ') : t('se.t')}</h3>
   <div style="text-align:center;margin:8px 0"><span class="h bigpos">${res.pos}.</span><div class="muted">${t('se.pts', { n: S.points.me })}</div></div>
   <div class="card"><div class="money-line"><span>${t('se.prize')}</span><span class="pos">+${money(res.prize)}</span></div>
   <div class="money-line"><span>${res.move ? t('move.' + res.move) : t('se.stay')}</span><b>${esc(cur)}</b></div>
   <div class="money-line"><span>${t('champ.champion')}</span><b>${esc(res.champ)}</b></div>
   <div class="money-line"><span>${t('home.rival')}</span><b>${S.h2h.me}–${S.h2h.rv}</b></div>
   <div class="small muted" style="margin-top:6px">${t('se.info')}</div></div>
   ${res.ach.length ? `<h2 class="sec">${t('ach.unlocked')}</h2>${res.ach.map(k => `<div class="ach on" style="margin:6px 0"><b>${t('ach.' + k)}</b><small>${t('ach.' + k + '.d')}</small></div>`).join('')}` : ''}
   <button class="btn pri block" style="margin-top:14px" id="ok">${t('ui.continue')}</button>`);
  $('#ok').onclick = () => renewals(res.expired.slice(), () => chooseNext(cur, other, ot));
}
function renewals(list, done) {
  const i = list.shift(); if (i == null) { done(); return; }
  const d = S.drivers[i], sal = renewSalary(d);
  modal(`<h3>${t('ct.t')}</h3><p>${t('ct.p', { n: esc(d.name), m: money(sal) })}</p>
   <div class="row col">${[1, 2, 3].map(y => `<button class="btn ${y === 2 ? 'pri' : ''}" data-y="${y}">${t('ct.renew', { n: y })}</button>`).join('')}<button class="btn danger-t" id="rel">${t('ct.release')}</button></div>`);
  $('#mc').querySelectorAll('[data-y]').forEach(b => b.onclick = () => { renewDriver(i, +b.dataset.y); renewals(list, done); });
  $('#rel').onclick = () => { releaseDriver(i); renewals(list, done); };
}
function chooseNext(cur, other, ot) {
  modal(`<h3>${t('se.next')}</h3>
   <div class="row col">
    <button class="btn pri" id="stay">${t('se.continue', { s: esc(cur) })}</button>
    ${other.map(o => `<button class="btn" data-sw="${o}">${t('se.switch', { s: esc(tierName(o, ot)), d: t('disc.' + o) })}</button>`).join('')}
   </div>
   <div class="small muted" style="margin-top:8px">${t('se.coNote')}</div>`);
  const fin = () => { closeModal(); VIEW = 'home'; render(); if (S.rule !== 'none') toast(t('rule.' + S.rule)); };
  $('#stay').onclick = () => { nextSeason(S.disc, S.tier); fin(); };
  $('#mc').querySelectorAll('[data-sw]').forEach(b => b.onclick = () => { const o = b.dataset.sw; addNews('start', 'news.switch', { d: 'disc.' + o }); nextSeason(o, ot); fin(); });
}
