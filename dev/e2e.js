// Browser checks for the Flywheel Brake Lab: the standard shell checks, then
// spec 04's test cases and acceptance criteria through the interface.
// Run: node dev/e2e.js   (needs Playwright: npm i --no-save playwright)
'use strict';
const path = require('path');
const fs = require('fs');
const kit = require('./vendor/e2e-kit.js');

(async () => {
  const t = await kit.start(path.join(__dirname, '..'));
  const { page } = t;
  const shots = path.join(__dirname, '..', 'docs', 'screenshots');
  await kit.standard(t, {
    predictKeys: ['N', 'Tb', 't', 'turns', 'dT'],
    change: async p => { await p.fill('#fbP', '25'); },
    mutate: async p => { await p.fill('#fbMu', '0.4'); },
    shotDir: shots, shotName: 'flywheel-brake-lab',
  });

  const row = label => page.evaluate(l => { const th = [...document.querySelectorAll('#shResultsBody th')].find(x => x.textContent.trim().startsWith(l)); return th ? th.nextElementSibling.textContent.trim() : null; }, label);
  const fill = (sel, v) => page.fill(sel, String(v));
  const sim = () => page.evaluate(() => Object.assign({}, window.__fb.sim));

  console.log('FB-1 to FB-4: the model through the interface');
  await t.fresh();
  t.ok('FB-1 I 0.0900 kg·m²', (await row('Moment of inertia')) === '0.0900 kg·m²');
  t.ok('FB-1 N / μN 60.0 / 21.0 N', (await row('N / μN')) === '60.0 / 21.0 N');
  t.ok('FB-1 T_b 3.15 N·m', (await row('Braking torque')) === '3.15 N·m');
  t.ok('FB-1 t / turns 0.898 s / 2.24', (await row('Stop time / turns')) === '0.898 s / 2.24');
  t.ok('FB-1 KE 44.4 J', (await row('Kinetic energy')) === '44.4 J');
  t.ok('FB-1 ΔT ≤ 0.0123 °C', (await row('ΔT upper limit')) === '0.0123 °C');
  await page.selectOption('#fbWheel', 'hoop');
  t.ok('FB-2 hoop I 0.180, t 1.80 s, 4.49 turns, KE 88.8 J', (await row('Moment of inertia')) === '0.180 kg·m²' && (await row('Stop time / turns')) === '1.80 s / 4.49' && (await row('Kinetic energy')) === '88.8 J');
  await page.selectOption('#fbWheel', 'both');
  t.ok('disk + hoop shows the rim fields', await page.isVisible('#fbMH') && await page.isVisible('#fbRH'));
  await page.selectOption('#fbWheel', 'disk');
  await fill('#fbA', 20);
  t.ok('FB-3 energizing N = 64.5 N', (await row('N / μN')).startsWith('64.5'));
  t.ok('FB-3 shows the self-energizing factor', (await row('Self-energizing factor')) === '1.08');
  await page.selectOption('#fbDir', 'other');
  t.ok('FB-4 other direction N = 56.1 N', (await row('N / μN')).startsWith('56.1'));
  await page.click('#shWorking summary');
  t.ok('working explains the sign choice', (await page.textContent('#shWorkingBody')).includes('eases the shoe off'));

  console.log('FB-5: self-locking');
  await t.fresh();
  await page.selectOption('#fbDir', 'energizing');
  await fill('#fbA', 300);
  t.ok('FB-5 no N value; self-locking shown', (await row('Normal force')) === 'self-locking' && (await page.textContent('#shResultsBody')).includes('grabs with no hand force'));
  t.ok('FB-5 the drawing says so', (await page.textContent('#fbDraw')).includes('Self-locking'));
  await page.click('#shWorking summary');
  t.ok('FB-5 the working explains', (await page.textContent('#shWorkingBody')).includes('grabs with no hand force'));
  await kit.noBadNumbers(t, 'FB-5');
  await page.evaluate(() => Anim.manual(true));
  await page.click('#fbSpinUp'); await page.click('#fbBrake');
  t.ok('FB-5 braking a self-locking brake locks the wheel at once', (await sim()).stopped && (await page.textContent('#fbDraw')).includes('grabbed and locked'));
  await page.evaluate(() => Anim.manual(false));

  console.log('Spin-down timing (acceptance: stop within one frame of t)');
  await t.fresh();
  await page.evaluate(() => Anim.manual(true));
  await page.click('#fbSpinUp');
  t.ok('spin up runs at N₀', (await sim()).spinning && Math.abs((await sim()).omega - 10 * Math.PI) < 1e-9);
  await page.evaluate(() => Anim.advanceAll(1));
  t.ok('with no brake and no drag the wheel keeps its speed', Math.abs((await sim()).omega - 10 * Math.PI) < 1e-9);
  await page.click('#fbBrake');
  t.ok('Apply brake is shown as on', (await page.getAttribute('#fbBrake', 'aria-pressed')) === 'true');
  let frames = 0;
  while ((await sim()).spinning && frames < 600) { await page.evaluate(() => Anim.advanceAll(1 / 60)); frames++; }
  const s1 = await sim();
  t.ok('the wheel stops', s1.stopped && s1.omega === 0);
  t.ok('stop time matches t = 0.898 s within one frame at 1× (' + s1.stopTime.toFixed(4) + ' s, ' + frames + ' frames)', Math.abs(s1.stopTime - 0.8976) <= 1 / 60);
  t.near('turns while braking 2.24', s1.turnsBraking, 2.24);
  t.near('all the kinetic energy went into brake heat', s1.Eb, 44.4);
  t.ok('the readout says when it stopped', (await page.textContent('#fbDraw')).includes('Stopped after 0.898 s'));
  t.ok('the energy bar is all brake heat', Math.abs(+(await page.getAttribute('#fbEB', 'width')) - 220) < 0.5);
  await page.click('[data-speed="0.25"]');
  t.ok('¼ speed slows the clock', await page.evaluate(() => window.__fb.clock.scale === 0.25));
  await page.click('[data-speed="1"]');
  await page.click('#fbBrake');                                      // release the latch
  await page.click('#fbSpinUp');
  await page.focus('body');
  await page.keyboard.down('b');
  t.ok('holding B applies the brake', (await sim()).keyHeld === true);
  await page.evaluate(() => Anim.advanceAll(0.3));
  await page.keyboard.up('b');
  const mid = await sim();
  t.ok('releasing B lets the wheel coast at its reduced speed', !mid.keyHeld && mid.spinning && mid.omega < 10 * Math.PI && Math.abs(mid.tBrake - 0.3) < 1e-6);
  await page.evaluate(() => Anim.manual(false));

  console.log('FB-12: no hand force');
  await t.fresh();
  await fill('#fbP', 0);
  t.ok('FB-12 N = 0 and the wheel keeps spinning', (await row('N / μN')) === '0 / 0 N' && (await row('Stop time / turns')) === 'keeps spinning' && (await page.textContent('#shResultsBody')).includes('No braking torque: the wheel keeps spinning'));
  await kit.noBadNumbers(t, 'FB-12');
  await page.evaluate(() => Anim.manual(true));
  await page.click('#fbSpinUp'); await page.click('#fbBrake');
  await page.evaluate(() => Anim.advanceAll(5));
  t.ok('FB-12 after 5 s of braking the wheel still spins at N₀', (await sim()).spinning && Math.abs((await sim()).omega - 10 * Math.PI) < 1e-9);
  await page.evaluate(() => Anim.manual(false));
  await fill('#fbTd', 0.5);
  t.ok('FB-12 with bearing drag it coasts to a stop', (await row('Stop time / turns')).startsWith('5.65 s'));

  console.log('FB-6 to FB-8: video data');
  await t.fresh();
  await page.click('#shTab_data');
  t.ok('Data tab shows the data box', await page.isVisible('#fbText'));
  await page.click('#fbExample');
  t.ok('FB-6 fit: ω₀ 31.4 rad/s, α −10.0 rad/s², R² 1.0000', (await page.textContent('#shWorkingBody')).includes('ω₀ = 31.4 rad/s, α = −10.0 rad/s², R² = 1.0000'));
  t.ok('FB-7 T_b from data 0.900 N·m, μ 0.100', (await row('Tb: model / from data')) === '3.15 / 0.900 N·m' && (await row('μ: model / from data')) === '0.350 / 0.100');
  t.ok('plots: data, fit, ω(t) and residuals', (await page.textContent('#fbDraw')).includes('Speed from the fit') && (await page.textContent('#fbDraw')).includes('Residuals'));
  await page.click('[data-run="coast"]');
  t.ok('the coast-down run has its own box', (await page.inputValue('#fbText')) === '' && (await page.textContent('#fbTextL')) === 'Coast-down data (brake off)');
  await page.click('#fbExample');
  t.ok('FB-8 with the coast-down: T_b from data 0.855 N·m', (await row('Tb: model / from data')) === '3.15 / 0.855 N·m');
  await page.click('#fbToTd');
  t.ok('Use the coast-down as bearing drag fills T_d = I |α_coast| = 0.045 N·m', (await page.inputValue('#fbTd')) === '0.045');
  await page.uncheck('#fbUseCoast');
  t.ok('turning off the drag correction goes back to 0.900 N·m', (await row('Tb: model / from data')).endsWith('0.900 N·m'));
  await page.check('#fbUseCoast');
  await page.click('[data-run="brake"]');
  t.ok('switching back shows the braking data', (await page.inputValue('#fbText')).startsWith('fps 240'));

  console.log('Fit window (acceptance: visible and adjustable by keyboard)');
  t.ok('the window is shaded and has two handles', await page.locator('#fbWin0').count() === 1 && await page.locator('#fbWin1').count() === 1);
  await page.focus('#fbWin0');
  await page.keyboard.press('ArrowRight');
  t.ok('→ on the start handle moves it one data point', (await page.getAttribute('#fbWin0', 'aria-valuenow')) === '2' && await page.evaluate(() => document.activeElement.id === 'fbWin0'));
  await page.focus('#fbWin1');
  await page.keyboard.press('ArrowLeft');
  t.ok('← on the end handle moves it back one point', (await page.getAttribute('#fbWin1', 'aria-valuenow')) === '6');
  t.ok('the fit uses the 5 points in the window', (await page.textContent('#shWorkingBody')).includes('5 points from 0.500 s to 2.50 s'));
  await page.keyboard.press('Home');
  t.ok('the window keeps at least three points', (await page.getAttribute('#fbWin1', 'aria-valuenow')) === '4');
  await page.keyboard.press('End');
  await page.focus('#fbWin0'); await page.keyboard.press('Home');
  const lay = await page.evaluate(() => { const r = document.getElementById('fbSvg').getBoundingClientRect(); return { x: r.x, y: r.y, k: r.width / 680 }; });
  const h0 = await page.locator('#fbWin0 rect').first().boundingBox();
  // Drag the start handle to the third data point (t = 1.0 s). The θ plot spans 46 to 670 px for 0 to 3 s.
  await page.mouse.move(h0.x + h0.width / 2, h0.y + h0.height / 2); await page.mouse.down();
  await page.mouse.move(lay.x + (46 + 624 * 1 / 3) * lay.k, lay.y + 100 * lay.k, { steps: 4 }); await page.mouse.up();
  t.ok('dragging the start handle snaps to a data point', (await page.getAttribute('#fbWin0', 'aria-valuenow')) === '3');

  console.log('FB-10 and FB-11: data messages, and the other formats');
  await page.click('#fbClear');
  await page.selectOption('#fbFmt', 'time');
  await fill('#fbText', '0, 0\n0.5, 2.3');
  t.ok('FB-10 fewer than three points', (await page.textContent('#fbTextErr')) === 'Add at least three data points to fit a curve.');
  await kit.noBadNumbers(t, 'FB-10');
  await fill('#fbText', '0, 0\n0.5, 2.3011\n1, 4.2042\n1.5, 5.7095');
  t.ok('time-and-turns format fits', (await page.textContent('#fbTextErr')) === '' && (await page.textContent('#shWorkingBody')).includes('α = −10.0 rad/s²'));
  await page.selectOption('#fbFmt', 'perturn');
  await fill('#fbText', '0.205, 0.215, 0.228, 0.244, 0.265');
  t.ok('time-per-turn format fits', (await page.textContent('#fbTextErr')) === '' && (await page.textContent('#shWorkingBody')).includes('Fit of the braking run'));
  await page.selectOption('#fbFmt', 'frames');
  await fill('#fbText', '0, 0\n120, 2.3011\n240, 4.2042');
  await fill('#fbFps', '');
  t.ok('FB-11 frames per second is asked for', (await page.textContent('#fbFpsErr')) === 'Enter a value for frames per second.');
  await kit.noBadNumbers(t, 'FB-11');

  console.log('Compare tab and the prediction log');
  await t.fresh();
  await page.click('#shTab_data'); await page.click('#fbExample');
  await page.click('#shPredict');
  t.ok('on the Data tab, predict first hides the model stop time', (await row('Stop time: model / measured')).startsWith('?'));
  await fill('#shPf_t', '0.9');
  await page.click('#shCheck');
  await page.click('#shTab_compare');
  const cmp = await page.textContent('#fbCmp');
  t.ok('compare table: model and data side by side with the difference', cmp.includes('Stopping time t') && cmp.includes('0.898 s') && cmp.includes('3.14 s') && cmp.includes('+250%'));
  await page.click('#fbRecord');
  const rec = await page.evaluate(() => window.__app.log.find(r => r.quantity === 'stopping time t'));
  t.ok('the measured stopping time goes into the log record', rec && Math.abs(rec.measured - Math.PI) / Math.PI < 0.005 && rec.pctMeasVsModel !== null, rec && JSON.stringify([rec.measured, rec.pctMeasVsModel]));
  t.ok('and the student is told', (await page.textContent('#fbRecMsg')).includes('Added the measured values'));
  await page.click('#shPredict');

  console.log('Predict first and challenges');
  await t.fresh();
  await page.click('#shPredict');
  const dr = await page.textContent('#fbDraw');
  t.ok('N and μN are hidden on the drawing', dr.includes('N = ?') && dr.includes('μN = ?') && dr.includes('ΔT ≤ ?'));
  await page.click('#fbSpinUp');
  t.ok('Spin up waits for a checked prediction', (await page.textContent('#shToast')).includes('Check your prediction first') && !(await sim()).spinning);
  await page.click('#shPredict');
  await page.click('#shModes [data-mode="challenge"]');
  t.ok('three example challenges', await page.locator('#shChallenge option').count() === 4);
  await page.selectOption('#shChallenge', 'FB-C3');
  t.ok('FB-C3 sets a = 20 mm', (await page.inputValue('#fbA')) === '20');
  await fill('#shPf_N', '64.5'); await page.click('#shCheck');
  t.ok('FB-C3 a correct N is a match and logged with the challenge id', (await page.textContent('#shPfBox')).includes('Match') && await page.evaluate(() => window.__app.log.slice(-1)[0].problemId === 'FB-C3'));
  await page.evaluate(() => Anim.manual(true));
  await page.click('#fbSpinUp');
  t.ok('after Check the wheel spins', (await sim()).spinning);
  await page.evaluate(() => Anim.manual(false));

  console.log('Reduced motion');
  {
    const ctx = await t.browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
    const p2 = await ctx.newPage(); t.watch(p2);
    await p2.goto(t.base + '/index.html'); await p2.waitForFunction(() => !!window.__app);
    await p2.click('#fbSpinUp');
    t.ok('spin up does not animate', await p2.evaluate(() => !window.__fb.clock.running && window.__fb.sim.spinning));
    await p2.click('#fbBrake');
    t.ok('the brake jumps straight to the stop, at the model time', await p2.evaluate(() => window.__fb.sim.stopped && Math.abs(window.__fb.sim.stopTime - 0.8976) < 0.001));
    await ctx.close();
  }

  console.log('Report and export from the Data tab');
  await t.fresh();
  await page.click('#shTab_data'); await page.click('#fbExample');
  await page.evaluate(() => { window.print = () => { }; });
  await page.click('#shReport');
  const rep = await page.textContent('#sh-report');
  t.ok('report has the video data and the comparison', rep.includes('Video data') && rep.includes('Braking run') && rep.includes('Model against data') && rep.includes('From the video data'));
  t.ok('report drawing is the fit on the Data tab', await page.evaluate(() => document.querySelector('#sh-report svg').textContent.includes('Angle θ against time')));
  const png = await kit.download(t, () => page.click('#shPng'));
  t.ok('PNG export works from the Data tab', kit.pngSize(png.buf).width === 1360);
  await page.screenshot({ path: path.join(shots, 'flywheel-brake-lab-data.png') });

  console.log('Performance');
  await page.click('#shTab_model');
  const ms = await kit.timeIt(page, 'window.__app.changed()', 15);
  t.ok('a full update takes under 50 ms (' + ms.toFixed(1) + ' ms)', ms < 50);
  fs.writeFileSync(path.join(shots, 'perf.txt'), 'Full update (change + render), median of 15: ' + ms.toFixed(1) + ' ms\n');

  await t.finish();
})().catch(e => { console.error(e); process.exit(1); });
