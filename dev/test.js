// Flywheel Brake Lab: every test case in spec 04 §7 (FB-1 to FB-12), run through
// the tool core in display units exactly as the interface uses it, plus the
// prediction records for the predict-first targets (spec 07).
// Run: node dev/test.js
'use strict';
const Lab = require('./core.js');
const Shell = require('./vendor/shell.js');
const PL = require('./vendor/prediction-log.js');

let passed = 0, failed = 0;
function ok(name, cond, detail) {
  if (cond) { passed++; console.log('  PASS ' + name); }
  else { failed++; console.log('  FAIL ' + name + (detail ? ': ' + detail : '')); }
}
// 00 §10: 0.5% relative, or 0.01 in the displayed unit for values under 1.
function near(name, got, exp) {
  const good = typeof got === 'number' && isFinite(got) &&
    (Math.abs(exp) < 1 ? Math.abs(got - exp) <= 0.01 : Math.abs(got - exp) / Math.abs(exp) <= 0.005);
  ok(name, good, 'got ' + got + ', expected ' + exp);
}
// For small values where 0.01 absolute is too loose to mean anything, check 0.5% relative.
function rel(name, got, exp) { ok(name, typeof got === 'number' && Math.abs(got - exp) / Math.abs(exp) <= 0.005, 'got ' + got + ', expected ' + exp); }
const st = o => Object.assign(Lab.defaultState(), o);
const mod = o => Lab.model(st(o));
const f = v => Shell.util.fmtSig(v, 3), fu = (v, u) => f(v) + (u ? ' ' + u : '');
const FB6 = 'fps 240\n0, 0\n120, 2.3011\n240, 4.2042\n360, 5.7095\n480, 6.8169\n600, 7.5264\n720, 7.8380';
const withRuns = (o, brake, coast) => { const s = st(o); s.runs.brake = Object.assign(Lab.emptyRun(), brake || {}); s.runs.coast = Object.assign(Lab.emptyRun(), coast || {}); return s; };

console.log('FB-1: disk, plain lever');
const m1 = mod({});
{
  rel('FB-1 I = 0.0900 kg·m²', m1.I, 0.0900);
  near('FB-1 N = 60.0 N', m1.lever.N, 60.0);
  near('FB-1 T_b = 3.15 N·m', m1.Tb, 3.15);
  rel('FB-1 t = 0.898 s', m1.t, 0.898);
  near('FB-1 turns = 2.24', m1.turns, 2.24);
  near('FB-1 KE = 44.4 J', m1.KE, 44.4);
  rel('FB-1 ΔT (8 kg steel) ≤ 0.0123 °C', m1.dTmax, 0.0123);
  near('the brake does all the work when there is no drag', m1.Eb, m1.KE);
  near('lever ratio 3 (as in the unit page prototype)', m1.lever.l / m1.lever.x, 3);
}

console.log('FB-2: hoop');
{
  const m = mod({ wheel: 'hoop' });
  rel('FB-2 I = 0.180 kg·m²', m.I, 0.180); near('FB-2 t = 1.80 s', m.t, 1.80); near('FB-2 turns = 4.49', m.turns, 4.49); near('FB-2 KE = 88.8 J', m.KE, 88.8);
  const both = mod({ wheel: 'both', m: 8, r: 150, mH: 2, rH: 200 });
  rel('disk + hoop adds the parts', both.I, 0.09 + 2 * 0.2 * 0.2);
  ok('disk + hoop brakes on the outer radius', Math.abs(both.rDrum - 0.2) < 1e-12);
  ok('custom I uses the drum radius field', mod({ wheel: 'custom', customI: 0.5, rDrum: 120 }).I === 0.5 && Math.abs(mod({ wheel: 'custom', customI: 0.5, rDrum: 120 }).rDrum - 0.12) < 1e-12);
}

console.log('FB-3 and FB-4: pivot offset and direction');
{
  near('FB-3 energizing N = 64.5 N', mod({ a: 20, dir: 'energizing' }).lever.N, 64.5);
  near('FB-4 other direction N = 56.1 N', mod({ a: 20, dir: 'other' }).lever.N, 56.1);
  near('FB-3 self-energizing factor x/(x − μa)', mod({ a: 20 }).lever.factor, 100 / 93);
  ok('no factor when a = 0', m1.lever.factor === null);
  ok('the energizing direction stops sooner', mod({ a: 20 }).t < mod({ a: 20, dir: 'other' }).t);
}

