/* ===================== sound (Web Audio, synthesised – no files) =====================
   Engine sound per car type: firing frequency from rpm and cylinder count, gears with shifts,
   throttle load (accelerating = louder and brighter, lifting = burble / pops), a V8 lope,
   exhaust rasp, turbo whistle, hybrid whine, small random wander and cars passing by.
   Radio blips, pit-gun bursts. Can be switched off; the setting is remembered in this browser. */
const SND = (() => {
  let ctx = null, on = true, eng = null, noiseBuf = null;
  try { on = localStorage.getItem('boxutca_sound') !== '0'; } catch (e) { }
  const ok = () => on && ctx && ctx.state === 'running';
  // cyl = cylinders (4-stroke: firing frequency = rpm / 60 * cyl / 2); gears = top of each gear as a share of top speed
  const PROFILES = {
    stock: { cyl: 8, idle: 900, max: 7200, gears: [.4, .56, .72, .9], vol: .09, cut: 1100, lope: .65, sub: .65, sub2: .5, rasp: .2, turbo: 0, whine: 0, pops: .02, pass: true },
    gt: { cyl: 6, idle: 1100, max: 8000, gears: [.22, .34, .46, .58, .72, .86], vol: .07, cut: 2400, lope: .15, sub: .3, sub2: .12, rasp: .18, turbo: 0, whine: 0, pops: .03, pass: true },
    proto: { cyl: 8, idle: 1600, max: 10200, gears: [.24, .36, .48, .6, .73, .86], vol: .065, cut: 3400, lope: .08, sub: .15, rasp: .15, turbo: 0, whine: .018, pops: .02, pass: true },
    rally: { cyl: 4, idle: 1300, max: 7600, gears: [.2, .32, .45, .58, .72, .86], vol: .07, cut: 2300, lope: .1, sub: .25, sub2: .08, rasp: .3, turbo: .014, whine: 0, pops: .1, pass: false },
  };
  PROFILES.rx = { ...PROFILES.rally, pass: true };
  function unlock() {
    if (!on) return;
    try {
      if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();
    } catch (e) { ctx = null; }
  }
  function noise() {
    if (noiseBuf) return noiseBuf;
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return noiseBuf;
  }
  // a buzzy, slightly uneven combustion wave (strong low harmonics, odd ones a bit louder)
  function engineWave(cyl) {
    const n = 24, re = new Float32Array(n), im = new Float32Array(n);
    for (let k = 1; k < n; k++) im[k] = (1 / Math.pow(k, cyl === 8 ? 1.05 : .9)) * (k % 2 ? 1 : .6) * (k === 1 ? 1.2 : 1);
    return ctx.createPeriodicWave(re, im);
  }
  function start(kind = 'gt') {
    unlock(); if (!ok() || eng) return;
    const P = PROFILES[kind] || PROFILES.gt, t = ctx.currentTime;
    const out = ctx.createGain(), comp = ctx.createDynamicsCompressor(), lp = ctx.createBiquadFilter();
    comp.threshold.value = -18; comp.ratio.value = 4; lp.type = 'lowpass'; lp.Q.value = .8; lp.frequency.value = P.cut; out.gain.value = 0;
    lp.connect(out); out.connect(comp); comp.connect(ctx.destination);
    // main combustion tone, amplitude-modulated by a slow "lope" (V8 burble)
    const main = ctx.createOscillator(), mainG = ctx.createGain(); main.setPeriodicWave(engineWave(P.cyl)); mainG.gain.value = .55;
    const lfo = ctx.createOscillator(), lfoG = ctx.createGain(); lfo.type = 'sine'; lfoG.gain.value = P.lope * .45;
    lfo.connect(lfoG); lfoG.connect(mainG.gain); main.connect(mainG); mainG.connect(lp);
    // sub-harmonic (half the firing frequency): the deep body of the sound
    const sub = ctx.createOscillator(), subG = ctx.createGain(); sub.type = 'triangle'; subG.gain.value = P.sub * .5; sub.connect(subG); subG.connect(lp);
    // a second, deeper one (quarter of the firing frequency): the V8 rumble
    const sub2 = ctx.createOscillator(), sub2G = ctx.createGain(); sub2.type = 'sawtooth'; sub2G.gain.value = (P.sub2 || 0) * .45; sub2.connect(sub2G); sub2G.connect(lp);
    // exhaust rasp: band-passed noise that follows the firing frequency
    const ns = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), nG = ctx.createGain();
    ns.buffer = noise(); ns.loop = true; bp.type = 'bandpass'; bp.Q.value = 1.3; nG.gain.value = 0; ns.connect(bp); bp.connect(nG); nG.connect(lp);
    // turbo whistle and hybrid whine (high, quiet, bypass the low-pass)
    const tb = ctx.createOscillator(), tbG = ctx.createGain(); tb.type = 'sine'; tbG.gain.value = 0; tb.connect(tbG); tbG.connect(out);
    const wh = ctx.createOscillator(), whG = ctx.createGain(); wh.type = 'sine'; whG.gain.value = 0; wh.connect(whG); whG.connect(out);
    [main, lfo, sub, sub2, ns, tb, wh].forEach(o => o.start(t));
    eng = { P, out, lp, main, mainG, lfo, lfoG, sub, subG, sub2, ns, bp, nG, tb, tbG, wh, whG, nodes: [main, lfo, sub, sub2, ns, tb, wh], s: 0, gear: 0, load: .5, lastT: t, nextPass: t + 3 + Math.random() * 5, shiftT: 0 };
  }
  function engine(speed, inPit) {
    if (!eng || !ok()) return;
    if (!Number.isFinite(speed)) speed = 0;
    const e = eng, P = e.P, t = ctx.currentTime, dt = Math.max(.001, Math.min(.2, t - e.lastT)); e.lastT = t;
    const s = clamp(speed, 0, 1.3) * (inPit ? .55 : 1);
    // throttle load from acceleration (smoothed): on the gas = 1, lifting = 0
    const acc = (s - e.s) / dt; e.s = s;
    e.load = lerp(e.load, clamp(.55 + acc * 6, 0, 1), Math.min(1, dt * 6));
    // gears with a little hysteresis; a shift drops the rpm and briefly cuts the sound
    const G = P.gears; let g = e.gear;
    while (g < G.length - 1 && s > G[g] * 1.02) g++;
    while (g > 0 && s < G[g - 1] * .9) g--;
    if (g > e.gear && s > .05) e.shiftT = t;
    e.gear = g;
    const lo = g ? G[g - 1] : 0, hi = G[g], within = clamp((s - lo * .9) / Math.max(.05, hi - lo * .9), 0, 1.1);
    let rpm = s < .02 ? P.idle : P.idle + (P.max - P.idle) * (.45 + .55 * within);
    // a little wander so it is never perfectly steady
    rpm *= 1 + .012 * Math.sin(t * 2.3) + .007 * Math.sin(t * 7.7 + 1) + (Math.random() - .5) * .004;
    const fire = rpm / 60 * P.cyl / 2, shiftCut = t - e.shiftT < .09 ? .35 : 1;
    const tc = .05;
    e.main.frequency.setTargetAtTime(fire, t, tc);
    e.sub.frequency.setTargetAtTime(fire / 2, t, tc); e.sub2.frequency.setTargetAtTime(fire / 4, t, tc);
    e.lfo.frequency.setTargetAtTime(fire / (P.cyl === 8 ? 4 : 6), t, tc);
    e.lfoG.gain.setTargetAtTime(P.lope * (.3 + (1 - e.load) * .5), t, .1);   // more burble off the throttle
    e.bp.frequency.setTargetAtTime(fire * 3, t, tc);
    e.nG.gain.setTargetAtTime(P.rasp * (.25 + e.load * .75) * (s > .02 ? 1 : .3), t, .08);
    e.lp.frequency.setTargetAtTime(P.cut * (.55 + e.load * .6) * (.7 + .5 * rpm / P.max), t, .08);
    e.tb.frequency.setTargetAtTime(2200 + e.load * 3800 * rpm / P.max, t, .15);
    e.tbG.gain.setTargetAtTime(P.turbo * e.load * (rpm / P.max), t, .2);
    e.wh.frequency.setTargetAtTime(rpm / 60 * 28, t, .1);
    e.whG.gain.setTargetAtTime(P.whine * (s > .05 ? 1 : 0), t, .2);
    const vol = s > 0 || speed > 0 ? P.vol * (.6 + .4 * e.load) * (.75 + .25 * rpm / P.max) * shiftCut : 0;
    e.out.gain.setTargetAtTime(vol, t, .06);
    // lifting off: pops and crackles from the exhaust
    if (e.load < .3 && s > .25 && Math.random() < P.pops * dt * 20) pop(.03 + Math.random() * .03);
    // other cars passing (circuits)
    if (P.pass && s > .35 && t > e.nextPass) { passBy(fire); e.nextPass = t + 2.5 + Math.random() * 6; }
  }
  function pop(vol) {
    const t = ctx.currentTime, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noise(); f.type = 'bandpass'; f.frequency.value = 700 + Math.random() * 900; f.Q.value = 1.5;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + .07);
    src.connect(f); f.connect(g); g.connect(ctx.destination); src.start(t, Math.random()); src.stop(t + .09);
  }
  // another car going by: pitch falls (Doppler), pans across, fades in and out
  function passBy(fire) {
    const t = ctx.currentTime, len = .9 + Math.random() * .5, f0 = fire * (1.05 + Math.random() * .2);
    const o = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain(), pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    o.setPeriodicWave(engineWave(eng ? eng.P.cyl : 8)); lp.type = 'lowpass'; lp.frequency.value = 1800;
    o.frequency.setValueAtTime(f0 * 1.12, t); o.frequency.linearRampToValueAtTime(f0 * .86, t + len);
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.035, t + len * .45); g.gain.exponentialRampToValueAtTime(.0001, t + len);
    o.connect(lp); lp.connect(g);
    if (pan) { const d = Math.random() < .5 ? -1 : 1; pan.pan.setValueAtTime(-.8 * d, t); pan.pan.linearRampToValueAtTime(.8 * d, t + len); g.connect(pan); pan.connect(ctx.destination); } else g.connect(ctx.destination);
    o.start(t); o.stop(t + len + .05);
  }
  function stop() {
    if (!eng) return;
    try { eng.out.gain.setTargetAtTime(0, ctx.currentTime, .05); const e = eng; setTimeout(() => { e.nodes.forEach(n => { try { n.stop(); } catch (x) { } }); }, 300); } catch (e) { }
    eng = null;
  }
  function blip(freq, at, len, vol = .06, type = 'sine') {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, at); g.gain.exponentialRampToValueAtTime(.0001, at + len); o.connect(g); g.connect(ctx.destination); o.start(at); o.stop(at + len + .02);
  }
  function radio() { if (!ok()) return; const t = ctx.currentTime; blip(1250, t, .07); blip(950, t + .09, .09); }
  function gun() {
    if (!ok()) return;
    const t = ctx.currentTime, len = .5, buf = ctx.createBuffer(1, ctx.sampleRate * len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) { const ph = (i / ctx.sampleRate) % .12; d[i] = (Math.random() * 2 - 1) * (ph < .07 ? 1 : .1); }
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = 'bandpass'; f.frequency.value = 2500; g.gain.value = .05; src.buffer = buf; src.connect(f); f.connect(g); g.connect(ctx.destination); src.start(t);
    setTimeout(() => { try { const s2 = ctx.createBufferSource(); s2.buffer = buf; s2.connect(f); s2.start(); } catch (e) { } }, 1200);
  }
  let lastKind = 'gt';
  function toggle() {
    on = !on; try { localStorage.setItem('boxutca_sound', on ? '1' : '0'); } catch (e) { }
    if (on) { unlock(); if ((R && !R.headless) || RL) start(lastKind); } else stop();
    paint();
  }
  function paint() { ['#rSnd', '#rlSnd'].forEach(id => { const b = $(id); if (b) b.classList.toggle('off', !on); }); }
  return { start: k => { lastKind = k || 'gt'; start(lastKind); }, stop, engine, radio, gun, toggle, unlock, paint, get on() { return on; } };
})();
