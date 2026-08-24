/* ===========================================================================
 * tests/harness.js  —  assertions, sandboxes, and scenario()
 * ---------------------------------------------------------------------------
 * L8: this file never reimplements the thing under test. It builds a sim,
 * drives it with scripted input, and READS what happened. There is no copy of
 * the jump equation in here to compare against — if there were, the suites
 * would only be proving that two identical mistakes agree.
 *
 * L10: scenario() is the only way a suite gets a sim. No test constructs one
 * by hand, so there is exactly one place a forgotten field can leak from, and
 * verify_arch points its reset assertions straight at it.
 * ======================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');

// The sim, in dependency order. Anything not on this list is presenter.
const SIM_FILES = [
  '00-core.js', '05-input.js', '10-data.js', '20-world.js',
  '25-body.js', '30-player.js', '35-rig.js', '40-combat.js', '45-enemy.js',
  '50-gen.js', '55-boss.js', '60-run.js', '65-meta.js', '70-sim.js'
];
const VIEW_FILES = ['80-view.js'];
// Presenter, source-scanned for the same invariants as the view (no
// Math.random, never a sim-state write) but never loaded into the sandbox
// View itself runs in — Settings and Menu have zero dependency on Sim/View
// and are exercised by their own pure-logic suite instead.
const APP_FILES = ['82-narrative.js', '85-audio.js', '90-settings.js', '92-menu.js', '94-touch.js', '95-app.js'];

function readSrc(name) {
  return fs.readFileSync(path.join(SRC, name), 'utf8');
}

/* ------------------------------------------------------------- sandboxes */

/* A context with NOTHING in it. No window, no document, no navigator, no
 * performance, no timers, and Math.random replaced by a landmine. If a sim
 * module reaches for any of them the load throws here rather than failing
 * mysteriously on someone's phone. */
function loadSim() {
  const sandbox = { CINDER: {} };
  const ctx = vm.createContext(sandbox);
  vm.runInContext(
    'Math.random = function () { throw new Error("Math.random() called inside the sim"); };',
    ctx
  );
  for (const f of SIM_FILES) {
    vm.runInContext(readSrc(f), ctx, { filename: 'src/' + f });
  }
  return sandbox.CINDER;
}

/* The same bare context plus the presenter. A canvas stub stands in for the
 * browser at the boundary — that is a fake of the platform, not of the code
 * under test, and it is the only way to run 80-view.js off a browser at all. */
function stubCanvas(w, h) {
  const noop = () => {};
  // A real CanvasGradient's only job here is to not throw when
  // addColorStop() is called on it — nothing reads its stops back, the
  // same "the stub only needs to answer the calls the real code actually
  // makes" reasoning every other no-op on this context already follows.
  const gradient = { addColorStop: noop };
  const ctx2d = {
    fillStyle: '', strokeStyle: '', font: '', textBaseline: '', lineWidth: 1,
    calls: 0,
    save: noop, restore: noop, translate: noop, scale: noop, rotate: noop,
    setTransform: noop,
    beginPath: noop, closePath: noop, moveTo: noop, lineTo: noop,
    arc: noop, quadraticCurveTo: noop, bezierCurveTo: noop,
    fill: noop, stroke: noop, clearRect: noop, drawImage: noop,
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    fillRect() { ctx2d.calls++; },
    strokeRect() { ctx2d.calls++; },
    fillText() { ctx2d.calls++; },
    measureText: () => ({ width: 0 })
  };
  return {
    width: w, height: h, clientWidth: w, clientHeight: h,
    style: {},
    getContext: () => ctx2d,
    _ctx: ctx2d
  };
}

/* Settings, Menu, and TouchControls's pure core (zoneAt, Stick) depend on
 * nothing but Pad.BUTTONS (05-input.js, which in turn needs CFG from
 * 00-core.js) — no world, no body, no combat, and critically no DOM: nothing
 * at module-evaluation time in 94-touch.js touches window/document, only
 * instance methods that a test never has to call to exercise zoneAt/Stick.
 * A bare sandbox this small is what lets verify_platform and verify_touch
 * test the REAL functions without dragging in — or risking a false pass
 * from — machinery neither of them touches (L8). */
function loadPlatform() {
  const sandbox = { CINDER: {} };
  const ctx = vm.createContext(sandbox);
  vm.runInContext(
    'Math.random = function () { throw new Error("Math.random() called inside platform code"); };',
    ctx
  );
  for (const f of ['00-core.js', '05-input.js', '90-settings.js', '92-menu.js', '94-touch.js']) {
    vm.runInContext(readSrc(f), ctx, { filename: 'src/' + f });
  }
  return sandbox.CINDER;
}

/* 82-narrative.js's own module-evaluation touches nothing but window/
 * document either — only its render() instance method does, and a test
 * never has to call that to exercise the trigger logic — the identical
 * "bare sandbox, only what's actually needed" reasoning loadPlatform()
 * already states above, minus World/Body/Combat (this file needs neither)
 * plus 10-data.js (DIALOGUE, the one real dependency loadPlatform()'s own
 * set doesn't already cover). */