console.log('FB-5: self-locking');
{
  const m = mod({ x: 100, a: 300, mu: 0.35, dir: 'energizing' });
  near('FB-5 x − μa = −5 mm', m.lever.den * 1000, -5);
  ok('FB-5 self-locking, no N value', m.lever.selfLocking && m.lever.N === null && m.Tb === null && m.t === null);
  ok('FB-5 the reason is given', /self-locking/.test(m.reason));
  const s = st({ x: 100, a: 300 });
  const w = Lab.working(Lab.solve(s), s, f, fu);
  ok('FB-5 the working explains it', w[0].steps.some(x => x.title === 'Self-locking' && /grabs with no hand force/.test(x.note)));
  ok('FB-5 the other direction is not self-locking', !mod({ x: 100, a: 300, dir: 'other' }).lever.selfLocking);
  ok('the targets carry the reason', Lab.targets(Lab.solve(s)).find(t => t.key === 'N').reason === m.reason);
}

console.log('FB-6: fitting frame counts');
const fit6 = Lab.fitRun({ format: 'frames', fps: 240, text: FB6, i0: null, i1: null });
{
  ok('FB-6 reads 7 rows', fit6.n === 7 && fit6.error === null);
  near('FB-6 ω₀ = 31.4 rad/s', fit6.fit.w0, 31.4);
  near('FB-6 ω₀ = 300 rpm', Lab.radToRpm(fit6.fit.w0), 300);
  near('FB-6 α = −10.0 rad/s²', fit6.fit.alpha, -10.0);
  ok('FB-6 R² = 1.000 within rounding', fit6.fit.r2 > 0.99999, String(fit6.fit.r2));
  const noLine = Lab.fitRun({ format: 'frames', fps: 240, text: FB6.replace('fps 240\n', '') });
  near('the fps field works without an "fps" line', noLine.fit.w0, 31.4);
  const asTime = Lab.fitRun({ format: 'time', fps: null, text: 't, turns\n' + FB6.split('\n').slice(1).map(l => { const [fr, n] = l.split(', '); return (fr / 240) + ', ' + n; }).join('\n') });
  near('time-and-turns format with a header row gives the same α', asTime.fit.alpha, -10.0);
  // Time per turn: the time each successive full turn took, from the FB-6 motion (θ = 2π k).
  const w0 = 10 * Math.PI, a = 10, tk = k => (w0 - Math.sqrt(w0 * w0 - 2 * a * 2 * Math.PI * k)) / a;
  const per = [1, 2, 3, 4, 5, 6, 7].map(k => (tk(k) - tk(k - 1)).toFixed(5)).join(', ');
  const asPer = Lab.fitRun({ format: 'perturn', text: per });
  near('time-per-turn format gives ω₀ = 31.4 rad/s', asPer.fit.w0, 31.4);
  near('time-per-turn format gives α = −10.0 rad/s²', asPer.fit.alpha, -10.0);
  const win = Lab.fitRun({ format: 'frames', fps: 240, text: FB6, i0: 1, i1: 5 });
  ok('a window fits only its rows', win.fit.n === 5 && win.i0 === 1 && win.i1 === 5);
  near('and still finds α = −10 on clean data', win.fit.alpha, -10.0);
}

console.log('FB-7 and FB-8: torque and friction from data');
{
  const s7 = withRuns({}, { text: FB6 });
  const m7 = Lab.solve(s7).meas;
  near('FB-7 T_b,meas = 0.900 N·m', m7.Tb, 0.900);
  near('FB-7 μ_meas = 0.100', m7.mu, 0.100);
  ok('FB-7 no coast run, so no drag correction', m7.useCoast === false && m7.aC === 0);
  near('measured stopping time from the fit is 3.14 s', m7.t, Math.PI);
  const s8 = withRuns({}, { text: FB6 }, { text: Lab.EXAMPLE_COAST });
  const m8 = Lab.solve(s8).meas;
  near('the example coast-down fits α = −0.5 rad/s²', m8.coast.fit.alpha, -0.5);
  near('FB-8 T_b,meas = 0.855 N·m', m8.Tb, 0.855);
  ok('turning the coast-down off ignores it', Lab.solve(Object.assign(s8, { useCoast: false })).meas.Tb === m7.Tb);
  s8.useCoast = true;
  const w = Lab.working(Lab.solve(s8), s8, f, fu);
  ok('working shows the fitted coefficients and how α becomes T_b and μ', w[2].heading === 'From the video data' && w[2].steps.map(x => x.title).join('|') === 'Fit of the braking run|Fit of the coast-down run|Braking torque from the data|Friction from the data|Stopping time from the data');
}

console.log('FB-9: heat');
{
  rel('FB-9 3000 J into 1 kg steel: ΔT ≤ 6.64 °C', 3000 / (1 * Lab.HEAT.steel.c), 6.637);
  // Through the model: choose a wheel with KE = 3000 J.
  const N0 = Lab.radToRpm(Math.sqrt(2 * 3000 / 0.09));
  near('FB-9 through the model', mod({ N0, mPart: 1, c: 452 }).dTmax, 6.64);
}

