// Confirms the code inlined in index.html is exactly the tested code, then runs
// spec cases on the inline copy. Run: node dev/verify-html.js   (--fix copies dev/core.js in)
'use strict';
const path = require('path');
const vb = require('./vendor/verify-blocks.js');
const root = path.join(__dirname, '..');
if (process.argv.includes('--fix') && vb.syncCore(root)) console.log('Copied dev/core.js into index.html.');
let passed = 0, failed = 0;
const ok = (n, c, d) => { if (c) { passed++; console.log('  PASS ' + n); } else { failed++; console.log('  FAIL ' + n + (d ? ': ' + d : '')); } };
const near = (n, g, e) => ok(n, typeof g === 'number' && (Math.abs(e) < 1 ? Math.abs(g - e) <= 0.01 : Math.abs(g - e) / Math.abs(e) <= 0.005), 'got ' + g + ', expected ' + e);

console.log('Inline blocks match dev/core.js and dev/vendor/');
const problems = vb.verify(root);
problems.forEach(p => ok(p, false));
ok('every inline block matches its tested copy', problems.length === 0);

console.log('Inline copy runs the spec cases');
const Stats = vb.loadInline(root, 'vendor:stats.js');
const Lab = vb.loadInline(root, 'core', { Stats });
const m = Lab.model(Lab.defaultState());
near('FB-1 N (inline, default state)', m.lever.N, 60.0);
near('FB-1 t (inline)', m.t, 0.898);
near('FB-1 turns (inline)', m.turns, 2.24);
const f = Lab.fitRun({ format: 'frames', fps: 240, text: Lab.EXAMPLE_BRAKE, i0: null, i1: null });
near('FB-6 α from the inline example data', f.fit.alpha, -10.0);
console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exitCode = failed ? 1 : 0;
