/* ===================== car setup & practice =====================
   Four settings from 1 to 9. Every track has a hidden ideal; the closer the setup,
   the faster the car. Practice laps give the engineer's feedback. */
function idealSetup(tr) {
  const corner = tr.c.reduce((a, b) => a + b, 0) / tr.N;
  const h = k => ((hashStr(tr.id + k) % 3) - 1);   // small fixed per-track variation
  let wing, gear;
  if (tr.oval) { wing = 1 + (1 - tr.ratio) * 9; gear = 2 + (tr.lt - 3) * 2.4; }
  else { wing = 3 + corner * 9 + (1 - tr.ratio) * 4; gear = 8.5 - corner * 10; }
  const ride = 2 + tr.bump * 8;
  const press = 3 + (tr.wear - .85) * 8;
  const fix = (v, k) => clamp(Math.round(v) + h(k), 1, 9);
  return { wing: fix(wing, 'w'), gear: fix(gear, 'g'), ride: fix(ride, 'r'), press: fix(press, 'p') };
}
function setupQuality(tr, s) {
  const id = idealSetup(tr);
  const err = SETUP.reduce((a, k) => a + Math.abs(s[k] - id[k]), 0);
  return clamp(1 - err / 14, 0, 1);
}
// speed factor from setup quality: perfect +1.2%, poor about -1.2%
const setupSpeed = q => 1 + (q - .6) * .03;
// ride height too low for a bumpy track -> more mistakes; tyre pressure off -> wear / grip trade-off
function setupEffects(tr, s) {
  const id = idealSetup(tr);
  return {
    err: 1 + Math.max(0, id.ride - s.ride) * .12,
    wear: 1 + (id.press - s.press) * .05
  };
}
function defaultSetup(tr) { return S.setups[tr.pool + tr.id] ? { ...S.setups[tr.pool + tr.id] } : { wing: 5, gear: 5, ride: 5, press: 5 }; }
// engineer feedback after a practice run: the larger the error, the more likely it is noticed
function practiceFeedback(tr, s, driver) {
  const id = idealSetup(tr), noise = clamp(1.5 - S.staff.eng * .11 - driver.cons / 220, .25, 1.5);
  const obs = SETUP.map(k => ({ k, d: s[k] - id[k] + randn() * noise }));
  obs.sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
  const out = [];
  for (const o of obs.slice(0, 2)) if (Math.abs(o.d) >= .8) out.push('fb.' + o.k + (o.d > 0 ? '.hi' : '.lo'));
  if (!out.length) out.push('fb.good');
  return out;
}
function practiceLap(tr, s, driver) {
  const base = tr.oval ? 22 + tr.lt * 4 : 84 + (tr.N > 0 ? (1 - tr.ratio) * 18 : 0);
  const q = setupQuality(tr, s), e = drvEff(driver);
  return base * (1 - (q - .6) * .03) * (1 - (e.D - 50) * .0012) + randn() * .25 * (1.4 - e.K / 100);
}
const fmtLap = s => { const m = Math.floor(s / 60), r = s - m * 60; return (m ? m + ':' + (r < 10 ? '0' : '') : '') + r.toFixed(3); };
