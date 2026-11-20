/* ===================== SVG artwork ===================== */
const FC = 'Barlow Condensed, Arial Narrow, sans-serif';
const ICONS = {
  eng: '<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="7" width="30" height="20" rx="2"/><path d="M14 33h12M20 27v6"/><path d="M10 22l6-6 5 4 8-8"/></svg>',
  pit: '<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"><circle cx="20" cy="22" r="13"/><path d="M20 22l5-6M16 4h8M20 4v5M31 9l3-3"/></svg>',
  shop: '<svg viewBox="0 0 40 40" fill="currentColor"><path d="M27 4a9 9 0 0 0-8.6 11.6L5 29a3.5 3.5 0 0 0 5 5l13.4-13.4A9 9 0 0 0 36 13l-5.5 5.5-5-1-1-5L30 7a9 9 0 0 0-3-3z"/></svg>',
  sim: '<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><rect x="4" y="5" width="32" height="20" rx="2"/><path d="M8 25l-3 9M32 25l3 9"/><circle cx="20" cy="30" r="5"/><path d="M15 30h10M20 30v5"/></svg>',
  mkt: '<svg viewBox="0 0 40 40" fill="currentColor"><path d="M6 15h6l16-8v26l-16-8H6a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2z"/><path d="M11 25l3 9h5l-3-9z" opacity=".7"/><path d="M32 14a8 8 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>',
};

