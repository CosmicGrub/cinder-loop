/* ===========================================================================
 * tests/verify_arch.js  —  the architecture holds, or nothing else matters
 * ---------------------------------------------------------------------------
 * Every invariant in this suite is one that, when broken, produces a bug that
 * looks like something else. A sim module that quietly reads `document` works
 * fine until the first headless test. A presenter that writes one field makes
 * replays drift a thousand ticks later. Hitstop that eats a buffered input
 * makes a game with correct numbers feel broken.
 *
 * These are cheap to assert and expensive to discover. They run first.
 * ======================================================================== */
'use strict';

const H = require('./harness');
const s = new H.Suite('verify_arch');

/* Strip comments before scanning for banned identifiers. Prose that mentions
 * `document` is not a use of `document`, and conflating the two trains people
 * to work around the gate instead of with it. */
function code(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

/* --------------------------------------------------- 1. sim purity (L5) */
const BROWSER = [
  'window', 'document', 'navigator', 'performance',
  'requestAnimationFrame', 'localStorage', 'setTimeout', 'Math.random'
];

for (const file of H.SIM_FILES) {
  const body = code(H.readSrc(file));
  for (const token of BROWSER) {
    const re = new RegExp('\\b' + token.replace('.', '\\.') + '\\b');
    s.ok('sim ' + file + ' has no ' + token, !re.test(body));
  }
}

// No dt anywhere in the sim (L3). The tick is fixed; a variable named dt is
// the first step toward multiplying by one.
for (const file of H.SIM_FILES) {
  s.ok('sim ' + file + ' has no dt', !/\bdt\b/.test(code(H.readSrc(file))));
}

// The presenter gets its own generators, but never Math.random — screenshots
// have to be comparable frame to frame.
for (const file of H.VIEW_FILES.concat(H.APP_FILES)) {
  s.ok('presenter ' + file + ' has no Math.random', !/\bMath\.random\b/.test(code(H.readSrc(file))));
}

/* The real proof, not a source scan: the sim loads and runs in a context with
 * no browser globals at all and a Math.random that throws. */
{
  let loaded = null, err = null;
  try { loaded = H.loadSim(); } catch (e) { err = e; }
  s.ok('sim loads in a bare sandbox', loaded !== null, err ? err.message : 'ok');
  s.ok('sim exports its surface', loaded &&
    loaded.Sim && loaded.Player && loaded.World && loaded.Body && loaded.Pads && loaded.RNG && loaded.Bus);

  const a = H.scenario({ C: loaded, seed: 3 });
  let ranErr = null;
  try {
    for (let t = 0; t < 300; t++) {
      a.pad().set('right', t % 40 < 25).set('jump', t % 31 === 0).set('roll', t % 47 === 0);
      a.sim.step();
    }
  } catch (e) { ranErr = e; }
  s.ok('sim runs 300 ticks with no browser', ranErr === null, ranErr ? ranErr.message : '300 ticks');
  s.ok('Math.random landmine never tripped', ranErr === null || !/Math\.random/.test(ranErr.message));
}

/* ------------------------------------------- 2. Sim owns its tick (L3) */
{
  const C = H.loadSim();
  s.eq('Sim.step takes no arguments', C.Sim.prototype.step.length, 0);
  s.eq('Player.update takes (pad, world, bus)', C.Player.prototype.update.length, 3);
  s.eq('Body.move takes (world)', C.Body.prototype.move.length, 1);
  s.ok('Sim.resetTransient exists', typeof C.Sim.prototype.resetTransient === 'function');
  s.ok('Player.resetTransient exists', typeof C.Player.prototype.resetTransient === 'function');
}

/* ------------------------- 3. the presenter never assigns sim state (L5) */
const WRITES = [
  ['sim.<field> =', /\bsim\.[A-Za-z_$][\w$]*\s*=(?!=)/],
  ['.body.<field> =', /\.body\.[A-Za-z_$][\w$]*\s*=(?!=)/],
  ['players[i].<field> =', /\bplayers\[[^\]]*\]\.[A-Za-z_$][\w$]*\s*=(?!=)/],
  ['.hp =', /\.hp\s*=(?!=)/],
  ['.state =', /\.state\s*=(?!=)/]
];
for (const file of H.VIEW_FILES.concat(H.APP_FILES)) {
  const body = code(H.readSrc(file));
  for (const [label, re] of WRITES) {
    s.ok('presenter ' + file + ' never does ' + label, !re.test(body));
  }
}

