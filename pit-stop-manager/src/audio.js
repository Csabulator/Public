/* ===================== sound (Web Audio, synthesised – no files) =====================
   Engine note follows the selected car's speed; radio blips, pit-gun bursts.
   Can be switched off; the setting is remembered in this browser. */
const SND = (() => {
  let ctx = null, on = true, eng = null;
  try { on = localStorage.getItem('boxutca_sound') !== '0'; } catch (e) { }
  const ok = () => on && ctx && ctx.state === 'running';
  function unlock() {
    if (!on) return;
    try {
      if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();
    } catch (e) { ctx = null; }
  }
  function start() {
    unlock(); if (!ok() || eng) return;
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o1.type = 'sawtooth'; o2.type = 'square'; f.type = 'lowpass'; f.frequency.value = 900; f.Q.value = 3; g.gain.value = 0;
    o1.connect(f); o2.connect(f); f.connect(g); g.connect(ctx.destination); o1.start(); o2.start();
    eng = { o1, o2, f, g };
  }
  function engine(speed, inPit) {
    if (!eng || !ok()) return;
    if (!Number.isFinite(speed)) speed = 0;
    const t = ctx.currentTime, s = clamp(speed, 0, 1.3), base = 55 + s * 150 * (inPit ? .55 : 1);
    eng.o1.frequency.setTargetAtTime(base, t, .08); eng.o2.frequency.setTargetAtTime(base * .5, t, .08);
    eng.f.frequency.setTargetAtTime(400 + s * 1400, t, .1);
    eng.g.gain.setTargetAtTime(s > 0 ? .035 + s * .03 : 0, t, .1);
  }
  function stop() { if (!eng) return; try { eng.g.gain.setTargetAtTime(0, ctx.currentTime, .05); const e = eng; setTimeout(() => { try { e.o1.stop(); e.o2.stop(); } catch (x) { } }, 300); } catch (e) { } eng = null; }
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
  function toggle() {
    on = !on; try { localStorage.setItem('boxutca_sound', on ? '1' : '0'); } catch (e) { }
    if (on) { unlock(); if (R && !R.headless) start(); } else stop();
    paint();
  }
  function paint() { const b = $('#rSnd'); if (b) b.classList.toggle('off', !on); }
  return { start, stop, engine, radio, gun, toggle, unlock, paint, get on() { return on; } };
})();
