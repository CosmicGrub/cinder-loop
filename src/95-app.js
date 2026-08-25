/* ===========================================================================
 * 95-app.js  —  boot, fixed-timestep accumulator, keyboard + gamepad
 * ---------------------------------------------------------------------------
 * PRESENTER layer. This is the only file allowed to know what a millisecond
 * is. The sim counts ticks; the accumulator here decides how many ticks a
 * wall-clock frame is worth and never, ever scales one (L3).
 *
 * v0.2.5: boot's primary path became a REAL Gen.generate() level, not the
 * demo level. v0.2.13: boot's primary path is now a full sim.beginRun() —
 * 60-run.js's real spawn -> clear -> boss -> die -> spend -> respawn loop,
 * not just one generated level with hand-placed scaffolding around it. Both
 * still guard the same way: beginRunOrFallback() below is a second,
 * independent net around Gen.generate()'s own fairness guard (D3a; throws
 * rather than ever handing back something unfair) — the game must still
 * boot into something playable, loudly, rather than a blank tab, if that
 * guard is ever somehow tripped by a future CFG edit. demoLevel() is what
 * it falls back to, and it is still built in code rather than hand-drawn
 * for the same reason it always was: this platform is here to test coyote
 * time, that tunnel is here to test rolling under a ceiling.
 *
 * Owned by: App team.
 * ======================================================================== */
;(function (C) {
'use strict';

var CFG = C.CFG, TILE = C.TILE, World = C.World, Sim = C.Sim, View = C.View,
    Combat = C.Combat, Settings = C.Settings, Menu = C.Menu, TouchControls = C.TouchControls,
    MetaLogic = C.MetaLogic, Narrative = C.Narrative, SFXPlayer = C.SFXPlayer;

var STORAGE_KEY = 'cinderloop.settings.v1';
var META_STORAGE_KEY = 'cinderloop.meta.v1';

/* --------------------------------------------------------- demo level */
function demoLevel() {
  var W = 60, H = 28, world = new World(W, H);
  var S = TILE.SOLID, O = TILE.ONEWAY, X = TILE.HAZARD;
  var FLOOR = 23, x, y;

  for (x = 0; x < W; x++) { world.set(x, 0, S); world.set(x, H - 1, S); }
  for (y = 0; y < H; y++) { world.set(0, y, S); world.set(W - 1, y, S); }
  for (y = FLOOR; y < H; y++) for (x = 1; x < W - 1; x++) world.set(x, y, S);

  // A pit with spikes at the bottom: falling in costs a heart, it is not a
  // silent teleport back to spawn.
  for (x = 22; x <= 27; x++) {
    for (y = FLOOR; y < H - 1; y++) world.set(x, y, TILE.EMPTY);
    world.set(x, H - 2, X);
  }

  // Raised block. Running off its right edge is the coyote-time test.
  for (x = 7; x <= 14; x++) for (y = 19; y < FLOOR; y++) world.set(x, y, S);

  // One-way platforms at three heights: up through them, down onto them,
  // crouch-jump through them.
  for (x = 16; x <= 21; x++) world.set(x, 18, O);
  for (x = 30; x <= 36; x++) world.set(x, 17, O);
  for (x = 40; x <= 46; x++) world.set(x, 20, O);

  // Spikes standing on the floor.
  for (x = 34; x <= 36; x++) world.set(x, FLOOR - 1, X);

  // A one-tile-high tunnel. 16px of headroom: the 22px standing box does not
  // fit, the 12px crouch/roll box does.
  for (x = 47; x <= 55; x++) world.set(x, FLOOR - 2, S);

  return world;
}

/* Fixed positions matching the ORIGINAL hand-placed boot() values exactly —
 * used only on the fallback path below, so a rare Gen.generate() failure
 * lands on the exact same scaffolding this project shipped with before
 * v0.2.5, not a new, untested shape. Floor surface is row 23 (y 368), so a
 * 20px dummy rests at 348 and a walking enemy rests at 368-h; the raised
 * block's top is row 19 (y 304), so an enemy standing there rests at 304-h.
 * The Ashwalker sits ON the block because the block is where the player has
 * to go — it walls off the corridor at spawn — and each template is met
 * alone before any are met together, same reasoning as the generated path
 * below. */
var DEMO_SPAWNS = [[CFG.TILE * 3, CFG.TILE * 18], [CFG.TILE * 5, CFG.TILE * 18]];
var DEMO_DUMMY = { x: 70, y: 348, hp: 40 };
var DEMO_ENEMIES = [
  { tid: 'ashwalker',  x: CFG.TILE * 11, y: 304 - 24 },
  { tid: 'emberrush',  x: CFG.TILE * 31, y: 368 - 18 },
  { tid: 'kilnspitter', x: CFG.TILE * 44, y: 368 - 16 },
  { tid: 'wickmoth',   x: CFG.TILE * 38, y: 250 }
];

/* ---------------------------------------------------- procedural level (D3)
 * A `?seed=12345` query param reproduces an exact generated level — matching
 * this file's existing debug-toggle conventions (F2/F3/F4) — because without
 * it, a bug found in some run's generated shape is gone the moment the tab
 * reloads. Anything absent or non-numeric falls through to a fresh seed.
 * Date.now(), not Math.random(): this file is scanned the same way
 * 80-view.js is (verify_arch) and Math.random specifically is banned there
 * so presenter screenshots stay frame-to-frame comparable — Date.now() is
 * not that generator, it is read exactly once per boot, not per frame. */
function pickSeed() {
  var params = (typeof location !== 'undefined' && location.search)
    ? new URLSearchParams(location.search) : null;
  var override = params ? params.get('seed') : null;
  if (override !== null && override !== '' && isFinite(Number(override))) return Number(override);
  return Date.now();
}

/* Enemy placement used to live here as scaffolding, with its own comment
 * naming 60-run.js as its intended replacement once it existed ("a
 * temporary stand-in that is honest about being one"). That file now
 * exists (RunLogic.placeEnemies, called from Sim.prototype.beginRun()) and
 * genuinely supersedes it — this file's job below is now just the boot-path
 * seed/fallback wiring around that one call, not level construction. */

/* ------------------------------------------------------------ persistence
 * The only two functions in the project allowed to throw on storage access —
 * a private-browsing tab or a disabled-storage policy raises here, and only
 * here, where it is caught and treated as "no settings available" rather
 * than a crash. Everything Settings.* does is pure and cannot throw; this is
 * deliberately the thin, ugly, contained edge around it. */
function loadSettings() {
  try {
    if (typeof localStorage === 'undefined') return Settings.deserialize(null);
    return Settings.deserialize(localStorage.getItem(STORAGE_KEY));
  } catch (e) {
    return Settings.deserialize(null);
  }
}
function saveSettings(settings) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, Settings.serialize(settings));
  } catch (e) {
    // Storage full, disabled, or a private-browsing tab. Play continues;
    // it just does not remember this session's settings for the next one.
  }
}