function loadNarrative() {
  const sandbox = { CINDER: {} };
  const ctx = vm.createContext(sandbox);
  vm.runInContext(
    'Math.random = function () { throw new Error("Math.random() called inside narrative code"); };',
    ctx
  );
  for (const f of ['00-core.js', '10-data.js', '82-narrative.js']) {
    vm.runInContext(readSrc(f), ctx, { filename: 'src/' + f });
  }
  return sandbox.CINDER;
}

// 85-audio.js's own module-evaluation touches nothing but window/document
// either — same reasoning as loadNarrative() above, minus 82-narrative.js
// itself (this file needs the DIALOGUE table's own sibling, SFX, not the
// Narrative class) plus, deliberately, NOT injecting a fake `window` —
// tests exercise _ensureCtx()'s own "no Web Audio support" branch for free
// this way, and always supply a real opts.ctx fixture when they need one.
function loadAudio() {
  const sandbox = { CINDER: {} };
  const ctx = vm.createContext(sandbox);
  vm.runInContext(
    'Math.random = function () { throw new Error("Math.random() called inside audio code"); };',
    ctx
  );
  for (const f of ['00-core.js', '10-data.js', '85-audio.js']) {
    vm.runInContext(readSrc(f), ctx, { filename: 'src/' + f });
  }
  return sandbox.CINDER;
}

function loadWithView() {
  const sandbox = { CINDER: {} };
  const ctx = vm.createContext(sandbox);
  vm.runInContext(
    'Math.random = function () { throw new Error("Math.random() called inside the sim"); };',
    ctx
  );
  for (const f of SIM_FILES.concat(VIEW_FILES)) {
    vm.runInContext(readSrc(f), ctx, { filename: 'src/' + f });
  }
  return sandbox.CINDER;
}

/* ------------------------------------------------------------- test worlds
 * Built through the World API, never by poking the tile array, so a change to
 * World's internals cannot leave the suites silently testing a stale shape. */

// A long flat hall. Floor surface sits at (h-2)*TILE; with h = 40 that is
// y = 608, so a 22px body rests at y = 586.
function flatWorld(C, w = 120, h = 40) {
  const W = new C.World(w, h);
  for (let x = 0; x < w; x++) { W.set(x, h - 1, C.TILE.SOLID); W.set(x, h - 2, C.TILE.SOLID); }
  for (let y = 0; y < h; y++) { W.set(0, y, C.TILE.SOLID); W.set(w - 1, y, C.TILE.SOLID); }
  return W;
}

/* A hall whose floor ends at tile `edge`, with a deep drop beyond it. The
 * left-hand floor surface is deliberately at the same y as flatWorld's (608,
 * so a 22px body rests at 586) — that keeps the default spawn correct for
 * both worlds and stops every ledge test from needing its own magic number.
 *
 * The pit is deep on purpose. A shallow one lands the player again within a
 * few frames, which is exactly the window the coyote measurement needs free. */
function ledgeWorld(C, edge = 20, w = 120, h = 48) {
  const W = new C.World(w, h);
  const SURFACE = 38;
  for (let y = 0; y < h; y++) { W.set(0, y, C.TILE.SOLID); W.set(w - 1, y, C.TILE.SOLID); }
  for (let x = 0; x < w; x++) W.set(x, h - 1, C.TILE.SOLID);
  for (let x = 1; x <= edge; x++) for (let y = SURFACE; y < h; y++) W.set(x, y, C.TILE.SOLID);
  return W;
}

const FLOOR_Y = (h = 40) => (h - 2) * 16;
const REST_Y = (h = 40) => FLOOR_Y(h) - 22;

/* ---------------------------------------------------------------- scenario
 * The single setup path. Every suite starts here. */
