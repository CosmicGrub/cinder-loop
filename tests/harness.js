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
  '50-gen.js', '55-boss.js', '56-caller.js', '60-run.js', '65-meta.js', '70-sim.js'
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

    // Kills a real target through the actual damage path (Combat.resolveBox),
    // never by poking .hp directly (L8) — promoted here from what used to be
    // two independently-maintained, byte-identical copies in verify_run.js
    // and verify_meta.js (a real "one sibling patched, others missed" gap
    // this project has already been burned by once; one shared copy now).
    realKill(target, i = 0) {
      const hb = { x: target.body.x, y: target.body.y, w: target.body.w, h: target.body.h };
      C.Combat.resolveBox(api.p(i), hb, sim.targets, { damage: 99999, knock: [0, 0], facing: 1 }, sim.bus);
      return api;
    },

    // room-checkpoint-structure spec: kills the current room's own roster
    // through the real damage path, walks to sim.exit, and steps once —
    // the exact "kill everything, walk to the door" sequence every existing
    // beginRun()-driven test already used when a level was a single room,
    // now repeated CFG.ROOM_COUNT (or `n`, if a test wants to stop partway
    // through the chain) times. Reads CFG.ROOM_COUNT rather than a
    // hardcoded 3, so this stays correct if that constant ever changes.
    clearRoomAndAdvance(n, i = 0) {
      if (n === undefined) n = C.CFG.ROOM_COUNT;
      for (let r = 0; r < n; r++) {
        for (const t of sim.targets.slice()) api.realKill(t, i);
        api.b(i).x = sim.exit[0]; api.b(i).y = sim.exit[1] - api.b(i).h;
        api.step(1);
      }
      return api;
    },

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

/* ---------------------------------------------------- the physics prover
 * Promoted here from verify_gen.js (originally the strongest claim in that
 * file alone — every edge a generation candidate's own graph model calls
 * legal, attempted by a REAL player through REAL sim ticks) so a second,
 * unrelated caller (verify_run.js's checkpoint-alcove regression) can reuse
 * this same hard-won, multi-strategy driving logic against a REAL,
 * already-built room world instead of only an isolated two-platform one —
 * rather than forking a second, independently-tuned copy of this delicate
 * logic, the exact "one sibling patched, others missed" risk this project
 * has already named elsewhere. verify_gen.js's own file is a runnable
 * script (ends in a bare `process.exit(s.done())`), so these could not
 * live there and still be safely `require()`-able from a second test file
 * without that exit running as a side effect of the import — hence the
 * move to this already-side-effect-free shared module instead.
 *
 * Landing precisely on a specific nearby platform via momentum-based
 * platforming has no single universal "correct" input timing — a real
 * player has more than one workable technique for the same hop (release
 * early and coast, release late right at the target, hold the full natural
 * arc and let distance do the work, or a genuine short tap for a small gap
 * that doesn't need real height), and which one actually lands depends on
 * the exact geometry. Chasing one universally-correct formula was the
 * wrong problem — an edge-release version confirmed 164/174 real generated
 * edges, switching to a center-release version regressed to 151/174
 * (fixed some overshoots, broke others the edge timing had gotten right).
 * The claim this exists to check is narrower and easier: does THERE EXIST
 * a real technique that lands this hop — not does one specific heuristic
 * happen to. So it tries a small set of genuinely distinct strategies and
 * calls the edge confirmed if ANY of them lands. */
const HOP_STRATEGIES = ['edge', 'center', 'hold-full', 'short-edge', 'short-center'];

// `C`: a loaded sim module (H.loadSim()'s own return value) — passed
// explicitly rather than assumed as a fixed module-level binding, since
// different test files each call loadSim() independently.
//
// `opts` is optional and additive. Omitted (every isolated-pair caller):
// builds its own fresh two-platform world from nothing but `from`/`to`'s
// own coordinates, exactly as this function has always done, and requires
// landing ON the `to` platform's own surface. `opts.world` (a real,
// already-built World — e.g. a real generated room, post any further
// stamping): drives the real platform records' own real coordinates
// directly against it instead. `opts.successCheck(body, tick)`: checked
// every real tick regardless of onGround, for a caller proving reachability
// against a point + radius (RunLogic.reachedExit's own shape) rather than
// "landed on this specific platform."
function attemptHop(C, from, to, opts) {
  const dir = to.x1 < from.x0 ? -1 : (to.x0 > from.x1 ? 1 : 0);
  if (dir === 0) return null;   // zero-gap / overlapping-in-x: out of scope, see above

  for (const strategy of HOP_STRATEGIES) {
    if (attemptHopWith(C, from, to, dir, strategy, opts)) return true;
  }
  return false;
}