// 65-meta.js's own storage glue — identical shape and identical reasoning,
// a second payload under a second key, not a reason to generalize the two
// into one shared helper: Settings and Meta are unrelated data (D4/D8 vs.
// keybinds/motion) that happen to persist the same way, the same way this
// project reuses a SHAPE without merging two conceptually different things
// into one.
function loadMeta() {
  try {
    if (typeof localStorage === 'undefined') return MetaLogic.deserialize(null);
    return MetaLogic.deserialize(localStorage.getItem(META_STORAGE_KEY));
  } catch (e) {
    return MetaLogic.deserialize(null);
  }
}
function saveMeta(meta) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(META_STORAGE_KEY, MetaLogic.serialize(meta));
  } catch (e) {
    // Same failure mode as saveSettings() above: play continues, this
    // session's meta progression just does not survive a reload.
  }
}

/* ------------------------------------------------------------- binding
 * There is no static KEYMAP any more (v0.2.2): live dispatch asks
 * Settings.actionForCode(app.settings, code) instead, so a rebind made in the
 * pause menu takes effect on the very next keypress with nothing to rebuild.
 *
 * Standard gamepad mapping. Face button 0 jumps, 1 and 5 roll (B and RB, so
 * both thumb and shoulder work), 2 attacks, 3 parries (abilities spec §2b —
 * the next free face button, same grouping as the other three core actions),
 * dpad 12-15 and the left stick both steer. Button 4 (LB) switches weapons
 * (D15) — confirmed genuinely unused by anything else in this codebase
 * before this. Only ever translates hardware into pad.set() calls, the
 * exact same shape every other action here already uses — the actual
 * consume-and-act decision lives in the SIM layer (Sim.prototype.step's
 * own phase 0), never here, so a scripted test never needs a fake gamepad.
 * ======================================================================== */
function pollGamepad(pad, gp) {
  if (!gp) return;
  var ax = gp.axes[0] || 0, DEAD = 0.35;
  pad.set('left', ax < -DEAD || !!(gp.buttons[14] && gp.buttons[14].pressed));
  pad.set('right', ax > DEAD || !!(gp.buttons[15] && gp.buttons[15].pressed));
  var ay = gp.axes[1] || 0;
  pad.set('up', ay < -DEAD || !!(gp.buttons[12] && gp.buttons[12].pressed));
  pad.set('down', ay > DEAD || !!(gp.buttons[13] && gp.buttons[13].pressed));
  pad.set('jump', !!(gp.buttons[0] && gp.buttons[0].pressed));
  pad.set('roll', !!((gp.buttons[1] && gp.buttons[1].pressed) || (gp.buttons[5] && gp.buttons[5].pressed)));
  pad.set('attack', !!(gp.buttons[2] && gp.buttons[2].pressed));
  pad.set('parry', !!(gp.buttons[3] && gp.buttons[3].pressed));
  pad.set('switchWeapon', !!(gp.buttons[4] && gp.buttons[4].pressed));
}