/* ---------- part illustrations: 4 visual stages per part (stock / sport / race / pro) ---------- */
const STAGE_COL = [
  { m: '#9aa1ab', m2: '#6f7782', a: '#7b828d' },   // stock: plain steel
  { m: '#c3c9d2', m2: '#8e96a2', a: '#e8392f' },   // sport: polished, red accents
  { m: '#33383f', m2: '#22262b', a: '#2f9bff' },   // race: carbon, blue anodised
  { m: '#2a2d33', m2: '#1a1c20', a: '#e0b54a' },   // pro: carbon + gold
];
function partArt(id, lv) {
  const st = stageOf(lv), C = STAGE_COL[st];
  const cf = st >= 2 ? `<defs><pattern id="cf${id}" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="4" height="4" fill="${C.m}"/><rect width="2" height="4" fill="${C.m2}"/></pattern></defs>` : '';
  const fill = st >= 2 ? `url(#cf${id})` : C.m;
  let g = '';
  if (id === 'engine') {
    const n = [4, 6, 8, 10][st], w = 60 / n;
    g += `<rect x="22" y="30" width="68" height="28" rx="4" fill="${fill}" stroke="#0007"/>`;
    for (let i = 0; i < n; i++) g += `<rect x="${25 + i * w}" y="21" width="${w - 2}" height="11" rx="2" fill="${C.a}"/>`;
    if (st >= 1) g += `<rect x="30" y="12" width="52" height="8" rx="3" fill="${C.m2}"/>${st >= 2 ? Array.from({ length: n / 2 }, (_, i) => `<rect x="${33 + i * (46 / (n / 2))}" y="6" width="5" height="7" rx="1.5" fill="#c3c9d2"/>`).join('') : ''}`;
    for (let i = 0; i < 2 + st; i++) g += `<path d="M22 ${38 + i * 5} H8" stroke="${st === 3 ? '#e0b54a' : '#8a8f96'}" stroke-width="3" stroke-linecap="round"/>`;
    if (st >= 2) g += `<circle cx="102" cy="40" r="11" fill="#b0b6bf" stroke="#0006"/><path d="M102 40 m0-7 a7 7 0 1 1-7 7 a4 4 0 1 1 4 4" fill="none" stroke="#555" stroke-width="2"/><path d="M90 40 h-2" stroke="#b0b6bf" stroke-width="6"/>`;
    g += `<circle cx="56" cy="44" r="5" fill="#0005"/><text x="56" y="68" text-anchor="middle" font-family="${FC}" font-weight="800" font-size="9" fill="#fff" opacity=".7">${['I4', 'V6', 'V8', 'V10'][st]}${st >= 2 ? ' TURBO' : ''}</text>`;
  } else if (id === 'gearbox') {
    g += `<circle cx="30" cy="38" r="20" fill="${fill}" stroke="#0007"/><rect x="30" y="22" width="62" height="32" rx="10" fill="${fill}" stroke="#0007"/>`;
    g += `<rect x="44" y="27" width="42" height="22" rx="4" fill="#12151a"/>`;
    const n = 2 + st;
    for (let i = 0; i < n; i++) { const r = 8 - i * .8, x = 50 + i * (32 / n) + r; g += `<circle cx="${x}" cy="38" r="${r}" fill="none" stroke="${i % 2 ? C.a : '#c3c9d2'}" stroke-width="3" stroke-dasharray="2 1.6"/>`; }
    if (st < 2) g += `<path d="M78 22 L78 8" stroke="#555" stroke-width="3"/><circle cx="78" cy="7" r="5" fill="${st ? C.a : '#222'}"/>`;
    else g += `<path d="M76 22 L86 6" stroke="#444" stroke-width="3"/><rect x="82" y="2" width="10" height="7" rx="2" fill="${C.a}"/><text x="100" y="18" font-family="${FC}" font-weight="800" font-size="8" fill="${C.a}">SEQ</text>`;
    g += `<text x="60" y="68" text-anchor="middle" font-family="${FC}" font-weight="800" font-size="9" fill="#fff" opacity=".7">${[4, 5, 6, 7][st]}-SPEED</text>`;
  } else if (id === 'aero') {
    const els = [1, 2, 2, 3][st];
    g += `<rect x="10" y="${8 - st * 2}" width="${7 + st * 2}" height="${46 + st * 4}" rx="2" fill="${st === 3 ? C.a : C.m2}"/>`;
    for (let i = 0; i < els; i++) {
      const y = 18 + i * 11, k = 1 - i * .15;
      g += `<path d="M18 ${y + 6} C40 ${y - 8 * k} 80 ${y - 6 * k} 110 ${y} L110 ${y + 4} C80 ${y + 2} 45 ${y + 4} 18 ${y + 11} Z" fill="${fill}" stroke="#0007"/>`;
    }
    if (st >= 1) g += `<path d="M110 ${16 + (els - 1) * 11} v-6" stroke="${C.a}" stroke-width="3"/>`;
    g += `<rect x="54" y="${30 + els * 8}" width="5" height="${30 - els * 6}" fill="#30343b"/><rect x="82" y="${30 + els * 8}" width="5" height="${30 - els * 6}" fill="#30343b"/>`;
  } else if (id === 'chassis') {
    const spring = ['#9aa1ab', '#e8392f', '#2f9bff', '#e0b54a'][st];
    g += `<circle cx="52" cy="8" r="5" fill="none" stroke="#8a8f96" stroke-width="3"/><circle cx="52" cy="64" r="5" fill="none" stroke="#8a8f96" stroke-width="3"/>`;
    g += `<rect x="45" y="12" width="14" height="48" rx="4" fill="${st >= 2 ? '#2a2d33' : '#5d646e'}"/><rect x="48" y="14" width="8" height="24" fill="#c3c9d2"/>`;
    let pth = 'M40 18'; for (let i = 0; i < 8; i++) pth += ` L${i % 2 ? 40 : 64} ${18 + (i + 1) * 4.5}`;
    g += `<path d="${pth}" fill="none" stroke="${spring}" stroke-width="4" stroke-linecap="round"/>`;
    g += `<rect x="38" y="14" width="28" height="4" rx="2" fill="${C.m2}"/><rect x="38" y="55" width="28" height="4" rx="2" fill="${C.m2}"/>`;
    if (st >= 1) g += `<circle cx="52" cy="62" r="3" fill="${C.a}"/>`;
    if (st >= 2) g += `<rect x="74" y="18" width="13" height="32" rx="5" fill="${st === 3 ? C.a : '#2f9bff'}"/><path d="M59 26 C66 26 68 30 74 30" fill="none" stroke="#333" stroke-width="3"/><circle cx="80" cy="16" r="3" fill="#c3c9d2"/>`;
    if (st === 3) g += `<text x="90" y="66" font-family="${FC}" font-weight="800" font-size="8" fill="${C.a}">3-WAY</text>`;
  } else if (id === 'brakes') {
    const r = [21, 24, 27, 30][st];
    const disc = st === 3 ? '#3b3b3e' : '#b8bec7';
    g += `<circle cx="50" cy="36" r="${r}" fill="${disc}" stroke="#0006"/>`;
    if (st >= 1) for (let i = 0; i < 12 + st * 4; i++) { const a = i / (12 + st * 4) * Math.PI * 2; g += `<circle cx="${(50 + Math.cos(a) * (r - 6)).toFixed(1)}" cy="${(36 + Math.sin(a) * (r - 6)).toFixed(1)}" r="1.4" fill="#555"/>`; }
    if (st >= 2) for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + .2; g += `<path d="M${(50 + Math.cos(a) * (r - 13)).toFixed(1)} ${(36 + Math.sin(a) * (r - 13)).toFixed(1)} L${(50 + Math.cos(a + .25) * (r - 3)).toFixed(1)} ${(36 + Math.sin(a + .25) * (r - 3)).toFixed(1)}" stroke="#666" stroke-width="1.4"/>`; }
    g += `<circle cx="50" cy="36" r="11" fill="${C.m2}"/><circle cx="50" cy="36" r="4" fill="#222"/>`;
    const cal = ['#5d646e', '#e8392f', '#e8392f', '#e0b54a'][st];
    g += `<path d="M${50 + r * .55} ${36 - r * .9} A${r + 5} ${r + 5} 0 0 1 ${50 + r * .55} ${36 + r * .9} L${50 + r * .3} ${36 + r * .75} A${r - 4} ${r - 4} 0 0 0 ${50 + r * .3} ${36 - r * .75} Z" fill="${cal}" stroke="#0006"/>`;
    g += `<text x="${50 + r + 10}" y="40" font-family="${FC}" font-weight="800" font-size="9" fill="#fff" opacity=".75">${[2, 4, 6, 6][st]}P</text>`;
    if (st === 3) g += `<circle cx="50" cy="36" r="${r}" fill="none" stroke="#ff6a1a" stroke-width="2" opacity=".5"/>`;
  } else if (id === 'tires') {
    g += `<circle cx="50" cy="36" r="32" fill="#141414"/>`;
    if (st === 0) g += `<circle cx="50" cy="36" r="29" fill="none" stroke="#2c2c2c" stroke-width="6" stroke-dasharray="3 3"/>`;
    if (st === 1) g += `<circle cx="50" cy="36" r="29" fill="none" stroke="#2c2c2c" stroke-width="6" stroke-dasharray="2 9"/>`;
    if (st >= 2) g += `<circle cx="50" cy="36" r="24.5" fill="none" stroke="${st === 3 ? '#e8392f' : '#ffd400'}" stroke-width="2" stroke-dasharray="24 14"/>`;
    const rim = ['#6b7280', '#c3c9d2', '#c3c9d2', '#e0b54a'][st], n = [5, 6, 10, 10][st];
    g += `<circle cx="50" cy="36" r="19" fill="#202226"/>`;
    for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; g += `<line x1="50" y1="36" x2="${(50 + Math.cos(a) * 17).toFixed(1)}" y2="${(36 + Math.sin(a) * 17).toFixed(1)}" stroke="${rim}" stroke-width="${st >= 2 ? 2.2 : 3.4}"/>`; }
    g += `<circle cx="50" cy="36" r="17.5" fill="none" stroke="${rim}" stroke-width="2"/><circle cx="50" cy="36" r="4" fill="${st === 3 ? '#e8392f' : rim}"/>`;
    g += `<text x="86" y="30" font-family="${FC}" font-weight="800" font-size="8.5" fill="#fff" opacity=".75">${['STREET', 'SEMI', 'SLICK', 'SLICK'][st]}</text><text x="86" y="41" font-family="${FC}" font-weight="700" font-size="8" fill="${C.a}">${['', 'R', 'RACE', 'PRO'][st]}</text>`;
  }
  return `<svg viewBox="0 0 120 72" xmlns="http://www.w3.org/2000/svg">${cf}${g}</svg>`;
}