function scenario(spec = {}) {
  const C = spec.C || loadSim();
  const h = spec.h || 40;
  const world = spec.world ? spec.world(C) : flatWorld(C, spec.w || 120, h);
  const sim = new C.Sim({
    seed: spec.seed === undefined ? 1 : spec.seed,
    world,
    players: spec.players || 1,
    spawns: spec.spawns || [[80, REST_Y(h)], [160, REST_Y(h)]],
    pickups: spec.pickups || []   // [[x,y], ...] — D2, matches Gen's own shape
  });
  sim.resetTransient();

  // Targets an attack can land on. Dummies, until 45-enemy.js lands.
  if (spec.dummies) {
    spec.dummies.forEach((d, i) => sim.addTarget(new C.Combat.Dummy(100 + i, d[0], d[1], d[2])));
  }
  // [templateId, x, y, seed?]
  if (spec.enemies) {
    spec.enemies.forEach((e) => sim.addEnemy(e[0], e[1], e[2], e[3]));
  }

  const log = [];
  if (spec.log !== false) {
    // Record the tick each event landed on. Durations measured as a
    // difference between two event ticks have no off-by-one to argue about,
    // which state-polling loops always do.
    for (const t of C.Bus.KNOWN) {
      sim.bus.on(t, (payload) => log.push({ type: t, payload, tick: sim.tick }));
    }
  }

  const api = {
    C, sim, world, log,
    p: (i = 0) => sim.players[i],
    b: (i = 0) => sim.players[i].body,
    pad: (i = 0) => sim.pads.get(i),
    t: (i = 0) => sim.targets[i],

    hold(btn, i = 0) { sim.pads.get(i).set(btn, true); return api; },
    release(btn, i = 0) { sim.pads.get(i).set(btn, false); return api; },

    step(n = 1) { for (let k = 0; k < n; k++) sim.step(); return api; },

    // Press for exactly `frames` ticks, then release and let the release be
    // latched. Held-vs-tapped is the difference between a full jump and a
    // short hop, so tests must be able to say which they mean.
    pressFor(btn, frames = 1, i = 0) {
      api.hold(btn, i).step(frames);
      api.release(btn, i).step(0);
      return api;
    },
    tap(btn, i = 0) { return api.pressFor(btn, 1, i); },

    // Run until the body is standing, so a test can start from a known rest
    // rather than from whatever the spawn happened to be.
    settle(max = 60) {
      for (let k = 0; k < max; k++) { sim.step(); if (sim.players[0].body.onGround) break; }
      // one more tick so velocities are the steady-state standing values
      sim.step();
      return api;
    },

    events(type) { return log.filter((e) => e.type === type); },
    count(type) { return api.events(type).length; },
    // Tick the nth event of this type landed on, or -1. Durations are the
    // difference between two of these.
    at(type, n = 0) { const e = api.events(type)[n]; return e ? e.tick : -1; },
    clearLog() { log.length = 0; return api; },

    // Airborne frames from now until the next landing.
    airtime(max = 400) {
      let n = 0;
      while (n < max) { sim.step(); n++; if (sim.players[0].body.onGround) break; }
      return n;
    },
    // Highest point (smallest y) reached before landing again.
    apex(max = 400) {
      const b = sim.players[0].body;
      let best = b.y, n = 0;
      while (n < max) { sim.step(); n++; if (b.y < best) best = b.y; if (b.onGround) break; }
      return best;
    }
  };
  return api;
}

/* ------------------------------------------------------------------ Suite */
function Suite(name) {
  this.name = name;
  this.passed = 0;
  this.failed = 0;
  this.lines = [];
}

Suite.prototype._record = function (ok, label, detail) {
  if (ok) {
    this.passed++;
    this.lines.push('PASS  ' + pad(label, 34) + (detail === undefined ? '' : String(detail)));
  } else {
    this.failed++;
    this.lines.push('FAIL  ' + pad(label, 34) + (detail === undefined ? '' : String(detail)));
  }
  return ok;
};

Suite.prototype.ok = function (label, cond, detail) {
  return this._record(!!cond, label, detail);
};
Suite.prototype.eq = function (label, actual, expected) {
  const ok = Object.is(actual, expected);
  return this._record(ok, label, ok ? String(actual) : 'got ' + fmt(actual) + ', want ' + fmt(expected));
};
Suite.prototype.near = function (label, actual, expected, tol) {
  const ok = Math.abs(actual - expected) <= tol;
  return this._record(
    ok, label,
    ok ? round(actual) + ' (±' + tol + ' of ' + expected + ')'
       : 'got ' + round(actual) + ', want ' + expected + ' ±' + tol
  );
};
Suite.prototype.between = function (label, actual, lo, hi) {
  const ok = actual >= lo && actual <= hi;
  return this._record(ok, label, ok ? String(round(actual)) : 'got ' + round(actual) + ', want ' + lo + '..' + hi);
};
Suite.prototype.throws = function (label, fn) {
  let threw = false;
  try { fn(); } catch (e) { threw = true; }
  return this._record(threw, label, threw ? 'threw' : 'did not throw');
};

Suite.prototype.done = function () {
  const total = this.passed + this.failed;
  for (const l of this.lines) console.log('  ' + l);
  console.log(
    '  ' + (this.failed === 0 ? 'PASS' : 'FAIL') + '  ' + pad(this.name, 34) +
    this.passed + '/' + total + ' assertions'
  );
  // A suite that asserts nothing is a suite that proves nothing.
  if (total === 0) {
    console.log('  FAIL  ' + pad(this.name, 34) + 'VACUOUS: zero assertions');
    process.exitCode = 1;
    return 1;
  }
  if (this.failed > 0) process.exitCode = 1;
  return this.failed === 0 ? 0 : 1;
};

function pad(s, n) { s = String(s); while (s.length < n) s += ' '; return s; }
function round(v) { return typeof v === 'number' ? Math.round(v * 1000) / 1000 : v; }
function fmt(v) { return typeof v === 'string' ? JSON.stringify(v) : String(round(v)); }

module.exports = {
  ROOT, SRC, SIM_FILES, VIEW_FILES, APP_FILES,
  readSrc, loadSim, loadWithView, loadPlatform, loadNarrative, loadAudio, stubCanvas,
  flatWorld, ledgeWorld, FLOOR_Y, REST_Y,
  scenario, Suite
};
