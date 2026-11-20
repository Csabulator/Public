/* ===================== track geometry ===================== */
function catmull(pts, sub = 24, sharp = false) {
  let P = pts;
  if (sharp) { // extra points keep corners tight (street / airfield tracks)
    const q = [];
    for (let i = 0; i < P.length; i++) {
      const a = P[i], b = P[(i + 1) % P.length];
      q.push(a, [lerp(a[0], b[0], .3), lerp(a[1], b[1], .3)], [lerp(a[0], b[0], .7), lerp(a[1], b[1], .7)]);
    }
    P = q;
  }
  const out = [], n = P.length;
  for (let i = 0; i < n; i++) {
    const p0 = P[(i - 1 + n) % n], p1 = P[i], p2 = P[(i + 1) % n], p3 = P[(i + 2) % n];
    for (let k = 0; k < sub; k++) {
      const t = k / sub, t2 = t * t, t3 = t2 * t;
      const f = j => .5 * ((2 * p1[j]) + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3);
      out.push([f(0), f(1)]);
    }
  }
  return out;
}
function ovalPts(o) {
  const out = [], M = 400;
  for (let i = 0; i < M; i++) {
    const a = 2 * Math.PI * i / M, c = Math.cos(a), s = Math.sin(a);
    const x = .5 + o.rx * Math.sign(c) * Math.pow(Math.abs(c), o.p);
    let y = .5 + o.ry * s * (o.egg ? 1 + o.egg * c : 1);
    if (o.tri && s > 0) y += o.tri * Math.pow(s, 6);
    if (o.d && s > 0) y += o.d * s * s;
    out.push([x, y]);
  }
  return out;
}
// sharp (street / airfield) layouts: straight lines joined by circular arcs of radius r, so every corner has a real radius
function filletPath(pts, r) {
  const n = pts.length, out = [];
  for (let i = 0; i < n; i++) {
    const a = pts[(i - 1 + n) % n], b = pts[i], c = pts[(i + 1) % n];
    const u = [a[0] - b[0], a[1] - b[1]], v = [c[0] - b[0], c[1] - b[1]], lu = Math.hypot(...u), lv = Math.hypot(...v);
    const ux = u[0] / lu, uy = u[1] / lu, vx = v[0] / lv, vy = v[1] / lv;
    const th = Math.acos(clamp(ux * vx + uy * vy, -1, 1));   // angle between the two legs
    let tl = r / Math.tan(th / 2); tl = Math.min(tl, lu * .45, lv * .45);
    const rr = tl * Math.tan(th / 2);
    const p1 = [b[0] + ux * tl, b[1] + uy * tl], p2 = [b[0] + vx * tl, b[1] + vy * tl];
    const bx = ux + vx, by = uy + vy, bl = Math.hypot(bx, by) || 1, dc = rr / Math.sin(th / 2);
    const cc = [b[0] + bx / bl * dc, b[1] + by / bl * dc];
    let a1 = Math.atan2(p1[1] - cc[1], p1[0] - cc[0]), a2 = Math.atan2(p2[1] - cc[1], p2[0] - cc[0]);
    let d = a2 - a1; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    const steps = 14;
    for (let k = 0; k <= steps; k++) { const an = a1 + d * k / steps; out.push([cc[0] + Math.cos(an) * rr, cc[1] + Math.sin(an) * rr]); }
  }
  // densify the straights
  const dense = [];
  for (let i = 0; i < out.length; i++) {
    const a = out[i], b = out[(i + 1) % out.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]), m = Math.max(1, Math.ceil(L / .01));
    for (let k = 0; k < m; k++) dense.push([lerp(a[0], b[0], k / m), lerp(a[1], b[1], k / m)]);
  }
  return dense;
}
const TRACK_CACHE = {};
function buildTrack(pool, idx) {
  const key = pool + idx; if (TRACK_CACHE[key]) return TRACK_CACHE[key];
  const T = POOLS[pool][idx];
  const raw = T.o ? ovalPts(T.o) : T.sharp ? filletPath(T.pts, .065) : catmull(T.pts, 24);
  // resample by arc length into N equally spaced points
  const N = 800, seg = [0];
  for (let i = 1; i <= raw.length; i++) { const a = raw[i - 1], b = raw[i % raw.length]; seg.push(seg[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
  const L = seg[seg.length - 1], pts = []; let j = 0;
  for (let i = 0; i < N; i++) {
    const d = i / N * L; while (seg[j + 1] < d) j++;
    const t = (d - seg[j]) / (seg[j + 1] - seg[j] || 1), a = raw[j], b = raw[(j + 1) % raw.length];
    pts.push([lerp(a[0], b[0], t), lerp(a[1], b[1], t)]);
  }
  if (T.o) { // start on the bottom (front) straight, counter-clockwise
    pts.reverse(); let best = 0, by = -1;
    for (let i = 0; i < N; i++) { const p = pts[i]; if (Math.abs(p[0] - .5) < .02 && p[1] > by) { by = p[1]; best = i; } }
    pts.push(...pts.splice(0, best));
  }
  const ang = [], curv = [];
  for (let i = 0; i < N; i++) { const a = pts[(i - 2 + N) % N], b = pts[(i + 2) % N]; ang.push(Math.atan2(b[1] - a[1], b[0] - a[0])); }
  const W = 14;
  for (let i = 0; i < N; i++) {
    let d = ang[(i + W) % N] - ang[(i - W + N) % N];
    while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    curv.push(Math.abs(d));
  }
  let c = curv.slice();
  for (let pass = 0; pass < 3; pass++) c = c.map((v, i) => { let s = 0; for (let k = -8; k <= 8; k++) s += c[(i + k + N) % N]; return s / 17; });
  const mx = Math.max(...c) || 1; c = c.map(v => clamp(v / mx, 0, 1));
  if (!T.o) c = c.map(v => v < .12 ? 0 : (v - .12) / .88);
  let P2 = pts, A2 = ang, C2 = c;
  const FLAT = .15, rot = (arr, k) => arr.slice(k).concat(arr.slice(0, k));
  if (!T.o) {   // road: start/finish line on the longest straight (60% along it)
    let best = 0, bestS = 0, cur = 0, curS = 0;
    for (let i = 0; i < 2 * N; i++) {
      if (c[i % N] < FLAT) { if (cur === 0) curS = i; cur++; if (cur > best && cur <= N) { best = cur; bestS = curS; } }
      else cur = 0;
    }
    const start = (bestS + Math.floor(best * .6)) % N;
    P2 = rot(pts, start); A2 = rot(ang, start); C2 = rot(c, start);
  }
  // pit lane: entry before the line, exit after it, on the inside of the straight
  let back = 0, fwd = 0;
  while (back < N / 2 && C2[(N - back - 1) % N] < FLAT) back++;
  while (fwd < N / 2 && C2[(fwd + 1) % N] < FLAT) fwd++;
  // ovals: pit road along the whole front stretch; road courses: as much of the straight as there is
  const pitE = T.o ? 84 : clamp(back - 6, 36, 72), pitX = T.o ? 72 : clamp(fwd - 6, 30, 60);
  let cx = 0, cy = 0; P2.forEach(p => { cx += p[0]; cy += p[1]; }); cx /= N; cy /= N;
  const nx = -Math.sin(A2[0]), ny = Math.cos(A2[0]);
  const pitSide = (cx - P2[0][0]) * nx + (cy - P2[0][1]) * ny > 0 ? 1 : -1;
  const geo = C2.map(v => 1 - v * (1 - T.ratio));   // corner speed factor
  const tr = { ...T, pool, idx, N, pts: P2, ang: A2, c: C2, geo, oval: !!T.o, pitE, pitX, pitSide };
  TRACK_CACHE[key] = tr; return tr;
}
function trackSVG(pool, idx, w = 100, h = 75, stroke = '#e6e9ef', sw = 4) {
  const t = buildTrack(pool, idx); let d = '';
  for (let i = 0; i < t.N; i += 4) { const p = t.pts[i]; d += (i ? 'L' : 'M') + (p[0] * w).toFixed(1) + ' ' + (p[1] * h).toFixed(1); }
  const s = t.pts[0];
  return `<svg viewBox="-4 -4 ${w + 8} ${h + 8}" xmlns="http://www.w3.org/2000/svg"><path d="${d}Z" fill="none" stroke="#000" stroke-opacity=".35" stroke-width="${sw + 3}" stroke-linejoin="round"/><path d="${d}Z" fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"/><circle cx="${(s[0] * w).toFixed(1)}" cy="${(s[1] * h).toFixed(1)}" r="${sw * .9}" fill="#ffb21e"/></svg>`;
}