function attemptHopWith(C, from, to, dir, strategy, opts) {
  opts = opts || {};
  const CFG = C.CFG, World = C.World, TILE = C.World.TILE;
  let world, ox, oy;
  if (opts.world) {
    world = opts.world; ox = 0; oy = 0;
  } else {
    const minX = Math.min(from.x0, to.x0) - 4, maxX = Math.max(from.x1, to.x1) + 4;
    const minY = Math.min(from.y, to.y) - 12, maxY = Math.max(from.y, to.y) + 4;
    world = new World(maxX - minX + 1, maxY - minY + 1);
    ox = -minX; oy = -minY;
    for (let x = from.x0; x <= from.x1; x++) world.set(x + ox, from.y + oy, TILE.SOLID);
    for (let x = to.x0; x <= to.x1; x++) world.set(x + ox, to.y + oy, TILE.SOLID);
  }

  const startX = dir > 0 ? (from.x0 + ox) * CFG.TILE + 2 : (from.x1 + ox + 1) * CFG.TILE - CFG.PLAYER_W - 2;
  const sim = new C.Sim({
    seed: 7, world, players: 1,
    spawns: [[startX, (from.y + oy) * CFG.TILE - CFG.PLAYER_H]]
  });
  sim.resetTransient();
  const pad2 = sim.pads.get(0);
  const rise = from.y - to.y;
  const needsDouble = rise >= 3;
  const edgeX = dir > 0 ? (from.x1 + ox + 1) * CFG.TILE : (from.x0 + ox) * CFG.TILE;
  const targetY = (to.y + oy) * CFG.TILE - CFG.PLAYER_H;
  const targetX0 = (to.x0 + ox) * CFG.TILE, targetX1 = (to.x1 + ox + 1) * CFG.TILE;
  const isShort = strategy === 'short-edge' || strategy === 'short-center';
  const targetAim = (strategy === 'center' || strategy === 'short-center') ? (targetX0 + targetX1) / 2 : targetX0;

  // Every non-zero gap is crossed by jumping, including flat/descending
  // ones — that's what the flat/drop gap ceiling itself measures (a running
  // jump, not a no-jump walk-off). But holding jump to full natural apex,
  // right for a gap AT that ceiling, is needless overkill for a SMALL gap
  // well under it: traced directly on a trivial 1-tile drop onto a nearby
  // spur (rise -1, well inside the flat ceiling), a full-apex hold produced
  // an arc so long that the character's x position sailed clean past the
  // entire narrow target before its y ever came back down to landing
  // height. Real players modulate jump duration to the gap they're actually
  // crossing (that's what this game's own JUMP_CUT mechanic is FOR) — the
  // 'short-*' strategies below are a real, short tap-and-release rather
  // than a held-to-apex jump, for exactly the small-gap cases a full hold
  // overshoots. Only meaningful where no real height is needed (rise <= 0,
  // and not a double-jump climb); for a genuine climb the short strategies
  // just fall through to the same technique as their non-short counterpart.
  const useShortHop = isShort && rise <= 0;

  let launched = false, releasedForEdge = false, doubleJumped = false, dirReleased = false;
  let shortHopReleased = false;
  for (let t = 0; t < 500; t++) {
    const b = sim.players[0].body;
    /* 'hold-full' never releases direction at all — the original
     * "maximize distance" technique, right for wide targets and gaps near
     * the measured ceiling. The other strategies ease off once launched is
     * done, letting AIR_FRICTION help precision on a narrow target —
     * holding direction unconditionally for the ENTIRE flight, even past
     * the target, consistently overshot narrow (2-3 tile) close targets
     * regardless of correct jump timing, because horizontal momentum is
     * entirely decoupled from jump state in this game's physics and
     * nothing was asking the character to slow down. */
    if (strategy === 'hold-full' || !dirReleased) pad2.set(dir > 0 ? 'right' : 'left', true);

    if (!launched) {
      const atEdge = dir > 0 ? (b.x + b.w >= edgeX - 4) : (b.x <= edgeX + 4);
      if (atEdge) { pad2.set('jump', true); launched = true; }
    } else if (useShortHop) {
      // A genuine tap: release on the very next tick after the press,
      // regardless of height or position — the short arc this produces is
      // the whole point, not a side effect to gate away. Direction still
      // eases off once past the aim point (height is trivially irrelevant
      // here since useShortHop only applies at rise <= 0) — without this,
      // direction would stay held for the entire flight and reintroduce the
      // same overshoot risk on a narrow target, just with a shorter arc.
      if (!shortHopReleased) { pad2.set('jump', false); shortHopReleased = true; }
      if (!dirReleased) {
        const bodyLead = dir > 0 ? b.x + b.w : b.x;
        const overAim = dir > 0 ? (bodyLead >= targetAim) : (bodyLead <= targetAim);
        if (overAim) dirReleased = true;
      }
    } else if (needsDouble && !doubleJumped && b.y > targetY && b.vy >= 0 && !releasedForEdge) {
      // Jump 1 has reached its own natural apex AND the target height still
      // isn't reached — both conditions matter. A tight (gap 1) climb can
      // clip the SIDE of the target platform on the way up: traced directly,
      // the body slides pinned against that wall (onWall) for many ticks
      // while still rising, and by the time it finally clears the top edge
      // it has already arrived at the exact needed height — for free, via
      // the wall-slide, no second jump required. The original height-blind
      // version pressed jump 2 anyway purely because apex (`vy >= 0`) had
      // been reached, launching a needless second arc that overshot the
      // target badly (rose far past it, landed nowhere near). Gating on
      // `b.y > targetY` skips jump 2 whenever jump 1 already got there.
      pad2.set('jump', false); releasedForEdge = true;
    } else if (needsDouble && releasedForEdge && !doubleJumped) {
      pad2.set('jump', true); doubleJumped = true;
    } else if (strategy === 'hold-full') {
      pad2.set('jump', true);   // hold continuously — JUMP_CUT never applies
    } else if (!dirReleased) {
      /* Release once past the aim point AND the needed height has actually
       * been reached — releasing on x-position alone was a real bug in an
       * earlier version: JUMP_CUT applies whenever jump is released WHILE
       * STILL RISING, with no regard for whether the x-check happened to
       * pass early. For a target well above the takeoff platform, the
       * horizontal position can drift into the target's x range LONG
       * before the climb is actually complete — releasing right then cuts
       * the ascent short and the character falls into the gap it was
       * trying to clear, never having reached the ledge at all. Gating on
       * `b.y <= targetY` first guarantees the full climb happens before
       * any release is considered; once past the apex, JUMP_CUT is a
       * no-op regardless (its own condition requires vy < 0), so a "late"
       * release is always safe. */
      const heightReached = b.y <= targetY;
      const bodyLead = dir > 0 ? b.x + b.w : b.x;
      const overAim = dir > 0 ? (bodyLead >= targetAim) : (bodyLead <= targetAim);
      if (heightReached && overAim) { pad2.set('jump', false); dirReleased = true; }
      else { pad2.set('jump', true); }
    } else {
      // A ONE-WAY LATCH. Re-setting jump back to true whenever the
      // character fell back below the target height after an earlier
      // release toggles pad.next.jump false-then-true again — a genuine
      // fresh PRESS EDGE from the sim's own perspective — and if the double
      // jump was never spent, that "hold again" accidentally CONSUMES it,
      // launching the character on an uncontrolled extra arc (measured
      // directly once: it flew clean off this isolation world's far
      // boundary wall). Once released, stay released for the rest of the
      // attempt.
      pad2.set('jump', false);
    }

    sim.step();
    // opts.successCheck, when given, is checked every tick regardless of
    // onGround — a caller proving real-world reachability against a point
    // + radius (RunLogic.reachedExit's own shape) rather than "landed on
    // this specific platform" doesn't need to be grounded to count; the
    // default landing-precision check below is unchanged for every
    // existing call site, none of which pass opts.
    if (opts.successCheck) {
      if (opts.successCheck(b, t)) return true;
    }
    else if (launched && b.onGround && t > 5) {
      return b.x + b.w > targetX0 && b.x < targetX1 && Math.abs(b.y - targetY) < 2;
    }
  }
  return false;
}

