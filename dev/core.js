// Flywheel Brake Lab core (spec 04). Takes the interface state in display units
// (kg, mm, rpm, N, N·m, J/(kg·°C)), converts to SI, and returns plain results in
// SI: moment of inertia, the lever-and-shoe brake, the constant-torque stop,
// energy and the temperature-rise limit, plus reading slow-motion video data,
// the least-squares fit of θ(t), and the braking torque and friction the data
// imply. It also builds the show-the-working steps, the predict-first targets
// and the drawing description. Pure functions; tested in dev/test.js.
const BrakeLab = (function () {
  'use strict';
  const St = typeof Stats !== 'undefined' ? Stats : require('./vendor/stats.js');
  const isNum = v => typeof v === 'number' && isFinite(v);
  const TAU = 2 * Math.PI;
  const rpmToRad = n => n * TAU / 60, radToRpm = w => w * 60 / TAU;
  const MAX_ROWS = 2000;

  const WHEELS = {
    disk: 'Solid disk',
    hoop: 'Thin hoop',
    both: 'Disk + hoop (hub and rim)',
    custom: 'Custom I',
  };
  // Specific heat presets (spec 04 §3.5): only iron or steel has a sourced value; the
  // teacher enters anything else (QUESTIONS Q17).
  const HEAT = { steel: { label: 'Iron or steel (OpenStax Table 14.1)', c: 452 }, custom: { label: 'Custom (enter c)', c: null } };

  const SOURCES = {
    inertia: 'OpenStax College Physics 2e, 10.3',
    ke: 'OpenStax College Physics 2e, 10.4',
    work: 'OpenStax University Physics Vol. 1, 10.8',
    heat: 'OpenStax College Physics 2e, 14.2',
    lever: 'IIT Kharagpur NPTEL, Design of brakes, module 12 lesson 1',
    shoe: 'ExtruDesign, single block brake',
    fit: 'Least-squares quadratic fit of θ(t)',
  };

  // Example data sets for the Data tab (labelled as examples in the interface).
  // FB-6: 240 fps, frame numbers and cumulative turns of a marker.
  const EXAMPLE_BRAKE = 'fps 240\n0, 0\n120, 2.3011\n240, 4.2042\n360, 5.7095\n480, 6.8169\n600, 7.5264\n720, 7.8380';
  // A coast-down with the brake off: 300 rpm, α = −0.5 rad/s² (FB-8), same frames.
  const EXAMPLE_COAST = 'fps 240\n' + [0, 120, 240, 360, 480, 600, 720].map(f => {
    const t = f / 240; return f + ', ' + ((rpmToRad(300) * t - 0.25 * t * t) / TAU).toFixed(4);
  }).join('\n');

  function emptyRun() { return { format: 'frames', fps: 240, text: '', i0: null, i1: null }; }
  function defaultState() {
    return {
      mode: 'sandbox', tab: 'model',
      wheel: 'disk', m: 8, r: 150, mH: 8, rH: 150, customI: 0.09, rDrum: 150,
      N0: 300,
      P: 20, l: 300, x: 100, a: 0, dir: 'energizing', mu: 0.35, Td: 0,
      mPart: 8, heat: 'steel', c: 452,
      speed: 1,
      runs: { brake: emptyRun(), coast: emptyRun() }, run: 'brake', useCoast: true,
    };
  }

  // Field rules (spec 04 §4, 00 §8). Units are the display units.
  const FIELDS = {
    m: { name: 'Mass', unit: 'kg', min: 0.01, max: 200 },
    r: { name: 'Radius', unit: 'mm', min: 5, max: 1000 },
    mH: { name: 'Rim mass', unit: 'kg', min: 0.01, max: 200 },
    rH: { name: 'Rim radius', unit: 'mm', min: 5, max: 1000 },
    customI: { name: 'Moment of inertia', unit: 'kg·m²', min: 0.00001, max: 100 },
    rDrum: { name: 'Drum radius', unit: 'mm', min: 5, max: 1000 },
    N0: { name: 'Starting speed', unit: 'rpm', min: 1, max: 3000 },
    P: { name: 'Hand force', unit: 'N', min: 0, max: 1000 },
    l: { name: 'Lever arm to hand', unit: 'mm', min: 10, max: 2000 },
    x: { name: 'Pivot to normal line', unit: 'mm', min: 5, max: 1000 },
    a: { name: 'Pivot offset from friction line', unit: 'mm', min: -500, max: 500 },
    mu: { name: 'Friction μ', min: 0.01, max: 1.5 },
    Td: { name: 'Bearing drag', unit: 'N·m', min: 0, max: 100 },
    mPart: { name: 'Heated part mass', unit: 'kg', min: 0.01, max: 200 },
    c: { name: 'Specific heat', unit: 'J/(kg·°C)', min: 1, max: 5000 },
    fps: { name: 'Frames per second', unit: 'fps', gt: 0, max: 100000 },
  };

  /* ------------------------------------------------------------ wheel (§3.1) */
  function inertia(s) {
    const r = s.r / 1000, rH = s.rH / 1000;
    if (s.wheel === 'custom') return { I: s.customI, rDrum: s.rDrum / 1000, parts: [] };
    const disk = { kind: 'disk', m: s.m, r, I: 0.5 * s.m * r * r };
    const hoop = { kind: 'hoop', m: s.m, r, I: s.m * r * r };
    if (s.wheel === 'disk') return { I: disk.I, rDrum: r, parts: [disk] };
    if (s.wheel === 'hoop') return { I: hoop.I, rDrum: r, parts: [hoop] };
    // Disk + hoop: a hub disk (m, r) and a rim hoop (mH, rH). The brake acts on the outer one.
    const rim = { kind: 'hoop', m: s.mH, r: rH, I: s.mH * rH * rH };
    return { I: disk.I + rim.I, rDrum: Math.max(r, rH), parts: [disk, rim] };
  }

  /* ------------------------------------------------------------ lever and shoe (§3.2) */
  // Moments about the pivot O: N x ∓ F a = P l with F = μN. The energizing direction uses
  // the minus sign. A denominator at or below zero means the shoe grabs with no hand force.
  function lever(s) {
    const P = s.P, l = s.l / 1000, x = s.x / 1000, a = s.a / 1000;
    const sign = s.dir === 'energizing' ? -1 : 1;
    const den = x + sign * s.mu * a;
    if (!(den > 0)) return { P, l, x, a, sign, den, selfLocking: true, N: null, F: null, factor: null };
    const N = P * l / den;
    return { P, l, x, a, sign, den, selfLocking: false, N, F: s.mu * N, factor: a !== 0 ? x / den : null };
  }

  /* ------------------------------------------------------------ stop, energy, heat (§3.3, §3.5) */
  function model(s) {
    const w = inertia(s), lv = lever(s);
    const w0 = rpmToRad(s.N0);
    const KE = 0.5 * w.I * w0 * w0;
    const out = { wheel: w, I: w.I, rDrum: w.rDrum, lever: lv, w0, KE, Td: s.Td };
    out.dTmax = KE / (s.mPart * s.c);
    if (lv.selfLocking) {
      Object.assign(out, { Tb: null, T: null, alpha: null, t: null, theta: null, turns: null, Eb: null, Ed: null, stops: false,
        reason: 'the brake is self-locking: it grabs with no hand force' });
      return out;
    }
    const Tb = s.mu * lv.N * w.rDrum;
    const T = Tb + s.Td;
    Object.assign(out, { Tb, T });
    if (!(T > 0)) {
      Object.assign(out, { alpha: 0, t: null, theta: null, turns: null, Eb: 0, Ed: 0, stops: false, reason: 'no braking torque: the wheel keeps spinning' });
      return out;
    }
    const alpha = T / w.I;
    const theta = w0 * w0 / (2 * alpha);
    Object.assign(out, {
      alpha, t: w0 / alpha, theta, turns: theta / TAU, stops: true, reason: null,
      Eb: Tb * theta, Ed: s.Td * theta,                  // work by each torque; they add to KE
    });
    return out;
  }
  // Spin-down at constant deceleration: ω(t), θ(t) from the moment the brake goes on.
  const omegaAt = (w0, alpha, t) => Math.max(0, w0 - alpha * t);
  function angleAt(w0, alpha, t) { if (!(alpha > 0)) return w0 * t; const ts = Math.min(t, w0 / alpha); return w0 * ts - 0.5 * alpha * ts * ts; }

  /* ------------------------------------------------------------ video data (§3.4) */
  // Rows of numbers separated by commas, tabs, spaces or semicolons. A line "fps 240" sets the
  // frame rate in the frame-count format. A first line of words (a header) is skipped.
  function parseData(text, format, fps) {
    const lines = String(text == null ? '' : text).replace(/\r/g, '').split('\n').map(x => x.trim()).filter(x => x !== '');
    let fpsIn = fps;
    const nums = [];
    for (let k = 0; k < lines.length; k++) {
      const line = lines[k];
      const m = /^fps\s*[:=,]?\s*([0-9.]+)\s*$/i.exec(line);
      if (m) { fpsIn = Number(m[1]); continue; }
      const parts = line.split(/[\s,;\t]+/).filter(x => x !== '');
      const vals = parts.map(p => /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(p) ? Number(p) : NaN);
      if (vals.some(v => !isNum(v))) {
        if (nums.length === 0 && k === 0) continue;          // header row
        return { rows: [], fps: fpsIn, error: 'Line ' + (k + 1) + ' ("' + line + '") is not a list of numbers.' };
      }
      nums.push({ line: k + 1, vals });
    }
    if (nums.length > MAX_ROWS) return { rows: [], fps: fpsIn, error: 'Use at most ' + MAX_ROWS + ' rows.' };
    let rows = [];
    if (format === 'perturn') {
      // Times for each successive full turn (s). Cumulative time against cumulative turns, from (0, 0).
      const times = [].concat(...nums.map(n => n.vals));
      if (times.some(v => !(v > 0))) return { rows: [], fps: fpsIn, error: 'Each turn time must be more than 0 s.' };
      let t = 0;
      rows.push({ t: 0, turns: 0 });
      times.forEach((dt, i) => { t += dt; rows.push({ t, turns: i + 1 }); });
    } else {
      for (const n of nums) if (n.vals.length !== 2) return { rows: [], fps: fpsIn, error: 'Line ' + n.line + ' needs two numbers: ' + (format === 'frames' ? 'frame number and turns' : 'time and turns') + '.' };
      if (format === 'frames') {
        if (nums.length && !(fpsIn > 0)) return { rows: [], fps: fpsIn, error: 'Enter the video\'s frames per second (for example 240 for slow motion).', fpsMissing: true };
        rows = nums.map(n => ({ t: n.vals[0] / fpsIn, turns: n.vals[1], frame: n.vals[0] }));
      } else {
        rows = nums.map(n => ({ t: n.vals[0], turns: n.vals[1] }));
      }
    }
    for (let i = 1; i < rows.length; i++) if (!(rows[i].t > rows[i - 1].t)) return { rows: [], fps: fpsIn, error: 'Times must go up from row to row (row ' + (i + 1) + ' does not).' };
    rows.forEach(r => { r.theta = TAU * r.turns; });
    return { rows, fps: fpsIn, error: null };
  }

  // Fit one run over its window (row indices i0..i1, both included; null means all rows).
  function fitRun(run) {
    const pd = parseData(run.text, run.format, run.fps);
    const n = pd.rows.length;
    const out = { parsed: pd, rows: pd.rows, n, error: pd.error, fit: null };
    if (pd.error || n === 0) return out;
    const i0 = run.i0 === null || run.i0 === undefined ? 0 : Math.max(0, Math.min(n - 1, run.i0));
    const i1 = run.i1 === null || run.i1 === undefined ? n - 1 : Math.max(i0, Math.min(n - 1, run.i1));
    out.i0 = i0; out.i1 = i1;
    const win = pd.rows.slice(i0, i1 + 1);
    const f = St.polyfit2(win.map(r => r.t), win.map(r => r.theta));
    if (f.error) { out.error = f.error; return out; }
    out.fit = { theta0: f.c0, w0: f.c1, alpha: 2 * f.c2, r2: f.r2, residuals: f.residuals, ts: f.ts, n: f.n };
    return out;
  }

  // §3.4: the braking torque and friction the data imply, and the comparison with the model.
  function measured(s, mod) {
    const b = fitRun(s.runs.brake), c = fitRun(s.runs.coast);
    const out = { brake: b, coast: c, Tb: null, mu: null, t: null, useCoast: false };
    if (!b.fit) return out;
    const useCoast = s.useCoast && !!c.fit;
    const aB = Math.abs(b.fit.alpha), aC = useCoast ? Math.abs(c.fit.alpha) : 0;
    out.useCoast = useCoast; out.aB = aB; out.aC = aC;
    out.Tb = mod.I * (aB - aC);
    out.mu = mod.lever.N > 0 ? out.Tb / (mod.lever.N * mod.rDrum) : null;
    out.muReason = out.mu === null ? (mod.lever.selfLocking ? 'the lever model has no normal force (self-locking)' : 'the normal force is 0') : null;
    out.t = aB > 0 && b.fit.w0 > 0 ? b.fit.w0 / aB : null;   // when the fitted ω(t) reaches 0
    return out;
  }

  function solve(s) {
    const mod = model(s);
    return { model: mod, meas: measured(s, mod) };
  }

  /* ------------------------------------------------------------ predict-first targets (§6) */
  // Quantity names are fixed in ecosystem/schemas.md.
  function targets(sol) {
    const m = sol.model, why = m.reason;
    return [
      { key: 'N', quantity: 'normal force N', label: 'Normal force N', unit: 'N', model: m.lever.N, reason: why },
      { key: 'Tb', quantity: 'braking torque T_b', label: 'Braking torque T<sub>b</sub>', unit: 'N·m', model: m.Tb, reason: why },
      { key: 't', quantity: 'stopping time t', label: 'Stopping time t', unit: 's', model: m.t, reason: why },
      { key: 'turns', quantity: 'turns to stop', label: 'Turns to stop', unit: 'turns', model: m.turns, reason: why },
      { key: 'dT', quantity: 'temperature rise upper limit', label: 'ΔT upper limit', unit: '°C', model: m.dTmax },
    ];
  }

  /* ------------------------------------------------------------ show the working (00 §5) */
  function working(sol, s, f, fu) {
    const m = sol.model, lv = m.lever, w = m.wheel;
    const mm = v => fu(v * 1000, 'mm');
    const wb = [];
    if (s.wheel === 'custom') wb.push({ title: 'Moment of inertia', formula: 'entered', sub: '', result: fu(m.I, 'kg·m²'), source: SOURCES.inertia });
    w.parts.forEach(p => wb.push({
      title: p.kind === 'disk' ? 'Solid disk' : 'Thin hoop', formula: p.kind === 'disk' ? 'I = ½ m r²' : 'I = m r²',
      sub: (p.kind === 'disk' ? '½ × ' : '') + fu(p.m, 'kg') + ' × (' + mm(p.r) + ')²', result: fu(p.I, 'kg·m²'), source: SOURCES.inertia,
    }));
    if (w.parts.length > 1) wb.push({ title: 'Whole wheel', formula: 'I = I_disk + I_hoop', sub: fu(w.parts[0].I, 'kg·m²') + ' + ' + fu(w.parts[1].I, 'kg·m²'), result: fu(m.I, 'kg·m²'), source: SOURCES.inertia });
    const energ = s.dir === 'energizing';
    const why = lv.a === 0 ? 'With a = 0 the friction force passes through the pivot and has no moment, so the direction does not matter.'
      : energ ? 'In this direction the friction force turns the lever the same way as your hand, so it helps press the shoe on (self-energizing).'
        : 'In this direction the friction force turns the lever against your hand, so it eases the shoe off.';
    wb.push({ title: 'Moments about the pivot O', formula: energ ? 'N x − μ N a = P l' : 'N x + μ N a = P l', sub: 'N × ' + mm(lv.x) + (energ ? ' − ' : ' + ') + f(s.mu) + ' × N × ' + mm(lv.a) + ' = ' + fu(s.P, 'N') + ' × ' + mm(lv.l), result: lv.selfLocking ? 'no solution' : '', note: why, source: SOURCES.lever });
    if (lv.selfLocking) {
      wb.push({ title: 'Self-locking', formula: energ ? 'x − μ a ≤ 0' : 'x + μ a ≤ 0', sub: mm(lv.x) + (energ ? ' − ' : ' + ') + f(s.mu) + ' × ' + mm(lv.a) + ' = ' + mm(lv.den), result: 'the brake grabs', note: 'The friction moment alone is enough to press the shoe on, so the brake grabs with no hand force. Designers keep the geometry short of this point.', source: SOURCES.shoe });
      return [{ heading: 'Wheel and brake', steps: wb }];
    }
    wb.push({ title: 'Normal force on the shoe', formula: energ ? 'N = P l / (x − μ a)' : 'N = P l / (x + μ a)', sub: fu(s.P, 'N') + ' × ' + mm(lv.l) + ' / ' + mm(lv.den), result: fu(lv.N, 'N'), note: lv.factor === null ? '' : 'Self-energizing factor x / (x ' + (energ ? '−' : '+') + ' μ a) = ' + f(lv.factor) + '.', source: SOURCES.lever });
    wb.push({ title: 'Friction force', formula: 'F = μ N', sub: f(s.mu) + ' × ' + fu(lv.N, 'N'), result: fu(lv.F, 'N'), note: 'Short shoe: pressure is taken as even, with friction acting at the middle of the shoe.', source: SOURCES.shoe });
    wb.push({ title: 'Braking torque', formula: 'T_b = μ N r', sub: f(s.mu) + ' × ' + fu(lv.N, 'N') + ' × ' + mm(m.rDrum), result: fu(m.Tb, 'N·m'), source: SOURCES.shoe });

    const st = [];
    st.push({ title: 'Starting speed', formula: 'ω₀ = 2π N₀ / 60', sub: '2π × ' + fu(s.N0, 'rpm') + ' / 60', result: fu(m.w0, 'rad/s'), source: SOURCES.work });
    if (s.Td > 0) st.push({ title: 'Total retarding torque', formula: 'T = T_b + T_d', sub: fu(m.Tb, 'N·m') + ' + ' + fu(s.Td, 'N·m'), result: fu(m.T, 'N·m'), source: SOURCES.inertia });
    if (m.stops) {
      st.push({ title: 'Angular deceleration', formula: 'α = T / I', sub: fu(m.T, 'N·m') + ' / ' + fu(m.I, 'kg·m²'), result: fu(m.alpha, 'rad/s²'), source: SOURCES.inertia });
      st.push({ title: 'Stopping time', formula: 't = ω₀ / α', sub: fu(m.w0, 'rad/s') + ' / ' + fu(m.alpha, 'rad/s²'), result: fu(m.t, 's'), source: SOURCES.inertia });
      st.push({ title: 'Angle to stop', formula: 'θ = ω₀² / (2α)', sub: '(' + fu(m.w0, 'rad/s') + ')² / (2 × ' + fu(m.alpha, 'rad/s²') + ')', result: fu(m.theta, 'rad') + ' = ' + fu(m.turns, 'turns'), source: SOURCES.inertia });
    } else {
      st.push({ title: 'Stopping time', formula: 't = ω₀ / α', sub: 'α = 0', result: 'not defined', note: 'No braking torque: the wheel keeps spinning.', source: SOURCES.inertia });
    }
    st.push({ title: 'Kinetic energy', formula: 'KE = ½ I ω₀²', sub: '½ × ' + fu(m.I, 'kg·m²') + ' × (' + fu(m.w0, 'rad/s') + ')²', result: fu(m.KE, 'J'), source: SOURCES.ke });
    if (m.stops && s.Td > 0) st.push({ title: 'Where the energy goes', formula: 'W_b = T_b θ,  W_d = T_d θ', sub: fu(m.Tb, 'N·m') + ' × ' + fu(m.theta, 'rad') + ',  ' + fu(s.Td, 'N·m') + ' × ' + fu(m.theta, 'rad'), result: fu(m.Eb, 'J') + ' brake, ' + fu(m.Ed, 'J') + ' bearings', source: SOURCES.work });
    st.push({ title: 'Temperature rise, upper limit', formula: 'ΔT ≤ KE / (m c)', sub: fu(m.KE, 'J') + ' / (' + fu(s.mPart, 'kg') + ' × ' + fu(s.c, 'J/(kg·°C)') + ')', result: fu(m.dTmax, '°C'), note: 'An upper limit: it assumes all the energy heats this one part. Some goes into the pad, the air and sound.', source: SOURCES.heat });

    const groups = [{ heading: 'Wheel and brake', steps: wb }, { heading: 'Stop and energy', steps: st }];
    const ms = sol.meas;
    if (ms.brake.fit) {
      const d = [];
      const bf = ms.brake.fit;
      d.push({ title: 'Fit of the braking run', formula: 'θ(t) = θ₀ + ω₀ t + ½ α t²', sub: bf.n + ' points from ' + fu(ms.brake.rows[ms.brake.i0].t, 's') + ' to ' + fu(ms.brake.rows[ms.brake.i1].t, 's'), result: 'ω₀ = ' + fu(bf.w0, 'rad/s') + ', α = ' + fu(bf.alpha, 'rad/s²') + ', R² = ' + (bf.r2 === null ? 'not defined' : bf.r2.toFixed(4)), source: SOURCES.fit });
      if (ms.useCoast) d.push({ title: 'Fit of the coast-down run', formula: 'θ(t) = θ₀ + ω₀ t + ½ α t²', sub: ms.coast.fit.n + ' points, brake off', result: 'α_coast = ' + fu(ms.coast.fit.alpha, 'rad/s²'), source: SOURCES.fit });
      d.push({ title: 'Braking torque from the data', formula: 'T_b,meas = I (|α_brake| − |α_coast|)', sub: fu(m.I, 'kg·m²') + ' × (' + fu(ms.aB, 'rad/s²') + ' − ' + fu(ms.aC, 'rad/s²') + ')', result: fu(ms.Tb, 'N·m'), note: ms.useCoast ? 'The coast-down takes out the bearing drag.' : 'No coast-down run, so bearing drag is taken as 0.', source: SOURCES.inertia });
      if (ms.mu !== null) d.push({ title: 'Friction from the data', formula: 'μ_meas = T_b,meas / (N r)', sub: fu(ms.Tb, 'N·m') + ' / (' + fu(lv.N, 'N') + ' × ' + mm(m.rDrum) + ')', result: f(ms.mu), note: 'N comes from the lever model.', source: SOURCES.shoe });
      if (ms.t !== null) d.push({ title: 'Stopping time from the data', formula: 't_meas = ω₀ / |α|', sub: fu(bf.w0, 'rad/s') + ' / ' + fu(ms.aB, 'rad/s²'), result: fu(ms.t, 's'), source: SOURCES.inertia });
      groups.push({ heading: 'From the video data', steps: d });
    }
    return groups;
  }

  /* ------------------------------------------------------------ description for screen readers */
  function describe(sol, s, fu, masked) {
    const m = sol.model, lv = m.lever;
    let t = WHEELS[s.wheel] + ' wheel, moment of inertia ' + fu(m.I, 'kilogram square meters') + ', starting at ' + fu(s.N0, 'rpm') + '. ';
    t += 'Lever brake: hand force ' + fu(s.P, 'N') + ' at ' + fu(s.l, 'mm') + ', shoe at ' + fu(s.x, 'mm') + ' from the pivot, offset ' + fu(s.a, 'mm') + ', ' + (s.dir === 'energizing' ? 'energizing' : 'other') + ' direction. ';
    if (lv.selfLocking) return t + 'The brake is self-locking: it grabs with no hand force.';
    if (!masked) t += m.stops ? 'Braking torque ' + fu(m.Tb, 'N·m') + '. The wheel stops in ' + fu(m.t, 'seconds') + ' after ' + fu(m.turns, 'turns') + '.' : 'There is no braking torque, so the wheel keeps spinning.';
    return t;
  }

  /* ------------------------------------------------------------ inputs snapshot (SI) for the log */
  function snapshot(s) {
    const w = inertia(s);
    return {
      values: { I: w.I, rDrum: w.rDrum, omega0: rpmToRad(s.N0), P: s.P, l: s.l / 1000, x: s.x / 1000, a: s.a / 1000, energizing: s.dir === 'energizing' ? 1 : 0, mu: s.mu, Td: s.Td, mPart: s.mPart, c: s.c },
      units: { I: 'kg·m²', rDrum: 'm', omega0: 'rad/s', P: 'N', l: 'm', x: 'm', a: 'm', energizing: '', mu: '', Td: 'N·m', mPart: 'kg', c: 'J/(kg·°C)' },
    };
  }

  return { WHEELS, HEAT, SOURCES, EXAMPLE_BRAKE, EXAMPLE_COAST, FIELDS, defaultState, emptyRun, rpmToRad, radToRpm, inertia, lever, model, omegaAt, angleAt, parseData, fitRun, measured, solve, targets, working, describe, snapshot };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = BrakeLab;