/* ---------------------------------------------------------------- boot */
/* Gen.generate() already guards its own fairness (D3a) and its own hard
 * ceiling — throws rather than ever handing back something unfair — so
 * beginRun() can throw too, by the same path. This is a second, independent
 * net around it: if some future CFG edit ever pushes generation somewhere
 * genuinely impossible, the game must still stay playable, LOUDLY
 * (console.warn, never silent), rather than freezing solid. Falls back to
 * the ORIGINAL hand-built demo level and roster — unlike a generated level,
 * this path cannot itself throw, so it is never allowed to be the thing
 * that fails.
 *
 * Shared between TWO call sites, not one — an adversarially-found gap.
 * `Gen.generate()` is not only called once, at boot: 60-run.js's own
 * `Sim.prototype._beginRunEnd()` calls it again on EVERY subsequent level
 * transition, for the rest of any given playthrough, with (before this)
 * zero net under it. An impossible-CFG failure there escaped uncaught out
 * of `sim.step()`, into `frame()`'s own `requestAnimationFrame` callback,
 * which has no try/catch either — the game froze solid, unrecoverable
 * without a reload, exactly the failure mode this comment already says
 * must never happen, just reached from a call site the original guard
 * didn't cover. Pulled the "warn loudly, install the known-safe fallback"
 * logic out into its own function so both call sites share ONE
 * implementation rather than risking the "one sibling patched, others
 * missed" gap this codebase has hit before (`_relocatePlayers()`'s own
 * comment names the same lesson). */
function installFallback(sim, err) {
  if (typeof console !== 'undefined' && console.warn) {
    console.warn('recovering to the fallback level: ' + (err && err.message));
  }
  // L5: the presenter may never assign sim.<field> directly — loadFallback()
  // is a real Sim method that does the actual mutation, exactly the same
  // shape every other sim-state change already goes through.
  sim.loadFallback(demoLevel(), DEMO_SPAWNS);
  for (var ei = 0; ei < DEMO_ENEMIES.length; ei++) {
    sim.addEnemy(DEMO_ENEMIES[ei].tid, DEMO_ENEMIES[ei].x, DEMO_ENEMIES[ei].y);
  }
}

function beginRunOrFallback(sim, seed) {
  try {
    sim.beginRun(seed);
    return true;
  } catch (e) {
    installFallback(sim, e);
    return false;
  }
}