function helmetSVG(d, size) {
  const sz = size ? ` style="width:${size}px;height:${size}px"` : '';
  return `<svg class="helmet"${sz} viewBox="0 0 64 64"><circle cx="32" cy="32" r="31" fill="#20252f"/><path d="M12 38c0-14 9-24 21-24s19 9 19 20v6c0 3-2 5-5 5H22c-6 0-10-3-10-7z" fill="${d.h1}"/><path d="M14 30c3-9 10-14 19-14 4 0 7 1 10 3-6 1-12 5-14 11z" fill="${d.h2}" opacity=".9"/><path d="M30 30h21c1 0 1 1 1 2v5c0 1-1 2-2 2H33c-2 0-3-1-3-3z" fill="#151a22"/><path d="M33 32h16" stroke="#6fd3ff" stroke-width="2" stroke-linecap="round" opacity=".6"/><path d="M18 45h30" stroke="#000" stroke-opacity=".25" stroke-width="3"/></svg>`;
}

/* ---------- side view car (garage, intro) ----------
   kind: 'gt' (GT4/GT3-style coupe), 'proto' (LMH/LMDh Hypercar), 'stock' (Gen 4 / ARCA-style stock car).
   Race livery: glossy body, three-stripe sweep, number panel, title sponsor, contingency decals.
   Upgrades show on the car: rear wing grows with aero (lip -> small wing -> swan neck -> big twin-element),
   splitter with aero, rim finish with tyres, caliper colour with brakes, exhaust flame with engine, ride height with suspension. */