/* D17: a sibling to attemptHop/attemptHopWith above, added for the same
 * reason those were promoted to this shared file — "a REAL player,
 * attempted through REAL sim ticks," this time for a Roll crossing rather
 * than a jump. Unlike a hop, roll has no strategic variation to fan out
 * over: fixed speed, fixed duration, no player timing choice beyond WHEN
 * to press the button while grounded and off cooldown — so this drives one
 * deterministic sequence rather than trying several.
 *
 * `opts.world`/`opts.successCheck` follow attemptHopWith's own optional
 * shape, for reuse against a real generated room instead of an isolated
 * two-platform world. Returns null for a zero-gap/overlapping-in-x pair
 * (out of scope, mirroring attemptHop's own convention); otherwise true
 * only if the body both lands cleanly on `to` AND never took hazard damage
 * along the way (roll's own i-frames are the entire point of this beat —
 * a crossing that happens to land but got hurt getting there is not the
 * capability this is proving). */
function attemptRoll(C, from, to, opts) {
  opts = opts || {};
  const CFG = C.CFG, World = C.World, TILE = C.World.TILE;
  const dir = to.x1 < from.x0 ? -1 : (to.x0 > from.x1 ? 1 : 0);
  if (dir === 0) return null;   // zero-gap / overlapping-in-x: out of scope, see above

  let world, ox, oy;
  if (opts.world) {
    world = opts.world; ox = 0; oy = 0;
  } else {
    const minX = Math.min(from.x0, to.x0) - 4, maxX = Math.max(from.x1, to.x1) + 4;
    const minY = Math.min(from.y, to.y) - 12, maxY = Math.max(from.y, to.y) + 4;
    world = new World(maxX - minX + 1, maxY - minY + 1);
    ox = -minX; oy = -minY;
    for (let x = from.x0; x <= from.x1; x++) world.set(x + ox, from.y + oy, TILE.SOLID);
    for (let x = to.x0; x <= to.x1; x++) world.set(x + ox, to.y + oy, TILE.SOLID);
    // The hazard strip a real hazard beat stamps across the gap, at the
    // shared/lower row (50-gen.js's stamp() convention) — without this,
    // "never took hazard damage" would be vacuously true (nothing there
    // to hit).
    const hazY = Math.max(from.y, to.y);
    const gapX0 = dir > 0 ? from.x1 + 1 : to.x1 + 1;
    const gapX1 = dir > 0 ? to.x0 - 1 : from.x0 - 1;
    for (let x = gapX0; x <= gapX1; x++) world.set(x + ox, hazY + oy, TILE.HAZARD);
  }

  // Unlike attemptHopWith, roll needs no run-up (b.vx is set to a fixed
  // ROLL_SPEED unconditionally on trigger, regardless of prior speed or
  // position) — spawning far from the departure edge the way a JUMP strategy
  // wants to (room to build up speed) would only waste roll's own fixed,
  // limited travel budget crossing the rest of `from`'s own platform before
  // ever reaching the gap. So this spawns at the edge NEAREST the gap —
  // deliberately the mirror image of attemptHopWith's own dir>0/dir<0
  // branches, not a copy of them.
  const startX = dir > 0 ? (from.x1 + ox + 1) * CFG.TILE - CFG.PLAYER_W - 2 : (from.x0 + ox) * CFG.TILE + 2;
  const sim = new C.Sim({
    seed: 7, world, players: 1,
    spawns: [[startX, (from.y + oy) * CFG.TILE - CFG.PLAYER_H]]
  });
  sim.resetTransient();
  const pad = sim.pads.get(0);
  const b = sim.players[0].body;
  const targetY = (to.y + oy) * CFG.TILE - CFG.PLAYER_H;
  const targetX0 = (to.x0 + ox) * CFG.TILE, targetX1 = (to.x1 + ox + 1) * CFG.TILE;

  // Settle grounded first — a body spawned at rest reads onGround=false on
  // tick 0 (30-player.js's roll-trigger checks `grounded`, captured from
  // the PREVIOUS tick's own onGround), so pressing roll before settling
  // fires the airborne Dash branch instead of a grounded Roll.
  let settled = false, startHp = null;
  for (let t = 0; t < 30 && !settled; t++) {
    sim.step();
    if (b.onGround) { settled = true; startHp = sim.players[0].hp; }
  }
  if (!settled) return false;

  // Facing is latched from the held direction before the roll-trigger
  // check runs later in the same tick's update(), and stays fixed for the
  // roll's whole duration — press direction + roll together for exactly
  // one tick, then release both.
  let pressed = false, hurt = false;
  for (let t = 0; t < 60; t++) {
    if (!pressed) {
      pad.set(dir > 0 ? 'right' : 'left', true);
      pad.set('roll', true);
      pressed = true;
    } else {
      pad.set(dir > 0 ? 'right' : 'left', false);
      pad.set('roll', false);
    }
    sim.step();
    if (sim.players[0].hp < startHp) hurt = true;
    if (opts.successCheck) {
      if (opts.successCheck(b, t)) return !hurt;
    // Roll crouches for its own entire duration (b.setHeight resizes about
    // the feet), so a body that's merely grounded WHILE STILL MID-ROLL sits
    // ~10px lower (top-y) than the standing-height targetY this checks
    // against — e.g. touching down partway across the gap's own hazard
    // strip, straddling onto the far platform's leading edge, well before
    // the roll itself has ended. Waiting for state to actually leave
    // 'roll' (endRoll() has run, the body has stood back up if there was
    // room to) is what makes this the same "did the crossing genuinely
    // conclude" check attemptHopWith gets for free (a jump never crouches).
    } else if (b.onGround && sim.players[0].state !== 'roll' && t > 3) {
      const landed = b.x + b.w > targetX0 && b.x < targetX1 && Math.abs(b.y - targetY) < 2;
      return landed && !hurt;
    }
  }
  return false;
}

module.exports = {
  ROOT, SRC, SIM_FILES, VIEW_FILES, APP_FILES,
  readSrc, loadSim, loadWithView, loadPlatform, loadNarrative, loadAudio, stubCanvas,
  flatWorld, ledgeWorld, FLOOR_Y, REST_Y,
  scenario, Suite,
  HOP_STRATEGIES, attemptHop, attemptHopWith, attemptRoll
};