/* --------------- 4. 900 ticks, with and without a presenter, identical */
{
  const script = (t) => ({
    right: (t % 97) < 61,
    left: (t % 97) >= 61 && (t % 97) < 70,
    jump: t % 29 === 0,
    roll: t % 61 === 0,
    down: (t % 143) > 130
  });

  const plain = H.scenario({ seed: 5, log: false });
  for (let t = 0; t < 900; t++) {
    const k = script(t);
    plain.pad().set('right', k.right).set('left', k.left)
      .set('jump', k.jump).set('roll', k.roll).set('down', k.down);
    plain.sim.step();
  }

  const shown = H.scenario({ C: H.loadWithView(), seed: 5, log: false });
  const canvas = H.stubCanvas(640, 360);
  const view = new shown.C.View(canvas, shown.sim);
  for (let t = 0; t < 900; t++) {
    const k = script(t);
    shown.pad().set('right', k.right).set('left', k.left)
      .set('jump', k.jump).set('roll', k.roll).set('down', k.down);
    shown.sim.step();
    view.render();
  }

  s.ok('presenter does not perturb the sim', plain.sim.hash() === shown.sim.hash(), '900 ticks');
  s.eq('both runs advanced', plain.sim.tick, 900);
  s.ok('the presenter actually ran', view.effects > 0, view.effects + ' effects');
  s.ok('the presenter actually drew', canvas._ctx.calls > 0, canvas._ctx.calls + ' draw calls');
  s.ok('the comparison was not vacuous', plain.sim.hash().length > 40 && plain.sim.bus.emitted > 0,
    plain.sim.bus.emitted + ' events');
}

/* -------------------------------- 4a. ability VFX regressions (§6) */
{
  // Regression for a real bug an adversarial review pass caught while
  // WRITING the abilities-pass VFX (not a pre-existing finding): rollStart's
  // own bus.emit call never carried a `y` field, despite 80-view.js's
  // rollStart handler always having read `e.y + CFG.PLAYER_H` — every
  // roll's own start-burst had been spawning at y === NaN, silently
  // invisible on canvas, since the effect shipped. Fixed alongside adding
  // dashStart's own (correctly-payloaded-from-the-start) VFX — but nothing
  // ever drove a GROUNDED roll specifically to prove the ORIGINAL broken
  // event, not just dashStart's new one, actually produces finite
  // positions now. tests/verify_render.js's own dash VFX check only ever
  // exercises the airborne (dash) path, never a grounded roll.
  const a = H.scenario({ C: H.loadWithView(), seed: 6, log: false });
  a.settle();
  const canvas = H.stubCanvas(640, 360);
  const view = new a.C.View(canvas, a.sim);
  a.hold('roll').step(1).release('roll');
  view.render();
  const rollParticles = view.particles.list.slice();
  s.ok('a grounded roll actually produced particles', rollParticles.length > 0);
  s.ok('every one has a real, finite position (regression: rollStart used to spawn at y=NaN)',
    rollParticles.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)),
    JSON.stringify(rollParticles.slice(0, 3)));
}
{
  // A SECOND, sibling instance of the exact same bug class, in the exact
  // same shape — found not by this suite but by tests/verify_render.js's
  // own dash-VFX finite-position sweep, which happens to catch whatever
  // 'dust'-kind particles are still alive at that instant, not only the
  // dash's own: 'step' (30-player.js's footstep emit) never carried a `y`
  // field either, despite 80-view.js's 'step' handler always having read
  // `e.y + CFG.PLAYER_H` — every footstep-dust burst had been spawning at
  // y === NaN, silently invisible, since 'step' first shipped, for the
  // identical reason rollStart's own bug went uncaught for as long as it
  // did (nothing before this session ever read a particle's actual x/y).
  // Fixed alongside it. Driven here directly, the same way the grounded
  // roll above proves ITS fix, rather than trusting that verify_render's
  // incidental sweep will always happen to catch a live 'step' particle.
  const a = H.scenario({ C: H.loadWithView(), seed: 6, log: false });
  a.settle();
  const canvas = H.stubCanvas(640, 360);
  const view = new a.C.View(canvas, a.sim);
  a.hold('right').step(15);   // stepTimer starts at 12; long enough for a real 'step' emit
  view.render();
  const stepParticles = view.particles.list.slice();
  s.ok('running long enough actually produced particles', stepParticles.length > 0);
  s.ok('every one has a real, finite position (regression: step used to spawn at y=NaN)',
    stepParticles.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)),
    JSON.stringify(stepParticles.slice(0, 3)));
}
{
  // Co-op isolation of parry's own hood-glow timer: the whole reason it is
  // a per-player-id map (this.parryGlow) rather than a single scalar like
  // this.flash — one player's successful parry must never light up a
  // teammate's hood. Driven directly against the real bus/View, the same
  // established pattern the presenter-vs-sim comparison above already uses,
  // since no existing test (bare-sandbox or real-browser) ever constructs
  // two players and arms only one's glow.
  const a = H.scenario({ C: H.loadWithView(), seed: 7, log: false, players: 2 });
  a.settle();
  const canvas = H.stubCanvas(640, 360);
  const view = new a.C.View(canvas, a.sim);
  const p0 = a.p(0).id, p1 = a.p(1).id;
  a.sim.bus.emit('parry', { id: p0, source: 999, x: 0, y: 0 });
  view.render();
  s.ok('the parrying player\'s own glow arms', view.parryGlow[p0] > 0, view.parryGlow[p0]);
  s.eq('the OTHER player\'s glow is untouched', view.parryGlow[p1] || 0, 0);

  // And the reverse: a second, later parry from the other player arms
  // THEIRS without resetting or otherwise disturbing the first.
  const p0Before = view.parryGlow[p0];
  a.sim.bus.emit('parry', { id: p1, source: 998, x: 0, y: 0 });
  view.render();
  s.ok('the second player\'s glow now arms too', view.parryGlow[p1] > 0, view.parryGlow[p1]);
  s.ok('the first player\'s own glow is merely a tick further along its own countdown, not reset or cleared',
    view.parryGlow[p0] === p0Before - 1, p0Before + ' -> ' + view.parryGlow[p0]);
}