let ART_ID = 0;
const ACCENT = { '#e8392f': '#2f7bf5', '#ff8a1e': '#1b3a6b', '#f5c518': '#16181c', '#2fbf71': '#f2f2f2', '#14b8c4': '#1b2a4a', '#2f7bf5': '#e8392f', '#7a4cf0': '#f5c518', '#e64598': '#16181c', '#f2f2f2': '#e8392f', '#2b2f36': '#ff8a1e' };
const accentFor = c => ACCENT[c] || '#f2f2f2';
const GT_BODY = 'M35 167 C31 150 30 120 31 104 Q31 88 36 80 L46 70 Q50 66 60 66 L144 64 C176 56 196 38 222 33 Q254 27 286 28 Q318 29 339 34 C356 40 384 60 416 78 C460 86 514 96 556 103 Q574 106 579 114 Q582 132 580 150 L576 166 Q572 170 562 170 L543.3 170 A43 43 0 1 0 460.7 170 L188.3 170 A43 43 0 1 0 105.7 170 L44 169 Q37 169 35 167 Z';
const PROTO_BODY = 'M40 182 L40 160 Q38 128 44 116 L56 110 Q96 100 120 102 Q150 104 172 106 Q220 100 252 96 Q262 80 298 78 Q334 79 350 98 L364 116 Q400 122 430 120 L460 114 Q500 92 530 104 Q556 116 572 140 Q588 156 598 168 L600 182 L539 182 A44 44 0 1 0 465 182 L173 182 A44 44 0 1 0 99 182 Z';
const STOCK_BODY = 'M48 596 L44 560 Q44 520 70 500 Q90 478 130 468 C200 455 280 446 330 438 L420 384 Q440 372 480 370 L630 370 Q662 372 692 396 L790 436 L884 440 L912 446 L922 454 Q930 492 922 530 L912 552 L758 574 A66 66 0 1 0 642 578 L636 592 L272 592 L264 586 A66 66 0 1 0 162 586 L150 592 L60 600 Z';
function sideWheel(x, y, o) {
  const n = 10; let spokes = '';
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2, d = .07, p = (r, aa) => `${(x + Math.cos(aa) * r).toFixed(1)} ${(y + Math.sin(aa) * r).toFixed(1)}`;
    spokes += `<path d="M${p(6, a - .16)} L${p(25, a - d)} L${p(25, a + d)} L${p(6, a + .16)} Z" fill="${o.rim}"/>`;
  }
  const glow = o.glow ? `<circle cx="${x}" cy="${y}" r="20" fill="url(#bglow${o.id})" opacity="${o.glow}"/>` : '';
  return `<g><circle cx="${x}" cy="${y}" r="38" fill="#101012"/><circle cx="${x}" cy="${y}" r="38" fill="url(#tyre${o.id})"/>
    <circle cx="${x}" cy="${y}" r="28.5" fill="#1a1b1e"/><circle cx="${x}" cy="${y}" r="22" fill="url(#disc${o.id})"/>
    <circle cx="${x}" cy="${y}" r="17" fill="none" stroke="#3b3e43" stroke-width="5" stroke-dasharray="1.2 2.4" opacity=".7"/>${glow}
    <path d="M${x - 9} ${y - 20} A21 21 0 0 1 ${x + 11} ${y - 19} L${x + 8} ${y - 13} A14 14 0 0 0 ${x - 6} ${y - 14} Z" fill="${o.caliper}" transform="rotate(-30 ${x} ${y})"/>
    ${spokes}<circle cx="${x}" cy="${y}" r="27" fill="none" stroke="${o.rim}" stroke-width="2.5"/>
    <circle cx="${x}" cy="${y}" r="5.5" fill="#222"/><circle cx="${x}" cy="${y}" r="3" fill="#d33"/>
    <path d="M${x - 30} ${y - 18} A35 35 0 0 1 ${x + 4} ${y - 35}" stroke="#fff" stroke-opacity=".08" stroke-width="3" fill="none"/></g>`;
}
function carSideSVG(opts) {
  const { kind = 'gt', color, num, parts, sponsor, bg = true } = opts;
  const id = 'c' + (++ART_ID), accent = accentFor(color);
  const dark = shade(color, -70), mid = shade(color, -30), light = shade(color, 45), carbon = '#17191c';
  const aS = stageOf(parts.aero), tS = stageOf(parts.tires), bS = stageOf(parts.brakes);
  const rim = ['#2a2c30', '#9aa1aa', '#1e2024', '#c9a347'][tS];
  const caliper = ['#5d636b', '#c62828', '#c62828', '#e0b54a'][bS];
  const glow = parts.brakes >= 8 ? clamp((parts.brakes - 6) / 14, 0, .85).toFixed(2) : 0;
  const rideH = Math.max(0, (6 - parts.chassis) * .4);
  const sp = sponsor ? esc(sponsor.name.toUpperCase()) : '';
  const flame = (x, y, dir) => parts.engine >= 12 ? `<path d="M${x} ${y} l${dir * (10 + parts.engine)} -3 l${dir * -4} 3 l${dir * (6 + parts.engine * .7)} 3z" fill="#ffb21e" opacity=".85"/><path d="M${x} ${y} l${dir * (5 + parts.engine * .4)} -1.5 l${dir * -2} 1.5 l${dir * (3 + parts.engine * .3)} 1.5z" fill="#fff3c4"/>` : '';
  const numPanel = (x, y, w, h, fs) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5" fill="#f4f5f7"/><text x="${x + w / 2}" y="${y + h * .8}" text-anchor="middle" font-family="${FC}" font-weight="800" font-size="${fs}" fill="#111">${num}</text>`;
  const spText = (x, y, fs, max) => sp ? `<text x="${x}" y="${y}" text-anchor="middle" font-family="${FC}" font-weight="800" font-size="${fs}" letter-spacing="1" fill="#fff" ${sp.length * fs * .55 > max ? `textLength="${max}" lengthAdjust="spacingAndGlyphs"` : ''}>${sp}</text>` : '';
  const decals = (x, y) => `<g opacity=".85">${[0, 1, 2, 3, 4].map(i => `<rect x="${x + i * 22}" y="${y}" width="18" height="6" rx="1" fill="#e9ebee"/>`).join('')}</g>`;
  const stripes = (pts) => `<path d="${pts[0]}" fill="#141518"/><path d="${pts[1]}" fill="${accent}"/><path d="${pts[2]}" fill="${shade(accent, -60)}"/>`;
  const defs = `<defs>
    <linearGradient id="body${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${light}"/><stop offset=".38" stop-color="${color}"/><stop offset=".75" stop-color="${mid}"/><stop offset="1" stop-color="${dark}"/></linearGradient>
    <linearGradient id="glass${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2c3a48"/><stop offset=".5" stop-color="#121a22"/><stop offset="1" stop-color="#0b0f14"/></linearGradient>
    <linearGradient id="refl${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".16"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <radialGradient id="tyre${id}" cx=".5" cy=".5" r=".5"><stop offset=".7" stop-color="#18181b"/><stop offset=".93" stop-color="#2a2a2e"/><stop offset="1" stop-color="#0c0c0d"/></radialGradient>
    <radialGradient id="disc${id}" cx=".45" cy=".4" r=".6"><stop offset="0" stop-color="#9aa0a8"/><stop offset="1" stop-color="#4a4e55"/></radialGradient>
    <radialGradient id="bglow${id}"><stop offset="0" stop-color="#ff7a1a"/><stop offset="1" stop-color="#ff3b00" stop-opacity="0"/></radialGradient>
    <filter id="blur${id}" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="4"/></filter>
    <linearGradient id="gwall${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#262a31"/><stop offset="1" stop-color="#1a1d22"/></linearGradient>
    <linearGradient id="gfloor${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a3e45"/><stop offset="1" stop-color="#202328"/></linearGradient>
    <radialGradient id="glamp${id}" cx=".5" cy="0" r=".9"><stop offset="0" stop-color="#fff7e6" stop-opacity=".28"/><stop offset="1" stop-color="#fff7e6" stop-opacity="0"/></radialGradient></defs>`;
  const W = (x, y) => sideWheel(x, y, { id, rim, caliper, glow });
  const shine = `<path d="M20 70 C200 64 380 80 610 108 L610 122 C380 98 200 84 20 88 Z" fill="url(#refl${id})"/>`;
  let body = '';
  if (kind === 'gt') {
    // rear wing by aero stage
    const wing = [
      `<path d="M40 70 L62 62 L66 66 L46 71 Z" fill="${carbon}"/>`,
      `<path d="M58 66 L60 54 L64 54 L64 66 Z M100 64 L101 54 L105 54 L105 64 Z" fill="${carbon}"/><path d="M42 52 Q76 44 112 49 L112 55 Q76 52 42 59 Z" fill="${carbon}"/><path d="M40 46 L46 46 L47 62 L41 62 Z" fill="${mid}"/>`,
      `<path d="M84 66 C88 56 90 48 88 42 Q87 38 84 38 L86 32 Q94 30 96 36 C99 46 98 56 96 66 Z" fill="${carbon}"/><path d="M32 42 Q70 33 114 37 L114 44 Q70 40 32 50 Z" fill="${carbon}"/><path d="M29 30 L38 30 L40 60 L31 61 Z" fill="${carbon}"/>`,
      `<path d="M84 66 C88 54 90 44 88 36 Q87 32 84 32 L86 26 Q94 24 96 30 C99 42 98 54 96 66 Z" fill="${carbon}"/><path d="M30 36 Q72 27 118 31 L118 38 Q72 34 30 44 Z" fill="${carbon}"/><path d="M34 30 Q72 22 114 25 L114 27.5 Q72 25 34 33 Z" fill="${carbon}"/><path d="M27 20 L37 20 L39 56 L29 58 Z" fill="${mid}"/>`][aS];
    const splitter = aS >= 2 ? `<path d="M530 176 L604 176 L604 180 L526 180 Z" fill="${carbon}"/><path d="M550 170 L556 176 M574 168 L582 176" stroke="${carbon}" stroke-width="3"/>` : `<path d="M548 172 L590 172 L590 175 L546 175 Z" fill="${carbon}"/>`;
    const canards = aS >= 1 ? `<path d="M579 132 L596 128 L595 132 L579 137 Z" fill="${carbon}"/>${aS >= 3 ? `<path d="M579 142 L593 139 L592 143 L579 147 Z" fill="${carbon}"/>` : ''}` : '';
    body = `<ellipse cx="310" cy="197" rx="285" ry="9" fill="#000" opacity=".7" filter="url(#blur${id})"/>
    <circle cx="147" cy="158" r="42" fill="#070708"/><circle cx="502" cy="158" r="42" fill="#070708"/>
    <g transform="translate(0 ${-rideH})">
    ${aS >= 2 ? wing : ''}
    <path d="${GT_BODY}" fill="url(#body${id})"/>
    <g clip-path="url(#clip${id})">${stripes(['M456 150 C360 142 250 104 30 96 L30 103 C250 112 350 152 446 160 Z', 'M446 160 C350 152 250 113 30 104 L30 109 C250 119 345 157 438 165 Z', 'M438 165 C345 157 250 120 30 110 L30 115 C250 126 340 162 430 170 Z'])}${shine}</g>
    ${aS < 2 ? wing : ''}
    <path d="M188 170 L461 170 L459 160 L192 159 Z" fill="${carbon}"/>
    <path d="M33 148 L104 152 L106 170 L44 169 Q37 169 35 167 Z" fill="${carbon}"/><path d="M46 153 V168 M58 154 V169 M70 154 V169 M82 155 V169" stroke="#2c2f34" stroke-width="2"/>
    <path d="M550 148 L580 146 L576 166 Q572 170 562 170 L548 170 Z" fill="${carbon}"/>${splitter}${canards}
    <path d="M393 85 L360 52 Q346 38 326 37 L280 35 Q248 36 220 44 Q186 56 152 70 Z" fill="url(#glass${id})" stroke="#0d0f12" stroke-width="2.5"/>
    <path d="M330 40 L346 40 L310 82 L292 82 Z" fill="#fff" opacity=".07"/><path d="M226 54 L240 50 L222 78 L208 78 Z" fill="#fff" opacity=".05"/>
    <path d="M248 36 L252 82" stroke="#0d0f12" stroke-width="5"/><path d="M360 50 L404 88" stroke="#0d0f12" stroke-width="3"/>
    <path d="M392 84 L376 80 Q370 74 378 71 L394 76 Z" fill="${mid}" stroke="#0d0f12" stroke-width="1"/>
    <path d="M426 90 Q430 128 428 158 M256 86 Q259 126 257 158" stroke="#000" stroke-opacity=".45" stroke-width="1.2" fill="none"/>
    <rect x="268" y="92" width="16" height="4" rx="2" fill="#000" opacity=".45"/>
    <path d="M432 114 L452 112 L450 136 L431 132 Z" fill="#0d0f12"/><path d="M435 119 L450 118 M434 125 L450 124 M433 131 L449 130" stroke="#3a3d42" stroke-width="1.5"/>
    <path d="M60 84 C180 86 330 96 430 106" stroke="${light}" stroke-opacity=".5" stroke-width="1.5" fill="none"/><path d="M440 112 Q500 96 556 104" stroke="${light}" stroke-opacity=".45" stroke-width="1.5" fill="none"/><path d="M106 104 Q147 92 190 100" stroke="${light}" stroke-opacity=".35" stroke-width="1.5" fill="none"/>
    <path d="M543 110 L577 115 L575 123 L540 119 Z" fill="#eef3f8"/><path d="M545 114 L573 118" stroke="#7aa6d6" stroke-width="1.5" opacity=".6"/>
    <path d="M33 84 L66 82 L66 96 L33 99 Z" fill="#c8232b"/><path d="M36 88 L63 86" stroke="#ff8a80" stroke-width="1.5"/>
    <path d="M200 162 h12 v5 h-12z" fill="#3a3a3a"/>${flame(200, 164.5, -1)}
    ${numPanel(290, 96, 62, 32, 27)}${spText(120, 82, 13, 110)}${decals(270, 151)}
    <path d="M300 28 L308 21 L312 21 L309 28 Z" fill="${carbon}"/><path d="M578 150 l5 0 l0 5 l-5 0 z" fill="#e23"/>
    </g>${W(147, 158)}${W(502, 158)}
    <clipPath id="clip${id}"><path d="${GT_BODY}" transform="translate(0 ${-rideH})"/></clipPath>`;
  } else if (kind === 'proto') {   // LMH / LMDh Hypercar
    const wy = [84, 76, 69, 62][aS], chord = [38, 50, 60, 72][aS], wx = 36;
    const wing = `<path d="M${wx + 10} ${wy + 6} L${wx + 22} 112 L${wx + 30} 112 L${wx + 20} ${wy + 6} Z" fill="${carbon}"/>
      <path d="M${wx} ${wy} Q${wx + chord * .5} ${wy - 5} ${wx + chord} ${wy + 1} L${wx + chord} ${wy + 6} Q${wx + chord * .5} ${wy + 2} ${wx} ${wy + 8} Z" fill="${carbon}" stroke="#6b7179" stroke-width="1.2"/>
      ${aS >= 2 ? `<path d="M${wx + 2} ${wy - 6} Q${wx + chord * .45} ${wy - 10} ${wx + chord * .8} ${wy - 6} L${wx + chord * .8} ${wy - 3} Q${wx + chord * .45} ${wy - 6} ${wx + 2} ${wy - 2} Z" fill="${carbon}"/>` : ''}
      <path d="M${wx - 4} ${wy - 10} L${wx + 8} ${wy - 10} L${wx + 10} ${aS >= 2 ? 150 : 118} L${wx - 2} ${aS >= 2 ? 160 : 124} Z" fill="${mid}" stroke="${carbon}" stroke-width="1.5"/>
      <path d="M${wx - 3} ${wy - 8} L${wx + 7} ${wy - 8}" stroke="${accent}" stroke-width="2.5"/>`;
    body = `<ellipse cx="320" cy="198" rx="290" ry="9" fill="#000" opacity=".7" filter="url(#blur${id})"/>
    <circle cx="136" cy="158" r="42" fill="#070708"/><circle cx="502" cy="158" r="42" fill="#070708"/>
    <g transform="translate(0 ${-rideH * .6})">
    <path d="M290 80 L${wx + 18} ${wy + 4} L${wx + 22} ${wy + 16} L272 98 Z" fill="${mid}"/><path d="M290 80 L${wx + 18} ${wy + 4}" stroke="${light}" stroke-width="2"/>
    <path d="${PROTO_BODY}" fill="url(#body${id})"/>
    <g clip-path="url(#clip${id})">${stripes(['M600 150 C470 140 330 150 36 112 L36 119 C330 157 470 147 600 157 Z', 'M600 157 C470 147 330 157 36 120 L36 125 C330 162 470 152 600 162 Z', 'M600 162 C470 152 330 162 36 126 L36 131 C330 167 470 157 600 167 Z'])}${shine}
      <path d="M36 168 L610 172 L610 190 L36 190 Z" fill="#000" opacity=".25"/></g>
    <path d="M264 104 Q278 86 304 84 Q332 85 350 102 L358 116 L264 116 Z" fill="url(#glass${id})" stroke="#0d0f12" stroke-width="2.5"/>
    <path d="M300 88 L322 88 L300 114 L282 114 Z" fill="#fff" opacity=".07"/><path d="M264 104 L264 116" stroke="#0d0f12" stroke-width="5"/>
    <path d="M364 112 L376 108 L380 114 L368 117 Z" fill="${carbon}"/>
    <path d="M300 78 L304 68 L307 68 L305 78 Z" fill="${carbon}"/>
    <path d="M420 128 Q440 124 456 130 L452 160 Q436 150 420 152 Z" fill="#0d0f12"/><path d="M426 134 L450 134 M425 141 L450 141 M424 148 L449 148" stroke="#30343a" stroke-width="1.5"/>
    <path d="M276 138 Q300 128 344 132 L346 160 L282 162 Z" fill="#0d0f12" opacity=".85"/>
    <path d="M480 108 L488 118 M492 106 L500 116 M504 106 L512 116 M516 108 L524 118" stroke="#0d0f12" stroke-width="2.5" opacity=".8"/>
    <path d="M552 126 L582 146 L578 150 L548 131 Z" fill="#eef3f8"/><path d="M556 130 L577 145" stroke="#7aa6d6" stroke-width="1.5" opacity=".7"/>
    <path d="M173 176 L465 176 L465 186 L173 186 Z" fill="${carbon}"/>
    <path d="M540 182 L${aS >= 2 ? 614 : 604} 184 L${aS >= 2 ? 614 : 604} 188 L540 188 Z" fill="${carbon}"/>${aS >= 1 ? `<path d="M586 160 L606 156 L606 161 L588 164 Z" fill="${carbon}"/>` : ''}
    <path d="M40 166 L99 168 L99 186 L40 186 Z" fill="${carbon}"/><path d="M50 168 V184 M62 169 V185 M74 169 V185 M86 170 V185" stroke="#2c2f34" stroke-width="2"/>
    <path d="M41 118 L47 118 L47 152 L41 154 Z" fill="#ff3b30"/>
    <path d="M44 158 h10 v5 h-10z" fill="#333"/>${flame(44, 160.5, -1)}
    ${numPanel(352, 132, 56, 28, 22)}${spText(236, 124, 13, 110)}${decals(214, 166)}
    ${wing}
    </g>${W(136, 158)}${W(502, 158)}
    <clipPath id="clip${id}"><path d="${PROTO_BODY}" transform="translate(0 ${-rideH * .6})"/></clipPath>`;
  } else {   // stock car (Gen 4 / ARCA silhouette). Drawn in 980px reference coords, mirrored so the nose faces right.
    const M = 'matrix(-0.636 0 0 0.636 628.6 -188.6)';
    const sh = 14 + aS * 11;   // spoiler blade height grows with aero
    const lower = color === '#f2f2f2' ? accent : '#f4f5f7';
    const band = color === '#f2f2f2' ? shade(accent, 40) : light;
    const steel = x => `<g><circle cx="${x}" cy="158" r="38" fill="url(#tyre${id})"/>
      <circle cx="${x}" cy="158" r="35" fill="none" stroke="${tS >= 1 ? '#c62828' : '#2a2b2f'}" stroke-width="1.2" opacity=".8"/>
      <circle cx="${x}" cy="158" r="25" fill="#16171a"/><circle cx="${x}" cy="158" r="25" fill="none" stroke="${rim}" stroke-width="3"/>
      ${glow ? `<circle cx="${x}" cy="158" r="21" fill="url(#bglow${id})" opacity="${glow}"/>` : ''}
      <circle cx="${x}" cy="158" r="11" fill="#202125" stroke="#2e3035" stroke-width="2"/>
      ${[0, 1, 2, 3, 4].map(i => { const an = i / 5 * Math.PI * 2 - Math.PI / 2; return `<circle cx="${(x + Math.cos(an) * 7).toFixed(1)}" cy="${(158 + Math.sin(an) * 7).toFixed(1)}" r="1.8" fill="#8b9098"/>`; }).join('')}
      <path d="M${x - 30} ${140} A35 35 0 0 1 ${x + 4} ${123}" stroke="#fff" stroke-opacity=".07" stroke-width="3" fill="none"/></g>`;
    body = `<ellipse cx="335" cy="197" rx="285" ry="9" fill="#000" opacity=".7" filter="url(#blur${id})"/>
    <circle cx="183" cy="158" r="41" fill="#070708"/><circle cx="493" cy="158" r="41" fill="#070708"/>
    <g transform="translate(0 ${-rideH * .5})">
    <g transform="${M}">
      <path d="M872 444 L${894 - aS * 2} ${443 - sh} L${908 - aS * 2} ${443 - sh} L914 447 Z" fill="${dark}" stroke="#9aa3ad" stroke-width="3" stroke-opacity=".6"/>
      <path d="${STOCK_BODY}" fill="url(#body${id})"/>
      <g clip-path="url(#clip${id})">
        <path d="M30 548 Q200 572 380 540 Q520 502 640 492 Q790 480 940 444 L940 474 Q790 508 640 522 Q520 532 380 566 Q200 596 30 566 Z" fill="${band}"/>
        <path d="M30 566 Q200 596 380 566 Q520 532 640 522 Q790 508 940 474 L940 640 L30 640 Z" fill="${lower}"/>
        <path d="M30 470 C300 432 600 404 940 428 L940 452 C600 428 300 456 30 494 Z" fill="url(#refl${id})"/>
        <path d="M30 600 L940 590 L940 640 L30 640 Z" fill="#000" opacity=".22"/>
      </g>
      <path d="M386 452 L418 394 Q428 384 452 383 L544 381 L544 452 Z" fill="url(#glass${id})" stroke="#0d0f12" stroke-width="4"/>
      <g stroke="#0d0f12" stroke-width="3.2" opacity=".9">${[466, 480, 494, 508, 522, 536].map(x => `<path d="M${x} 388 V450"/>`).join('')}${[400, 414, 428, 442].map(y => `<path d="M458 ${y} H542"/>`).join('')}</g>
      <path d="M576 381 L640 381 Q664 384 682 402 L668 442 L576 442 Z" fill="url(#glass${id})" stroke="#0d0f12" stroke-width="4"/>
      <path d="M600 386 L560 440 M630 386 L604 440" stroke="#9aa3ad" stroke-width="3" opacity=".35"/>
      <path d="M330 440 L420 386" stroke="#0d0f12" stroke-width="6"/><path d="M474 370 L640 370" stroke="#0d0f12" stroke-width="5"/>
      <path d="M690 378 h26 v6 h-26z M700 371 h20 v5 h-20z" fill="#0d0f12" opacity=".8"/>
      <path d="M700 400 L790 437 L884 440" stroke="${dark}" stroke-width="2.5" fill="none" opacity=".6"/>
      <path d="M140 548 A80 80 0 0 1 290 548 M626 540 A80 80 0 0 1 776 540" stroke="${dark}" stroke-width="4" fill="none" opacity=".45"/>
      <path d="M80 472 Q200 452 330 440" stroke="#fff" stroke-opacity=".35" stroke-width="2.5" fill="none"/>
      <path d="M62 506 Q80 490 118 488 L124 500 Q96 504 74 518 Z" fill="#eef3f8"/><path d="M70 510 Q86 498 112 495" stroke="#7aa6d6" stroke-width="2.5" fill="none" opacity=".7"/>
      <path d="M868 446 L894 448 L890 474 L866 470 Z" fill="#c8232b"/><path d="M872 452 L888 454" stroke="#ff8a80" stroke-width="2.5"/>
      <circle cx="845" cy="452" r="11" fill="#202226" stroke="#3a3d42" stroke-width="2.5"/>
      <path d="M44 590 L40 598 L${aS >= 2 ? 30 : 46} 606 L130 606 L134 596 Z" fill="${carbon}"/>
      <g opacity=".9"><rect x="82" y="540" width="40" height="12" rx="2" fill="#e9ebee"/><rect x="82" y="556" width="40" height="12" rx="2" fill="#e9ebee"/><rect x="82" y="572" width="40" height="10" rx="2" fill="#e9ebee"/></g>
      <rect x="180" y="458" width="64" height="8" rx="2" fill="#f4f5f7" opacity=".9"/>
    </g>
    <path d="M232 178 h14 v5 h-14z" fill="#3a3a3a"/>${flame(246, 180.5, 1)}
    <text x="330" y="166" text-anchor="middle" font-family="${FC}" font-weight="900" font-style="italic" font-size="64" fill="#121316" stroke="#f4f5f7" stroke-width="5" stroke-linejoin="round" paint-order="stroke">${num}</text>
    ${sp ? `<text x="166" y="104" text-anchor="middle" font-family="${FC}" font-weight="900" font-style="italic" font-size="19" letter-spacing=".5" fill="#fff" stroke="#111" stroke-width="3" paint-order="stroke" ${sp.length * 11 > 130 ? 'textLength="130" lengthAdjust="spacingAndGlyphs"' : ''}>${sp}</text>` : ''}
    </g>${steel(183)}${steel(493)}
    <clipPath id="clip${id}"><path d="${STOCK_BODY}"/></clipPath>`;
  }
  const back = bg ? `<rect width="620" height="240" fill="url(#gwall${id})"/>
  <g opacity=".5">${Array.from({ length: 6 }, (_, i) => `<rect x="${24 + i * 100}" y="10" width="92" height="70" rx="2" fill="#20242b" stroke="#2d323a"/>`).join('')}</g>
  <text x="310" y="58" text-anchor="middle" font-family="${FC}" font-weight="800" font-size="30" fill="#fff" opacity=".05" letter-spacing="6">${esc((opts.team || '').toUpperCase())}</text>
  <rect y="178" width="620" height="62" fill="url(#gfloor${id})"/><path d="M0 178 H620" stroke="#ffb21e" stroke-opacity=".35" stroke-width="2"/>
  <rect width="620" height="240" fill="url(#glamp${id})"/>` : '';
  return `<svg class="car" viewBox="0 0 620 ${bg ? 240 : 210}" xmlns="http://www.w3.org/2000/svg">${defs}${back}<g transform="translate(0 ${bg ? 26 : 0})">${body}</g></svg>`;
}