function boot(canvas, hud, seed) {
  if (seed === undefined) seed = pickSeed();
  // Loaded BEFORE construction, passed as a real constructor option — the
  // same accepted shape opts.seed/opts.world already use, not the
  // presenter reaching in to assign sim.meta directly (L5). beginRun()'s
  // own reset loop (70-sim.js) applies whatever this.meta already is, so a
  // player's maxHp reflects loaded progression from the very first tick,
  // with no separate apply-after-the-fact call needed here.
  var sim = new Sim({ seed: seed, players: 1, meta: loadMeta() });
  var generated = beginRunOrFallback(sim, seed);
  // The one new event 65-meta.js needs (00-core.js's own EVENTS comment):
  // persist exactly when there is something newly worth persisting, not on
  // a timer or every frame — _commitPendingLevel() only fires at a real
  // D4 "transition."
  sim.bus.on('runEnd', function () { saveMeta(sim.meta); });
  // D15 (weapon equip & switch): meta.lastWeapon is a real, frequently-
  // mutated, player-facing preference (Sim.prototype.switchWeapon writes
  // it the instant player 0 switches) — unlike F5-F10's debug-only fields,
  // it can be changed many times in an ordinary session with no run-end
  // anywhere nearby. Without a dedicated save hook, this is the exact
  // "mutated in memory but silently reverted by an ordinary reload" gap
  // this file's own F5/F6 comment above already documents and fixed once
  // for those two fields — adversarially found again here, fixed the same
  // way: save immediately, gated to player 0's own switch (the only one
  // that actually touches shared meta; a co-op partner's own live
  // player.weapon is per-player and never persisted).
  sim.bus.on('weaponSwitch', function (e) { if (e.playerId === sim.players[0].id) saveMeta(sim.meta); });

  // A silent practice dummy near spawn, before anything that fights back —
  // boot-path flavor, not part of 60-run.js's own roster (a Dummy is a
  // tutorial fixture, not a DATA.ENEMIES template), added AFTER beginRun()
  // has already placed this level's real roster. Found by its own fixed id
  // (100), not array position: sim.targets[0] is now whichever real enemy
  // RunLogic.placeEnemies() happened to add first, not this. Safe alongside
  // a real roster in the sense that matters: Sim's own _levelRosterIds
  // (70-sim.js) tracks exactly which target ids came from beginRun() itself,
  // so an undying dummy sitting in the same this.targets array can never
  // make isLevelClear() see a phantom survivor and block the run loop
  // forever — a real bug an earlier draft of this exact change had, caught
  // by driving it end to end in a real browser rather than assumed safe.
  // NOT actually permanent, though, an earlier version of this comment's
  // own overclaim, caught adversarially: both _enterRoom() and
  // _enterBoss() unconditionally clear this.targets on every transition,
  // this dummy included, and nothing ever re-adds it — it survives only
  // until the player walks through the very first exit. Left as-is rather
  // than re-added on every transition: it is boot-path flavor, not a
  // feature this loop promises to maintain, and the ONE claim that matters
  // (isLevelClear() never sees it as a phantom survivor) stays true for the
  // whole time it does exist.
  var sb = sim.players[0].body;
  var dummy = generated ? { x: sb.x + 20, y: sb.y + sb.h - 20, hp: 40 } : DEMO_DUMMY;
  sim.addTarget(new Combat.Dummy(100, dummy.x, dummy.y, dummy.hp));

  var view = new View(canvas, sim);
  // D11/D12: constructed AFTER beginRunOrFallback(), the same ordering
  // View itself already uses — its own initial _lastPhase/_lastLevelSeed
  // baseline has to reflect the level actually loaded, not the sim's
  // pristine pre-beginRun() construction defaults, or the very first frame
  // would misread "a level is already loaded" as a fresh levelStart.
  //
  // Seeded with `seed` (below the presenter's own real, varying value —
  // pickSeed()'s Date.now(), or a debug ?seed= override), not left to its
  // own class default. An adversarially-found gap: with no seed passed
  // here, every real boot ever launched used the exact same fallback (1),
  // making the Kilnkeeper's own dialogue stream — and every enemy bark —
  // hardcoded byte-identical from the game's first launch to its last,
  // defeating the entire reason this file owns a seeded RNG at all.
  // Reusing the sim's own seed (rather than drawing a second, independent
  // one) is deliberate, not incidental: it means a `?seed=` debug session
  // reproduces its dialogue sequence exactly alongside its level, useful
  // for a bug report, and the sim's own seed already varies boot to boot
  // exactly the way this file's dialogue stream needs to.
  var narrative = new Narrative(sim, { seed: seed });

  var settings = loadSettings();
  function applyMotion() {
    view.particles.reducedMotion = settings.reducedMotion;
    view.camera.reducedMotion = settings.reducedMotion;
  }
  applyMotion();

  // 85-audio.js (D11): same seed the sim and narrative already share (see
  // narrative's own comment above on why that reuse is deliberate, not
  // incidental) — a `?seed=` debug session reproduces its noise-cue texture
  // exactly alongside its level and dialogue. `muted` is read from the
  // settings ALREADY loaded above, not defaults(), so a player who muted
  // last session does not hear one un-muted cue on the very next boot before
  // the menu ever opens.
  var audio = new SFXPlayer(sim, { seed: seed, muted: settings.muted });

  var menu = new Menu(settings, {
    // Adversarially found (v0.2.16, driving the real Sound row through a
    // real browser): `settings` here is this closure's OWN local variable,
    // reassigned to `next` every call, but `app.settings` below is a
    // separate reference captured once, at `app` construction — reassigning
    // the local was silently leaving `app.settings` pointing at the
    // ORIGINAL, pre-toggle object forever. Every INTERNAL consumer
    // (applyMotion(), audio.muted, actionForCode() in the key handlers)
    // already reads the closure variable directly and was never affected —
    // this only broke code reading `window.CINDER_APP.settings` from
    // outside boot() itself, which nothing in-engine does today, but a
    // stale `app.settings` is exactly the kind of landmine worth closing on
    // sight.
    //
    // app.showMeter is a SEPARATE, second adversarially-found gap in this
    // same callback (v0.2.16): F3 below (line ~440-ish) writes
    // `app.showMeter` directly, bypassing Settings entirely, by design — a
    // debug-only override, never persisted. onChange used to unconditionally
    // re-derive `app.showMeter = settings.showMeter` on EVERY call, which
    // silently reverted an F3 toggle the instant the player changed ANY
    // OTHER, unrelated setting (Sound, a rebind, Reduced Motion) — two
    // separate write paths to one field, and only one of them was ever
    // guarded. Fixed by only re-deriving it when settings.showMeter itself
    // actually changed (compared against the OLD closure value, before
    // reassignment) — so F3's override survives an unrelated change, while a
    // real Frame-Meter-row toggle (or Reset to Defaults, which legitimately
    // means "override everything, including F3's session-only choice") both
    // still take effect correctly.
    onChange: function (next) {
      var showMeterChanged = next.showMeter !== settings.showMeter;
      settings = next;
      applyMotion();
      audio.muted = settings.muted;
      app.settings = settings;
      if (showMeterChanged) app.showMeter = settings.showMeter;
      saveSettings(settings);
    },
    onClose: function () { app.paused = false; }
  });

  /* Touch capability and portrait detection.
   *
   * `'ontouchstart' in window` and `navigator.maxTouchPoints > 0` are BOTH
   * known false-positive traps: a headless/automated Chromium reports touch
   * support through them with no touch emulation active at all (measured
   * directly — a plain launch with zero emulation reported `true`), and on
   * real hardware a touch-capable 2-in-1 laptop with its keyboard attached
   * reports the same `true` while the player is unambiguously using a mouse.
   * `matchMedia('(pointer: coarse)')` asks the right question instead — is
   * the PRIMARY input mechanism imprecise — which is what actually decides
   * whether big on-screen buttons make sense, and it is also literally the
   * signal the CSS rotate-hint rule already keys on, so JS and CSS now agree
   * by construction instead of by coincidence.
   *
   * Declared with `var` and updated by direct DOM manipulation (never
   * through `app`, which does not exist yet the first time fit() runs
   * below) so ordering with the rest of boot() cannot matter. Re-evaluated
   * every fit() call rather than decided once — the same place DPR already
   * gets re-checked every frame — because unlike "does this hardware have a
   * touchscreen at all," "is touch the primary input right now" can
   * genuinely change mid-session (a 2-in-1's keyboard being detached). This
   * is capability detection, not scheme-specific: it holds regardless of
   * which on-screen control layout eventually reads `app.touch`.
   *
   * The hint is a NUDGE, not a lock. A hard orientation lock needs the
   * Fullscreen + Screen Orientation APIs, both of which require a user
   * gesture this page never forces — a game that only agrees to play after
   * an extra unexplained tap is worse than one that asks nicely. */
  var isTouch = false;
  var rotateEl = document.getElementById('rotate');
  var coarseMQ = window.matchMedia ? window.matchMedia('(pointer: coarse)') : null;
  var portraitMQ = window.matchMedia ? window.matchMedia('(orientation: portrait)') : null;

  /* Gesture Surface touch layer (locked design, masterfile §5b). Constructed
   * lazily — the first time isTouch is observed true — and never torn down
   * again even if a 2-in-1's keyboard reattaches and isTouch flips back to
   * false; the difference between "constructed but idle" and "never
   * constructed" only matters for the zero-cost claim on a device that is
   * NEVER touch-capable, which this still satisfies exactly (touchInput
   * stays null for the whole session on a plain desktop). */
  var touchInput = null;
  // Touch Assist (abilities spec §2b): the one genuinely new pattern in
  // this whole feature, not a mirror of anything 94-touch.js already does
  // — a real telegraph timestamp, tracked here (not in 94-touch.js, which
  // has no Bus access at all — it is DOM-facing only) and read by
  // TouchControls through the controller interface, the same "here is a
  // pad, here is a menu-ish interface" decoupling isPaused/openPause/etc.
  // already establish. TOUCH_ASSIST_WINDOW is a presenter-only judgment
  // call (not a CFG constant — this never reaches the sim), roughly
  // MIN_TELEGRAPH plus real margin for a touch player's own reaction time.
  var TOUCH_ASSIST_WINDOW = 24;
  var lastTelegraphTick = -Infinity;
  sim.bus.on('telegraph', function () { lastTelegraphTick = sim.tick; });

  var touchController = {
    isPaused: function () { return app.paused; },
    openPause: function () { app.paused = true; menu.openRoot(); },
    closePause: function () { app.paused = false; menu.close(); },
    menuMove: function (dir) { menu.move(dir); },
    menuConfirm: function () { menu.confirm(); },
    menuCancel: function () { menu.cancel(); },
    parryAssistEnabled: function () { return !!settings.touchParryAssist; },
    recentTelegraph: function () { return (sim.tick - lastTelegraphTick) <= TOUCH_ASSIST_WINDOW; }
  };

  function updateTouchState() {
    // No matchMedia at all (very old browser) is the one case worth a
    // fallback for; everywhere else, coarseMQ is authoritative.
    isTouch = coarseMQ ? coarseMQ.matches : (navigator.maxTouchPoints || 0) > 0;
    if (rotateEl) rotateEl.classList.toggle('active', isTouch && !!(portraitMQ && portraitMQ.matches));
    if (isTouch && !touchInput && TouchControls) {
      touchInput = new TouchControls(canvas, sim.pads.get(0), touchController);
      touchInput.attach();
    }
  }

  /* DPR is re-read every call rather than cached: there is no native
   * "devicePixelRatio changed" event, and this already runs once a frame, so
   * dragging the window between a 100% and a 200%-scaled monitor (or a phone
   * rotating into a different pixel density) is picked up for free on the
   * very next frame instead of needing a dedicated listener. */
  function fit() {
    var w = Math.max(320, canvas.clientWidth | 0);
    var h = Math.max(240, canvas.clientHeight | 0);
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (view.cssW !== w || view.cssH !== h || view.dpr !== dpr) view.resize(w, h, dpr);
    updateTouchState();
  }
  fit();
  window.addEventListener('resize', fit);

  var p1 = sim.pads.get(0);

  // The browser autoplay-gesture policy (85-audio.js's own header comment)
  // means an AudioContext constructed at boot would stay permanently
  // suspended on most browsers until a REAL user gesture calls .resume()
  // from inside a trusted event handler — keydown, pointerdown, and
  // touchstart are the three this project actually receives (a gamepad
  // press is not a trusted gesture for this policy). unlock() is cheap and
  // idempotent (85-audio.js: a no-op once the context is already running),
  // so calling it on every one of these rather than only the first is
  // simpler than tracking "have we unlocked yet" state here too.
  window.addEventListener('keydown', function () { audio.unlock(); });
  window.addEventListener('pointerdown', function () { audio.unlock(); });
  window.addEventListener('touchstart', function () { audio.unlock(); });

  window.addEventListener('keydown', function (e) {
    if (app.paused) {
      // Escape always reaches the menu even while it is open, so it can
      // back out of a screen or close entirely; every other key is only
      // meaningful to the menu, never to the game, while paused.
      if (menu.handleKey(e.code)) e.preventDefault();
      return;
    }

    if (e.code === 'Escape') { app.paused = true; menu.openRoot(); e.preventDefault(); return; }

    var b = Settings.actionForCode(settings, e.code);
    if (b) { p1.set(b, true); e.preventDefault(); }
    // Debug: co-op join. Stage 1 ships one keyboard and one pad, so the
    // second player is the gamepad; this key exists to prove the sim really
    // is N-player without needing hardware plugged in.
    if (e.code === 'F2' && sim.players.length < 2) sim.addPlayer();
    if (e.code === 'F3') { app.showMeter = !app.showMeter; }
    if (e.code === 'F4') view.showBoxes = !view.showBoxes;
    // D4's own "debug-room toggle" — flips whether the blueprint pool is
    // enforced (Stage 1 ships pre-unlocked; this is what makes the whole
    // mechanic observable at all before real content exists to gate behind
    // it for real). F6 spends the permanent meta pool on +max HP (D8) —
    // both real Sim methods (L5), not the presenter poking sim.meta
    // directly. Both save immediately, not just on the next runEnd — an
    // adversarially-found gap: F5/F6 are currently the ONLY exposed way to
    // trigger either mutation (no shop UI exists), and the ONLY save hook
    // wired at boot was `runEnd`, which only fires at a real D4 transition.
    // A real purchase or toggle sat correctly mutated in memory but was
    // silently reverted by an ordinary reload if the player closed the tab
    // before the run happened to reach its next level or boss — the
    // permanent progression this file exists to make survive a reload,
    // lost by the one path that currently exercises it at all.
    if (e.code === 'F5') { sim.toggleEnforceLocks(); saveMeta(sim.meta); }
    if (e.code === 'F6') { if (sim.buyMaxHp()) saveMeta(sim.meta); }
    // Abilities spec §4's four enhancements — same debug-key shape as F6
    // above, for the identical reason: no shop UI exists yet for these
    // either, so a debug key is currently the ONLY exposed way to trigger
    // any of them (a real, named gap, not a silent one — an adversarial
    // review pass flagged the four new Sim.prototype.buyX() methods as
    // otherwise completely unreachable from the shipped game, unlike every
    // other deferred-reachability choice in this project, which names
    // itself explicitly the way this comment block does).
    if (e.code === 'F7') { if (sim.buyDashExtraCharge()) saveMeta(sim.meta); }
    if (e.code === 'F8') { if (sim.buyDashExtIframes()) saveMeta(sim.meta); }
    if (e.code === 'F9') { if (sim.buyParryRiposte()) saveMeta(sim.meta); }
    if (e.code === 'F10') { if (sim.buyParryReflect()) saveMeta(sim.meta); }
  });
  window.addEventListener('keyup', function (e) {
    if (app.paused) return;
    var b = Settings.actionForCode(settings, e.code);
    if (b) { p1.set(b, false); e.preventDefault(); }
  });
  // A window that loses focus mid-press must not leave the key stuck down.
  // Losing focus also isn't a moment to keep simulating blind — pause.
  // Bound to BOTH blur and visibilitychange: a backgrounded mobile tab does
  // not reliably fire blur the same way a desktop window does, and a stuck
  // touch-held button is worse on a device with no Alt-Tab to rescue it.
  function hardReset() {
    p1.reset();
    if (touchInput) touchInput.reset();
    if (!app.paused) { app.paused = true; menu.openRoot(); }
  }
  window.addEventListener('blur', hardReset);
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) hardReset();
  });

  var acc = 0, last = 0, started = false;
  var MAX_STEPS = 5;
  var fpsSamples = [], fps = 0, stepsLast = 0;
  var startWasDown = false;              // gamepad Start, edge-detected here:
                                          // it is app-meta, not a Pad button
  var navUp = false, navDown = false, navA = false, navB = false;

  var app = {
    sim: sim,
    view: view,
    menu: menu,
    narrative: narrative,
    audio: audio,
    settings: settings,
    showMeter: settings.showMeter,
    paused: false,
    // A live accessor, not a copied snapshot — isTouch can genuinely change
    // mid-session (a 2-in-1's keyboard detaching), same reasoning as fps
    // and steps below being functions rather than fields.
    touch: function () { return isTouch; },
    // Exposed for the render suite to drive/inspect directly; null until the
    // first fit() call observes isTouch true and lazily constructs it.
    touchControls: function () { return touchInput; },
    fps: function () { return fps; },
    steps: function () { return stepsLast; },
    frames: 0
  };

  // Menu navigation from a gamepad while paused. Kept out of Menu itself:
  // edge-detection needs per-frame state that belongs to the frame loop, the
  // same way Pad.pressed() needs a tick to compare against.
  function pollMenuGamepad(gp) {
    if (!gp) return;
    var up = (gp.axes[1] || 0) < -0.5 || !!(gp.buttons[12] && gp.buttons[12].pressed);
    var down = (gp.axes[1] || 0) > 0.5 || !!(gp.buttons[13] && gp.buttons[13].pressed);
    var a = !!(gp.buttons[0] && gp.buttons[0].pressed);
    var b = !!(gp.buttons[1] && gp.buttons[1].pressed);
    if (up && !navUp) menu.move(-1);
    if (down && !navDown) menu.move(1);
    if (a && !navA) menu.confirm();
    if (b && !navB) menu.cancel();
    navUp = up; navDown = down; navA = a; navB = b;
  }

  function frame(now) {
    if (!started) { started = true; last = now; }
    var ms = now - last;
    last = now;

    fpsSamples.push(ms);
    if (fpsSamples.length > 30) fpsSamples.shift();
    var sum = 0;
    for (var i = 0; i < fpsSamples.length; i++) sum += fpsSamples[i];
    fps = sum > 0 ? Math.round(1000 / (sum / fpsSamples.length)) : 0;

    var gps = navigator.getGamepads ? navigator.getGamepads() : [];

    // Start toggles pause from either side, edge-detected against last frame
    // so holding it does not flicker the menu open and shut.
    var startDown = !!(gps[0] && gps[0].buttons[9] && gps[0].buttons[9].pressed);
    if (startDown && !startWasDown) {
      // Adversarially found (v0.2.16): the three real-gesture listeners
      // above (keydown/pointerdown/touchstart) are the ONLY calls to
      // audio.unlock() anywhere in this file — a session played entirely
      // on a gamepad never fires any of them, leaving every SFX cue
      // silently inaudible for the whole session with nothing telling the
      // player why. Best-effort mitigation, not a full fix: per the
      // browser's own user-activation model, a Gamepad API button press is
      // NOT one of the trusted events that grant "sticky activation" the
      // way keydown/pointerdown/touchend are — so calling unlock() here
      // may still fail to actually resume() a real AudioContext on a
      // strictly spec-conforming browser for a player who has genuinely
      // never touched a keyboard, mouse, or touchscreen this session. Wired
      // anyway (harmless if it does nothing; correct if a browser is more
      // permissive, or if this session's gamepad sits alongside keyboard/
      // mouse use elsewhere) rather than left entirely unattempted — but a
      // TRULY gamepad-only session unlocking audio is a real, currently
      // unresolved platform limitation, named here rather than silently
      // claimed as fixed.
      audio.unlock();
      if (app.paused) { app.paused = false; menu.close(); }
      else { app.paused = true; menu.openRoot(); }
    }
    startWasDown = startDown;

    var steps = 0;
    if (app.paused) {
      pollMenuGamepad(gps[0]);
      // The accumulator is simply not fed while paused, so it resumes
      // exactly where it left off — no burst of catch-up steps on the frame
      // the menu closes, no matter how long the pause lasted (L3: nothing
      // here scales a tick, and nothing here owes one either).
    } else {
      // Gamepads are polled once per rendered frame, not once per tick: the
      // browser only refreshes their state that often anyway.
      //
      // Solo, the pad is ADDITIVE on top of player one's keyboard — an
      // authoritative poll would write false over a key the player is
      // holding. In co-op the keyboard is player one's alone and every pad
      // shifts down one seat, where authoritative is correct.
      if (sim.players.length === 1) {
        padAssist(sim.pads.get(0), gps[0]);
      } else {
        for (var g = 1; g < sim.players.length; g++) pollGamepad(sim.pads.get(g), gps[g - 1]);
      }

      var dt = ms / 1000;
      if (dt > 0.25) dt = 0.25;      // a backgrounded tab must not spiral
      acc += dt;

      while (acc >= CFG.DT && steps < MAX_STEPS) {
        // Every sim.step() past the FIRST beginRun() can still call
        // Gen.generate() again (60-run.js's own level->level transition) —
        // see installFallback()'s own comment for the real freeze this
        // guard closes. Recovering here, rather than letting it escape
        // into this uncaught requestAnimationFrame callback, is what keeps
        // the game running instead of frozen solid until a reload.
        try {
          sim.step();
        } catch (e) {
          installFallback(sim, e);
          acc = 0;
          break;
        }
        acc -= CFG.DT;
        steps++;
      }
      if (steps === MAX_STEPS) acc = 0;   // stop trying to catch up; drop time
      // Frame-cadence, not tick-cadence (82-narrative.js's own header) —
      // gated the same as the stepping above so a displayed line's TTL
      // freezes while paused rather than silently expiring under the menu.
      narrative.update(sim, ms);
    }
    stepsLast = steps;

    fit();
    view.render();
    narrative.render(view.ctx, view.cssW, view.cssH);
    if (app.showMeter) meter(view.ctx, view, sim, fps, steps, app.paused);
    if (app.paused) menu.render(view.ctx, view.cssW, view.cssH);
    // After the menu, not before: touch glyphs (including the pause-nav
    // reading of the same zones) stay legible over the dim pause backdrop
    // rather than being drawn under it.
    if (touchInput) touchInput.render(view.ctx, view.cssW, view.cssH);
    app.frames++;
    requestAnimationFrame(frame);
  }

  // Solo play: the gamepad drives player one alongside the keyboard. Only
  // ever sets true — a neutral stick must not release a held key.
  function padAssist(pad, gp) {
    if (!gp) return;
    var ax = gp.axes[0] || 0, DEAD = 0.35;
    if (ax < -DEAD) pad.set('left', true);
    if (ax > DEAD) pad.set('right', true);
    if (gp.buttons[0] && gp.buttons[0].pressed) pad.set('jump', true);
    if (gp.buttons[1] && gp.buttons[1].pressed) pad.set('roll', true);
    if (gp.buttons[13] && gp.buttons[13].pressed) pad.set('down', true);
    // Same face button 3 pollGamepad's own co-op mapping uses for parry.
    if (gp.buttons[3] && gp.buttons[3].pressed) pad.set('parry', true);
    // Same button 4 pollGamepad's own co-op mapping uses for switchWeapon (D15).
    if (gp.buttons[4] && gp.buttons[4].pressed) pad.set('switchWeapon', true);
  }

  // Takes the View, not the raw canvas: it needs cssW, the LOGICAL width, to
  // place itself correctly now that the backing store can be DPR-scaled
  // larger than that. This runs after view.render() returns but shares the
  // same context, so it inherits render()'s dpr-scaled baseline transform
  // for free — see the comment at the top of View.prototype.render.
  function meter(ctx, view, s, f, st, paused) {
    var lines = [
      f + ' fps   ' + st + ' step' + (st === 1 ? '' : 's') + '/frame' + (paused ? '   PAUSED' : ''),
      'tick ' + s.tick + '   hitstop ' + s.hitstop,
      'p1 ' + s.players[0].state + '  hp ' + s.players[0].hp
    ];
    ctx.font = '11px ui-monospace, Consolas, monospace';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(13,11,16,0.72)';
    ctx.fillRect(view.cssW - 186, 6, 180, 8 + lines.length * 14);
    ctx.fillStyle = f >= 58 ? '#8fc0d0' : '#d1495b';
    for (var i = 0; i < lines.length; i++) ctx.fillText(lines[i], view.cssW - 178, 12 + i * 14);
  }

  requestAnimationFrame(frame);
  return app;
}

C.boot = boot;
C.demoLevel = demoLevel;

// Auto-boot when running as the built HTML. Guarded so that loading the
// modules in a test sandbox does nothing.
if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  var start = function () {
    var canvas = document.getElementById('game');
    if (!canvas) return;
    window.CINDER_APP = boot(canvas);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
}

})(CINDER);
