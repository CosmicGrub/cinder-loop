/* ===========================================================================
 * 00-core.js  —  RNG · Bus · CFG · math
 * ---------------------------------------------------------------------------
 * SIM layer. Loads with no window and no document (L5, enforced by
 * verify_arch). Contains no Math.random (L4, enforced by verify_arch both by
 * source scan and by running the sim in a sandbox where Math.random is gone).
 *
 * Owned by: Core team. No other team edits this file.
 * ======================================================================== */
;(function (C) {
'use strict';

/* ------------------------------------------------------------------ CFG
 * Every tunable in the simulation lives here and nowhere else. No module
 * below invents a number. Units are pixels and frames; one frame is one
 * tick of 1/60 s and dt is NEVER scaled (L3).
 *
 * The vertical numbers are discrete, not continuous. The textbook apex
 * v^2/2g is the answer for a smooth curve; this is a 60Hz integrator that
 * applies gravity on the same tick as the impulse, so the real rise is
 * sum(V - k*g) over the frames where that is positive. With V 5.55 and
 * g 0.3 that is 18 frames totalling 48.6px — three 16px tiles — and the
 * fall back to launch height takes another 18, so a full uncut jump is
 * airborne for exactly 36 frames.
 *
 * Solving the continuous equation instead gives -5.4 here and a jump that
 * measures 45.9px, short of three tiles. verify_move measures the real
 * thing rather than trusting this comment (L8).
 * ------------------------------------------------------------------ */
var CFG = {
  TICK_HZ: 60,
  DT: 1 / 60,
  TILE: 16,

  // body
  PLAYER_W: 10,
  PLAYER_H: 22,
  PLAYER_CROUCH_H: 12,

  // horizontal
  RUN_SPEED: 2.5,            // px/frame -> 150 px/s
  RUN_ACCEL: 0.5,
  RUN_FRICTION: 0.5,
  AIR_ACCEL: 0.35,
  AIR_FRICTION: 0.12,

  // vertical
  GRAVITY: 0.3,
  JUMP_VEL: -5.55,
  DOUBLE_JUMP_VEL: -4.95,
  JUMP_CUT: 0.45,            // vy *= this when jump is released while rising
  MAX_FALL: 9.0,
  SLAM_VEL: 11.0,
  SLAM_HANG_FRAMES: 4,       // brief hang before the slam drops

  /* --- slam impact (30-player.js lands it, 40-combat.js resolves it) ----
   * The slam has always had impact FX (hitstop, screen shake) but never
   * dealt damage — a false affordance: it LOOKS like an attack and isn't
   * one. Wired through the exact same Combat.resolveBox every other hit in
   * the game uses (never a second hp-subtraction path) as a symmetric
   * ground-level AOE — two adjacent boxes, one per facing, so knockback
   * pushes each target away from the landing point rather than in one
   * shared direction. Deliberately weapon-agnostic (D7's per-weapon move
   * ownership is not extended here): a ground-pound is a movement-triggered
   * shockwave, not a swing, so it does not need its own geometry/frames per
   * weapon the way light/heavy do — it still scales with Combat.weaponScale
   * off the player's current stats, so D2 stays meaningfully coupled to
   * every damage source, not just standard swings. Numbers below are named
   * design judgments, not measurements — there is no capture plate for "how
   * hard should a ground-pound hit," same discipline as
   * STAT_SCALE_PER_POINT/GEN_MIN_FIGHT_TILES. */
  SLAM_DAMAGE: 10,           // base, before Combat.weaponScale — matches daggerHeavy's tier
  SLAM_HIT_W: 22,            // px the AOE extends outward from each side of the body
  SLAM_HIT_H: 14,            // px the AOE extends upward from the feet
  SLAM_KNOCK: [3.2, -1.4],   // mostly horizontal shove, not a vertical pop like a swing

  // grace windows, in frames
  COYOTE_FRAMES: 5,
  JUMP_BUFFER_FRAMES: 5,
  PENDING_FRAMES: 8,

  /* --- wall interaction (30-player.js) ----------------------------------
   * onWall is already computed every tick by 25-body.js's own axis-separated
   * collision (Emberrush's charge already reads it to end early) — this is
   * the first PLAYER mechanic to act on it. Initial values, not yet swept
   * against real climb-height/reach measurements the way JUMP_VEL or
   * ROLL_SPEED were — see verify_move's own wall-interaction section for
   * what has and has not actually been measured about them yet. */
  WALL_SLIDE_MAX: 2.2,       // px/frame terminal fall speed while held into a wall
  WALLJUMP_VEL_X: 4.0,       // px/frame pushed away from the wall on a wall jump
  WALLJUMP_LOCKOUT: 8,       // frames of reduced horizontal control afterward,
                             // same shape as ATTACK_DRIFT — steerable, not free

  /* --- ledge grab (30-player.js) -----------------------------------------
   * Real spatial reasoning about the tilemap, not a velocity clamp the way
   * wall slide/jump are: the wall the player is touching has to actually
   * run out, within reach, into a stand-on-able surface. Genre-standard
   * shape (hold into a wall while falling to catch it, jump to climb,
   * down to drop) rather than open design space, so this skipped a panel
   * the same way wall interaction did — but the DETECTION geometry itself
   * was measured against real constructed test worlds (clean ledge, a tall
   * wall with none, a ledge with no headroom to climb into) before being
   * written here, the same discipline as any baked move. Numbers below are
   * initial values, not yet swept the way JUMP_VEL was — see verify_move's
   * own ledge-grab section for what has and has not actually been measured
   * about them yet. */
  LEDGE_GRAB_LOCKOUT: 10,    // frames before a ledge can be grabbed again after climbing/dropping
  LEDGE_GRAB_MAX_HANG: 90,   // frames an ungrabbed hang lasts before it auto-drops

  // roll
  ROLL_FRAMES: 18,
  ROLL_SPEED: 4.75,          // 18 * 4.75 = 85.5px
  ROLL_COOLDOWN_FRAMES: 24,

  /* --- ember dash (30-player.js) -----------------------------------------
   * Ember Dash — airborne reuse of the Roll button (abilities spec §2a): a
   * fast horizontal burst usable in the air, the same committed/i-frame
   * shape as Roll, just triggered by NOT being grounded rather than being
   * grounded. Slightly shorter than roll's own 85.5px on purpose — a dash
   * trades some distance for being available where roll never was. Initial
   * values, not yet swept the way ROLL_SPEED was — see verify_move's own
   * ember-dash section for what has and has not actually been measured
   * about them yet. */
  DASH_FRAMES: 14,
  DASH_SPEED: 5.5,           // 14 * 5.5 = 77px
  DASH_COOLDOWN_FRAMES: 30,

  /* --- parry (30-player.js / 40-combat.js) -------------------------------
   * Parry — abilities spec §2b: a timed window, armed on a new dedicated
   * input, that negates an incoming hit and staggers the attacker. A
   * lightweight flag (`parryWindow`), deliberately NOT its own player
   * state the way roll/dash are — folding it into invulnerable() (which
   * also gates hazard damage) would silently grant hazard immunity as a
   * side effect of a window that is only meant to answer one attack.
   * Initial values, not yet swept — see verify_move's own parry section
   * for what has and has not actually been measured about them yet. */
  PARRY_WINDOW_FRAMES: 12,
  PARRY_COOLDOWN_FRAMES: 30,
  // A fixed, dedicated punish window (45-enemy.js's new 'staggered' state),
  // deliberately NOT however long the interrupted move's own recover phase
  // happens to be — a fast move's own tiny recovery would otherwise
  // undercut the whole point of a parry's punish window (and Riposte's
  // own bonus hit, §4). Initial value, not yet swept.
  STAGGER_FRAMES: 30,

  // damage / life
  MAX_HP: 3,                // STARTING max hp every run — see STAT_HP_GAIN,
                             // player.maxHp is the per-run figure this grows
  HAZARD_DAMAGE: 1,
  HURT_IFRAMES: 60,
  HURT_KNOCK_X: 2.0,
  HURT_KNOCK_Y: -3.0,
  RESPAWN_FRAMES: 30,

  /* --- stats (D2) --------------------------------------------------------
   * "Each stat starts at 1 every run. A pickup grants +1 to a chosen stat
   * and +HP only if that stat is dominant. Weapons list two colours and
   * scale off the larger; colourless gear scales off the highest." "+HP"
   * reuses this project's own already-established vocabulary for permanent
   * capability growth — D8 names "+max HP" as exactly what meta currency
   * buys permanently; this is the within-run version of the same concept,
   * stated explicitly rather than left to guess at "+HP" meaning a heal. */
  STAT_START: 1,
  STAT_HP_GAIN: 1,           // +max hp (and a matching heal) when a gained
                             // stat becomes strictly dominant
  // Design judgment, not a measurement — there is no capture plate for "how
  // much should a stat point matter." +15% per point above the 1-point
  // baseline is generous enough that build choices are felt, conservative
  // enough that three points in one colour (the practical early-run ceiling)
  // is a real but not run-breaking spike.
  STAT_SCALE_PER_POINT: 0.15,

  // sub-stepping: no body may move more than this in one collision step
  MAX_STEP: 4,

  /* --- rig (35-rig.js) -------------------------------------------------
   * Local pose space is the STANDING body box: origin at its top-left, +x
   * right, +y down, authored facing right. Combat anchors it to the feet so
   * a crouched body does not drag its own hitboxes downward.
   *
   * Angles are degrees. 0 points right, -90 points up (+y is down). The
   * forearm angle is shoulder + elbow, and the blade continues along it. */
  RIG_SHOULDER_X: 6,
  RIG_SHOULDER_Y: 8,
  RIG_ARM_UPPER: 6,
  RIG_ARM_LOWER: 5,
  RIG_BLADE: 11,
  // Blade-tip travel per frame that counts as a swing. Below this the weapon
  // is being carried, not swung, and carries no hitbox.
  RIG_ACTIVE_SPEED: 12,
  RIG_SKIN: 1,             // px of tolerance allowed by the overreach audit
  RIG_BEHIND_SLACK: 4,     // px a hitbox may sit behind the body's front edge

  /* --- combat (40-combat.js) ------------------------------------------ */
  ATTACK_DRIFT: 0.35,      // fraction of ground control kept while swinging
  HIT_IFRAMES: 24,         // i-frames a struck target receives
  HITSTOP_LIGHT: 5,
  HITSTOP_HEAVY: 9,

  /* --- enemies (10-data.js / 45-enemy.js) -----------------------------
   * MIN_TELEGRAPH is a FAIRNESS floor, not a balance number. An attack that
   * can reach you without first showing you it is coming is not difficulty,
   * it is a bug; verify_enemy fails the build over any template below it.
   * Same instinct as D3a — turn "that felt bad" into a number a test holds. */
  MIN_TELEGRAPH: 14,
  ENEMY_HITSTOP: 3,        // when an enemy connects, not when it is hit
  ENEMY_FRICTION: 0.22,
  AGGRO_DROP: 1.7,         // sight multiplier before it loses interest again

  /* --- generation (50-gen.js) -------------------------------------------
   * The GEN_*_TILES numbers below are MEASURED, not guessed (D3a exists
   * precisely because "the level felt unfair" is the hardest bug class to
   * chase without a number to hold it to). Each was found by driving the
   * REAL Body/Player physics across a test gap at increasing width until it
   * stopped landing on the target platform — the same "measure, then
   * hardcode" discipline as every other constant in this project (jump
   * apex, roll distance, and so on). A held jump (never released mid-rise)
   * was required to get a trustworthy reading — the first pass tapped jump
   * for one tick, which triggers the game's OWN short-hop mechanic
   * (JUMP_CUT) and silently measured a cut arc instead of the real one.
   *
   * Every number here then has one further tile of margin subtracted below
   * the measured reliable maximum. The generator never designs a jump at
   * the exact edge of capability — a fair layout should feel generous, not
   * pixel-perfect, and margin absorbs the ways a real playthrough differs
   * from an idealized held-jump-from-a-long-clean-run-up measurement (a
   * shorter run-up, a slightly mistimed press).
   *
   * GEN_MIN_FIGHT_TILES is NOT a physics measurement — there is no capture
   * plate for "how much room feels fair to fight on." It is a design
   * judgment, called out as one rather than dressed up as derived: wide
   * enough to stand off the edge, take a couple of steps back from an
   * enemy, and start a dodge-roll without immediately running out of
   * platform. Roughly six times the player's own width; comfortably under
   * a full roll's distance rather than requiring one.
   */
  GEN_FLAT_GAP_TILES: 3,     // dy <= 0 (flat or a step down): measured reliable to 4
  GEN_RISE1_GAP_TILES: 3,    // dy = 1 tile up, single jump: measured reliable to 4
  GEN_RISE2_GAP_TILES: 2,    // dy = 2 tiles up, single jump: measured reliable to 3
  GEN_DBLJUMP_GAP_TILES: 4,  // dy = 3-4 tiles up, needs a double jump: measured reliable to 6-7
  GEN_DBLJUMP_HIGH_GAP_TILES: 3, // dy = 5 tiles up, double jump near its ceiling: measured reliable to 5
  // A double-jump climb also needs a FLOOR under the gap, not just a
  // ceiling: at gap 0 the rising arc's own horizontal drift can carry the
  // body under the target platform's footprint before it has climbed high
  // enough to clear it, hitting the target's own underside like a low
  // ceiling. Measured directly, twice — gap 0 at rise 4-5 already failed in
  // the original capability sweep, and a rise-3/gap-0 pairing that cleared
  // in one platform-width configuration failed to clear in another once the
  // generator's own physics cross-check started exercising real generated
  // geometry. Not reliable enough to treat as a supported edge.
  GEN_DBLJUMP_MIN_GAP_TILES: 1,
  // That floor of 1 holds for rise 3-4, but NOT at rise 5 — the top of the
  // double-jump range, where maxGapForRise already drops to a tighter
  // ceiling (GEN_DBLJUMP_HIGH_GAP_TILES) for the same reason: less capacity
  // left over near the limit of what a double jump can do at all. Measured
  // directly with a clean gap sweep (canonical run-to-edge, hold-to-apex,
  // release+repress-at-apex technique) at rise 3, 4, and 5: gap 1 clears
  // reliably at rise 3-4, but at rise 5 it fails every time — the rising
  // arc's horizontal drift still carries the body under the target's
  // footprint before there's enough height to clear it (the same underside
  // collision GEN_DBLJUMP_MIN_GAP_TILES exists to prevent, just needing
  // more room at this tighter margin); gap 2 clears reliably. Found via the
  // generator's own physics cross-check exercising real generated rise-5
  // edges — the audit's graph model was silently calling an unreachable
  // climb "legal" until this was measured.
  GEN_DBLJUMP_HIGH_MIN_GAP_TILES: 2,
  GEN_MAX_RISE_TILES: 5,     // no generated beat may ever ask for more rise than this
  GEN_ROLL_HAZARD_TILES: 4,  // ground-level hazard strip crossable via roll: measured 85.5px = 5.34 tiles

  GEN_MIN_FIGHT_TILES: 4,    // design judgment, not a measurement — see above

  // How often a beat is allowed to ignore its own capability model and risk
  // an unfair placement — the reason the audit has real, non-zero work to
  // do and REPORTS a real rejection rate (D3a) rather than one that is
  // always trivially 0%. Tuned by sweeping several values against 60 seeds
  // each and picking the one where the audit reads as a guardrail catching
  // real mistakes (~20% aggregate rejection, ~80% of seeds accepted on the
  // first attempt) rather than the primary mechanism (0.08 measured 61%
  // rejected — the generator would have been barely trying). verify_gen
  // measures the resulting rate directly rather than trusting this comment.
  GEN_RISK_CHANCE: 0.02,
  // A hard ceiling on the reject-and-regenerate loop. Should never be
  // reached given GEN_RISK_CHANCE is tuned to keep the true rejection rate
  // well under this many consecutive failures in practice — but an
  // unbounded retry loop is never acceptable, so generation fails loudly
  // past this point rather than hanging.
  GEN_MAX_ATTEMPTS: 200,

  /* --- run loop (60-run.js) ---------------------------------------------
   * D1: spawn -> clear -> boss -> die -> spend -> respawn. "Clear" needs a
   * player-driven moment (not a level that silently auto-clears the instant
   * its enemies happen to be gone) — RUN_EXIT_RADIUS is the grace window
   * around 50-gen.js's own `exit` point (its header: "a pixel coordinate on
   * the far side... that NOTHING currently consumes" until this file gives
   * it one), the same "generous, not pixel-perfect" spirit as this file's
   * other grace numbers (COYOTE_FRAMES, JUMP_BUFFER_FRAMES). The currency
   * numbers are named design judgments, not measurements — a boss clear is
   * worth an order of magnitude more than one trash kill, matching genre
   * convention that the real reward is at the door, not the hallway. */
  // Confirmed by an adversarial pass, against real generated levels: this
  // generosity means a player standing on a pickup spur close enough to
  // the exit's own attach point (a real, if narrow, shape across a scan of
  // 400 seeds — always a spur, never an unrelated main platform) can open
  // the boss door without ever having set foot on the exit platform
  // itself. Read as an accepted consequence of the choice stated above,
  // not a bug: the same "generous, not pixel-perfect" reasoning that
  // already governs COYOTE_FRAMES/JUMP_BUFFER_FRAMES doesn't stop being
  // true just because THIS instance of it is a spur rather than open air.
  RUN_EXIT_RADIUS: 24,          // ~1.5 tiles from the exit's own coordinate
  RUN_CURRENCY_PER_KILL: 1,
  RUN_CURRENCY_PER_BOSS: 10,

  /* --- meta progression (65-meta.js, D4/D8) -----------------------------
   * D4: blueprint carry-and-hand-in — drop, carry, lose on death, hand in
   * at a transition, pay to unlock into the pool. D8: meta currency also
   * buys permanent capability; this session's scope is +max HP only (flask
   * charges and a backpack slot are real parts of D8's own list, named and
   * deliberately deferred — genuinely new mechanics with nothing existing
   * to build on, unlike +max HP, which reuses D2's own "+HP" vocabulary
   * directly, or blueprint unlocks, which map onto the four already-built,
   * already-locked (D9) weapons rather than inventing new content).
   * RUN_SPEND_STUB_COST (the old "nothing to buy yet" placeholder this
   * comment block used to name) is retired outright, not kept alongside
   * the real spends below — its whole stated job was standing in until a
   * real price existed; once one does, keeping a second, always-succeeding
   * spend at the same call site would just be dead weight pretending to be
   * infrastructure.
   *
   * META_BLUEPRINT_DROP_CHANCE, META_BLUEPRINT_UNLOCK_COST, and
   * META_MAXHP_COST are named design judgments, the same discipline
   * GEN_MIN_FIGHT_TILES/GEN_RISK_CHANCE/STAT_SCALE_PER_POINT already use —
   * no capture plate exists for "how often should a kill offer a
   * blueprint" any more than one exists for "how much room feels fair to
   * fight on." META_MAXHP_GAIN reuses D2's own STAT_HP_GAIN value directly
   * rather than inventing a second number for the same concept one layer
   * up (a permanent version of the same "+HP" D8 already names). Under
   * Stage 1's default (META_ENFORCE_LOCKS_DEFAULT = false, D4's own "ships
   * with the pool pre-unlocked"), every weapon already reads as unlocked,
   * so blueprints have nothing left to offer and never drop — the
   * debug-room toggle (D4's own phrase; F5 in 95-app.js) is what makes the
   * whole mechanic observable at all before any content is added to
   * eventually gate behind it. */
  META_BLUEPRINT_DROP_CHANCE: 0.15,
  META_BLUEPRINT_CAPACITY: 1,     // per player; a "backpack slot" purchase would raise this later — deferred
  META_BLUEPRINT_UNLOCK_COST: 15,
  META_MAXHP_COST: 25,
  META_MAXHP_GAIN: 1,             // matches STAT_HP_GAIN — the permanent version of the same concept
  META_ENFORCE_LOCKS_DEFAULT: false,

  /* --- ability enhancements (65-meta.js/70-sim.js, abilities spec §4) ----
   * Four flat-cost purchases, same shape as META_MAXHP_COST above — no
   * tree, no prerequisites between them. Named design judgments, the same
   * discipline META_MAXHP_COST/META_BLUEPRINT_UNLOCK_COST already use — no
   * capture plate exists for "how much should a second dash charge cost"
   * any more than one exists for "how often should a kill offer a
   * blueprint." Reflect priced highest: the one with a concrete, always-
   * applicable target (any kilnspitter volley) rather than a situational
   * bonus. */
  META_DASH_EXTRA_CHARGE_COST: 20,
  META_DASH_EXT_IFRAMES_COST: 15,
  META_PARRY_RIPOSTE_COST: 20,
  META_PARRY_REFLECT_COST: 25,
  // Frames of bonus this.iframes granted on a dash's OWN end (endDash(),
  // 30-player.js) when Dash Extended I-Frames is owned — the dash's own
  // i-frames already cover its full committed duration (state === 'dash'),
  // so "extended" means a residual invulnerability window immediately
  // AFTER the dash ends, not a longer dash. Reuses the existing iframes
  // counter (already checked by invulnerable()) rather than inventing a
  // second one.
  DASH_EXT_IFRAMES_BONUS: 10,
  // A flat bonus hit, not scaled by Combat.weaponScale like an ordinary
  // swing — Riposte is a reward for the READ, not a second weapon attack.
  PARRY_RIPOSTE_DAMAGE: 4
};

/* ------------------------------------------------------------------ math */
function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
function sign(v) { return v < 0 ? -1 : (v > 0 ? 1 : 0); }
function abs(v) { return v < 0 ? -v : v; }

// Move `v` toward `target` by at most `step`. Used for accel and friction so
// both directions share one definition and cannot drift apart.
function approach(v, target, step) {
  if (v < target) { v += step; return v > target ? target : v; }
  if (v > target) { v -= step; return v < target ? target : v; }
  return target;
}

function aabb(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && bx < ax + aw && ay < by + bh && by < ay + ah;
}

/* ------------------------------------------------------------------ RNG
 * mulberry32. Per-instance state (L4): two RNGs seeded differently diverge,
 * and a snapshot restores the exact stream. Nothing in the sim may reach for
 * a shared or global generator.
 * ------------------------------------------------------------------ */
function RNG(seed) {
  if (!(this instanceof RNG)) return new RNG(seed);
  this.s = (seed >>> 0) || 1;
}
RNG.prototype.next = function () {
  var t = (this.s = (this.s + 0x6D2B79F5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1) >>> 0;
  t = (t + Math.imul(t ^ (t >>> 7), t | 61)) >>> 0;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
RNG.prototype.int = function (n) { return (this.next() * n) | 0; };
RNG.prototype.range = function (a, b) { return a + this.next() * (b - a); };
RNG.prototype.pick = function (arr) { return arr[this.int(arr.length)]; };
RNG.prototype.snapshot = function () { return { s: this.s }; };
RNG.prototype.restore = function (snap) { this.s = snap.s >>> 0; return this; };

/* ------------------------------------------------------------------ Bus
 * Typed. emit() of an unregistered type throws, so a typo in a sim module
 * fails loudly in the gate instead of silently never reaching the presenter.
 *
 * The bus is the ONLY channel from sim to presenter (L5). The sim emits
 * facts; 80-view.js is the only place a fact becomes an effect.
 * ------------------------------------------------------------------ */
var EVENTS = [
  'jump', 'doubleJump', 'wallJump', 'land', 'step',
  'rollStart', 'rollEnd',
  'dashStart', 'dashEnd',
  'parryStart', 'parry',
  'crouch', 'uncrouch', 'dropThrough',
  'slamStart', 'slamLand',
  'ledgeGrab', 'ledgeClimb', 'ledgeRelease',
  'hurt', 'death', 'respawn',
  'wallTouch',
  'attackStart', 'attackEnd', 'attackCancel', 'hit', 'targetDown',
  'telegraph', 'enemyAttack', 'shotBurst', 'enemyStagger',
  'statGain', 'pickup',
  // 65-meta.js (D4/D8): fires once, exactly at _commitPendingLevel() (D4's
  // own "a transition"), after currency/blueprint hand-in resolution has
  // finished mutating this.meta — the one new event this feature needs,
  // for a genuinely new downstream consumer (95-app.js persisting to
  // localStorage) rather than a redundant re-derivation of something
  // already inferable, the same bar 60-run.js's own "zero new Bus events"
  // held itself to.
  'blueprintDrop', 'blueprintLost', 'blueprintUnlocked', 'runEnd'
];

function Bus() {
  this.listeners = Object.create(null);
  this.frame = [];        // events emitted during the current tick
  this.emitted = 0;       // lifetime count, for the vacuity check in the gate
}
Bus.KNOWN = EVENTS;

Bus.prototype.on = function (type, fn) {
  if (EVENTS.indexOf(type) === -1) throw new Error('Bus.on: unknown event "' + type + '"');
  var list = this.listeners[type] || (this.listeners[type] = []);
  list.push(fn);
  return fn;
};
Bus.prototype.off = function (type, fn) {
  var list = this.listeners[type];
  if (!list) return false;
  var i = list.indexOf(fn);
  if (i === -1) return false;
  list.splice(i, 1);
  return true;
};
Bus.prototype.emit = function (type, payload) {
  if (EVENTS.indexOf(type) === -1) throw new Error('Bus.emit: unknown event "' + type + '"');
  this.emitted++;
  this.frame.push({ type: type, payload: payload });
  var list = this.listeners[type];
  if (!list) return;
  // Iterate a copy: a listener may legally unsubscribe itself.
  var snap = list.slice(), i;
  for (i = 0; i < snap.length; i++) snap[i](payload, type);
};
// Called by Sim at the top of every tick. The per-frame log is a sim-owned
// buffer the presenter reads; it must not accumulate across ticks or the
// presenter replays old effects.
Bus.prototype.beginFrame = function () { this.frame.length = 0; };
Bus.prototype.clear = function () {
  this.listeners = Object.create(null);
  this.frame.length = 0;
};

C.CFG = CFG;
C.RNG = RNG;
C.Bus = Bus;
C.clamp = clamp;
C.sign = sign;
C.abs = abs;
C.approach = approach;
C.aabb = aabb;

})(CINDER);