/* ---------- top-down telemetry schematic of the player's car ---------- */
const condCol = v => v < .15 ? '#38d98a' : v < .45 ? '#ffb21e' : '#ff5a5f';   // damage 0..1
const treadCol = r => r > .55 ? '#38d98a' : r > .3 ? '#ffb21e' : '#ff5a5f';    // remaining tread 0..1
function teleCarSVG(c) {
  const tr = clamp(1 - c.wear / 1.2, 0, 1);
  const fr = clamp(1 - c.wear * 1.06 / 1.2, 0, 1);
  const tireFill = c.tire === 'W' ? '#2f7bf5' : '#18191c';
  const tire = (x, y, r) => `<rect x="${x}" y="${y}" width="9" height="18" rx="2.5" fill="${tireFill}" stroke="${treadCol(r)}" stroke-width="2.2"/>`;
  return `<svg viewBox="0 0 64 104" xmlns="http://www.w3.org/2000/svg">
  <rect x="14" y="2" width="36" height="9" rx="2" fill="${condCol(c.dmg.a)}" opacity=".9"/>
  <path d="M22 10 L42 10 L48 30 L48 86 Q48 96 40 96 L24 96 Q16 96 16 86 L16 30Z" fill="#2a2f38" stroke="#4a5160"/>
  <rect x="24" y="36" width="16" height="22" rx="5" fill="#1d2a38"/>
  <rect x="20" y="64" width="24" height="22" rx="3" fill="${condCol(c.dmg.e)}" opacity=".55"/>
  <path d="M8 26 H56 M8 80 H56" stroke="${condCol(c.dmg.s)}" stroke-width="3" opacity=".9"/>
  ${tire(3, 17, fr)}${tire(52, 17, fr)}${tire(3, 71, tr)}${tire(52, 71, tr)}
  <rect x="12" y="96" width="40" height="6" rx="1.5" fill="${condCol(c.dmg.a)}" opacity=".7"/>
  </svg>`;
}