/* ------------------------------- 5. hitstop does not eat input (L5/feel) */
{
  const a = H.scenario({ seed: 9 });
  a.settle();

  // Slam into the floor to earn a real hitstop through a real code path.
  a.tap('jump');
  a.step(6);
  a.tap('down');
  for (let i = 0; i < 60 && a.sim.hitstop === 0; i++) a.sim.step();

  s.ok('slam landing produces hitstop', a.sim.hitstop > 0, a.sim.hitstop + ' frames');
  const frozenAt = a.sim.hitstop;
  const xBefore = a.b().x, tickBefore = a.sim.tick;

  // Press jump on the first frozen frame.
  a.hold('jump');
  a.step(1);
  s.ok('time advances during hitstop', a.sim.tick === tickBefore + 1);
  s.ok('hitstop counts down', a.sim.hitstop === frozenAt - 1);
  s.ok('the world is frozen', a.b().x === xBefore);
  s.ok('the press was still latched', a.pad().down('jump'));
  s.ok('the buffer was armed while frozen', a.pad().buffered('jump'));

  const pendDuring = a.pad().pend.jump;
  a.step(1);
  s.eq('the buffer does not decay while frozen', a.pad().pend.jump, pendDuring);

  // Run out the freeze and confirm the held press still becomes a jump.
  a.clearLog();
  for (let i = 0; i < 20 && a.sim.hitstop > 0; i++) a.sim.step();
  a.step(2);
  s.ok('the buffered jump survived hitstop', a.count('jump') > 0, a.count('jump') + ' jump events');
  s.ok('and the body actually left the ground', a.b().vy < 0, 'vy ' + a.b().vy.toFixed(2));
}

/* ---------------------- 6. resetTransient clears every leak channel (L10) */
{
  const fresh = H.scenario({ seed: 11, log: false });
  const fingerprint = fresh.sim.hash();

  const dirty = H.scenario({ seed: 11, log: false });
  for (let t = 0; t < 400; t++) {
    dirty.pad().set('right', true).set('jump', t % 17 === 0).set('roll', t % 23 === 0)
      .set('down', t % 71 > 64);
    dirty.sim.step();
  }
  s.ok('the dirty run really was dirty', dirty.sim.hash() !== fingerprint);

  dirty.sim.resetTransient();
  s.ok('reset restores the exact fresh state', dirty.sim.hash() === fingerprint);
  s.eq('reset clears the tick counter', dirty.sim.tick, 0);
  s.eq('reset clears hitstop', dirty.sim.hitstop, 0);
  s.eq('reset rewinds the rng', dirty.sim.rng.s, fresh.sim.rng.s);
  s.eq('reset clears the frame log', dirty.sim.bus.frame.length, 0);
  s.eq('reset clears the lifetime counter', dirty.sim.bus.emitted, 0);
  s.ok('reset clears every pad button', dirty.sim.pads.get(0).pend.jump === 0 &&
    dirty.sim.pads.get(0).down('right') === false);
  s.ok('reset restores body size', dirty.b().h === dirty.C.CFG.PLAYER_H);
  s.ok('reset restores hp', dirty.p().hp === dirty.C.CFG.MAX_HP);

  // Listeners are NOT sim state. A reset mid-run must not unplug the view.
  let heard = 0;
  const live = H.scenario({ seed: 11, log: false });
  live.sim.bus.on('jump', () => { heard++; });
  live.sim.resetTransient();
  live.settle();
  live.tap('jump');
  live.step(2);
  s.ok('reset keeps bus listeners subscribed', heard > 0, heard + ' heard');

  // Two scenarios must not share anything at all.
  const s1 = H.scenario({ seed: 2, log: false });
  const s2 = H.scenario({ seed: 2, log: false });
  s1.settle(); s1.hold('right'); s1.step(120);
  s.ok('scenarios are fully independent',
    s2.sim.tick === 0 && s2.b().x === 80 && s1.b().x !== s2.b().x);
}

/* --------------------------------- 7. this suite is not vacuous (L8) */
{
  const probe = new H.Suite('probe');
  probe.ok('deliberately false', false);
  probe.eq('deliberately unequal', 1, 2);
  probe.near('deliberately far', 0, 100, 1);
  s.eq('the harness can detect a failure', probe.failed, 3);
  s.eq('the harness does not invent passes', probe.passed, 0);

  const probe2 = new H.Suite('probe2');
  probe2.ok('true is true', true);
  s.eq('the harness records a real pass', probe2.passed, 1);

  s.ok('this suite asserted a great deal', s.passed + s.failed > 60,
    (s.passed + s.failed + 1) + ' assertions');
}

process.exit(s.done());