console.log('FB-10 and FB-11: data messages');
{
  ok('FB-10 two points', Lab.fitRun({ format: 'time', text: '0, 0\n0.5, 2' }).error === 'Add at least three data points to fit a curve.');
  const no = Lab.fitRun({ format: 'frames', fps: null, text: '0, 0\n120, 2.3' });
  ok('FB-11 frames without fps asks for it', /frames per second/.test(no.error) && no.parsed.fpsMissing === true);
  ok('a bad line is named', Lab.parseData('0, 0\n1, x', 'time').error === 'Line 2 ("1, x") is not a list of numbers.');
  ok('three numbers on a line is refused', /needs two numbers/.test(Lab.parseData('0, 0, 0', 'time').error));
  ok('times must go up', /must go up/.test(Lab.parseData('0, 0\n1, 1\n1, 2', 'time').error));
  ok('empty data is not an error', Lab.fitRun(Lab.emptyRun()).error === null && Lab.fitRun(Lab.emptyRun()).fit === null);
  ok('no fit, no measured values', Lab.solve(st({})).meas.Tb === null);
}

console.log('FB-12: no hand force');
{
  const m = mod({ P: 0 });
  ok('FB-12 N = 0', m.lever.N === 0 && m.Tb === 0);
  ok('FB-12 with no drag: no stop and no infinite time', m.stops === false && m.t === null && m.reason === 'no braking torque: the wheel keeps spinning');
  const d = mod({ P: 0, Td: 0.5 });
  near('FB-12 with drag the wheel coasts down on T_d alone', d.t, m1.w0 / (0.5 / 0.09));
  ok('and all the energy goes to the bearings', Math.abs(d.Ed - d.KE) < 1e-9 && d.Eb === 0);
  const s = st({ P: 0 });
  ok('FB-12 no NaN or Infinity in the working', !/NaN|Infinity|undefined/.test(JSON.stringify(Lab.working(Lab.solve(s), s, f, fu))));
  const sl = withRuns({ x: 100, a: 300 }, { text: FB6 });
  ok('self-locking lever: measured μ is not defined, with the reason', Lab.solve(sl).meas.mu === null && /self-locking/.test(Lab.solve(sl).meas.muReason));
}

console.log('Animation helpers');
{
  ok('ω(t) stops at 0', Lab.omegaAt(31.4, 35, 2) === 0);
  near('θ(t) at the stop is the stopping angle', Lab.angleAt(m1.w0, m1.alpha, 5), m1.theta);
  near('θ(t) with no deceleration is ω₀ t', Lab.angleAt(10, 0, 2), 20);
}

console.log('Predict-first targets and log records (spec 07)');
{
  const s = st({}), t = Lab.targets(Lab.solve(s));
  ok('five targets with the shared quantity names', t.map(x => x.quantity).join('|') === 'normal force N|braking torque T_b|stopping time t|turns to stop|temperature rise upper limit');
  const rec = PL.makeRecord({ tool: 'Flywheel Brake Lab', toolVersion: '1.0.0', student: 'A', problemId: 'FB-1', quantity: t[2].quantity, unit: 's', predicted: 1, model: t[2].model, attempt: 1, inputs: Lab.snapshot(s) });
  near('record percent difference for t (1 s vs 0.898 s)', rec.pctPredVsModel, (1 - m1.t) / m1.t * 100);
  ok('record holds the inputs in SI', Math.abs(rec.inputs.values.I - 0.09) < 1e-12 && rec.inputs.units.omega0 === 'rad/s');
}

console.log('Show the working and the description');
{
  const s = st({ a: 20 }), w = Lab.working(Lab.solve(s), s, f, fu);
  ok('groups: wheel and brake, then stop and energy', w.length === 2 && w[0].heading === 'Wheel and brake' && w[1].heading === 'Stop and energy');
  ok('the sign choice is explained', /self-energizing/.test(w[0].steps.find(x => x.title === 'Moments about the pivot O').note));
  ok('every step names a source', w.every(g => g.steps.every(x => x.source)));
  ok('covers I, N, T_b, α, t, KE and ΔT', ['Solid disk', 'Normal force on the shoe', 'Braking torque', 'Angular deceleration', 'Stopping time', 'Kinetic energy', 'Temperature rise, upper limit'].every(n => w.some(g => g.steps.some(x => x.title === n))));
  const d = Lab.describe(Lab.solve(st({})), st({}), fu, false);
  ok('description gives the stop', /0.898 seconds/.test(d) && /2.24 turns/.test(d));
  ok('masked description does not', !/0.898/.test(Lab.describe(Lab.solve(st({})), st({}), fu, true)));
}

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exitCode = failed ? 1 : 0;
